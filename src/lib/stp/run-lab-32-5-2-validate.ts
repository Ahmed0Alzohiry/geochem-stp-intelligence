/**
 * STEP 32.5.2 LAB account-by-account commercial validation.
 * READ-ONLY. Does not persist, does not change eligibility/score/registry.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { loadEnvLocal } from "./build-pch-persist-payload";
import { ENV_SERVICE_ID, PCH_SERVICE_ID } from "./env-wave1-manifest";
import { INS_SERVICE_ID } from "./ins-wave1-manifest";
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
  overlap: string;
  overlayScore: number;
  rationale: string;
};

type Verdict = "APPROVE" | "DEVELOP" | "VERIFY" | "REJECT";
type CompClass = "none" | "COMPETITOR" | "POTENTIAL_PARTNER" | "VERIFY" | "CUSTOMER";

const WAVE1_IDS: { id: string; rank: number; useCase: string; recurring: "HIGH" | "MEDIUM" | "LOW"; loc: string; conf: "HIGH" | "MEDIUM" }[] = [
  { id: "3d9fc8b5-a439-4be7-acef-e6be121d65d0", rank: 1, loc: "Yanbu", conf: "HIGH", recurring: "HIGH", useCase: "SAMREF refinery petroleum-product and process-stream specification testing" },
  { id: "bffc98ac-41bc-4aa2-b542-23cb477dfda7", rank: 2, loc: "Yanbu", conf: "HIGH", recurring: "HIGH", useCase: "YASREF refinery petroleum-product and process-stream specification testing" },
  { id: "434b1729-803c-4c10-b702-eefd669663d9", rank: 3, loc: "Jeddah", conf: "HIGH", recurring: "HIGH", useCase: "Luberef base-oil / lubricant product specification testing" },
  { id: "32498bc2-ccaa-4ce8-a82c-ef1f16b9fbdb", rank: 4, loc: "Yanbu", conf: "HIGH", recurring: "HIGH", useCase: "Yanpet petrochemical feedstock and finished-product QC" },
  { id: "5f42dbe1-4a16-4657-8627-1c49d4ddca84", rank: 5, loc: "Rabigh", conf: "HIGH", recurring: "HIGH", useCase: "Petro Rabigh refinery product/process laboratory testing (independent of polymer)" },
  { id: "bcb70c34-0c5e-4316-8f64-d4e3fb1d45fe", rank: 6, loc: "Rabigh", conf: "HIGH", recurring: "HIGH", useCase: "Petro Rabigh polymer-plant product QC (independent of refining)" },
  { id: "b243ca65-1254-45e3-83f0-ec9d74a05274", rank: 7, loc: "Jubail", conf: "MEDIUM", recurring: "HIGH", useCase: "SATORP Jubail refining/petrochemical product and process testing (ACCOUNT is the buying entity)" },
  { id: "e154ab7b-97e8-4672-84fe-0e22a1ad5e08", rank: 8, loc: "Jubail", conf: "MEDIUM", recurring: "HIGH", useCase: "SASREF Jubail refinery petroleum-product specification testing" },
  { id: "0fa1d9ba-cc45-4bc9-8164-cff2e5c9bcf6", rank: 9, loc: "Yanbu", conf: "MEDIUM", recurring: "HIGH", useCase: "Aramco Yanbu refinery testing — not YASREF" },
  { id: "d513f250-6fdc-40c2-b13f-01e51fa34976", rank: 10, loc: "Ras Tanura", conf: "MEDIUM", recurring: "HIGH", useCase: "Ras Tanura refinery petroleum-product / process testing" },
  { id: "3937ec7d-6976-4237-9f9b-ef0a1ca23152", rank: 11, loc: "Jazan", conf: "MEDIUM", recurring: "HIGH", useCase: "Jazan refinery petroleum-product / process testing" },
  { id: "3c8cb96f-0185-46d9-a30e-9b811f70affe", rank: 12, loc: "Riyadh", conf: "MEDIUM", recurring: "HIGH", useCase: "Riyadh refinery petroleum-product / process testing" },
  { id: "16da2cd8-0139-4221-a109-77f0af480426", rank: 13, loc: "Yanbu", conf: "MEDIUM", recurring: "HIGH", useCase: "YANSAB petrochemical product and process QC" },
  { id: "bb3df338-bf59-4095-9be4-95bd4bb017f0", rank: 14, loc: "Yanbu", conf: "MEDIUM", recurring: "HIGH", useCase: "NATPET polypropylene product QC" },
  { id: "48cbe798-594d-4bc0-ab20-0178739f96f4", rank: 15, loc: "Jubail", conf: "MEDIUM", recurring: "HIGH", useCase: "Advanced PP plant product QC" },
  { id: "ddd965a6-dffc-44dd-a9ab-732ced9a0897", rank: 16, loc: "Jubail", conf: "MEDIUM", recurring: "HIGH", useCase: "Sadara integrated-complex third-party / overflow product QC (complex buyer)" },
  { id: "f955c059-326d-4040-a6e5-fca3cb6e9087", rank: 17, loc: "Jubail", conf: "MEDIUM", recurring: "HIGH", useCase: "Kemya petrochemical product QC" },
  { id: "616e0cb4-e67f-4bbb-9a34-ba0a9bed8b3a", rank: 18, loc: "Jubail", conf: "MEDIUM", recurring: "HIGH", useCase: "Sharq petrochemical product QC" },
  { id: "66b0194d-9d89-441f-b9e8-8e70baa24749", rank: 19, loc: "Jubail", conf: "MEDIUM", recurring: "HIGH", useCase: "Petrokemya petrochemical product QC" },
];

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

function decideCore(row: Slim): { verdict: Verdict; comp: CompClass; why: string; duplicateOf?: string } {
  const n = row.company;
  const wave = WAVE1_BY_ID.get(row.companyId);
  if (wave) {
    return { verdict: "APPROVE", comp: "CUSTOMER", why: wave.useCase };
  }

  if (/saudi arabia refineries company/i.test(n) || /refining investments/i.test(row.subsector ?? "")) {
    return { verdict: "REJECT", comp: "none", why: "Holding / investment grain — not the operating lab buyer" };
  }
  if (n === "SAMREF Refinery Operations") {
    return { verdict: "REJECT", comp: "none", why: "Duplicate of SAMREF Yanbu Industrial Operations", duplicateOf: "3d9fc8b5-a439-4be7-acef-e6be121d65d0" };
  }
  if (n === "YASREF Refinery Operations") {
    return { verdict: "REJECT", comp: "none", why: "Duplicate of YASREF Yanbu Industrial Operations", duplicateOf: "bffc98ac-41bc-4aa2-b542-23cb477dfda7" };
  }
  if (n === "SATORP Refinery Operations") {
    return { verdict: "REJECT", comp: "none", why: "Duplicate grain of SATORP ACCOUNT (Jubail buying entity already in Wave-1)", duplicateOf: "b243ca65-1254-45e3-83f0-ec9d74a05274" };
  }
  if (n === "Yanpet Yanbu Industrial Operations") {
    return { verdict: "REJECT", comp: "none", why: "Duplicate of Yanpet Operations", duplicateOf: "32498bc2-ccaa-4ce8-a82c-ef1f16b9fbdb" };
  }
  if (/alujain natpet/i.test(n) || n === "Alujain Corporation") {
    return { verdict: "REJECT", comp: "none", why: "Duplicate of NATPET Yanbu Operations", duplicateOf: "bb3df338-bf59-4095-9be4-95bd4bb017f0" };
  }
  if (n === "Advanced Petrochemical Company") {
    return { verdict: "REJECT", comp: "none", why: "HQ duplicate of Advanced PP Operations", duplicateOf: "48cbe798-594d-4bc0-ab20-0178739f96f4" };
  }
  if (n === "Saudi Basic Industries Corporation") {
    return { verdict: "REJECT", comp: "none", why: "SABIC HQ — plants buy testing, not Riyadh corporate" };
  }
  if (n === "Yanbu National Petrochemical Company - Conversion Operations") {
    return { verdict: "DEVELOP", comp: "none", why: "Same YANSAB complex as Industrial Operations — not a second Wave-1 row" };
  }
  if (/^sadara /i.test(n) && n !== "Sadara Chemical Company") {
    return { verdict: "DEVELOP", comp: "none", why: "Sadara unit inside one Jubail complex — commercial lab buyer is Sadara Chemical Company" };
  }
  if (/^sipchem /i.test(n)) {
    return { verdict: "DEVELOP", comp: "none", why: "Credible Sipchem plant QC buyer; Wave-1 keeps one Sipchem row (Polymers) to avoid unit flooding" };
  }
  if (n === "Sahara International Petrochemical Company") {
    return { verdict: "DEVELOP", comp: "none", why: "Sipchem parent HQ — prefer Jubail plant rows" };
  }
  if (n === "National Industrialization Company" || n === "National Petrochemical Company") {
    return { verdict: "VERIFY", comp: "none", why: "Parent/holding name — confirm operating plant vs paper company" };
  }
  if (n === "Methanol Chemicals Company") {
    return { verdict: "DEVELOP", comp: "none", why: "Chemanol Jubail methanol QC is credible; not first-wave until plant grain is confirmed" };
  }
  if (/gas plant|gas processing/i.test(n) || /gas processing/i.test(row.subsector ?? "")) {
    return { verdict: "DEVELOP", comp: "none", why: "Named gas plant has recurring process samples; Wave-1 starts with Hawiyah only" };
  }
  if (/kayan|ibn zahr|united operations|ibn sina|kemya|sharq|petrokemya/i.test(n)) {
    if (WAVE1_BY_ID.has(row.companyId)) return { verdict: "APPROVE", comp: "CUSTOMER", why: "Wave-1" };
    return { verdict: "DEVELOP", comp: "none", why: "Credible Jubail petrochemical plant QC — second-wave after unique-site Wave-1" };
  }
  if (row.entity === "FACILITY" && (row.industry === "Petrochemicals" || row.industry === "Chemicals" || row.industry === "Refining" || row.industry === "Oil & Gas")) {
    return { verdict: "DEVELOP", comp: "none", why: "Operating hydrocarbon/chemical facility with lab demand; not in first Wave-1 cut" };
  }
  if (row.entity === "ACCOUNT") {
    return { verdict: "VERIFY", comp: "none", why: "ACCOUNT grain without a unique operating-site Wave-1 match" };
  }
  return { verdict: "VERIFY", comp: "none", why: "Identity or procurement path not confirmed" };
}

function decideGrowth(row: Slim): { verdict: Verdict; why: string } | null {
  const n = row.company;
  if (/saudi aramco shell refinery/i.test(n)) {
    return { verdict: "REJECT", why: "SAMREF ACCOUNT duplicate of SAMREF Yanbu Industrial Operations" };
  }
  if (/gold refinery/i.test(n)) {
    return { verdict: "REJECT", why: "Precious-metals refinery — /refin/ false positive, not GEOCHEM petroleum/process lab" };
  }
  if (/sugar/i.test(n)) {
    return { verdict: "REJECT", why: "Sugar refining — not GEOCHEM industrial/hydrocarbon laboratory demand" };
  }
  if (/grace|criterion catalyst|dorf ketal/i.test(n)) {
    return { verdict: "REJECT", why: "Refinery chemical/catalyst vendor — sells into plants; not a sample-owner buyer" };
  }
  if (/farabi/i.test(n)) {
    return { verdict: "DEVELOP", why: "Petrochemical operator HQ — credible QC buyer, confirm plant vs office" };
  }
  return null;
}

const WAVE1_BY_ID = new Map<string, (typeof WAVE1_IDS)[number]>();

async function main() {
  loadEnvLocal();
  const raw = JSON.parse(readFileSync("lab-32-5-1-scope-out.json", "utf8")) as {
    allA: Slim[];
    growthB: Slim[];
    competitorSamples: Slim[];
    labServiceId: string;
  };

  const sipchemPolymers = raw.allA.find((r) => r.company === "Sipchem Polymers Operations");
  const wave1 = [...WAVE1_IDS];
  if (sipchemPolymers) {
    wave1.push({
      id: sipchemPolymers.companyId,
      rank: 20,
      loc: "Jubail",
      conf: "MEDIUM",
      recurring: "HIGH",
      useCase: "Sipchem polymers finished-product / process QC",
    });
  }
  wave1.push({
    id: "076b0bf5-193f-4994-a3ed-a5b5ba8bf63f",
    rank: 21,
    loc: "Hawiyah",
    conf: "MEDIUM",
    recurring: "HIGH",
    useCase: "Hawiyah gas-plant hydrocarbon and process-sample laboratory testing",
  });
  for (const w of wave1) WAVE1_BY_ID.set(w.id, w);

  const coreReviewed = raw.allA.map((row) => {
    const d = decideCore(row);
    return { ...row, verdict: d.verdict, competitorClass: d.comp, validationWhy: d.why, duplicateOf: d.duplicateOf ?? null, source: "CORE_A" as const };
  });

  const growthPicked: Slim[] = [];
  for (const row of raw.growthB) {
    const d = decideGrowth(row);
    if (d) growthPicked.push(row);
  }
  const growthReviewed = growthPicked.map((row) => {
    const d = decideGrowth(row)!;
    return { ...row, verdict: d.verdict, competitorClass: "none" as CompClass, validationWhy: d.why, duplicateOf: null as string | null, source: "GROWTH_B" as const };
  });

  const competitors = raw.competitorSamples.map((row) => ({
    ...row,
    verdict: "REJECT" as Verdict,
    competitorClass: "COMPETITOR" as CompClass,
    validationWhy: "TIC / independent laboratory / certification competitor — not a GEOCHEM LAB customer",
    duplicateOf: null as string | null,
    source: "COMPETITOR" as const,
  }));

  const reviewed = [...coreReviewed, ...growthReviewed];
  const count = (v: Verdict) => reviewed.filter((r) => r.verdict === v).length;

  const byId = new Map(raw.allA.map((r) => [r.companyId, r]));
  const wave1Rows = [...WAVE1_BY_ID.values()]
    .sort((a, b) => a.rank - b.rank)
    .map((w) => {
      const row = byId.get(w.id);
      if (!row) throw new Error(`Wave-1 id missing from CORE: ${w.id}`);
      return {
        rank: w.rank,
        account: row.company,
        companyId: row.companyId,
        entity: row.entity,
        industry: row.industry,
        location: w.loc,
        useCase: w.useCase,
        recurring: w.recurring,
        overlap: row.overlap,
        dataConfidence: w.conf,
        verdict: "APPROVE" as const,
        buyerRationale: w.useCase,
      };
    });

  const crossSell = wave1Rows.filter((r) => r.overlap !== "none");
  const standalone = wave1Rows.filter((r) => r.overlap === "none");

  const labId = raw.labServiceId;
  const before = {
    pch: await countEq(PCH_SERVICE_ID),
    env: await countEq(ENV_SERVICE_ID),
    ins: await countEq(INS_SERVICE_ID),
    pet: await countEq(PET_SERVICE_ID),
    ocm: await countEq(OCM_SERVICE_ID),
    lab: await countEq(labId),
  };
  const after = { ...before };

  const out = {
    wrote: false,
    scoringUnchanged: true,
    registryUnchanged: true,
    before,
    after,
    labReadiness: serviceReadiness("LAB", 0),
    coreReviewed: coreReviewed.length,
    growthAdditionallyReviewed: growthReviewed.length,
    approve: count("APPROVE"),
    develop: count("DEVELOP"),
    verify: count("VERIFY"),
    reject: count("REJECT"),
    proposedWave1: wave1Rows.length,
    crossSellWave1: crossSell.length,
    standaloneLabWave1: standalone.length,
    competitorsExcluded: competitors.length,
    potentialPartners: 0,
    duplicateOrHqRemoved: reviewed.filter((r) => /duplicate|holding|HQ/i.test(r.validationWhy)).length,
    wave1: wave1Rows,
    coreVerdicts: coreReviewed.map((r) => ({
      company: r.company,
      companyId: r.companyId,
      entity: r.entity,
      verdict: r.verdict,
      overlap: r.overlap,
      why: r.validationWhy,
    })),
    growthVerdicts: growthReviewed.map((r) => ({ company: r.company, companyId: r.companyId, verdict: r.verdict, why: r.validationWhy })),
    competitorVerdicts: competitors.map((r) => ({ company: r.company, companyId: r.companyId, class: r.competitorClass, verdict: r.verdict })),
  };

  writeFileSync("lab-32-5-2-validation-out.json", JSON.stringify(out, null, 2), "utf8");
  process.stdout.write(
    JSON.stringify(
      {
        wrote: false,
        before,
        after,
        coreReviewed: out.coreReviewed,
        growthAdditionallyReviewed: out.growthAdditionallyReviewed,
        approve: out.approve,
        develop: out.develop,
        verify: out.verify,
        reject: out.reject,
        proposedWave1: out.proposedWave1,
        crossSellWave1: out.crossSellWave1,
        standaloneLabWave1: out.standaloneLabWave1,
        competitorsExcluded: out.competitorsExcluded,
        potentialPartners: 0,
        duplicateOrHqRemoved: out.duplicateOrHqRemoved,
        wave1: wave1Rows.map((r) => ({ rank: r.rank, account: r.account, overlap: r.overlap, loc: r.location })),
      },
      null,
      2,
    ) + "\n",
  );

  const ok =
    before.pch === 350 &&
    before.env === 24 &&
    before.ins === 22 &&
    before.pet === 18 &&
    before.ocm === 25 &&
    before.lab === 0 &&
    after.lab === 0 &&
    serviceReadiness("LAB", 0) === "NOT_CONFIGURED" &&
    wave1Rows.length === out.approve;
  if (!ok) process.exitCode = 1;
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
