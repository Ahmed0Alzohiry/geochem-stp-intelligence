/**
 * Persist verified FACILITY/BRANCH locations into public.company_locations.
 * Does not update public.companies (including city).
 *
 * STEP 5.20: --write without --include-medium persists HIGH rows only.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createSupabaseBrowserClient } from "../supabase/client";
import {
  assessNamedFacility,
  detectWesternCity,
  isFacilityOrBranch,
  toCompanyLocationInsert,
  type NamedFacilityScan,
  type VerifiedLocationCandidate,
} from "../locations/western-facility-location";

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

const PAGE = 1000;

type CompanyRow = {
  id: string;
  company_name: string | null;
  website: string | null;
  website_domain: string | null;
  city: string | null;
  industrial_city: string | null;
  parent_company_name: string | null;
};

type EntityRow = {
  company_id: string;
  entity_type: string;
  account_group_key: string;
};

function text(value: string | null | undefined): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
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

async function loadNamedFacilities(): Promise<NamedFacilityScan[]> {
  const companies = await fetchAll<CompanyRow>(
    "companies",
    "id, company_name, website, website_domain, city, industrial_city, parent_company_name",
    "id",
  );
  const entities = await fetchAll<EntityRow>(
    "company_entity_resolution",
    "company_id, entity_type, account_group_key",
    "company_id",
  );
  const er = new Map(entities.map((row) => [row.company_id, row]));
  const byGroup = new Map<string, string[]>();
  for (const row of entities) {
    byGroup.set(row.account_group_key, [...(byGroup.get(row.account_group_key) ?? []), row.company_id]);
  }

  const named: NamedFacilityScan[] = [];
  for (const row of companies) {
    const meta = er.get(row.id);
    if (!isFacilityOrBranch(meta?.entity_type)) continue;
    const name = text(row.company_name);
    if (!name) continue;
    const city = detectWesternCity(name);
    if (!city) continue;
    named.push({
      company_id: row.id,
      company_name: name,
      entity_type: meta?.entity_type ?? "UNKNOWN",
      detected_city: city,
      proposed_region: "Western Region",
      stored_city: text(row.city),
      stored_industrial_city: text(row.industrial_city),
      parent_company_name: text(row.parent_company_name),
      website: text(row.website),
      website_domain: text(row.website_domain),
      account_group_key: meta?.account_group_key ?? "",
      group_size: byGroup.get(meta?.account_group_key ?? "")?.length ?? 1,
    });
  }
  return named;
}

async function main() {
  loadEnvLocal();
  const write = process.argv.includes("--write");
  const highOnly = !process.argv.includes("--include-medium");
  const yanpetOnly = process.argv.includes("--yanpet-only");
  const named = await loadNamedFacilities();
  const assessed = named.map(assessNamedFacility);
  const verified = assessed.filter((row): row is VerifiedLocationCandidate => "confidence" in row);
  const payload = verified
    .filter((row) => (highOnly ? row.confidence === "HIGH" : true))
    .filter((row) => (yanpetOnly ? row.company_id === "32498bc2-ccaa-4ce8-a82c-ef1f16b9fbdb" : true))
    .map(toCompanyLocationInsert);

  const supabase = createSupabaseBrowserClient();
  const existing = await fetchAll<{ id: string; company_id: string; city: string; confidence: string | null }>(
    "company_locations",
    "id, company_id, city, confidence",
    "id",
  );
  const existingKeys = new Set(existing.map((row) => `${row.company_id}|${row.city}`));
  const toInsert = payload.filter((row) => !existingKeys.has(`${row.company_id}|${row.city}`));

  let writeError: string | null = null;
  let written = 0;
  if (write) {
    const probe = await supabase.from("company_locations").select("id, confidence").limit(1);
    if (probe.error) {
      writeError = [probe.error.message, probe.error.code].filter(Boolean).join(" | ");
    } else {
      for (let i = 0; i < toInsert.length; i += 50) {
        const chunk = toInsert.slice(i, i + 50);
        const { error } = await supabase.from("company_locations").insert(chunk);
        if (error) {
          writeError = [error.message, error.code, error.details, error.hint].filter(Boolean).join(" | ");
          break;
        }
        written += chunk.length;
      }
    }
  }

  const stored = await fetchAll<{
    id: string;
    company_id: string;
    city: string;
    region: string | null;
    country: string | null;
    location_type: string;
    confidence: string | null;
    evidence_type: string | null;
    source_url: string | null;
    source_name: string | null;
    verified_at: string | null;
  }>(
    "company_locations",
    "id, company_id, city, region, country, location_type, confidence, evidence_type, source_url, source_name, verified_at",
    "id",
  );
  const { count: companyCount, error: companyCountError } = await supabase
    .from("companies")
    .select("id", { count: "exact", head: true });
  const pairCounts = new Map<string, number>();
  for (const row of stored) {
    const key = `${row.company_id}|${row.city}`;
    pairCounts.set(key, (pairCounts.get(key) ?? 0) + 1);
  }
  const duplicatePairs = [...pairCounts.values()].filter((count) => count > 1);

  console.log(
    JSON.stringify(
      {
        wrote: write && !writeError,
        writeError,
        writtenRows: written,
        skippedAlreadyPresent: payload.length - toInsert.length,
        companiesUpdated: 0,
        sourceFieldsOverwritten: 0,
        highOnly,
        yanpetOnly,
        wouldInsert: toInsert.length,
        companyCount: companyCountError ? companyCountError.message : companyCount,
        storedTotal: stored.length,
        storedByCity: {
          Yanbu: stored.filter((row) => row.city === "Yanbu").length,
          Jeddah: stored.filter((row) => row.city === "Jeddah").length,
          Rabigh: stored.filter((row) => row.city === "Rabigh").length,
        },
        storedByConfidence: {
          HIGH: stored.filter((row) => row.confidence === "HIGH").length,
          MEDIUM: stored.filter((row) => row.confidence === "MEDIUM").length,
          LOW: stored.filter((row) => row.confidence === "LOW").length,
        },
        sourceUrlPresentForAll: stored.length > 0 && stored.every((row) => Boolean(row.source_url)),
        duplicateCompanyCityRows: duplicatePairs.reduce((sum, count) => sum + (count - 1), 0),
        storedRows: stored,
        verifiedPreview: toInsert.map((row) => ({
          company_id: row.company_id,
          city: row.city,
          confidence: row.confidence,
          source_url: row.source_url,
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
