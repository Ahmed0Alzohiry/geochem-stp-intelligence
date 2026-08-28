/**
 * STEP 32.2.2 INS Wave-1 audit. SELECT + in-memory score only. No writes.
 */
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { loadEnvLocal } from "./build-pch-persist-payload";
import { scoreServiceAccount } from "./score";
import { ENV_SERVICE_ID, ENV_WAVE1_COMPANY_IDS, PCH_SERVICE_ID } from "./env-wave1-manifest";
import type { ServiceFirstInput } from "./types";

const PAGE = 1000;
const INS_SERVICE_ID = "ddbbe11f-7352-4798-9546-76aff6f47944";

function timedClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
  if (!url || !anonKey) throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY");
  return createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      fetch: (input: RequestInfo | URL, init?: RequestInit) =>
        fetch(input, { ...init, cache: "no-store", signal: AbortSignal.timeout(25_000) }),
    },
  });
}

async function fetchAll<T>(supabase: SupabaseClient, table: string, fields: string, idCol: string): Promise<T[]> {
  const { count, error: countError } = await supabase.from(table).select(idCol, { count: "exact", head: true });
  if (countError) throw new Error(`${table}: ${countError.message}`);
  const rows: T[] = [];
  const total = count ?? 0;
  for (let from = 0; from < total; from += PAGE) {
    const to = Math.min(from + PAGE - 1, total - 1);
    const { data, error } = await supabase.from(table).select(fields).range(from, to);
    if (error) throw new Error(`${table}: ${error.message}`);
    rows.push(...(((data ?? []) as unknown) as T[]));
  }
  return rows;
}

function text(v: string | null | undefined): string | null {
  if (!v) return null;
  const t = v.trim();
  return t.length ? t : null;
}

function pack(input: ServiceFirstInput, result: ReturnType<typeof scoreServiceAccount>, extra: Record<string, unknown>) {
  const app = result.dimensions.find((d) => d.key === "subsectorFit");
  return {
    companyId: input.companyId,
    company: input.companyName,
    entity: input.entityType,
    industry: input.industry,
    subsector: input.subsector,
    customerType: input.customerType,
    parent: input.parentCompanyName,
    verified: input.verifiedCities,
    importedCity: input.importedCity,
    app: app?.rawScore ?? null,
    conf: `${result.dataConfidenceBand} ${result.dataConfidenceScore}`,
    score: result.commercialScore,
    tier: result.tier,
    kw: result.knownWeightTotal,
    rankingEligible: result.rankingEligible,
    eligibility: result.eligibility,
    ...extra,
  };
}

async function main() {
  loadEnvLocal();
  const supabase = timedClient();
  const pch = await supabase.from("company_service_stp_current").select("id", { count: "exact", head: true }).eq("service_id", PCH_SERVICE_ID);
  const env = await supabase.from("company_service_stp_current").select("id", { count: "exact", head: true }).eq("service_id", ENV_SERVICE_ID);
  const ins = await supabase.from("company_service_stp_current").select("id", { count: "exact", head: true }).eq("service_id", INS_SERVICE_ID);
  const companies = await fetchAll<{
    id: string;
    company_name: string | null;
    industry: string | null;
    subsector: string | null;
    customer_type: string | null;
    parent_company_name: string | null;
    account_status: string | null;
    city: string | null;
    industrial_city: string | null;
  }>(supabase, "companies", "id, company_name, industry, subsector, customer_type, parent_company_name, account_status, city, industrial_city", "id");
  const entities = await fetchAll<{ company_id: string; entity_type: string; account_group_key: string }>(
    supabase,
    "company_entity_resolution",
    "company_id, entity_type, account_group_key",
    "company_id",
  );
  const locations = await fetchAll<{ company_id: string; city: string; confidence: string | null }>(
    supabase,
    "company_locations",
    "company_id, city, confidence",
    "id",
  );
  const er = new Map(entities.map((r) => [r.company_id, r]));
  const locByCompany = new Map<string, string[]>();
  for (const row of locations) {
    if (row.confidence !== "HIGH") continue;
    locByCompany.set(row.company_id, [...(locByCompany.get(row.company_id) ?? []), row.city]);
  }

  const scored = companies.map((company) => {
    const meta = er.get(company.id);
    const input: ServiceFirstInput = {
      serviceId: INS_SERVICE_ID,
      serviceCode: "INS",
      serviceName: "Industrial Inspection",
      companyId: company.id,
      companyName: text(company.company_name) ?? "(unnamed)",
      industry: text(company.industry),
      subsector: text(company.subsector),
      customerType: text(company.customer_type),
      entityType: (meta?.entity_type as ServiceFirstInput["entityType"]) ?? null,
      parentCompanyName: text(company.parent_company_name),
      isExistingGeochemCustomer: null,
      accountStatus: text(company.account_status),
      verifiedCities: locByCompany.get(company.id) ?? [],
      importedCity: text(company.city),
      companyServicesNeed: null,
      companyServicesFitRating: null,
    };
    return {
      input,
      result: scoreServiceAccount(input),
      accountGroupKey: meta?.account_group_key ?? company.id,
      industrialCity: text(company.industrial_city),
    };
  });

  const byId = new Map(scored.map((r) => [r.input.companyId, r]));
  const facilities = scored
    .filter((r) => r.input.entityType === "FACILITY" && r.result.eligibility === "ELIGIBLE")
    .sort((a, b) => (b.result.commercialScore ?? 0) - (a.result.commercialScore ?? 0));
  const envWave1 = ENV_WAVE1_COMPANY_IDS.map((id) => {
    const row = byId.get(id);
    if (!row) return { companyId: id, missing: true };
    return pack(row.input, row.result, { group: row.accountGroupKey, industrialCity: row.industrialCity });
  });
  const epc = scored
    .filter(
      (r) =>
        r.result.rankingEligible &&
        (r.input.customerType === "EPC Contractor" || r.input.industry === "EPC / Projects"),
    )
    .sort((a, b) => (b.result.commercialScore ?? 0) - (a.result.commercialScore ?? 0))
    .slice(0, 40)
    .map((r) => pack(r.input, r.result, { group: r.accountGroupKey }));
  const om = scored
    .filter((r) => r.input.customerType === "O&M Contractor" && r.result.eligibility === "ELIGIBLE")
    .map((r) => pack(r.input, r.result, { rankingEligible: r.result.rankingEligible, group: r.accountGroupKey }));
  const nameNeedles = [
    "Sadara",
    "Tasnee",
    "National Industrialization",
    "Chemanol",
    "Methanol Chemicals",
    "Basic Chemical",
    "Nama Chemical",
    "Naas Petrol",
    "Saudi Cement",
    "Southern Province Cement",
    "Yanbu Cement",
    "Arabian Cement",
    "Qassim Cement",
    "Yamama Cement",
    "Eastern Province Cement",
    "Tabuk Cement",
    "Maaden",
    "Zamil",
    "Saudi Aramco Shell",
    "SASREF",
    "Petro Rabigh",
    "Rabigh Refining",
    "SABIC",
    "Sipchem",
    "SEC ",
    "Saudi Electricity",
    "SWCC",
    "Saline Water",
    "NESR",
    "Snamprogetti",
    "Technip",
    "Saipem",
    "JGC",
    "Samsung E&A",
    "Hyundai Engineering",
    "Tecnicas Reunidas",
    "GS Engineering",
    "Petrofac",
    "McDermott",
    "Lamprell",
    "Drydocks",
    "Bahri",
    "King Fahd Industrial Port",
    "Royal Commission",
  ];
  const named = scored
    .filter((r) => nameNeedles.some((n) => r.input.companyName.toLowerCase().includes(n.toLowerCase())))
    .map((r) => pack(r.input, r.result, { group: r.accountGroupKey, industrialCity: r.industrialCity }));

  const groupsOfInterest = new Set(ENV_WAVE1_COMPANY_IDS.map((id) => byId.get(id)?.accountGroupKey).filter(Boolean) as string[]);
  const groupMembers = scored
    .filter((r) => groupsOfInterest.has(r.accountGroupKey))
    .map((r) =>
      pack(r.input, r.result, { group: r.accountGroupKey, industrialCity: r.industrialCity }),
    );

  const out = {
    wrote: false,
    pchCurrent: pch.count,
    envCurrent: env.count,
    insCurrent: ins.count,
    universe: companies.length,
    facilityEligible: facilities.length,
    facilities: facilities.slice(0, 50).map((r) => pack(r.input, r.result, { group: r.accountGroupKey, industrialCity: r.industrialCity })),
    envWave1,
    epc,
    om,
    named,
    envGroupMembers: groupMembers,
  };
  const outPath = resolve(process.cwd(), "src/lib/stp/ins-32-2-2-wave1-audit-out.json");
  writeFileSync(outPath, JSON.stringify(out, null, 2), "utf8");
  process.stderr.write(`wrote ${outPath}\n`);
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
