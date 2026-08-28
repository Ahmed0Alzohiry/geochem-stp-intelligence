/**
 * STEP 32.3.2 PET commercial scope refinement.
 * SELECT + in-memory overlay only. Does not write STP, registry, or scoring config.
 */
import { writeFileSync } from "node:fs";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { loadEnvLocal } from "./build-pch-persist-payload";
import { scoreServiceAccount } from "./score";
import { ENV_SERVICE_ID, PCH_SERVICE_ID } from "./env-wave1-manifest";
import { INS_SERVICE_ID } from "./ins-wave1-manifest";
import type { ServiceFirstInput } from "./types";

const PAGE = 1000;
const PET_SERVICE_ID_EXPECTED = "4f2e1c0a-5dbf-42cf-9a11-112c2aad375b";

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

function text(v: string | null | undefined): string | null {
  if (!v) return null;
  const t = v.trim();
  return t.length ? t : null;
}

const REFINERY = /refin|luberef|satorp|sasref|samref|yasref|base oil/i;
const TERMINAL = /terminal|tank farm|tankage|bulk plant|oil depot|storage terminal|petroleum storage|fuel terminal|oil jetty|export terminal|import terminal|spm\b|sbm\b|single buoy/i;
const BUNKER = /bunker|bunkering|marine fuel|vlsfo|hsfo|\bifo\b|fuel oil/i;
const CARGO = /cargo inspection|quantity|ship.?shore|custody|loss control|petroleum cargo|oil tanker|product tanker|crude tanker/i;
const FUEL_DIST = /fuel distribution|petroleum product|jet fuel|aviation fuel|gasoline|diesel|naphtha|asphalt|bitumen|fuel logistics/i;
const PIPELINE = /\bpipeline\b|midstream|downstream|crude/i;
const PETRO_WORD = /petroleum|hydrocarbon|\bcrude\b|\boil\b|petro/i;
const POLYMER = /polymer|polyethylene|polypropylene|polyolefin|yanpet|petrochemical operations/i;
const UPSTREAM = /drilling|reservoir|wellsite|geophysic|seismic|exploration geology|\bupstream\b/i;
const GAS_PLANT = /gas plant|gas processing|gas process|ngls?\b|fractionat/i;
const OFS =
  /\b(?:weatherford|baker hughes|\bslb\b|schlumberger|halliburton|national oilwell|\bnov\b|honeywell uop|axens|core laboratories|nabors|ades\b|precision drilling|helmerich|patterson-uti|gulf drilling|sinopec international petroleum service|cameron|oceaneering|kanoo energy|sanad\b|china oilfield|aramco rowan)\b/i;
const COMP = /\b(?:sgs|intertek|bureau veritas|applus|tuv|als |element materials|\bndt\b|inspection (?:co|company|services))\b/i;
const HOLDING = /investment|holding(?!.*refin)/i;
const CONTAINER = /container/i;
const MARINE_PET =
  /aramco terminal|oil terminal|petroleum terminal|petroleum port|oil port|bunker|bunkering|marine fuel|vlsfo|crude|oil tanker|product tanker|tank farm|petroleum cargo|hydrocarbon cargo|ship.?shore|oil jetty|spm\b|sbm\b/i;
const MARINE_UNRELATED =
  /container terminal|container shipping|liner service|cruise|yacht|ship repair|shipyard|dry dock|fishing|naval|passenger|ro-?ro|stevedor|freight forward|dredg|marine construction|pleasure craft|global ports/i;
const WESTERN = /yanbu|jeddah|rabigh/i;
const USABLE_STATUS = new Set(["Prospect", "Current Customer", "Former Customer", "Partner"]);
const INLAND_BULK = /bulk plant (hail|duba|madinah|najran|tabuk|abha|jizan|qassim|al ahsa|riyadh)/i;
const EASTERN_BULK = /bulk plant (dammam|dhahran)/i;

function blobOf(name: string, subsector: string | null, industry: string | null): string {
  return [name, subsector, industry].filter(Boolean).join(" | ");
}

function useCases(blob: string, name: string, industry: string | null): string[] {
  const cases: string[] = [];
  const container = CONTAINER.test(blob) || CONTAINER.test(name);
  if (REFINERY.test(blob) || REFINERY.test(name)) cases.push("refinery");
  if (industry === "Marine / Ports") {
    if (MARINE_PET.test(blob) || MARINE_PET.test(name)) {
      if (BUNKER.test(blob) || BUNKER.test(name)) cases.push("bunkering");
      else cases.push("terminal_storage");
    }
  } else if ((TERMINAL.test(blob) || TERMINAL.test(name)) && !container) {
    cases.push("terminal_storage");
  }
  if (industry !== "Marine / Ports") {
    if (BUNKER.test(blob) || BUNKER.test(name)) cases.push("bunkering");
  }
  if (CARGO.test(blob)) cases.push("cargo_qty_custody");
  if (FUEL_DIST.test(blob) || FUEL_DIST.test(name)) cases.push("fuel_distribution");
  if (PIPELINE.test(blob) && !UPSTREAM.test(blob)) cases.push("pipeline_midstream");
  return cases;
}

function commercialAppFit(cases: string[], industry: string | null): { score: number; label: string } {
  if (cases.includes("refinery")) return { score: 96, label: "Refinery quantity/quality, sampling, custody transfer" };
  if (cases.includes("terminal_storage")) return { score: 92, label: "Tank/terminal measurement, sampling, loss control" };
  if (cases.includes("bunkering") || cases.includes("cargo_qty_custody")) {
    return { score: 90, label: "Marine petroleum / bunkering / ship-shore quantity" };
  }
  if (cases.includes("pipeline_midstream")) return { score: 80, label: "Midstream/pipeline custody and product quality" };
  if (cases.includes("fuel_distribution")) return { score: 72, label: "Fuel distribution / depot quality and quantity" };
  if (industry === "Refining") return { score: 88, label: "Refining industry — petroleum inspection demand" };
  if (industry === "Oil & Gas") return { score: 48, label: "Oil & Gas without cargo/terminal/refinery language" };
  if (industry === "Petrochemicals") return { score: 40, label: "Petrochemicals — feedstock/product quality possible" };
  if (industry === "Marine / Ports") return { score: 24, label: "Marine/ports without petroleum cargo evidence" };
  if (industry === "Logistics") return { score: 24, label: "Logistics without petroleum product evidence" };
  return { score: 0, label: "No commercial PET application signal" };
}

function overlayScore(opts: {
  app: number;
  entity: string | null;
  western: boolean;
  verified: boolean;
  customerType: string | null;
  cls: ClassLetter;
}): number {
  let s = opts.app * 0.72;
  if (opts.entity === "FACILITY") s += 10;
  else if (opts.entity === "ACCOUNT") s += 4;
  if (opts.western) s += 6;
  if (opts.verified) s += 5;
  if (opts.customerType === "Asset Owner") s += 6;
  else if (opts.customerType === "Operator") s += 5;
  else if (opts.customerType === "Manufacturer") s += 2;
  else if (opts.customerType === "Trader") s += 1;
  if (opts.cls === "A") s += 4;
  else if (opts.cls === "B") s += 1;
  return Math.round(Math.min(99.2, s) * 10) / 10;
}

function proposedTier(score: number): "Tier 1" | "Tier 2" | "Tier 3" {
  if (score >= 90) return "Tier 1";
  if (score >= 78) return "Tier 2";
  return "Tier 3";
}

function classify(row: {
  name: string;
  industry: string | null;
  subsector: string | null;
  customerType: string | null;
  entity: string | null;
  accountStatus: string | null;
  cases: string[];
}): { cls: ClassLetter; rationale: string; marineGate: string | null } {
  const blob = blobOf(row.name, row.subsector, row.industry);
  const industry = row.industry;
  const entity = row.entity;
  const type = row.customerType;
  const facility = entity === "FACILITY";
  const buyer = type === "Asset Owner" || type === "Operator" || type === "Manufacturer" || type === "Government Entity";
  const cases = row.cases;
  const strongOps = cases.some((c) =>
    ["refinery", "terminal_storage", "bunkering", "cargo_qty_custody"].includes(c),
  );

  if (!USABLE_STATUS.has(row.accountStatus ?? "")) {
    return { cls: "D", rationale: `unusable account_status ${row.accountStatus}`, marineGate: null };
  }
  if (COMP.test(blob)) return { cls: "D", rationale: "inspection competitor — not a PET buyer", marineGate: null };
  if (OFS.test(blob) || OFS.test(row.name)) {
    return { cls: "D", rationale: "oilfield services / equipment vendor", marineGate: null };
  }
  if (type === "Technical Partner") return { cls: "D", rationale: "Technical Partner is not a PET buyer", marineGate: null };

  if (industry === "Marine / Ports") {
    const marinePet = MARINE_PET.test(blob) || MARINE_PET.test(row.name);
    const container = CONTAINER.test(blob) || CONTAINER.test(row.subsector || "");
    if (container && !marinePet) {
      return { cls: "D", rationale: "container terminal/port — not petroleum cargo inspection demand", marineGate: "exclude" };
    }
    if (MARINE_UNRELATED.test(blob) && !marinePet) {
      return { cls: "D", rationale: "marine activity without petroleum cargo/terminal/bunker evidence", marineGate: "exclude" };
    }
    if (marinePet) {
      if (facility || buyer || /aramco terminal/i.test(row.name)) {
        return { cls: "A", rationale: "marine petroleum cargo/terminal/bunkering operations", marineGate: "include" };
      }
      return { cls: "B", rationale: "marine petroleum signal; confirm operating site vs HQ/agent", marineGate: "include" };
    }
    if (PETRO_WORD.test(blob) || /tanker/i.test(blob)) {
      return { cls: "C", rationale: "marine record with weak petroleum wording — verify cargo mix", marineGate: "verify" };
    }
    return { cls: "D", rationale: "Marine / Ports without credible petroleum inspection demand", marineGate: "exclude" };
  }

  if (industry === "Logistics") {
    if (strongOps || FUEL_DIST.test(blob) || PETRO_WORD.test(blob)) {
      if (facility || type === "Operator" || buyer) {
        return { cls: "B", rationale: "petroleum logistics/distribution — growth PET", marineGate: null };
      }
      return { cls: "C", rationale: "logistics with petroleum language — verify physical cargo", marineGate: null };
    }
    return { cls: "D", rationale: "logistics without petroleum product operations", marineGate: null };
  }

  if (!["Oil & Gas", "Refining", "Petrochemicals"].includes(industry ?? "")) {
    return { cls: "D", rationale: `${industry ?? "unknown industry"} outside commercial PET industries`, marineGate: null };
  }

  if (HOLDING.test(row.name) || /investments$/i.test(row.subsector || "")) {
    return { cls: "C", rationale: "investment/holding vehicle — verify operating PET demand", marineGate: null };
  }
  if (/^Saudi Arabian Oil Company$/i.test(row.name) && entity === "ACCOUNT") {
    return { cls: "B", rationale: "NOC HQ — strategic PET buyer; site rows preferred", marineGate: null };
  }
  if (POLYMER.test(blob) && !REFINERY.test(row.name)) {
    return { cls: "C", rationale: "polymer/petrochemical operations — possible feedstock quality, not core cargo PET", marineGate: null };
  }
  if (GAS_PLANT.test(blob) && !strongOps) {
    return { cls: "C", rationale: "gas processing — verify if liquid/cargo PET vs gas plant lab only", marineGate: null };
  }
  if (UPSTREAM.test(blob) && !strongOps) {
    return { cls: "C", rationale: "upstream/geochem language — verify cargo/inspection vs reservoir geochem", marineGate: null };
  }

  if (industry === "Refining" || cases.includes("refinery")) {
    if (facility || buyer || strongOps) return { cls: "A", rationale: "operating refinery — core quantity/quality/custody PET", marineGate: null };
    return { cls: "B", rationale: "refining industry without facility grain — growth/verify operating site", marineGate: null };
  }

  if (cases.includes("terminal_storage") || cases.includes("bunkering") || cases.includes("cargo_qty_custody")) {
    if (INLAND_BULK.test(row.name) || EASTERN_BULK.test(row.name)) {
      return { cls: "B", rationale: "inland/eastern bulk plant — recurring depot PET, lower Wave-1 priority", marineGate: null };
    }
    if (facility || buyer || type === "Operator") {
      return { cls: "A", rationale: "terminal/storage/bunkering/cargo operations — core PET", marineGate: null };
    }
    return { cls: "B", rationale: "terminal/cargo language on non-facility grain", marineGate: null };
  }

  if (cases.includes("fuel_distribution") || cases.includes("pipeline_midstream")) {
    if (facility || type === "Operator" || buyer) {
      return { cls: "B", rationale: "fuel distribution / midstream — PET growth", marineGate: null };
    }
    return { cls: "C", rationale: "distribution/midstream language without operator grain", marineGate: null };
  }

  if (type === "Trader") {
    if (strongOps || facility) return { cls: "B", rationale: "physical petroleum trader with ops evidence", marineGate: null };
    return { cls: "C", rationale: "trader without terminal/cargo operations evidence", marineGate: null };
  }

  if (industry === "Petrochemicals") {
    return { cls: "C", rationale: "petrochemicals — verify petroleum cargo vs process chemistry (PCH)", marineGate: null };
  }

  if (industry === "Oil & Gas") {
    return { cls: "C", rationale: "Oil & Gas without refinery/terminal/cargo evidence", marineGate: null };
  }

  return { cls: "D", rationale: "no commercial PET inspection/testing demand signal", marineGate: null };
}

type OutRow = {
  companyId: string;
  company: string;
  entity: string | null;
  industry: string | null;
  subsector: string | null;
  customerType: string | null;
  geo: string;
  verified: boolean;
  western: boolean;
  engineEligibility: string;
  engineScore: number | null;
  engineApp: number | null;
  engineTier: string | null;
  rankingEligible: boolean;
  commercialApp: number;
  useCase: string;
  cls: ClassLetter;
  rationale: string;
  overlayScore: number;
  proposedTier: "Tier 1" | "Tier 2" | "Tier 3";
  group: string;
  groupSize: number;
  parent: string | null;
  marineGate: string | null;
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
  process.stderr.write("PET 32.3.2 commercial scope (SELECT only; no scoring config writes)\n");
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
  if (pet.id !== PET_SERVICE_ID_EXPECTED) throw new Error(`Live PET id ${pet.id} !== expected`);

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
      serviceId: pet.id,
      serviceCode: "PET",
      serviceName: pet.name,
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
    const blob = blobOf(name, subsector, industry);
    const cases = useCases(blob, name, industry);
    const decision = classify({
      name,
      industry,
      subsector,
      customerType: input.customerType,
      entity: input.entityType,
      accountStatus: input.accountStatus,
      cases,
    });
    const app = commercialAppFit(cases, industry);
    const geoVerified = (input.verifiedCities || []).join("/") || null;
    const geo = geoVerified || input.importedCity || "none";
    const western = WESTERN.test(geo) || WESTERN.test(name);
    const overlay = overlayScore({
      app: app.score,
      entity: input.entityType,
      western,
      verified: (input.verifiedCities || []).length > 0,
      customerType: input.customerType,
      cls: decision.cls,
    });
    const engineApp = result.dimensions.find((d) => d.key === "subsectorFit")?.rawScore ?? null;
    return {
      companyId: company.id,
      company: name,
      entity: input.entityType,
      industry,
      subsector,
      customerType: input.customerType,
      geo,
      verified: (input.verifiedCities || []).length > 0,
      western,
      engineEligibility: result.eligibility,
      engineScore: result.commercialScore,
      engineApp,
      engineTier: result.tier,
      rankingEligible: result.rankingEligible,
      commercialApp: app.score,
      useCase: app.label,
      cls: decision.cls,
      rationale: decision.rationale,
      overlayScore: overlay,
      proposedTier: proposedTier(overlay),
      group: meta?.account_group_key ?? company.id,
      groupSize: 1,
      parent: input.parentCompanyName,
      marineGate: decision.marineGate,
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
  const marine = classified.filter((r) => r.industry === "Marine / Ports");
  const marineReps = reps.filter((r) => r.industry === "Marine / Ports");

  const ab = reps.filter((r) => r.cls === "A" || r.cls === "B").sort((a, b) => {
    if (CLASS_RANK[b.cls] !== CLASS_RANK[a.cls]) return CLASS_RANK[b.cls] - CLASS_RANK[a.cls];
    return b.overlayScore - a.overlayScore || a.company.localeCompare(b.company);
  });

  const after = {
    pch: await countService(supabase, PCH_SERVICE_ID),
    env: await countService(supabase, ENV_SERVICE_ID),
    ins: await countService(supabase, INS_SERVICE_ID),
    pet: await countService(supabase, pet.id),
  };

  const byInd = (letter: ClassLetter) => {
    const m: Record<string, number> = {};
    for (const row of reps.filter((r) => r.cls === letter)) {
      m[row.industry ?? ""] = (m[row.industry ?? ""] ?? 0) + 1;
    }
    return m;
  };

  const out = {
    wrote: false,
    scoringConfigUnchanged: true,
    before,
    after,
    universe: companies.total,
    engineEligible: classified.filter((r) => r.engineEligibility === "ELIGIBLE").length,
    engineOos: classified.filter((r) => r.engineEligibility === "OUT_OF_SCOPE").length,
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
    marine: {
      total: marine.length,
      include: marine.filter((r) => r.marineGate === "include").length,
      verify: marine.filter((r) => r.marineGate === "verify").length,
      exclude: marine.filter((r) => r.marineGate === "exclude").length,
      grouped: {
        A: countCls("A", marineReps),
        B: countCls("B", marineReps),
        C: countCls("C", marineReps),
        D: countCls("D", marineReps),
      },
      includedSample: marine
        .filter((r) => r.cls === "A" || r.cls === "B")
        .sort((a, b) => b.overlayScore - a.overlayScore)
        .slice(0, 25),
      verifySample: marine.filter((r) => r.cls === "C").slice(0, 15),
      excludeSample: marine.filter((r) => r.cls === "D").slice(0, 12),
    },
    westernAB: ab.filter((r) => r.western).length,
    top40AB: ab.slice(0, 40),
    allA: reps.filter((r) => r.cls === "A").sort((a, b) => b.overlayScore - a.overlayScore),
    growthB: reps.filter((r) => r.cls === "B").sort((a, b) => b.overlayScore - a.overlayScore).slice(0, 40),
    verifyC: reps.filter((r) => r.cls === "C").sort((a, b) => b.overlayScore - a.overlayScore).slice(0, 25),
  };

  writeFileSync("pet-32-3-2-scope-out.json", JSON.stringify(out, null, 2), "utf8");
  process.stderr.write(
    JSON.stringify(
      {
        wrote: false,
        before,
        after,
        grouped: out.classCountsGrouped,
        ungrouped: out.classCountsUngrouped,
        marine: {
          total: out.marine.total,
          include: out.marine.include,
          verify: out.marine.verify,
          exclude: out.marine.exclude,
          grouped: out.marine.grouped,
        },
        top40: out.top40AB.map((r) => ({
          cls: r.cls,
          company: r.company,
          industry: r.industry,
          score: r.overlayScore,
          tier: r.proposedTier,
          id: r.companyId,
        })),
        aCount: out.allA.length,
        aNames: out.allA.map((r) => r.company),
      },
      null,
      2,
    ) + "\n",
  );
  if (before.pch !== 350 || before.env !== 24 || before.ins !== 22 || before.pet !== 0) process.exitCode = 1;
  if (after.pch !== 350 || after.env !== 24 || after.ins !== 22 || after.pet !== 0) process.exitCode = 1;
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
