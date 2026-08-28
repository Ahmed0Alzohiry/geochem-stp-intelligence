/**
 * STEP 32.2.1 INS scope dry-run. SELECT + in-memory score only. No writes.
 */
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { loadEnvLocal } from "./build-pch-persist-payload";
import { scoreServiceAccount } from "./score";
import { collapseByAccountGroup } from "./account-group";
import { ENV_SERVICE_ID, PCH_SERVICE_ID } from "./env-wave1-manifest";
import type { ServiceFirstInput } from "./types";

const PAGE = 1000;

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

async function fetchAll<T>(supabase: SupabaseClient, table: string, fields: string, idCol: string): Promise<{ total: number; rows: T[] }> {
  process.stderr.write(`fetch ${table}\n`);
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
  process.stderr.write(`fetched ${table} ${rows.length}\n`);
  return { total, rows };
}

function text(v: string | null | undefined): string | null {
  if (!v) return null;
  const t = v.trim();
  return t.length ? t : null;
}

const INS_APP = /inspection|integrity|ndt|pipeline|plant|turnaround|corrosion|coating|tank|pressure|vessel|fabricat|shutdown|welding|mechanical|refin|petrochem|polymer|terminal|offshore|compressor|turbine|boiler|cement|steel|smelt|desal/i;
const PROCESS_IM = /cement|steel|iron|smelt|foundry|pipe|pressure|vessel|tank|fabricat|coating|aluminum|aluminium|glass|ceramic|pharma|chemical|polymer|cable|heavy|mechanical equipment|industrial equipment/i;
const WEAK_IM = /food|poultry|flour|dairy|beverage|juice|snack|bottled water|catering|hygiene|packaging|modular building|trading|logistics|aviation|transport/i;
const COMP = /\b(?:sgs|intertek|bureau veritas|applus|tuv|als |element materials|ndt\b|inspection (?:co|company|services))\b/i;
const HOLDING = /investment|holding|trading co/i;
const CORE_IND = new Set(["Oil & Gas", "Refining", "Petrochemicals", "Mining & Minerals", "Power & Utilities", "Marine / Ports"]);
const COND_IND = new Set(["Chemicals", "Industrial Manufacturing", "EPC / Projects", "Water & Wastewater"]);

type Row = {
  input: ServiceFirstInput;
  result: ReturnType<typeof scoreServiceAccount>;
  accountGroupKey: string;
  city: string | null;
  industrialCity: string | null;
};

function classify(row: Pick<Row, "input" | "result">) {
  const blob = [row.input.companyName, row.input.subsector, row.input.industry].filter(Boolean).join(" | ");
  const appFit = row.result.dimensions.find((d) => d.key === "subsectorFit")?.rawScore ?? null;
  const appDirect = appFit === 96 || INS_APP.test(row.input.subsector || "") || INS_APP.test(row.input.companyName);
  const competitor = COMP.test(blob);
  const holding = HOLDING.test(row.input.companyName) || /investments$/i.test(row.input.subsector || "");
  const weakType = row.input.customerType === "Trader" || row.input.customerType === "Technical Partner";
  const industry = row.input.industry;
  const buyers = ["Asset Owner", "Operator", "Manufacturer", "EPC Contractor", "O&M Contractor", "Government Entity"];
  if (competitor) return { bucket: "exclude" as const, reason: "inspection/NDT competitor-like" };
  if (weakType) return { bucket: "exclude" as const, reason: `${row.input.customerType} is not a primary INS buyer` };
  if (holding) return { bucket: "hold" as const, reason: "investment/holding vehicle" };
  if (industry === "Industrial Manufacturing") {
    if (WEAK_IM.test(blob) && !PROCESS_IM.test(blob)) return { bucket: "exclude" as const, reason: "IM without process/asset inspection intensity" };
    if (PROCESS_IM.test(blob) || appDirect) return { bucket: "keep" as const, reason: "IM with process/asset/inspection signal" };
    return { bucket: "hold" as const, reason: "generic IM; need extra INS demand signal" };
  }
  if (industry === "EPC / Projects") {
    if (buyers.includes(row.input.customerType ?? "") || appDirect || row.input.customerType === "EPC Contractor") {
      return { bucket: "keep" as const, reason: "EPC/project inspection demand" };
    }
    if (row.input.customerType === "Prospect") return { bucket: "hold" as const, reason: "EPC industry but unmapped buyer class" };
    return { bucket: "keep" as const, reason: "EPC/projects in inspection market" };
  }
  if (CORE_IND.has(industry ?? "")) {
    if (buyers.includes(row.input.customerType ?? "") || row.input.entityType === "FACILITY" || appDirect) {
      return { bucket: "keep" as const, reason: "core INS-exposed industry with buyer/facility evidence" };
    }
    return { bucket: "hold" as const, reason: "core industry but Prospect/unmapped buyer class" };
  }
  if (COND_IND.has(industry ?? "")) {
    if (appDirect || PROCESS_IM.test(blob) || ["Asset Owner", "Operator", "Manufacturer", "EPC Contractor"].includes(row.input.customerType ?? "")) {
      return { bucket: "keep" as const, reason: "conditional industry with INS demand/buyer signal" };
    }
    return { bucket: "hold" as const, reason: "conditional industry, weak INS application" };
  }
  return { bucket: "exclude" as const, reason: "outside proposed INS commercial set" };
}

async function main() {
  process.stderr.write("INS 32.2.1 dry-run starting (SELECT only)\n");
  loadEnvLocal();
  const supabase = timedClient();
  process.stderr.write("counting PCH/ENV current rows\n");
  const pch = await supabase.from("company_service_stp_current").select("id", { count: "exact", head: true }).eq("service_id", PCH_SERVICE_ID);
  const env = await supabase.from("company_service_stp_current").select("id", { count: "exact", head: true }).eq("service_id", ENV_SERVICE_ID);
  const services = await fetchAll<{ id: string; name: string; service_code: string; active: boolean }>(supabase, "services", "id, name, service_code, active", "id");
  const ins = services.rows.find((r) => r.service_code === "INS" && r.active);
  if (!ins) throw new Error("INS not found");
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
  const er = new Map(entities.rows.map((r) => [r.company_id, r]));
  const locByCompany = new Map<string, string[]>();
  for (const row of locations.rows) {
    if (row.confidence !== "HIGH") continue;
    locByCompany.set(row.company_id, [...(locByCompany.get(row.company_id) ?? []), row.city]);
  }

  const scored: Row[] = companies.rows.map((company) => {
    const meta = er.get(company.id);
    const input: ServiceFirstInput = {
      serviceId: ins.id,
      serviceCode: "INS",
      serviceName: ins.name,
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
      city: text(company.city),
      industrialCity: text(company.industrial_city),
    };
  });

  const elig = { ELIGIBLE: 0, OUT_OF_SCOPE: 0, INSUFFICIENT_TO_ELIGIBLE: 0 };
  const oosInd: Record<string, number> = {};
  const eligInd: Record<string, number> = {};
  for (const row of scored) {
    elig[row.result.eligibility] += 1;
    if (row.result.eligibility === "OUT_OF_SCOPE") {
      const k = row.input.industry ?? "(missing)";
      oosInd[k] = (oosInd[k] ?? 0) + 1;
    }
    if (row.result.eligibility === "ELIGIBLE") {
      const k = row.input.industry ?? "(missing)";
      eligInd[k] = (eligInd[k] ?? 0) + 1;
    }
  }
  const eligible = scored.filter((r) => r.result.eligibility === "ELIGIBLE" && r.result.commercialScore != null);
  const grouped = collapseByAccountGroup(eligible);
  const persistTiers: Record<string, number> = { "Tier 1": 0, "Tier 2": 0, "Tier 3": 0, Watchlist: 0 };
  let rankingEligible = 0;
  const persistInd: Record<string, number> = {};
  const persistCust: Record<string, number> = {};
  const persistEnt: Record<string, number> = {};
  const persistApp = { 96: 0, 48: 0, unknown: 0 };
  for (const row of grouped) {
    persistTiers[row.result.tier ?? "Watchlist"] = (persistTiers[row.result.tier ?? "Watchlist"] ?? 0) + 1;
    if (row.result.rankingEligible) rankingEligible += 1;
    persistInd[row.input.industry ?? ""] = (persistInd[row.input.industry ?? ""] ?? 0) + 1;
    persistCust[row.input.customerType ?? "(missing)"] = (persistCust[row.input.customerType ?? "(missing)"] ?? 0) + 1;
    persistEnt[row.input.entityType ?? "(missing)"] = (persistEnt[row.input.entityType ?? "(missing)"] ?? 0) + 1;
    const af = row.result.dimensions.find((d) => d.key === "subsectorFit")?.rawScore;
    if (af === 96) persistApp[96] += 1;
    else if (af === 48) persistApp[48] += 1;
    else persistApp.unknown += 1;
  }

  const ranked = grouped
    .filter((r) => r.result.rankingEligible)
    .sort((a, b) => (b.result.commercialScore ?? 0) - (a.result.commercialScore ?? 0) || a.accountGroupKey.localeCompare(b.accountGroupKey));

  const classified = ranked.map((row) => {
    const c = classify(row);
    const app = row.result.dimensions.find((d) => d.key === "subsectorFit");
    return {
      company: row.input.companyName,
      entity: row.input.entityType,
      industry: row.input.industry,
      subsector: row.input.subsector,
      customerType: row.input.customerType,
      geo: (row.input.verifiedCities || []).join("/") || row.input.importedCity || "none",
      verified: (row.input.verifiedCities || []).length > 0,
      app: app?.rawScore ?? null,
      conf: `${row.result.dataConfidenceBand} ${row.result.dataConfidenceScore}`,
      score: row.result.commercialScore,
      tier: row.result.tier,
      kw: row.result.knownWeightTotal,
      bucket: c.bucket,
      reason: c.reason,
      parent: row.input.parentCompanyName,
    };
  });

  const keep = classified.filter((r) => r.bucket === "keep");
  const hold = classified.filter((r) => r.bucket === "hold");
  const exclR = classified.filter((r) => r.bucket === "exclude");
  const keepTiers: Record<string, number> = { "Tier 1": 0, "Tier 2": 0, "Tier 3": 0 };
  for (const row of keep) keepTiers[row.tier ?? ""] = (keepTiers[row.tier ?? ""] ?? 0) + 1;
  const keepByInd: Record<string, number> = {};
  for (const row of keep) keepByInd[row.industry ?? ""] = (keepByInd[row.industry ?? ""] ?? 0) + 1;

  const out = {
    wrote: false,
    pchCurrent: pch.count,
    envCurrent: env.count,
    insServiceId: ins.id,
    universe: companies.total,
    eligibility: elig,
    oosInd,
    eligInd,
    persistReps: grouped.length,
    persistTiers,
    rankingEligible,
    persistInd,
    persistCust,
    persistEnt,
    persistApp,
    commercial: { keep: keep.length, hold: hold.length, excludeFromRanked: exclR.length, keepTiers, keepByInd },
    top30: keep.slice(0, 30),
    engineTop15: classified.slice(0, 15),
    holdSample: hold.slice(0, 18),
    excludeSample: exclR.slice(0, 12),
  };
  const outPath = resolve(process.cwd(), "src/lib/stp/ins-32-2-1-dry-run-out.json");
  writeFileSync(outPath, JSON.stringify(out, null, 2), "utf8");
  process.stderr.write(`wrote ${outPath}\n`);
  console.log(JSON.stringify(out, null, 2));
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
