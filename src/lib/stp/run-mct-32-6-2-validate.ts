/**
 * STEP 32.6.2 MCT account-by-account commercial validation.
 * READ-ONLY. Does not persist. Does not change eligibility, score, or registry.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { loadEnvLocal } from "./build-pch-persist-payload";
import { ENV_SERVICE_ID, PCH_SERVICE_ID } from "./env-wave1-manifest";
import { INS_SERVICE_ID } from "./ins-wave1-manifest";
import { LAB_SERVICE_ID } from "./lab-wave1-manifest";
import { OCM_SERVICE_ID } from "./ocm-wave1-manifest";
import { PET_SERVICE_ID } from "./pet-wave1-manifest";
import { serviceReadiness } from "./service-registry";

type Slim = {
  cls: string;
  flag: string;
  company: string;
  companyId: string;
  industry: string | null;
  subsector: string | null;
  customerType: string | null;
  entity: string | null;
  geo: string;
  locConfidence: string;
  useCase: string;
  apps: string;
  overlap: string;
  overlayScore: number;
  rationale: string;
};

type Verdict = "APPROVE" | "DEVELOP" | "VERIFY" | "REJECT";
type PrimaryApp = "Metering" | "Calibration" | "Topography" | "Multiple";
type Region = "Western" | "Eastern" | "Central" | "Other";

type Wave1Spec = {
  id: string;
  rank: number;
  loc: string;
  region: Region;
  conf: "HIGH" | "MEDIUM";
  primary: PrimaryApp;
  useCase: string;
  priority: "HIGH" | "MEDIUM";
};

const WAVE1: Wave1Spec[] = [
  { id: "3d9fc8b5-a439-4be7-acef-e6be121d65d0", rank: 1, loc: "Yanbu", region: "Western", conf: "HIGH", primary: "Multiple", priority: "HIGH", useCase: "SAMREF refinery process/fiscal metering and I&C calibration" },
  { id: "bffc98ac-41bc-4aa2-b542-23cb477dfda7", rank: 2, loc: "Yanbu", region: "Western", conf: "HIGH", primary: "Multiple", priority: "HIGH", useCase: "YASREF refinery process/fiscal metering and I&C calibration" },
  { id: "434b1729-803c-4c10-b702-eefd669663d9", rank: 3, loc: "Jeddah", region: "Western", conf: "HIGH", primary: "Multiple", priority: "HIGH", useCase: "Luberef base-oil plant flow measurement and instrument calibration" },
  { id: "32498bc2-ccaa-4ce8-a82c-ef1f16b9fbdb", rank: 4, loc: "Yanbu", region: "Western", conf: "HIGH", primary: "Calibration", priority: "HIGH", useCase: "Yanpet process instrumentation calibration (pressure/temp/flow/level)" },
  { id: "5f42dbe1-4a16-4657-8627-1c49d4ddca84", rank: 5, loc: "Rabigh", region: "Western", conf: "HIGH", primary: "Multiple", priority: "HIGH", useCase: "Petro Rabigh refinery custody/process metering and calibration — independent of polymer" },
  { id: "bcb70c34-0c5e-4316-8f64-d4e3fb1d45fe", rank: 6, loc: "Rabigh", region: "Western", conf: "HIGH", primary: "Calibration", priority: "HIGH", useCase: "Petro Rabigh polymer-plant instrument calibration — independent of refining" },
  { id: "7963b17a-19a5-4b0b-8198-cf8aa068ad90", rank: 7, loc: "Yanbu", region: "Western", conf: "MEDIUM", primary: "Metering", priority: "HIGH", useCase: "Aramco Yanbu petroleum terminal custody transfer / tank measurement" },
  { id: "b1366b1d-4a30-488e-88ef-4f5faaa6ae6d", rank: 8, loc: "Jeddah", region: "Western", conf: "MEDIUM", primary: "Metering", priority: "HIGH", useCase: "Aramco Jeddah petroleum terminal custody transfer / tank measurement" },
  { id: "662d6207-72d1-4a14-8c7c-401c23021478", rank: 9, loc: "Rabigh", region: "Western", conf: "MEDIUM", primary: "Metering", priority: "HIGH", useCase: "Aramco Rabigh petroleum terminal custody transfer / tank measurement" },
  { id: "49692a39-cebd-423e-8805-93b306e4d710", rank: 10, loc: "Jazan", region: "Western", conf: "MEDIUM", primary: "Metering", priority: "HIGH", useCase: "Aramco Jazan petroleum terminal custody transfer / tank measurement" },
  { id: "b243ca65-1254-45e3-83f0-ec9d74a05274", rank: 11, loc: "Jubail", region: "Eastern", conf: "MEDIUM", primary: "Multiple", priority: "HIGH", useCase: "SATORP Jubail refining/petrochemical metering and calibration (ACCOUNT buying entity)" },
  { id: "e154ab7b-97e8-4672-84fe-0e22a1ad5e08", rank: 12, loc: "Jubail", region: "Eastern", conf: "MEDIUM", primary: "Multiple", priority: "HIGH", useCase: "SASREF Jubail refinery fiscal/process metering and I&C calibration" },
  { id: "0fa1d9ba-cc45-4bc9-8164-cff2e5c9bcf6", rank: 13, loc: "Yanbu", region: "Western", conf: "MEDIUM", primary: "Multiple", priority: "MEDIUM", useCase: "Aramco Yanbu refinery metering/calibration — distinct from YASREF" },
  { id: "3937ec7d-6976-4237-9f9b-ef0a1ca23152", rank: 14, loc: "Jazan", region: "Western", conf: "MEDIUM", primary: "Multiple", priority: "MEDIUM", useCase: "Jazan refinery process/fiscal metering and instrument calibration" },
  { id: "d513f250-6fdc-40c2-b13f-01e51fa34976", rank: 15, loc: "Ras Tanura", region: "Eastern", conf: "MEDIUM", primary: "Multiple", priority: "MEDIUM", useCase: "Ras Tanura refinery process/fiscal metering and I&C calibration" },
  { id: "3c8cb96f-0185-46d9-a30e-9b811f70affe", rank: 16, loc: "Riyadh", region: "Central", conf: "MEDIUM", primary: "Multiple", priority: "MEDIUM", useCase: "Riyadh refinery process/fiscal metering and I&C calibration" },
  { id: "076b0bf5-193f-4994-a3ed-a5b5ba8bf63f", rank: 17, loc: "Hawiyah", region: "Eastern", conf: "MEDIUM", primary: "Multiple", priority: "MEDIUM", useCase: "Hawiyah gas-plant allocation/fiscal metering and instrument calibration" },
  { id: "4f501e4f-5989-4dcc-b407-f5d87fb3e91e", rank: 18, loc: "Ras Tanura", region: "Eastern", conf: "MEDIUM", primary: "Metering", priority: "MEDIUM", useCase: "Aramco Ras Tanura petroleum terminal custody transfer / tank measurement" },
  { id: "16da2cd8-0139-4221-a109-77f0af480426", rank: 19, loc: "Yanbu", region: "Western", conf: "MEDIUM", primary: "Calibration", priority: "MEDIUM", useCase: "YANSAB process instrumentation calibration" },
  { id: "bb3df338-bf59-4095-9be4-95bd4bb017f0", rank: 20, loc: "Yanbu", region: "Western", conf: "MEDIUM", primary: "Calibration", priority: "MEDIUM", useCase: "NATPET polypropylene plant instrument calibration" },
  { id: "48cbe798-594d-4bc0-ab20-0178739f96f4", rank: 21, loc: "Jubail", region: "Eastern", conf: "MEDIUM", primary: "Calibration", priority: "MEDIUM", useCase: "Advanced PP plant instrument calibration" },
  { id: "ddd965a6-dffc-44dd-a9ab-732ced9a0897", rank: 22, loc: "Jubail", region: "Eastern", conf: "MEDIUM", primary: "Calibration", priority: "MEDIUM", useCase: "Sadara complex I&C calibration / overflow third-party calibration (ACCOUNT)" },
  { id: "f955c059-326d-4040-a6e5-fca3cb6e9087", rank: 23, loc: "Jubail", region: "Eastern", conf: "MEDIUM", primary: "Calibration", priority: "MEDIUM", useCase: "Kemya petrochemical plant instrument calibration" },
  { id: "208ab123-da25-488d-8b35-8451fd8e895e", rank: 24, loc: "Jubail", region: "Eastern", conf: "MEDIUM", primary: "Calibration", priority: "MEDIUM", useCase: "Sipchem polymers plant instrument calibration (one Sipchem Wave-1 row)" },
  { id: "176d8c04-170e-4098-978d-9fed3e6b8a65", rank: 25, loc: "Rabigh", region: "Western", conf: "MEDIUM", primary: "Multiple", priority: "MEDIUM", useCase: "ACWA Power Rabigh I&C calibration and energy/flow metering" },
  { id: "9f0a3793-52f7-45b1-b5d0-5746c7bd5768", rank: 26, loc: "Yanbu", region: "Western", conf: "MEDIUM", primary: "Multiple", priority: "MEDIUM", useCase: "Yanbu power and desalination flow metering and instrument calibration" },
];

const WAVE1_BY_ID = new Map(WAVE1.map((row) => [row.id, row]));

const GROWTH_REVIEW_IDS = new Set([
  "b903b27d-226c-4c34-8884-e85b6fdc9f81",
  "5feb6239-a1d9-438b-b160-1c3b5f5eef1f",
  "80ed6a7d-d298-40c1-aece-52c388c331eb",
  "fcbd0f0a-150b-49ff-95a8-0fb8f367017c",
  "d3fbd14e-d5c3-44cd-9f95-104ea9529405",
  "8d36853a-2ef1-4c91-aebf-6bb0ab130410",
  "4bc8156e-a154-4899-965a-a0676b098352",
  "176d8c04-170e-4098-978d-9fed3e6b8a65",
  "f19018f4-9091-4645-b057-f1ebb3e5d03e",
  "9f0a3793-52f7-45b1-b5d0-5746c7bd5768",
  "e6a9bca1-0d29-44a8-9150-62dad97d438d",
  "5753ed38-8b2b-4c62-a04d-127abd7f5edd",
]);

function timedClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
  if (!url || !anonKey) throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY");
  return createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      fetch: (input: RequestInfo | URL, init?: RequestInit) =>
        fetch(input, { ...init, cache: "no-store", signal: AbortSignal.timeout(45_000) }),
    },
  });
}

async function countEq(serviceId: string) {
  const { count, error } = await timedClient()
    .from("company_service_stp_current")
    .select("id", { count: "exact", head: true })
    .eq("service_id", serviceId);
  if (error) throw new Error(error.message);
  return count ?? 0;
}

function decideCore(row: Slim): { verdict: Verdict; why: string; competitor?: boolean } {
  if (WAVE1_BY_ID.has(row.companyId)) {
    return { verdict: "APPROVE", why: WAVE1_BY_ID.get(row.companyId)!.useCase };
  }
  const n = row.company;
  if (/saudi arabia refineries company/i.test(n)) {
    return { verdict: "REJECT", why: "Holding / refining investments grain — not the operating MCT buyer" };
  }
  if (n === "SAMREF Refinery Operations") {
    return { verdict: "REJECT", why: "Duplicate of SAMREF Yanbu Industrial Operations" };
  }
  if (n === "YASREF Refinery Operations") {
    return { verdict: "REJECT", why: "Duplicate of YASREF Yanbu Industrial Operations" };
  }
  if (n === "SATORP Refinery Operations") {
    return { verdict: "REJECT", why: "Duplicate grain of SATORP ACCOUNT (Jubail buying entity in Wave-1)" };
  }
  if (n === "Yanpet Yanbu Industrial Operations") {
    return { verdict: "REJECT", why: "Duplicate of Yanpet Operations" };
  }
  if (n === "Alujain NATPET Operations" || n === "Alujain Corporation" || n === "National Petrochemical Company") {
    return { verdict: "REJECT", why: "Duplicate/holding of NATPET Yanbu Operations" };
  }
  if (n === "Advanced Petrochemical Company") {
    return { verdict: "REJECT", why: "HQ duplicate of Advanced PP Operations" };
  }
  if (n === "Saudi Basic Industries Corporation") {
    return { verdict: "REJECT", why: "SABIC HQ — plants buy metering/calibration, not Riyadh corporate" };
  }
  if (n === "Sahara International Petrochemical Company") {
    return { verdict: "REJECT", why: "Sipchem parent HQ — Wave-1 keeps Polymers Operations only" };
  }
  if (n === "National Industrialization Company") {
    return { verdict: "REJECT", why: "Tasnee HQ — not an operating MCT site" };
  }
  if (/reda chemicals|imcd jeddah/i.test(n)) {
    return { verdict: "REJECT", why: "Specialty chemical distributor — not a plant metering/calibration buyer" };
  }
  if (/^saudi aramco bulk plant/i.test(n)) {
    return { verdict: "DEVELOP", why: "Real fuel-distribution metering/proving demand, but Wave-1 does not take the full Aramco bulk-plant network" };
  }
  if (n === "Saudi Aramco Terminal Operations Juaymah") {
    return { verdict: "DEVELOP", why: "Credible LPG/terminal metering; Wave-1 keeps Ras Tanura terminal as the eastern custody representative" };
  }
  if (/gas plant operations|gas processing operations/i.test(n)) {
    return { verdict: "DEVELOP", why: "Credible gas-plant allocation metering; Wave-1 keeps Hawiyah only to avoid Aramco gas-plant flooding" };
  }
  if (n === "Yanbu National Petrochemical Company - Conversion Operations") {
    return { verdict: "DEVELOP", why: "Same YANSAB complex as Industrial Operations — not a second Wave-1 row" };
  }
  if (/^sadara /i.test(n) && n !== "Sadara Chemical Company") {
    return { verdict: "DEVELOP", why: "Sadara unit inside one Jubail complex — MCT buyer is Sadara Chemical Company" };
  }
  if (/^sipchem /i.test(n) && n !== "Sipchem Polymers Operations") {
    return { verdict: "DEVELOP", why: "Credible Sipchem plant calibration; Wave-1 keeps one Sipchem row" };
  }
  if (/kayan|ibn zahr|ibn sina|united operations|sharq operations|petrokemya/i.test(n)) {
    return { verdict: "DEVELOP", why: "Credible Jubail SABIC-affiliate calibration; Wave-1 samples Kemya only" };
  }
  if (/nama chemicals|basic chemical industries|methanol chemicals company/i.test(n)) {
    return { verdict: "DEVELOP", why: "Chemical ACCOUNT without a confirmed independent plant grain for MCT" };
  }
  if (/basf jeddah|akzonobel jeddah|dow western|evonik western|clariant western/i.test(n)) {
    return { verdict: "VERIFY", why: "Multinational specialty-chemical regional ops — could be warehouse/office, not an instrument-heavy plant" };
  }
  return { verdict: "DEVELOP", why: "In CORE overlay but not stronger than frozen Wave-1 operating sites" };
}

function decideGrowth(row: Slim): { verdict: Verdict; why: string } | null {
  if (!GROWTH_REVIEW_IDS.has(row.companyId)) return null;
  if (WAVE1_BY_ID.has(row.companyId)) {
    return { verdict: "APPROVE", why: WAVE1_BY_ID.get(row.companyId)!.useCase };
  }
  const n = row.company;
  if (/grace|criterion|dorf ketal/i.test(n)) {
    return { verdict: "REJECT", why: "Catalyst / process-chemical vendor — not the meter/instrument owner" };
  }
  if (/saudi aramco shell refinery/i.test(n)) {
    return { verdict: "REJECT", why: "SAMREF corporate grain — Yanbu Industrial Operations already APPROVE" };
  }
  if (/saudi gold refinery|united sugar/i.test(n)) {
    return { verdict: "REJECT", why: "False /refin/ match — not hydrocarbon metering/calibration" };
  }
  if (/water transmission pipeline/i.test(n)) {
    return { verdict: "VERIFY", why: "Linear water-transmission asset — possible flow metering but buyer/O&M grain unclear" };
  }
  if (/jeddah south thermal|rabigh power plant operations|saudi water authority yanbu/i.test(n)) {
    return { verdict: "DEVELOP", why: "Credible western utility; Wave-1 already has ACWA Rabigh and Yanbu power/desal" };
  }
  return { verdict: "DEVELOP", why: "Reviewed GROWTH — not promoted over CORE Wave-1" };
}

async function main() {
  loadEnvLocal();
  const raw = JSON.parse(readFileSync("mct-32-6-1-scope-out.json", "utf8")) as {
    allA: Slim[];
    growthB: Slim[];
    competitorSamples: Slim[];
    mctServiceId: string;
  };
  if (raw.allA.length !== 85) throw new Error(`Expected 85 CORE A, got ${raw.allA.length}`);

  const coreReviewed = raw.allA.map((row) => {
    const d = decideCore(row);
    return { ...row, verdict: d.verdict, validationWhy: d.why, source: "CORE_A" as const, competitor: Boolean(d.competitor) };
  });
  const growthReviewed = raw.growthB.filter((row) => GROWTH_REVIEW_IDS.has(row.companyId)).map((row) => {
    const d = decideGrowth(row);
    if (!d) throw new Error(`Missing growth decision ${row.companyId}`);
    return { ...row, verdict: d.verdict, validationWhy: d.why, source: "GROWTH_B" as const, competitor: false };
  });
  if (growthReviewed.length !== GROWTH_REVIEW_IDS.size) {
    throw new Error(`GROWTH reviewed ${growthReviewed.length} !== ${GROWTH_REVIEW_IDS.size}`);
  }

  const byId = new Map([...raw.allA, ...raw.growthB].map((row) => [row.companyId, row]));
  const wave1Rows = WAVE1.map((w) => {
    const row = byId.get(w.id);
    if (!row) throw new Error(`Wave-1 id missing: ${w.id}`);
    return {
      rank: w.rank,
      account: row.company,
      companyId: row.companyId,
      entity: row.entity,
      industry: row.industry,
      subsector: row.subsector,
      location: w.loc,
      locConfidence: w.conf,
      region: w.region,
      primary: w.primary,
      useCase: w.useCase,
      overlap: row.overlap,
      priority: w.priority,
      dataConfidence: w.conf,
      verdict: "APPROVE" as const,
      source: WAVE1_BY_ID.has(row.companyId) && raw.allA.some((a) => a.companyId === w.id) ? "CORE_A" : "GROWTH_B",
      rationale: w.useCase,
    };
  });
  for (const w of wave1Rows) {
    if (w.overlap === "none") throw new Error(`Unexpected standalone slipped in: ${w.account}`);
  }

  const count = (rows: { verdict: Verdict }[], v: Verdict) => rows.filter((r) => r.verdict === v).length;
  const coreApprove = count(coreReviewed, "APPROVE");
  const growthPromote = growthReviewed.filter((r) => r.verdict === "APPROVE").length;

  const before = {
    pch: await countEq(PCH_SERVICE_ID),
    env: await countEq(ENV_SERVICE_ID),
    ins: await countEq(INS_SERVICE_ID),
    pet: await countEq(PET_SERVICE_ID),
    ocm: await countEq(OCM_SERVICE_ID),
    lab: await countEq(LAB_SERVICE_ID),
    mct: await countEq(raw.mctServiceId),
  };

  const out = {
    wrote: false,
    scoringUnchanged: true,
    registryUnchanged: true,
    mctReadiness: serviceReadiness("MCT", 0),
    before,
    after: before,
    coreReviewed: 85,
    core: {
      APPROVE: coreApprove,
      DEVELOP: count(coreReviewed, "DEVELOP"),
      VERIFY: count(coreReviewed, "VERIFY"),
      REJECT: count(coreReviewed, "REJECT"),
      COMPETITOR: 0,
    },
    growthAdditionallyReviewed: growthReviewed.length,
    growthPromotedToApprove: growthPromote,
    proposedWave1: wave1Rows.length,
    appMix: {
      Metering: wave1Rows.filter((r) => r.primary === "Metering").length,
      Calibration: wave1Rows.filter((r) => r.primary === "Calibration").length,
      Topography: wave1Rows.filter((r) => r.primary === "Topography").length,
      Multiple: wave1Rows.filter((r) => r.primary === "Multiple").length,
    },
    geoMix: {
      Western: wave1Rows.filter((r) => r.region === "Western").length,
      Eastern: wave1Rows.filter((r) => r.region === "Eastern").length,
      Central: wave1Rows.filter((r) => r.region === "Central").length,
      Other: wave1Rows.filter((r) => r.region === "Other").length,
    },
    crossSellWave1: wave1Rows.filter((r) => r.overlap !== "none").length,
    standaloneWave1: wave1Rows.filter((r) => r.overlap === "none").length,
    competitorsExcludedFrom32_6_1: raw.competitorSamples.length,
    wave1: wave1Rows,
    coreVerdicts: coreReviewed.map((r) => ({
      company: r.company,
      companyId: r.companyId,
      entity: r.entity,
      verdict: r.verdict,
      overlap: r.overlap,
      why: r.validationWhy,
    })),
    growthVerdicts: growthReviewed.map((r) => ({
      company: r.company,
      companyId: r.companyId,
      verdict: r.verdict,
      why: r.validationWhy,
    })),
  };

  writeFileSync("mct-32-6-2-validation-out.json", JSON.stringify(out, null, 2), "utf8");
  const baselineOk =
    before.pch === 350 &&
    before.env === 24 &&
    before.ins === 22 &&
    before.pet === 18 &&
    before.ocm === 25 &&
    before.lab === 21 &&
    before.mct === 0 &&
    serviceReadiness("MCT", 0) === "NOT_CONFIGURED" &&
    coreReviewed.length === 85 &&
    coreApprove + count(coreReviewed, "DEVELOP") + count(coreReviewed, "VERIFY") + count(coreReviewed, "REJECT") === 85 &&
    wave1Rows.length === coreApprove + growthPromote;
  process.stdout.write(
    JSON.stringify(
      {
        wrote: false,
        baselineOk,
        before,
        mctReadiness: out.mctReadiness,
        core: out.core,
        growthReviewed: out.growthAdditionallyReviewed,
        growthPromoted: growthPromote,
        wave1: out.proposedWave1,
        appMix: out.appMix,
        geoMix: out.geoMix,
        crossSell: out.crossSellWave1,
        standalone: out.standaloneWave1,
        competitorsExcluded: out.competitorsExcludedFrom32_6_1,
      },
      null,
      2,
    ) + "\n",
  );
  if (!baselineOk) process.exitCode = 1;
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
