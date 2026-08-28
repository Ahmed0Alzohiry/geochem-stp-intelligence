/**
 * STEP 32.3.1 PET discovery dry-run. SELECT + in-memory score only. No writes.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { loadEnvLocal } from "./build-pch-persist-payload";
import { scoreServiceAccount } from "./score";
import { collapseByAccountGroup } from "./account-group";
import { ENV_SERVICE_ID, PCH_SERVICE_ID } from "./env-wave1-manifest";
import { INS_SERVICE_ID } from "./ins-wave1-manifest";
import type { ServiceFirstInput } from "./types";

const PAGE = 1000;
const PET_SERVICE_ID_EXPECTED = "4f2e1c0a-5dbf-42cf-9a11-112c2aad375b";

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

async function countService(supabase: SupabaseClient, serviceId: string) {
  const { count, error } = await supabase
    .from("company_service_stp_current")
    .select("id", { count: "exact", head: true })
    .eq("service_id", serviceId);
  if (error) throw new Error(error.message);
  return count ?? 0;
}

function text(v: string | null | undefined): string | null {
  if (!v) return null;
  const t = v.trim();
  return t.length ? t : null;
}

const PET_OPS =
  /refin|crude|terminal|tank farm|tankage|storage terminal|petroleum terminal|oil terminal|fuel terminal|fuel distribution|bunker|marine fuel|custody|ship.?shore|midstream|downstream|pipeline|export terminal|import terminal|oil depot|petroleum product|fuel oil|jet fuel|naphtha|asphalt|bitumen|base oil|luberef|satorp|sasref|samref|yasref|jazan/i;
const STRATEGIC_OPERATOR = /^Saudi Arabian Oil Company$/i;
const POLYMER_PCH = /polymer|polyethylene|polypropylene|polyolefin|yanpet|petrochemical operations/i;
const UPSTREAM_GEOCHEM = /drilling|reservoir|wellsite|geophysic|seismic|exploration geology|upstream/i;
const OFS =
  /\b(?:weatherford|baker hughes|\bslb\b|schlumberger|halliburton|national oilwell|\bnov\b|honeywell uop|axens|core laboratories|nabors|ades\b|precision drilling|helmerich|patterson-uti|gulf drilling|sinopec international petroleum service|cameron|oceaneering|kanoo energy|sanad\b|china oilfield|aramco rowan)\b/i;
const COMP = /\b(?:sgs|intertek|bureau veritas|applus|tuv|als |element materials|ndt\b|inspection (?:co|company|services))\b/i;
const HOLDING = /investment|holding(?!.*refin)/i;
const WESTERN = /yanbu|jeddah|rabigh/i;
const USABLE_STATUS = new Set(["Prospect", "Current Customer", "Former Customer", "Partner"]);

type Row = {
  input: ServiceFirstInput;
  result: ReturnType<typeof scoreServiceAccount>;
  accountGroupKey: string;
  importedCity: string | null;
};

function classify(row: Pick<Row, "input" | "result">): { bucket: "keep" | "hold" | "exclude"; reason: string } {
  const blob = [row.input.companyName, row.input.subsector, row.input.industry].filter(Boolean).join(" | ");
  const ops = PET_OPS.test(blob) || PET_OPS.test(row.input.companyName);
  const polymer = POLYMER_PCH.test(blob) && !/refin/i.test(row.input.companyName);
  const upstream = UPSTREAM_GEOCHEM.test(blob) && !ops;
  const competitor = COMP.test(blob);
  const holding = HOLDING.test(row.input.companyName) || /investments$/i.test(row.input.subsector || "");
  const type = row.input.customerType;
  const industry = row.input.industry;
  const entity = row.input.entityType;
  const buyer = type === "Asset Owner" || type === "Operator" || type === "Manufacturer" || type === "Government Entity";

  if (!USABLE_STATUS.has(row.input.accountStatus ?? "")) {
    return { bucket: "exclude", reason: `unusable account_status ${row.input.accountStatus}` };
  }
  if (competitor) return { bucket: "exclude", reason: "inspection competitor-like; not a PET buyer" };
  if (OFS.test(blob) || OFS.test(row.input.companyName)) {
    return { bucket: "exclude", reason: "oilfield services / equipment vendor — not a PET cargo/quantity inspection buyer" };
  }
  if (type === "Technical Partner") return { bucket: "exclude", reason: "Technical Partner is not a PET inspection buyer" };
  if (type === "Trader" && entity !== "FACILITY" && !ops) {
    return { bucket: "exclude", reason: "petroleum trader without operating terminal/facility evidence" };
  }
  if (holding) return { bucket: "hold", reason: "investment/holding vehicle" };
  if (STRATEGIC_OPERATOR.test(row.input.companyName) && entity === "ACCOUNT") {
    return { bucket: "keep", reason: "integrated national oil company — PET buyer at account grain; site-level rows preferred when they exist" };
  }
  if (polymer) return { bucket: "hold", reason: "polymer/petrochemical operations — PCH/INS demand, weak PET cargo/quantity case" };
  if (upstream) return { bucket: "hold", reason: "upstream/geochem phrase; engine PET regex matches, commercial PET is inspection/testing" };
  if (industry === "Refining" || /refin/i.test(row.input.companyName) || /refin/i.test(row.input.subsector || "")) {
    if (entity === "FACILITY" || buyer || ops) return { bucket: "keep", reason: "refinery / refining operations" };
    return { bucket: "hold", reason: "refining industry but HQ/unmapped buyer class" };
  }
  if (ops && (industry === "Oil & Gas" || industry === "Refining" || industry === "Petrochemicals")) {
    if (entity === "FACILITY" || buyer || type === "Operator") {
      return { bucket: "keep", reason: "terminal/storage/pipeline/fuel operations signal" };
    }
    return { bucket: "hold", reason: "ops language but Prospect/HQ — verify operating site" };
  }
  if (industry === "Oil & Gas") {
    if (ops && (entity === "FACILITY" || buyer || type === "Operator")) {
      return { bucket: "keep", reason: "Oil & Gas operating site with PET terminal/refinery/fuel/pipeline evidence" };
    }
    if (type === "Trader") return { bucket: "hold", reason: "Oil & Gas trader — confirm custody-transfer/ops demand" };
    return { bucket: "hold", reason: "Oil & Gas eligible but no terminal/refinery/ops evidence" };
  }
  if (industry === "Petrochemicals") {
    return { bucket: "hold", reason: "petrochemicals — feedstock/product quality possible; not a primary PET Wave-1 buyer" };
  }
  return { bucket: "exclude", reason: "no commercial PET inspection/testing demand signal" };
}

async function main() {
  process.stderr.write("PET 32.3.1 dry-run starting (SELECT only)\n");
  loadEnvLocal();
  const supabase = timedClient();
  const before = {
    pch: await countService(supabase, PCH_SERVICE_ID),
    env: await countService(supabase, ENV_SERVICE_ID),
    ins: await countService(supabase, INS_SERVICE_ID),
    pet: await countService(supabase, PET_SERVICE_ID_EXPECTED),
  };

  const services = await fetchAll<{ id: string; name: string; service_code: string; active: boolean }>(
    supabase,
    "services",
    "id, name, service_code, active",
    "id",
  );
  const pet = services.rows.find((r) => r.service_code === "PET" && r.active);
  if (!pet) throw new Error("PET not found");
  if (pet.id !== PET_SERVICE_ID_EXPECTED) throw new Error(`Live PET id ${pet.id} !== expected ${PET_SERVICE_ID_EXPECTED}`);

  const companies = await fetchAll<{
    id: string;
    company_name: string | null;
    industry: string | null;
    subsector: string | null;
    customer_type: string | null;
    parent_company_name: string | null;
    account_status: string | null;
    city: string | null;
  }>(
    supabase,
    "companies",
    "id, company_name, industry, subsector, customer_type, parent_company_name, account_status, city",
    "id",
  );
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
      serviceId: pet.id,
      serviceCode: "PET",
      serviceName: pet.name,
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
      importedCity: text(company.city),
    };
  });

  const elig = { ELIGIBLE: 0, OUT_OF_SCOPE: 0, INSUFFICIENT_TO_ELIGIBLE: 0 };
  const oosInd: Record<string, number> = {};
  const eligInd: Record<string, number> = {};
  for (const row of scored) {
    elig[row.result.eligibility] += 1;
    const k = row.input.industry ?? "(missing)";
    if (row.result.eligibility === "OUT_OF_SCOPE") oosInd[k] = (oosInd[k] ?? 0) + 1;
    if (row.result.eligibility === "ELIGIBLE") eligInd[k] = (eligInd[k] ?? 0) + 1;
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

  const rankedAll = [...grouped].sort(
    (a, b) =>
      (b.result.commercialScore ?? 0) - (a.result.commercialScore ?? 0) || a.accountGroupKey.localeCompare(b.accountGroupKey),
  );

  const classified = rankedAll.map((row) => {
    const c = classify(row);
    const app = row.result.dimensions.find((d) => d.key === "subsectorFit");
    const geoVerified = (row.input.verifiedCities || []).join("/") || null;
    const geo = geoVerified || row.input.importedCity || "none";
    const western = WESTERN.test(geo) || WESTERN.test(row.input.companyName);
    return {
      companyId: row.input.companyId,
      company: row.input.companyName,
      entity: row.input.entityType,
      industry: row.input.industry,
      subsector: row.input.subsector,
      customerType: row.input.customerType,
      geo,
      verified: (row.input.verifiedCities || []).length > 0,
      western,
      app: app?.rawScore ?? null,
      conf: `${row.result.dataConfidenceBand} ${row.result.dataConfidenceScore}`,
      score: row.result.commercialScore,
      tier: row.result.tier,
      kw: row.result.knownWeightTotal,
      rankingEligible: row.result.rankingEligible,
      eligibilityReason: row.result.eligibilityReason,
      roles: row.result.recommendedContactRoles,
      departments: row.result.recommendedDepartments,
      group: row.accountGroupKey,
      groupSize: row.groupSize,
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
  const westernKeep = keep.filter((r) => r.western);

  const after = {
    pch: await countService(supabase, PCH_SERVICE_ID),
    env: await countService(supabase, ENV_SERVICE_ID),
    ins: await countService(supabase, INS_SERVICE_ID),
    pet: await countService(supabase, pet.id),
  };

  const out = {
    wrote: false,
    petService: { id: pet.id, name: pet.name, service_code: pet.service_code },
    catalogNote:
      "Live PET playbook is still geochemistry/reservoir-fluid positioning. Commercial overlay treats PET as petroleum inspection/quantity/quality/cargo/terminal/bunkering demand.",
    engineGaps: [
      "Marine / Ports is OUT_OF_SCOPE for PET (eligible industries are Oil & Gas, Refining, Petrochemicals only).",
      "PET application regex includes drilling/reservoir/seismic/wellsite (geochem catalog) and omits terminal/tank farm/bunker/custody phrases.",
      "Traders remain engine-eligible at customerTypeFit 24 if industry is in CORE_OIL.",
    ],
    before,
    after,
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
    commercial: {
      keep: keep.length,
      hold: hold.length,
      excludeFromRanked: exclR.length,
      keepTiers,
      keepByInd,
      westernKeep: westernKeep.length,
      persistableKeep: keep.filter((r) => r.rankingEligible).length,
    },
    top30: keep.slice(0, 30),
    engineTop20: classified.filter((r) => r.rankingEligible).slice(0, 20),
    holdSample: hold.slice(0, 20),
    excludeSample: exclR.slice(0, 12),
    westernKeep: westernKeep.slice(0, 20),
  };
  const { writeFileSync } = await import("node:fs");
  writeFileSync("pet-32-3-1-dry-run-out.json", JSON.stringify(out, null, 2), "utf8");
  console.log(JSON.stringify(out, null, 2));
  if (before.pch !== 350 || before.env !== 24 || before.ins !== 22 || before.pet !== 0) process.exitCode = 1;
  if (after.pch !== 350 || after.env !== 24 || after.ins !== 22 || after.pet !== 0) process.exitCode = 1;
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
