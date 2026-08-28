/**
 * STEP 32.6.1 MCT dry-run and commercial scope.
 * SELECT + in-memory overlay only. Does not write STP, registry, eligibility, or scoring config.
 */
import { writeFileSync } from "node:fs";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { loadEnvLocal } from "./build-pch-persist-payload";
import { ENV_SERVICE_ID, PCH_SERVICE_ID } from "./env-wave1-manifest";
import { INS_SERVICE_ID } from "./ins-wave1-manifest";
import { LAB_SERVICE_ID } from "./lab-wave1-manifest";
import { OCM_SERVICE_ID } from "./ocm-wave1-manifest";
import { PET_SERVICE_ID } from "./pet-wave1-manifest";
import { scoreServiceAccount } from "./score";
import { serviceReadiness } from "./service-registry";
import type { ServiceFirstInput } from "./types";

const PAGE = 1000;

type ClassLetter = "A" | "B" | "C" | "D";
type CompFlag = "none" | "COMPETITOR" | "PARTNER" | "VERIFY";
type AppTag = "metering" | "calibration" | "topography";

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
  /petrochem|cracker|polymer|polyethylene|polypropylene|polyolefin|olefin|aromatic|methanol|ethylene|yanpet|sadara|sipchem|tasnee|advanced petrochemical|kemya|sharq|petro rabigh|yansab|natpet/i;
const CHEM_PLANT = /chemical company|chemicals plant|specialty chemical|industrial chemical|chlor.?alkali|fertilizer plant/i;
const POWER = /power plant|power generation|combined cycle|thermal power|\bipp\b|\biwpp\b|saudi electricity/i;
const WATER = /desal|wastewater plant|sewage treatment|water treatment plant|miahona|\bswcc\b|\bnwc\b/i;
const MINING = /mine|mining|ore|smelt|phosphate|gold mine|copper mine|bauxite|maaden/i;
const CEMENT = /\bcement\b/i;
const STEEL = /steel mill|steel plant|rolling mill|aluminium smelter|aluminum smelter|\bhadeed\b/i;
const GAS_PROC = /gas plant|gas processing|ngls?\b|fractionat/i;
const TERMINAL = /tank farm|petroleum terminal|oil terminal|bulk plant|jetty|marine terminal|custody|pipeline/i;
const METERING_KW =
  /custody|flow.?meter|fiscal meter|allocation meter|meter prov|proving|tank gaug|metering skid|fiscal measurement|ship.?shore/i;
const CAL_KW =
  /calibrat|instrumentation|pressure transmitter|temperature transmitter|flow transmitter|level transmitter|metrology|instrument workshop/i;
const TOPO_KW = /topograph|land survey|geodetic|as-built survey|plant survey|construction survey|surveying/i;
const SELLER =
  /calibration services|calibrat(?:ion)? lab|metrology services|surveying company|survey consultants|geodetic services|instrumentation services|metering services|testing and calibration/i;
const TIC =
  /\b(?:sgs|intertek|bureau veritas|\bbv\b|applus|tuv|t[uü]v|als |element materials|inspectorate|caleb brett|saybolt|core laboratories|geochem|trescal|beamex|fluke calibration)\b/i;
const LICENSOR = /\b(?:axens|honeywell uop|\buop\b|technip|\bkbr\b|fluor\b|worley)\b/i;
const OFS = /\b(?:weatherford|baker hughes|\bslb\b|schlumberger|halliburton|national oilwell|\bnov\b)\b/i;
const HOLDING = /investment|holding(?!.*refin)/i;
const CONSULT = /consulting|consultancy|advisory/i;
const DISTRIB = /distributor|trading company|general trading/i;
const CONTAINER = /container terminal|container shipping|stevedor|freight forward/i;
const FOOD = /food|dairy|beverage|agriculture|poultry|feed mill/i;
const WESTERN = /yanbu|jeddah|rabigh/i;
const OTHER_IND = /jubail|ras tanura|dammam|khobar|jazan|riyadh|dhahran|ras al khair/i;
const USABLE_STATUS = new Set(["Prospect", "Current Customer", "Former Customer", "Partner", "Prospect Segment"]);
const CORE_INDUSTRY = new Set([
  "Refining",
  "Petrochemicals",
  "Chemicals",
  "Oil & Gas",
  "Power & Utilities",
  "Water & Wastewater",
  "Mining & Minerals",
  "Industrial Manufacturing",
]);

function plantCases(name: string, subsector: string | null): string[] {
  const blob = [name, subsector].filter(Boolean).join(" | ");
  const cases: string[] = [];
  if (REFINERY.test(blob) || REFINERY.test(name)) cases.push("refinery");
  if (PETRO_PLANT.test(blob) || PETRO_PLANT.test(name)) cases.push("petrochem");
  if (CHEM_PLANT.test(blob)) cases.push("chemical_plant");
  if (POWER.test(blob) || POWER.test(name)) cases.push("power");
  if (WATER.test(blob) || WATER.test(name)) cases.push("water");
  if (MINING.test(blob) || MINING.test(name)) cases.push("mining");
  if (CEMENT.test(blob)) cases.push("cement");
  if (STEEL.test(blob)) cases.push("steel");
  if (GAS_PROC.test(blob)) cases.push("gas");
  if (TERMINAL.test(blob)) cases.push("terminal");
  return cases;
}

function appsFor(name: string, subsector: string | null, plants: string[]): AppTag[] {
  const blob = [name, subsector].filter(Boolean).join(" | ");
  const apps = new Set<AppTag>();
  if (METERING_KW.test(blob) || plants.includes("terminal") || plants.includes("refinery") || plants.includes("gas")) {
    apps.add("metering");
  }
  if (
    CAL_KW.test(blob) ||
    plants.some((p) =>
      ["refinery", "petrochem", "chemical_plant", "power", "water", "mining", "cement", "steel", "gas", "terminal"].includes(p),
    )
  ) {
    apps.add("calibration");
  }
  if (TOPO_KW.test(blob) || plants.includes("mining") || plants.includes("cement")) {
    apps.add("topography");
  }
  return [...apps];
}

function appLabel(apps: AppTag[], plants: string[]): string {
  if (apps.length === 0) return "No credible metering, calibration, or industrial-survey buying case";
  const mix = apps.join(" + ");
  if (plants.includes("terminal")) return `${mix} — custody / tank / terminal measurement`;
  if (plants.includes("refinery")) return `${mix} — refinery fiscal/process metering and instrument calibration`;
  if (plants.includes("petrochem") || plants.includes("chemical_plant")) {
    return `${mix} — plant process metering and instrument calibration`;
  }
  if (plants.includes("gas")) return `${mix} — gas-plant allocation/fiscal metering and calibration`;
  if (plants.includes("power") || plants.includes("water")) return `${mix} — utility flow metering and instrument calibration`;
  if (plants.includes("mining") || plants.includes("cement") || plants.includes("steel")) {
    return `${mix} — heavy-industry calibration and site survey`;
  }
  return mix;
}

function family(plants: string[]): string {
  if (plants.includes("refinery")) return "refinery";
  if (plants.includes("petrochem")) return "petrochem";
  if (plants.includes("gas")) return "gas";
  if (plants.includes("terminal")) return "terminal";
  if (plants.includes("power")) return "power";
  if (plants.includes("water")) return "water";
  if (plants.includes("mining")) return "mining";
  if (plants.includes("chemical_plant")) return "chemical";
  if (plants.includes("cement") || plants.includes("steel")) return "heavy_mfg";
  return "other";
}

function competitorFlag(name: string, blob: string, customerType: string | null, industry: string | null): CompFlag {
  if (TIC.test(blob) || TIC.test(name) || SELLER.test(blob) || SELLER.test(name)) return "COMPETITOR";
  if (industry === "Industrial Services" && (CAL_KW.test(name) || TOPO_KW.test(name) || METERING_KW.test(name))) {
    if (customerType === "Technical Partner") return "PARTNER";
    return "COMPETITOR";
  }
  if (customerType === "Technical Partner" && (CAL_KW.test(blob) || TOPO_KW.test(blob))) return "PARTNER";
  if (industry === "EPC / Projects" && TOPO_KW.test(name) && /survey/i.test(name)) return "VERIFY";
  return "none";
}

function overlayScore(opts: {
  cls: ClassLetter;
  plants: string[];
  apps: AppTag[];
  entity: string | null;
  western: boolean;
  verified: boolean;
  customerType: string | null;
  overlapCount: number;
}): number {
  let s = 40;
  if (opts.plants.includes("refinery") || opts.plants.includes("terminal")) s = 94;
  else if (opts.plants.includes("petrochem") || opts.plants.includes("gas")) s = 90;
  else if (opts.plants.includes("chemical_plant")) s = 84;
  else if (opts.plants.includes("power") || opts.plants.includes("water")) s = 80;
  else if (opts.plants.includes("mining") || opts.plants.includes("cement") || opts.plants.includes("steel")) s = 76;
  else if (opts.cls === "A") s = 80;
  else if (opts.cls === "B") s = 62;
  else if (opts.cls === "C") s = 42;
  else s = 18;
  if (opts.apps.includes("metering") && opts.apps.includes("calibration")) s += 2;
  if (opts.entity === "FACILITY") s += 4;
  if (opts.verified) s += 3;
  if (opts.western) s += 2;
  if (opts.customerType === "Asset Owner" || opts.customerType === "Operator") s += 2;
  s += Math.min(opts.overlapCount, 3);
  return Math.min(99, s);
}

function classify(row: {
  name: string;
  industry: string | null;
  subsector: string | null;
  customerType: string | null;
  entity: string | null;
  accountStatus: string | null;
  plants: string[];
  apps: AppTag[];
  flag: CompFlag;
}): { cls: ClassLetter; rationale: string } {
  const blob = blobOf(row.name, row.subsector, row.industry);
  const industry = row.industry;
  const entity = row.entity;
  const type = row.customerType;
  const facility = entity === "FACILITY";
  const buyer = type === "Asset Owner" || type === "Operator" || type === "Manufacturer" || type === "Government Entity";
  const plant = row.plants;

  if (!USABLE_STATUS.has(row.accountStatus ?? "")) {
    return { cls: "D", rationale: `unusable account_status ${row.accountStatus}` };
  }
  if (row.flag === "COMPETITOR") {
    return { cls: "D", rationale: "calibration/survey/TIC/metrology service seller — not a GEOCHEM MCT buyer" };
  }
  if (LICENSOR.test(blob) || LICENSOR.test(row.name)) {
    return { cls: "D", rationale: "EPC/licensor brand — specifier at best, not the operating buyer" };
  }
  if (OFS.test(blob) || OFS.test(row.name)) {
    return { cls: "D", rationale: "oilfield services vendor — operators buy MCT, not OFS brands" };
  }
  if (type === "Technical Partner") {
    return { cls: "D", rationale: "Technical Partner is a channel/competitor grain, not an MCT buyer" };
  }
  if (CONSULT.test(blob) && plant.length === 0) return { cls: "D", rationale: "consulting without operating measurement assets" };
  if ((DISTRIB.test(blob) || type === "Trader") && !facility && plant.length === 0) {
    return { cls: "D", rationale: "trader/distributor without operating meters/instruments" };
  }
  if (CONTAINER.test(blob)) return { cls: "D", rationale: "container logistics — not industrial metering/calibration" };
  if (FOOD.test(blob) && industry !== "Chemicals") {
    return { cls: "C", rationale: "food/ag instrument calibration possible but GEOCHEM industrial fit unproven" };
  }
  if (row.flag === "VERIFY") {
    return { cls: "C", rationale: "survey/EPC name — specifier vs competing survey firm" };
  }
  if (HOLDING.test(row.name) && !facility) {
    return { cls: "C", rationale: "holding — prefer operating plants as MCT buyers" };
  }

  if (industry === "EPC / Projects") {
    if (type === "O&M Contractor" && (facility || plant.length > 0)) {
      return { cls: "B", rationale: "O&M may buy calibration/metering for client plants — growth, not automatic CORE" };
    }
    if (TOPO_KW.test(blob) || METERING_KW.test(blob)) {
      return { cls: "C", rationale: "EPC may specify MCT on projects — verify buyer vs competing survey/metering contractor" };
    }
    return { cls: "D", rationale: "generic EPC without metering/survey specifier evidence" };
  }
  if (industry === "Industrial Services") {
    return { cls: "D", rationale: "industrial services — typically MCT sellers or non-buyers" };
  }
  if (industry === "Marine / Ports") {
    if (plant.includes("terminal") || METERING_KW.test(blob)) {
      if (facility || buyer) return { cls: "A", rationale: "petroleum terminal / custody measurement — core metering" };
      return { cls: "B", rationale: "marine custody/terminal signal on HQ grain" };
    }
    return { cls: "D", rationale: "Marine / Ports without terminal/custody measurement evidence" };
  }
  if (industry === "Government / Public Sector") {
    if (buyer && (CAL_KW.test(blob) || plant.length > 0)) {
      return { cls: "C", rationale: "government metrology/utility mandate — verify vs SASO/GSO labs" };
    }
    return { cls: "D", rationale: "government without measurement-buyer grain" };
  }

  if (!industry) return { cls: "D", rationale: "missing industry" };
  if (!CORE_INDUSTRY.has(industry)) {
    return { cls: "D", rationale: `${industry} outside commercial GEOCHEM MCT buyer industries` };
  }

  const hydro =
    plant.includes("refinery") ||
    plant.includes("petrochem") ||
    plant.includes("gas") ||
    plant.includes("chemical_plant") ||
    plant.includes("terminal");

  if (hydro) {
    if (facility || buyer) return { cls: "A", rationale: "operating hydrocarbon/chemical site — recurring metering + instrument calibration" };
    return { cls: "B", rationale: "core plant signal on HQ grain — prefer facility as MCT buyer" };
  }

  if (industry === "Refining" || industry === "Petrochemicals") {
    if (facility || buyer) return { cls: "A", rationale: "refining/petrochemical operator — core metering/calibration buyer" };
    return { cls: "B", rationale: "refining/PCH ACCOUNT — growth vs site rows" };
  }

  if (industry === "Oil & Gas") {
    if (facility && (plant.length > 0 || buyer)) {
      return { cls: "A", rationale: "named O&G operating site — allocation/fiscal metering and calibration" };
    }
    if (facility || buyer) return { cls: "B", rationale: "O&G operator — confirm plant vs office" };
    return { cls: "C", rationale: "O&G HQ — verify operating measurement assets" };
  }

  if (industry === "Chemicals") {
    if (facility && buyer) return { cls: "A", rationale: "chemical manufacturing site — process metering and calibration" };
    if (facility || buyer) return { cls: "B", rationale: "chemicals operator — confirm plant vs office" };
    return { cls: "C", rationale: "chemicals HQ — verify operating instruments" };
  }

  if (industry === "Water & Wastewater") {
    if (facility || buyer) return { cls: "B", rationale: "water/desal operator — flow metering and instrument calibration growth" };
    return { cls: "C", rationale: "water industry without operator/facility grain" };
  }

  if (industry === "Power & Utilities") {
    if (facility || buyer) return { cls: "B", rationale: "power plant — flow/energy metering and I&C calibration" };
    return { cls: "C", rationale: "power industry without plant grain" };
  }

  if (industry === "Mining & Minerals") {
    if (facility || buyer) return { cls: "B", rationale: "mining/minerals site — calibration and topographic survey growth" };
    return { cls: "C", rationale: "mining without site grain" };
  }

  if (industry === "Industrial Manufacturing") {
    if (plant.includes("cement") || plant.includes("steel")) {
      if (facility || buyer) return { cls: "B", rationale: "heavy manufacturing plant — calibration and site survey" };
    }
    if (facility && buyer && row.apps.length > 0) {
      return { cls: "B", rationale: "named manufacturing plant with measurement evidence" };
    }
    return { cls: "C", rationale: "industrial manufacturing without plant/measurement evidence — industry alone is not CORE" };
  }

  return { cls: "C", rationale: "in-industry but insufficient MCT buying evidence" };
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
  plants: string[];
  apps: AppTag[];
  family: string;
  cls: ClassLetter;
  flag: CompFlag;
  rationale: string;
  overlayScore: number;
  group: string;
  groupSize: number;
  splitFromGroup: boolean;
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

function commercialReps(groups: Map<string, OutRow[]>): OutRow[] {
  const reps: OutRow[] = [];
  for (const members of groups.values()) {
    const plants = members.filter(
      (m) => m.entity === "FACILITY" && (m.cls === "A" || m.cls === "B") && m.family !== "other",
    );
    const families = new Set(plants.map((p) => p.family));
    if (plants.length >= 2 && families.size >= 2) {
      for (const plant of plants) {
        reps.push({ ...plant, groupSize: members.length, splitFromGroup: true });
      }
      continue;
    }
    const pick = pickRep(members);
    reps.push({ ...pick, groupSize: members.length, splitFromGroup: false });
  }
  return reps;
}

async function main() {
  process.stderr.write("MCT 32.6.1 dry-run (SELECT only; no scoring config writes)\n");
  loadEnvLocal();
  const supabase = timedClient();
  const before = {
    pch: await countService(supabase, PCH_SERVICE_ID),
    env: await countService(supabase, ENV_SERVICE_ID),
    ins: await countService(supabase, INS_SERVICE_ID),
    pet: await countService(supabase, PET_SERVICE_ID),
    ocm: await countService(supabase, OCM_SERVICE_ID),
    lab: await countService(supabase, LAB_SERVICE_ID),
  };

  const services = await fetchAll<{ id: string; name: string; service_code: string; active: boolean }>(
    supabase,
    "services",
    "id, name, service_code, active",
    "id",
  );
  const mct = services.rows.find((r) => r.service_code === "MCT" && r.active);
  if (!mct) throw new Error("MCT not found in live catalog");
  const mctCountBefore = await countService(supabase, mct.id);

  const pchIds = await currentIdsByService(supabase, PCH_SERVICE_ID);
  const envIds = await currentIdsByService(supabase, ENV_SERVICE_ID);
  const insIds = await currentIdsByService(supabase, INS_SERVICE_ID);
  const petIds = await currentIdsByService(supabase, PET_SERVICE_ID);
  const ocmIds = await currentIdsByService(supabase, OCM_SERVICE_ID);
  const labIds = await currentIdsByService(supabase, LAB_SERVICE_ID);

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
      serviceId: mct.id,
      serviceCode: "MCT",
      serviceName: mct.name,
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
    const plants = plantCases(name, subsector);
    const apps = appsFor(name, subsector, plants);
    const blob = blobOf(name, subsector, industry);
    const flag = competitorFlag(name, blob, input.customerType, industry);
    const decision = classify({
      name,
      industry,
      subsector,
      customerType: input.customerType,
      entity: input.entityType,
      accountStatus: input.accountStatus,
      plants,
      apps,
      flag,
    });
    const geoVerified = (input.verifiedCities || []).join("/") || null;
    const geo = geoVerified || input.importedCity || "none";
    const western = WESTERN.test(geo) || WESTERN.test(name);
    const locConfidence = geoVerified ? "HIGH" : input.importedCity ? "MEDIUM" : "LOW";
    const overlap: string[] = [];
    if (pchIds.has(company.id)) overlap.push("PCH");
    if (envIds.has(company.id)) overlap.push("ENV");
    if (insIds.has(company.id)) overlap.push("INS");
    if (petIds.has(company.id)) overlap.push("PET");
    if (ocmIds.has(company.id)) overlap.push("OCM");
    if (labIds.has(company.id)) overlap.push("LAB");
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
      useCase: appLabel(apps, plants),
      plants,
      apps,
      family: family(plants),
      cls: decision.cls,
      flag,
      rationale: decision.rationale,
      overlayScore: overlayScore({
        cls: decision.cls,
        plants,
        apps,
        entity: input.entityType,
        western,
        verified: (input.verifiedCities || []).length > 0,
        customerType: input.customerType,
        overlapCount: overlap.length,
      }),
      group: meta?.account_group_key ?? company.id,
      groupSize: 1,
      splitFromGroup: false,
      parent: input.parentCompanyName,
      overlap,
    };
  });

  const groups = new Map<string, OutRow[]>();
  for (const row of classified) {
    if (row.entity === "RELATED" || row.entity === "REVIEW") continue;
    groups.set(row.group, [...(groups.get(row.group) ?? []), row]);
  }
  const reps = commercialReps(groups);

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
    ocm: await countService(supabase, OCM_SERVICE_ID),
    lab: await countService(supabase, LAB_SERVICE_ID),
    mct: await countService(supabase, mct.id),
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
    if (row.verified && OTHER_IND.test(row.geo)) return "HIGH other industrial KSA";
    if (row.verified) return "HIGH other verified";
    if (WESTERN.test(row.geo) || OTHER_IND.test(row.geo)) return "MEDIUM imported industrial city";
    if (row.geo !== "none") return "MEDIUM imported city";
    return "LOW no location";
  };
  const geoAb: Record<string, number> = {};
  for (const row of ab) {
    const k = geoBucket(row);
    geoAb[k] = (geoAb[k] ?? 0) + 1;
  }

  const appMix = { metering: 0, calibration: 0, topography: 0, multiple: 0, none: 0 };
  for (const row of ab) {
    if (row.apps.length === 0) appMix.none += 1;
    else if (row.apps.length >= 2) appMix.multiple += 1;
    if (row.apps.includes("metering")) appMix.metering += 1;
    if (row.apps.includes("calibration")) appMix.calibration += 1;
    if (row.apps.includes("topography")) appMix.topography += 1;
  }

  const overlapCounts = { PCH: 0, ENV: 0, INS: 0, PET: 0, OCM: 0, LAB: 0, any: 0, none: 0 };
  const combo: Record<string, number> = {};
  for (const row of ab) {
    if (row.overlap.length) overlapCounts.any += 1;
    else overlapCounts.none += 1;
    for (const code of row.overlap) {
      if (code in overlapCounts) overlapCounts[code as keyof typeof overlapCounts] += 1;
    }
    const key = row.overlap.length ? `MCT+${row.overlap.join("+")}` : "MCT standalone";
    combo[key] = (combo[key] ?? 0) + 1;
  }

  const engineElig = classified.filter((r) => r.engineEligibility === "ELIGIBLE");
  const engineOos = classified.filter((r) => r.engineEligibility === "OUT_OF_SCOPE");
  const engineInsuff = classified.filter((r) => r.engineEligibility === "INSUFFICIENT_TO_ELIGIBLE");
  const engineApp96 = engineElig.filter((r) => r.engineApp === 96).length;
  const engineApp48 = engineElig.filter((r) => r.engineApp === 48).length;
  const engineAppNull = engineElig.filter((r) => r.engineApp == null).length;
  const engineEligButD = engineElig.filter((r) => r.cls === "D").length;
  const commercialAButOos = classified.filter((r) => r.cls === "A" && r.engineEligibility !== "ELIGIBLE").length;
  const oosInd: Record<string, number> = {};
  for (const row of engineOos) {
    const k = row.industry ?? "(missing)";
    oosInd[k] = (oosInd[k] ?? 0) + 1;
  }
  const eligInd: Record<string, number> = {};
  for (const row of engineElig) {
    const k = row.industry ?? "(missing)";
    eligInd[k] = (eligInd[k] ?? 0) + 1;
  }

  const slim = (rows: OutRow[]) =>
    rows.map((r) => ({
      cls: r.cls,
      flag: r.flag,
      company: r.company,
      companyId: r.companyId,
      industry: r.industry,
      subsector: r.subsector,
      customerType: r.customerType,
      entity: r.entity,
      geo: r.geo,
      locConfidence: r.locConfidence,
      useCase: r.useCase,
      apps: r.apps.join("+") || "none",
      overlap: r.overlap.join("+") || "none",
      overlayScore: r.overlayScore,
      engineScore: r.engineScore,
      engineElig: r.engineEligibility,
      engineApp: r.engineApp,
      rankingEligible: r.rankingEligible,
      groupSize: r.groupSize,
      splitFromGroup: r.splitFromGroup,
      rationale: r.rationale,
    }));

  const competitors = classified.filter((r) => r.flag !== "none");
  const splitGroups = reps.filter((r) => r.splitFromGroup).length;

  const out = {
    wrote: false,
    scoringConfigUnchanged: true,
    registryUnchanged: true,
    mctReadinessAtZero: serviceReadiness("MCT", 0),
    mctServiceId: mct.id,
    mctServiceName: mct.name,
    before: { ...before, mct: mctCountBefore },
    after,
    universe: companies.total,
    engineEligible: engineElig.length,
    engineOos: engineOos.length,
    engineInsufficient: engineInsuff.length,
    engineRankingEligible: classified.filter((r) => r.rankingEligible).length,
    engineApp96,
    engineApp48,
    engineAppNull,
    engineEligibleButCommercialD: engineEligButD,
    commercialAButEngineOos: commercialAButOos,
    engineEligByIndustry: Object.fromEntries(Object.entries(eligInd).sort((a, b) => b[1] - a[1])),
    engineOosByIndustry: Object.fromEntries(Object.entries(oosInd).sort((a, b) => b[1] - a[1]).slice(0, 20)),
    groupedReps: reps.length,
    splitFacilityRows: splitGroups,
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
    appMixAB: appMix,
    overlapAB: overlapCounts,
    combinationsAB: Object.fromEntries(Object.entries(combo).sort((a, b) => b[1] - a[1])),
    competitorFlags: {
      COMPETITOR: competitors.filter((r) => r.flag === "COMPETITOR").length,
      PARTNER: competitors.filter((r) => r.flag === "PARTNER").length,
      VERIFY: competitors.filter((r) => r.flag === "VERIFY").length,
    },
    competitorSamples: slim(competitors.sort((a, b) => a.company.localeCompare(b.company)).slice(0, 40)),
    top30AB: slim(ab.slice(0, 30)),
    allA: slim(reps.filter((r) => r.cls === "A").sort((a, b) => b.overlayScore - a.overlayScore)),
    growthB: slim(reps.filter((r) => r.cls === "B").sort((a, b) => b.overlayScore - a.overlayScore).slice(0, 40)),
    verifyC: slim(reps.filter((r) => r.cls === "C").sort((a, b) => b.overlayScore - a.overlayScore).slice(0, 25)),
  };

  writeFileSync("mct-32-6-1-scope-out.json", JSON.stringify(out, null, 2), "utf8");
  process.stdout.write(
    JSON.stringify(
      {
        wrote: false,
        before: out.before,
        after,
        mctId: mct.id,
        mctReadiness: out.mctReadinessAtZero,
        universe: companies.total,
        engine: {
          eligible: out.engineEligible,
          oos: out.engineOos,
          insufficient: out.engineInsufficient,
          rankingEligible: out.engineRankingEligible,
          app96: engineApp96,
          app48: engineApp48,
          appNull: engineAppNull,
          eligibleButD: engineEligButD,
          aButOos: commercialAButOos,
        },
        grouped: out.classCountsGrouped,
        ungrouped: out.classCountsUngrouped,
        splitFacilityRows: splitGroups,
        appMixAB: appMix,
        overlapAB: overlapCounts,
        competitorFlags: out.competitorFlags,
        aCount: out.allA.length,
        top15: out.top30AB.slice(0, 15).map((r, i) => ({
          rank: i + 1,
          cls: r.cls,
          company: r.company,
          industry: r.industry,
          apps: r.apps,
          geo: r.geo,
          loc: r.locConfidence,
          overlap: r.overlap,
          id: r.companyId,
        })),
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
    before.ocm === 25 &&
    before.lab === 21 &&
    mctCountBefore === 0 &&
    after.pch === 350 &&
    after.env === 24 &&
    after.ins === 22 &&
    after.pet === 18 &&
    after.ocm === 25 &&
    after.lab === 21 &&
    after.mct === 0 &&
    serviceReadiness("MCT", 0) === "NOT_CONFIGURED";
  if (!baselineOk) process.exitCode = 1;
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
