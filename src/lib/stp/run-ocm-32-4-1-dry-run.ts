/**
 * STEP 32.4.1 OCM dry-run and commercial scope.
 * SELECT + in-memory overlay only. Does not write STP, registry, or scoring config.
 */
import { writeFileSync } from "node:fs";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { loadEnvLocal } from "./build-pch-persist-payload";
import { ENV_SERVICE_ID, PCH_SERVICE_ID } from "./env-wave1-manifest";
import { INS_SERVICE_ID } from "./ins-wave1-manifest";
import { PET_SERVICE_ID } from "./pet-wave1-manifest";
import { scoreServiceAccount } from "./score";
import { serviceReadiness } from "./service-registry";
import type { ServiceFirstInput } from "./types";

const PAGE = 1000;

type ClassLetter = "A" | "B" | "C" | "D";

function timedClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
  if (!url || !anonKey) throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY");
  return createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      fetch: (input: RequestInfo | URL, init?: RequestInit) =>
        fetch(input, { ...init, cache: "no-store", signal: AbortSignal.timeout(60_000) }),
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

async function currentIdsByService(supabase: SupabaseClient, serviceId: string): Promise<Set<string>> {
  const ids = new Set<string>();
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from("company_service_stp_current")
      .select("company_id")
      .eq("service_id", serviceId)
      .range(from, from + PAGE - 1);
    if (error) throw new Error(error.message);
    const batch = data ?? [];
    for (const row of batch) ids.add(String(row.company_id));
    if (batch.length < PAGE) break;
  }
  return ids;
}

function text(v: string | null | undefined): string | null {
  if (!v) return null;
  const t = v.trim();
  return t.length ? t : null;
}

function blobOf(name: string, subsector: string | null, industry: string | null): string {
  return [name, subsector, industry].filter(Boolean).join(" | ");
}

const REFINERY = /refin|luberef|satorp|sasref|samref|yasref|base oil/i;
const PETRO_PLANT =
  /petrochem|cracker|polymer|polyethylene|polypropylene|polyolefin|olefin|aromatic|methanol|ethylene|yanpet|sadara|sipchem|tasnee|advanced petrochemical|kemya|sharq|petro rabigh polymer/i;
const POWER =
  /power plant|power generation|combined cycle|thermal power|\bipp\b|\biwpp\b|acwa power|marafiq|saudi electricity|rabigh power|yanbu power|jeddah south/i;
const WATER = /desal|wastewater plant|sewage treatment|water treatment plant|miahona|alkhorayef water|\bswcc\b/i;
const MINING = /mine|mining|ore|smelt|phosphate|gold mine|copper mine|bauxite|maaden/i;
const CEMENT = /\bcement\b/i;
const STEEL =
  /steel mill|steel plant|steel works|iron works|rolling mill|aluminium smelter|aluminum smelter|\bhadeed\b|metals plant/i;
const GAS_PROC = /gas plant|gas processing|ngls?\b|fractionat|gas compression|compressor station/i;
const ROTATING =
  /rotating equipment|oil condition|used oil|wear metal|gear oil|hydraulic oil|lube oil|oil analysis|condition.?based|\bcbm\b|predictive maintenance/i;
const TRANSFORMER = /transformer oil|dissolved gas|\bdga\b|insulating oil/i;
const FLEET = /\bfleet\b|tanker owner|\bbahri\b|marine engine|engine oil program/i;
const OM = /o&m|operation.?and.?maintenance|operations and maintenance/i;
const INDUSTRIAL_CITY = /\bmodon\b|industrial city|royal commission for (yanbu|jubail)/i;
const LICENSOR =
  /\b(?:axens|honeywell uop|\buop\b|technip|\bkbr\b|fluor\b|worley|jacobs engineering|wood group)\b/i;
const OFS =
  /\b(?:weatherford|baker hughes|\bslb\b|schlumberger|halliburton|national oilwell|\bnov\b|nabors|ades\b|precision drilling|helmerich|gulf drilling|china oilfield|aramco rowan|core laboratories)\b/i;
const COMP =
  /\b(?:sgs|intertek|bureau veritas|applus|tuv|als |element materials|wearcheck|spectro scientific|oil analysis lab)\b/i;
const HOLDING = /investment|holding(?!.*refin)/i;
const CONSULT = /consulting|consultancy|advisory(?!.*power)/i;
const DISTRIB = /distributor|trading company|general trading/i;
const CONTAINER = /container terminal|container shipping|stevedor|freight forward/i;
const WESTERN = /yanbu|jeddah|rabigh/i;
const USABLE_STATUS = new Set(["Prospect", "Current Customer", "Former Customer", "Partner"]);
const CORE_INDUSTRY = new Set([
  "Refining",
  "Petrochemicals",
  "Oil & Gas",
  "Power & Utilities",
  "Water & Wastewater",
  "Mining & Minerals",
  "Industrial Manufacturing",
  "Chemicals",
]);

function useCases(name: string, subsector: string | null): string[] {
  const blob = [name, subsector].filter(Boolean).join(" | ");
  const cases: string[] = [];
  if (REFINERY.test(blob) || REFINERY.test(name)) cases.push("refinery_rotating");
  if (PETRO_PLANT.test(blob) || PETRO_PLANT.test(name)) cases.push("petrochem_plant");
  if (POWER.test(blob) || POWER.test(name)) cases.push("power_generation");
  if (WATER.test(blob) || WATER.test(name)) cases.push("water_desal");
  if (MINING.test(blob) || MINING.test(name)) cases.push("mining");
  if (CEMENT.test(blob) || CEMENT.test(name)) cases.push("cement");
  if (STEEL.test(blob) || STEEL.test(name)) cases.push("steel_metals");
  if (GAS_PROC.test(blob)) cases.push("gas_processing");
  if (ROTATING.test(blob) || ROTATING.test(name)) cases.push("explicit_ocm_language");
  if (TRANSFORMER.test(blob)) cases.push("transformer_oil");
  if (FLEET.test(blob) || FLEET.test(name)) cases.push("marine_fleet");
  if (OM.test(blob) || OM.test(name)) cases.push("om_operator");
  return cases;
}

function useCaseLabel(cases: string[], industry: string | null): string {
  if (cases.includes("refinery_rotating")) return "Refinery rotating equipment / lube-oil CBM";
  if (cases.includes("petrochem_plant")) return "Petrochemical plant compressors/turbines/gearboxes";
  if (cases.includes("power_generation")) return "Power generation turbine/lube-oil monitoring";
  if (cases.includes("water_desal")) return "Desal/water plant pumps, turbines, hydraulics";
  if (cases.includes("mining")) return "Mining mobile/fixed plant oil analysis";
  if (cases.includes("cement")) return "Cement kiln/mill gearbox and hydraulic oil";
  if (cases.includes("steel_metals")) return "Steel/metals mill rotating equipment";
  if (cases.includes("gas_processing")) return "Gas plant compressors and turbines";
  if (cases.includes("explicit_ocm_language")) return "Named lubricant/rotating/reliability program";
  if (cases.includes("om_operator")) return "O&M contractor — plant lube programs on behalf of owner";
  if (cases.includes("marine_fleet")) return "Marine fleet engine/gear oil monitoring";
  if (cases.includes("transformer_oil")) return "Transformer oil only — not core rotating OCM";
  if (industry === "Industrial Manufacturing") return "Industrial plant machinery — verify scale";
  if (industry && CORE_INDUSTRY.has(industry)) return "Industry-implied machinery; no named OCM program";
  return "No credible OCM use case";
}

function overlayScore(opts: {
  cls: ClassLetter;
  cases: string[];
  entity: string | null;
  western: boolean;
  verified: boolean;
  customerType: string | null;
}): number {
  let s = 40;
  if (opts.cases.includes("refinery_rotating")) s = 92;
  else if (opts.cases.includes("petrochem_plant")) s = 88;
  else if (opts.cases.includes("power_generation") && opts.entity === "FACILITY") s = 86;
  else if (opts.cases.includes("gas_processing")) s = 84;
  else if (opts.cases.includes("cement") || opts.cases.includes("steel_metals")) s = 82;
  else if (opts.cases.includes("mining") && opts.entity === "FACILITY") s = 80;
  else if (opts.cases.includes("water_desal") && opts.entity === "FACILITY") s = 78;
  else if (opts.cases.includes("explicit_ocm_language")) s = 76;
  else if (opts.cases.includes("om_operator")) s = 70;
  else if (opts.cases.includes("marine_fleet")) s = 66;
  else if (opts.cls === "A") s = 80;
  else if (opts.cls === "B") s = 62;
  else if (opts.cls === "C") s = 42;
  else s = 12;
  if (opts.entity === "FACILITY") s += 8;
  else if (opts.entity === "ACCOUNT") s += 3;
  if (opts.western) s += 5;
  if (opts.verified) s += 4;
  if (opts.customerType === "Asset Owner") s += 5;
  else if (opts.customerType === "Operator") s += 5;
  else if (opts.customerType === "Manufacturer") s += 3;
  else if (opts.customerType === "O&M Contractor") s += 2;
  else if (opts.customerType === "Trader") s -= 8;
  if (opts.cls === "A") s += 3;
  return Math.round(Math.min(99.2, Math.max(8, s)) * 10) / 10;
}

function classify(row: {
  name: string;
  industry: string | null;
  subsector: string | null;
  customerType: string | null;
  entity: string | null;
  accountStatus: string | null;
  cases: string[];
}): { cls: ClassLetter; rationale: string } {
  const blob = blobOf(row.name, row.subsector, row.industry);
  const industry = row.industry;
  const entity = row.entity;
  const type = row.customerType;
  const facility = entity === "FACILITY";
  const buyer = type === "Asset Owner" || type === "Operator" || type === "Manufacturer" || type === "Government Entity";
  const plantCases = row.cases.filter((c) =>
    [
      "refinery_rotating",
      "petrochem_plant",
      "power_generation",
      "water_desal",
      "mining",
      "cement",
      "steel_metals",
      "gas_processing",
      "explicit_ocm_language",
    ].includes(c),
  );

  if (!USABLE_STATUS.has(row.accountStatus ?? "")) {
    return { cls: "D", rationale: `unusable account_status ${row.accountStatus}` };
  }
  if (COMP.test(blob)) return { cls: "D", rationale: "oil-analysis / inspection competitor — not an OCM buyer" };
  if (LICENSOR.test(blob) || LICENSOR.test(row.name)) {
    return { cls: "D", rationale: "process licensor / technology vendor — not the machinery owner" };
  }
  if (INDUSTRIAL_CITY.test(row.name) && !POWER.test(row.name) && !WATER.test(row.name)) {
    return { cls: "C", rationale: "industrial-city / park operator — tenants usually buy OCM, not the park" };
  }
  if (OFS.test(blob) || OFS.test(row.name)) {
    return { cls: "D", rationale: "oilfield services vendor — operator plants buy OCM, not OFS vendors" };
  }
  if (type === "Technical Partner") return { cls: "D", rationale: "Technical Partner is not an OCM program buyer" };
  if (CONSULT.test(blob) && !plantCases.length) return { cls: "D", rationale: "consulting without operating plant" };
  if (DISTRIB.test(blob) && !facility && !plantCases.length) {
    return { cls: "D", rationale: "distributor/trader grain without plant machinery" };
  }
  if (type === "Trader" && !facility && plantCases.length === 0) {
    return { cls: "D", rationale: "trader without operating-site machinery evidence" };
  }
  if (HOLDING.test(row.name) && !facility) {
    return { cls: "C", rationale: "investment/holding — verify operating plant vs paper company" };
  }
  if (/refineries company/i.test(row.name) && !facility) {
    return { cls: "C", rationale: "refinery holding company — site rows are the OCM buyers" };
  }

  if (industry === "EPC / Projects") {
    if (row.cases.includes("om_operator") || type === "O&M Contractor") {
      return { cls: "B", rationale: "O&M on industrial assets — growth OCM, not core owner" };
    }
    return { cls: "D", rationale: "EPC/projects is construction demand, not recurring used-oil programs" };
  }

  if (industry === "Industrial Services") {
    if (type === "O&M Contractor" || row.cases.includes("om_operator")) {
      return { cls: "B", rationale: "industrial O&M — can specify lube-oil labs for client plants" };
    }
    return { cls: "D", rationale: "generic industrial services without O&M/plant evidence" };
  }

  if (industry === "Marine / Ports") {
    if (CONTAINER.test(blob)) return { cls: "D", rationale: "container/port logistics — not machinery OCM buyer" };
    if (row.cases.includes("marine_fleet") && (facility || buyer)) {
      return { cls: "B", rationale: "marine fleet engine/gear oil — growth OCM" };
    }
    if (facility && (REFINERY.test(blob) || /terminal|tank farm|bulk plant/i.test(blob))) {
      return { cls: "B", rationale: "petroleum terminal pumps/hydraulics — growth, weaker than plants" };
    }
    return { cls: "D", rationale: "Marine / Ports without fleet or lubricated-plant evidence" };
  }

  if (row.cases.includes("transformer_oil") && plantCases.length === 0) {
    return { cls: "C", rationale: "transformer oil only — confirm if GEOCHEM OCM offering includes DGA" };
  }

  if (!industry) return { cls: "D", rationale: "missing industry" };
  if (!CORE_INDUSTRY.has(industry)) {
    return { cls: "D", rationale: `${industry} outside commercial OCM industries` };
  }

  const strongPlant =
    row.cases.includes("refinery_rotating") ||
    row.cases.includes("petrochem_plant") ||
    row.cases.includes("gas_processing") ||
    (row.cases.includes("power_generation") && (facility || buyer)) ||
    row.cases.includes("cement") ||
    row.cases.includes("steel_metals") ||
    (row.cases.includes("mining") && (facility || buyer)) ||
    (row.cases.includes("water_desal") && (facility || buyer)) ||
    (row.cases.includes("explicit_ocm_language") && (facility || buyer));

  if (strongPlant) {
    if (facility || buyer) return { cls: "A", rationale: "operating plant with recurring rotating-equipment OCM demand" };
    return { cls: "B", rationale: "plant-type signal on HQ/unmapped grain — prefer facility row" };
  }

  if (industry === "Refining" || row.cases.includes("refinery_rotating")) {
    if (facility || buyer) return { cls: "A", rationale: "operating refinery — core recurring OCM" };
    return { cls: "B", rationale: "refinery signal on HQ grain — prefer facility row" };
  }
  if (industry === "Petrochemicals" || row.cases.includes("petrochem_plant")) {
    if (facility || buyer) return { cls: "A", rationale: "petrochemical operating site — core OCM" };
    return { cls: "B", rationale: "petrochemicals at ACCOUNT grain — growth vs site rows" };
  }

  if (industry === "Power & Utilities" || industry === "Water & Wastewater") {
    if (facility || buyer) return { cls: "B", rationale: "utility/water operator — credible pumps/turbines, confirm plant vs HQ" };
    return { cls: "C", rationale: "utility industry without operator/facility grain" };
  }

  if (industry === "Mining & Minerals") {
    if (facility || buyer) return { cls: "B", rationale: "mining operator — mobile/fixed plant oil analysis growth" };
    return { cls: "C", rationale: "mining industry without site grain" };
  }

  if (industry === "Industrial Manufacturing" || industry === "Chemicals") {
    if (facility && buyer) return { cls: "B", rationale: "chemicals/manufacturing plant — growth OCM if scale is industrial" };
    if (facility || buyer) return { cls: "C", rationale: "manufacturing/chemicals — verify rotating fleet scale" };
    return { cls: "C", rationale: "manufacturing/chemicals HQ — verify operating plant" };
  }

  if (industry === "Oil & Gas") {
    if (facility || type === "Operator") {
      return { cls: "C", rationale: "Oil & Gas site without plant/rotating evidence — verify processing vs trading/office" };
    }
    return { cls: "C", rationale: "Oil & Gas without processing/plant evidence" };
  }

  return { cls: "D", rationale: "no commercial OCM machinery/oil-monitoring demand" };
}

type OutRow = {
  companyId: string;
  company: string;
  entity: string | null;
  industry: string | null;
  subsector: string | null;
  customerType: string | null;
  geo: string;
  locConfidence: string;
  verified: boolean;
  western: boolean;
  engineEligibility: string;
  engineScore: number | null;
  engineApp: number | null;
  engineTier: string | null;
  rankingEligible: boolean;
  useCase: string;
  cases: string[];
  cls: ClassLetter;
  rationale: string;
  overlayScore: number;
  group: string;
  groupSize: number;
  parent: string | null;
  overlap: string[];
};

const CLASS_RANK: Record<ClassLetter, number> = { A: 4, B: 3, C: 2, D: 1 };

function pickRep(members: OutRow[]): OutRow {
  return [...members].sort((a, b) => {
    if (CLASS_RANK[b.cls] !== CLASS_RANK[a.cls]) return CLASS_RANK[b.cls] - CLASS_RANK[a.cls];
    if (b.overlayScore !== a.overlayScore) return b.overlayScore - a.overlayScore;
    const ae = a.entity === "FACILITY" ? 1 : 0;
    const be = b.entity === "FACILITY" ? 1 : 0;
    if (be !== ae) return be - ae;
    if (Number(b.verified) !== Number(a.verified)) return Number(b.verified) - Number(a.verified);
    return a.company.localeCompare(b.company);
  })[0];
}

async function main() {
  process.stderr.write("OCM 32.4.1 dry-run (SELECT only; no scoring config writes)\n");
  loadEnvLocal();
  const supabase = timedClient();
  const before = {
    pch: await countService(supabase, PCH_SERVICE_ID),
    env: await countService(supabase, ENV_SERVICE_ID),
    ins: await countService(supabase, INS_SERVICE_ID),
    pet: await countService(supabase, PET_SERVICE_ID),
  };

  const services = await fetchAll<{ id: string; name: string; service_code: string; active: boolean }>(
    supabase,
    "services",
    "id, name, service_code, active",
    "id",
  );
  const ocm = services.rows.find((r) => r.service_code === "OCM" && r.active);
  if (!ocm) throw new Error("OCM not found in live catalog");
  const ocmCountBefore = await countService(supabase, ocm.id);

  const pchIds = await currentIdsByService(supabase, PCH_SERVICE_ID);
  const envIds = await currentIdsByService(supabase, ENV_SERVICE_ID);
  const insIds = await currentIdsByService(supabase, INS_SERVICE_ID);
  const petIds = await currentIdsByService(supabase, PET_SERVICE_ID);

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

  const classified: OutRow[] = companies.rows.map((company) => {
    const meta = er.get(company.id);
    const name = text(company.company_name) ?? "(unnamed)";
    const industry = text(company.industry);
    const subsector = text(company.subsector);
    const input: ServiceFirstInput = {
      serviceId: ocm.id,
      serviceCode: "OCM",
      serviceName: ocm.name,
      companyId: company.id,
      companyName: name,
      industry,
      subsector,
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
    const result = scoreServiceAccount(input);
    const cases = useCases(name, subsector);
    const decision = classify({
      name,
      industry,
      subsector,
      customerType: input.customerType,
      entity: input.entityType,
      accountStatus: input.accountStatus,
      cases,
    });
    const geoVerified = (input.verifiedCities || []).join("/") || null;
    const geo = geoVerified || input.importedCity || "none";
    const western = WESTERN.test(geo) || WESTERN.test(name);
    const locConfidence = geoVerified ? "HIGH verified" : input.importedCity ? "imported city only" : "none";
    const overlap: string[] = [];
    if (pchIds.has(company.id)) overlap.push("PCH");
    if (envIds.has(company.id)) overlap.push("ENV");
    if (insIds.has(company.id)) overlap.push("INS");
    if (petIds.has(company.id)) overlap.push("PET");
    const engineApp = result.dimensions.find((d) => d.key === "subsectorFit")?.rawScore ?? null;
    return {
      companyId: company.id,
      company: name,
      entity: input.entityType,
      industry,
      subsector,
      customerType: input.customerType,
      geo,
      locConfidence,
      verified: (input.verifiedCities || []).length > 0,
      western,
      engineEligibility: result.eligibility,
      engineScore: result.commercialScore,
      engineApp,
      engineTier: result.tier,
      rankingEligible: result.rankingEligible,
      useCase: useCaseLabel(cases, industry),
      cases,
      cls: decision.cls,
      rationale: decision.rationale,
      overlayScore: overlayScore({
        cls: decision.cls,
        cases,
        entity: input.entityType,
        western,
        verified: (input.verifiedCities || []).length > 0,
        customerType: input.customerType,
      }),
      group: meta?.account_group_key ?? company.id,
      groupSize: 1,
      parent: input.parentCompanyName,
      overlap,
    };
  });

  const groups = new Map<string, OutRow[]>();
  for (const row of classified) {
    if (row.entity === "RELATED" || row.entity === "REVIEW") continue;
    groups.set(row.group, [...(groups.get(row.group) ?? []), row]);
  }
  const reps: OutRow[] = [];
  for (const members of groups.values()) {
    const pick = pickRep(members);
    reps.push({ ...pick, groupSize: members.length });
  }

  const countCls = (letter: ClassLetter, rows: OutRow[]) => rows.filter((r) => r.cls === letter).length;
  const ab = reps
    .filter((r) => r.cls === "A" || r.cls === "B")
    .sort((a, b) => {
      if (CLASS_RANK[b.cls] !== CLASS_RANK[a.cls]) return CLASS_RANK[b.cls] - CLASS_RANK[a.cls];
      return b.overlayScore - a.overlayScore || a.company.localeCompare(b.company);
    });

  const after = {
    pch: await countService(supabase, PCH_SERVICE_ID),
    env: await countService(supabase, ENV_SERVICE_ID),
    ins: await countService(supabase, INS_SERVICE_ID),
    pet: await countService(supabase, PET_SERVICE_ID),
    ocm: await countService(supabase, ocm.id),
  };

  const byInd = (letter: ClassLetter) => {
    const m: Record<string, number> = {};
    for (const row of reps.filter((r) => r.cls === letter)) {
      m[row.industry ?? "(missing)"] = (m[row.industry ?? "(missing)"] ?? 0) + 1;
    }
    return Object.fromEntries(Object.entries(m).sort((a, b) => b[1] - a[1]));
  };

  const geoBucket = (row: OutRow) => {
    if (row.verified && row.western) return "HIGH western (Yanbu/Jeddah/Rabigh)";
    if (row.verified) return "HIGH other KSA";
    if (WESTERN.test(row.geo)) return "imported/name western";
    if (row.geo !== "none") return "imported city only";
    return "no location";
  };
  const geoAb: Record<string, number> = {};
  for (const row of ab) {
    const k = geoBucket(row);
    geoAb[k] = (geoAb[k] ?? 0) + 1;
  }

  const overlapCounts = { PCH: 0, ENV: 0, INS: 0, PET: 0, any: 0, none: 0 };
  for (const row of ab) {
    if (row.overlap.length) overlapCounts.any += 1;
    else overlapCounts.none += 1;
    if (row.overlap.includes("PCH")) overlapCounts.PCH += 1;
    if (row.overlap.includes("ENV")) overlapCounts.ENV += 1;
    if (row.overlap.includes("INS")) overlapCounts.INS += 1;
    if (row.overlap.includes("PET")) overlapCounts.PET += 1;
  }

  const engineElig = classified.filter((r) => r.engineEligibility === "ELIGIBLE");
  const engineOos = classified.filter((r) => r.engineEligibility === "OUT_OF_SCOPE");
  const engineInsuff = classified.filter((r) => r.engineEligibility === "INSUFFICIENT_TO_ELIGIBLE");
  const engineApp96 = engineElig.filter((r) => r.engineApp === 96).length;
  const engineApp48 = engineElig.filter((r) => r.engineApp === 48).length;
  const oosInd: Record<string, number> = {};
  for (const row of engineOos) {
    const k = row.industry ?? "(missing)";
    oosInd[k] = (oosInd[k] ?? 0) + 1;
  }

  const slim = (rows: OutRow[]) =>
    rows.map((r) => ({
      cls: r.cls,
      company: r.company,
      companyId: r.companyId,
      industry: r.industry,
      subsector: r.subsector,
      customerType: r.customerType,
      entity: r.entity,
      geo: r.geo,
      locConfidence: r.locConfidence,
      useCase: r.useCase,
      overlap: r.overlap.join("+") || "none",
      overlayScore: r.overlayScore,
      engineScore: r.engineScore,
      engineElig: r.engineEligibility,
      engineApp: r.engineApp,
      rankingEligible: r.rankingEligible,
      groupSize: r.groupSize,
      rationale: r.rationale,
    }));

  const out = {
    wrote: false,
    scoringConfigUnchanged: true,
    registryUnchanged: true,
    ocmReadinessAtZero: serviceReadiness("OCM", 0),
    ocmServiceId: ocm.id,
    before: { ...before, ocm: ocmCountBefore },
    after,
    universe: companies.total,
    engineEligible: engineElig.length,
    engineOos: engineOos.length,
    engineInsufficient: engineInsuff.length,
    engineRankingEligible: classified.filter((r) => r.rankingEligible).length,
    engineApp96,
    engineApp48,
    engineOosByIndustry: Object.fromEntries(Object.entries(oosInd).sort((a, b) => b[1] - a[1]).slice(0, 20)),
    groupedReps: reps.length,
    classCountsUngrouped: {
      A: countCls("A", classified),
      B: countCls("B", classified),
      C: countCls("C", classified),
      D: countCls("D", classified),
    },
    classCountsGrouped: {
      A: countCls("A", reps),
      B: countCls("B", reps),
      C: countCls("C", reps),
      D: countCls("D", reps),
    },
    classByIndustryGrouped: { A: byInd("A"), B: byInd("B"), C: byInd("C") },
    geoAb,
    overlapAB: overlapCounts,
    top30AB: slim(ab.slice(0, 30)),
    allA: slim(reps.filter((r) => r.cls === "A").sort((a, b) => b.overlayScore - a.overlayScore)),
    growthB: slim(reps.filter((r) => r.cls === "B").sort((a, b) => b.overlayScore - a.overlayScore).slice(0, 40)),
    verifyC: slim(reps.filter((r) => r.cls === "C").sort((a, b) => b.overlayScore - a.overlayScore).slice(0, 25)),
    overlapSamples: {
      pet: slim(ab.filter((r) => r.overlap.includes("PET")).slice(0, 20)),
      ins: slim(ab.filter((r) => r.overlap.includes("INS")).slice(0, 15)),
      env: slim(ab.filter((r) => r.overlap.includes("ENV")).slice(0, 15)),
      pch: slim(ab.filter((r) => r.overlap.includes("PCH")).slice(0, 15)),
    },
  };

  writeFileSync("ocm-32-4-1-scope-out.json", JSON.stringify(out, null, 2), "utf8");
  process.stderr.write(
    JSON.stringify(
      {
        wrote: false,
        before: out.before,
        after,
        ocmId: ocm.id,
        ocmReadiness: out.ocmReadinessAtZero,
        universe: companies.total,
        engine: {
          eligible: out.engineEligible,
          oos: out.engineOos,
          insufficient: out.engineInsufficient,
          rankingEligible: out.engineRankingEligible,
          app96: engineApp96,
          app48: engineApp48,
        },
        grouped: out.classCountsGrouped,
        ungrouped: out.classCountsUngrouped,
        overlapAB: overlapCounts,
        top30: out.top30AB.map((r) => ({
          cls: r.cls,
          company: r.company,
          industry: r.industry,
          score: r.overlayScore,
          overlap: r.overlap,
          id: r.companyId,
        })),
        aCount: out.allA.length,
      },
      null,
      2,
    ) + "\n",
  );

  const baselineOk =
    before.pch === 350 &&
    before.env === 24 &&
    before.ins === 22 &&
    before.pet === 18 &&
    ocmCountBefore === 0 &&
    after.pch === 350 &&
    after.env === 24 &&
    after.ins === 22 &&
    after.pet === 18 &&
    after.ocm === 0 &&
    serviceReadiness("OCM", 0) === "NOT_CONFIGURED";
  if (!baselineOk) process.exitCode = 1;
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
