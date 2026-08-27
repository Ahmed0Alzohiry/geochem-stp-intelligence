/**
 * STEP 5.22 read-only scan: remaining Yanbu/Jeddah/Rabigh facilities vs existing websites.
 * Does not write companies or company_locations.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createSupabaseBrowserClient } from "../supabase/client";
import { detectWesternCity, isFacilityOrBranch, type WesternCity } from "../locations/western-facility-location";

const PAGE = 1000;
const COMPANY_SELECT_PRIMARY =
  "id, company_name, legal_name, alias_name, record_type, website, website_domain, parent_company_name, city, industrial_city, business_description, main_activities";
const COMPANY_SELECT_FALLBACK =
  "id, company_name, legal_name, record_type, website, website_domain, parent_company_name, city, industrial_city, business_description, main_activities";

type CompanyRow = {
  id: string;
  company_name: string | null;
  legal_name: string | null;
  alias_name?: string | null;
  record_type: string | null;
  website: string | null;
  website_domain: string | null;
  parent_company_name: string | null;
  city: string | null;
  industrial_city: string | null;
  business_description: string | null;
  main_activities: string | null;
};

type EntityRow = {
  company_id: string;
  entity_type: string;
  account_group_key: string;
};

function loadEnvLocal() {
  const envPath = resolve(process.cwd(), ".env.local");
  const text = readFileSync(envPath, "utf8");
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim();
    if (!process.env[key]) process.env[key] = value;
  }
}

function text(value: string | null | undefined): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function detectFromNames(row: CompanyRow): WesternCity | null {
  return (
    detectWesternCity(text(row.company_name) ?? "") ??
    detectWesternCity(text(row.legal_name) ?? "") ??
    detectWesternCity(text(row.alias_name) ?? "")
  );
}

function domainFromWebsite(website: string | null): string | null {
  if (!website) return null;
  const raw = website.trim().toLowerCase();
  const withoutProto = raw.replace(/^https?:\/\//, "").replace(/^www\./, "");
  const host = withoutProto.split(/[/#?]/)[0];
  return host && host.includes(".") ? host : null;
}

function normalizeDomain(row: CompanyRow): string | null {
  const fromField = text(row.website_domain)?.toLowerCase().replace(/^www\./, "") ?? null;
  return fromField ?? domainFromWebsite(text(row.website));
}

const UNUSABLE = [
  "linkedin.com",
  "facebook.com",
  "twitter.com",
  "x.com",
  "instagram.com",
  "youtube.com",
  "wikipedia.org",
  "crunchbase.com",
  "zoominfo.com",
  "dnb.com",
  "bloomberg.com",
  "yellowpages.com",
  "kompass.com",
  "maps.google.com",
  "google.com",
];

const PARENT_MEGA_SITES = ["sabic.com", "aramco.com", "saudiaramco.com", "maaden.com", "se.com.sa"];

function isUnusableHost(domain: string): boolean {
  return UNUSABLE.some((host) => domain === host || domain.endsWith(`.${host}`));
}

function nameTokens(name: string): string[] {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .split(" ")
    .filter((token) => token.length >= 4);
}

function domainLooksDedicated(domain: string, companyName: string): boolean {
  const host = domain.replace(/^www\./, "").split(".")[0] ?? "";
  const tokens = nameTokens(companyName);
  if (host.length >= 4 && tokens.some((token) => host.includes(token) || token.includes(host))) return true;
  return false;
}

type SourceClass = "A" | "B" | "C";

function classifySource(row: CompanyRow): { bucket: SourceClass; reason: string; domain: string | null } {
  const website = text(row.website);
  const domain = normalizeDomain(row);
  if (!website && !domain) {
    return { bucket: "C", reason: "no website or website_domain on this facility row", domain: null };
  }
  if (!domain) {
    return { bucket: "B", reason: "website present but host/domain could not be parsed", domain: null };
  }
  if (isUnusableHost(domain)) {
    return { bucket: "C", reason: `directory/social host is not an operator source (${domain})`, domain };
  }
  if (PARENT_MEGA_SITES.some((host) => domain === host || domain.endsWith(`.${host}`))) {
    return {
      bucket: "B",
      reason: `domain is a parent/group site and does not by itself locate this facility (${domain})`,
      domain,
    };
  }
  const name = text(row.company_name) ?? "";
  if (domainLooksDedicated(domain, name)) {
    return { bucket: "A", reason: "facility-row domain appears dedicated to this operator", domain };
  }
  return {
    bucket: "B",
    reason: "website/domain exists but ownership or facility relevance is uncertain from DB fields only",
    domain,
  };
}

async function fetchAll<T>(table: string, fields: string, idCol: string): Promise<T[]> {
  const supabase = createSupabaseBrowserClient();
  const { count, error: countError } = await supabase.from(table).select(idCol, { count: "exact", head: true });
  if (countError) throw new Error(`${table}: ${countError.message}`);
  const total = count ?? 0;
  const rows: T[] = [];
  for (let from = 0; from < total; from += PAGE) {
    const to = Math.min(from + PAGE - 1, total - 1);
    const { data, error } = await supabase.from(table).select(fields).range(from, to);
    if (error) throw new Error(`${table}: ${error.message}`);
    rows.push(...(((data ?? []) as unknown) as T[]));
  }
  return rows;
}

async function main() {
  loadEnvLocal();
  const supabase = createSupabaseBrowserClient();
  const aliasProbe = await supabase.from("companies").select("alias_name").limit(1);
  const companySelect = aliasProbe.error ? COMPANY_SELECT_FALLBACK : COMPANY_SELECT_PRIMARY;
  const companies = await fetchAll<CompanyRow>("companies", companySelect, "id");
  const entities = await fetchAll<EntityRow>(
    "company_entity_resolution",
    "company_id, entity_type, account_group_key",
    "company_id",
  );
  const locations = await fetchAll<{ company_id: string }>("company_locations", "company_id", "id");
  const { count: companyCount, error: companyCountError } = await supabase
    .from("companies")
    .select("id", { count: "exact", head: true });

  const er = new Map(entities.map((row) => [row.company_id, row]));
  const byGroup = new Map<string, string[]>();
  for (const row of entities) {
    byGroup.set(row.account_group_key, [...(byGroup.get(row.account_group_key) ?? []), row.company_id]);
  }
  const verifiedIds = new Set(locations.map((row) => row.company_id));

  const remaining = companies.flatMap((row) => {
    const meta = er.get(row.id);
    if (!isFacilityOrBranch(meta?.entity_type)) return [];
    const city = detectFromNames(row);
    if (!city) return [];
    if (verifiedIds.has(row.id)) return [];
    const source = classifySource(row);
    return [
      {
        company_id: row.id,
        company_name: text(row.company_name) ?? "(unnamed)",
        entity_type: meta?.entity_type ?? "UNKNOWN",
        record_type: text(row.record_type),
        city_token: city,
        stored_city: text(row.city),
        website: text(row.website),
        website_domain: text(row.website_domain),
        domain: source.domain,
        parent_company_name: text(row.parent_company_name),
        account_group_key: meta?.account_group_key ?? "",
        group_size: byGroup.get(meta?.account_group_key ?? "")?.length ?? 1,
        bucket: source.bucket,
        reason: source.reason,
      },
    ];
  });

  const a = remaining.filter((row) => row.bucket === "A");
  const b = remaining.filter((row) => row.bucket === "B");
  const c = remaining.filter((row) => row.bucket === "C");
  const relatedGroups = new Map<string, typeof remaining>();
  for (const row of remaining) {
    relatedGroups.set(row.account_group_key, [...(relatedGroups.get(row.account_group_key) ?? []), row]);
  }
  const multi = [...relatedGroups.values()].filter((rows) => rows.length > 1 || (rows[0]?.group_size ?? 1) > 1);

  console.log(
    JSON.stringify(
      {
        databaseWrites: 0,
        companyCount: companyCountError ? companyCountError.message : companyCount,
        companyLocationsRows: locations.length,
        alreadyVerifiedExcluded: verifiedIds.size,
        remainingFacilityCandidates: remaining.length,
        remainingByCity: {
          Yanbu: remaining.filter((row) => row.city_token === "Yanbu").length,
          Jeddah: remaining.filter((row) => row.city_token === "Jeddah").length,
          Rabigh: remaining.filter((row) => row.city_token === "Rabigh").length,
        },
        A: a.map((row) => ({
          company_name: row.company_name,
          city_token: row.city_token,
          website: row.website,
          website_domain: row.website_domain ?? row.domain,
        })),
        B: b.map((row) => ({
          company_name: row.company_name,
          city_token: row.city_token,
          website: row.website,
          website_domain: row.website_domain ?? row.domain,
          reason: row.reason,
        })),
        C_count: c.length,
        relatedMultiCount: multi.length,
        relatedSummary: multi.slice(0, 25).map((rows) => ({
          account_group_key: rows[0]?.account_group_key,
          group_size: rows[0]?.group_size,
          remaining_in_scope: rows.length,
          names: rows.map((row) => row.company_name),
        })),
      },
      null,
      2,
    ),
  );
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
