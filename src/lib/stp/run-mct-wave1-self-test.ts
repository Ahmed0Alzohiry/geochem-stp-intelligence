/**
 * MCT Wave-1 persist gate self-test. No database writes.
 */
import { ENV_SERVICE_ID, PCH_SERVICE_ID } from "./env-wave1-manifest";
import { INS_SERVICE_ID } from "./ins-wave1-manifest";
import { LAB_SERVICE_ID } from "./lab-wave1-manifest";
import { OCM_SERVICE_ID } from "./ocm-wave1-manifest";
import { PET_SERVICE_ID } from "./pet-wave1-manifest";
import {
  assertMctWave1ManifestIntegrity,
  MCT_PETRO_RABIGH_ER_GROUP_KEY,
  MCT_PETRO_RABIGH_POLYMER_ID,
  MCT_PETRO_RABIGH_REFINING_ID,
  MCT_SERVICE_ID,
  MCT_WAVE1_COMPANY_IDS,
  MCT_WAVE1_EXPECTED_COUNT,
  mctPersistAccountGroupKey,
} from "./mct-wave1-manifest";
import {
  planMctWave1Persist,
  planMctWave1Rollback,
  rejectNonMctServiceId,
  validateMctWave1Payload,
} from "./mct-wave1-gates";
import type { CompanyServiceStpScoreInsert } from "./stp-persist-row";
import { serviceReadiness } from "./service-registry";
import {
  LAB_CONTACT_PERSONAS,
  MCT_CONTACT_PERSONAS,
  OCM_CONTACT_PERSONAS,
  PCH_CONTACT_PERSONAS,
  validateServicePersonaMap,
} from "../contacts/service-persona-map";
import { scoreServiceAccount } from "./score";
import type { ServiceFirstInput } from "./types";

function sampleRow(overrides: Partial<CompanyServiceStpScoreInsert> = {}): CompanyServiceStpScoreInsert {
  const companyId = overrides.company_id ?? MCT_WAVE1_COMPANY_IDS[0];
  return {
    company_id: companyId,
    service_id: MCT_SERVICE_ID,
    account_group_key: mctPersistAccountGroupKey(companyId, `er:v1:id:${companyId}`),
    entity_type: "FACILITY",
    is_account_group_representative: true,
    is_current: true,
    eligibility: "ELIGIBLE",
    eligibility_reason: "in scope",
    commercial_score: 76.9,
    known_weight_total: 50,
    ranking_eligible: false,
    tier: "Tier 3",
    industry_fit: 90,
    application_fit: 96,
    service_need_fit: null,
    commercial_potential: null,
    customer_type_fit: null,
    geographic_fit: null,
    strategic_fit: 90,
    data_confidence_score: 67,
    data_confidence_band: "MEDIUM",
    data_confidence_explanation: "test",
    positioning_statement: "For test: GEOCHEM metering and calibration support for custody transfer.",
    targeting_reason: "test",
    recommended_contact_roles: ["Technical", "Procurement"],
    recommended_departments: ["Engineering", "Inspection"],
    dimension_snapshot: [],
    scoring_model_version: "6.4.0",
    scored_at: new Date().toISOString(),
    ...overrides,
  };
}

function fullPayload(mutate?: (rows: CompanyServiceStpScoreInsert[]) => CompanyServiceStpScoreInsert[]): CompanyServiceStpScoreInsert[] {
  const rows = MCT_WAVE1_COMPANY_IDS.map((companyId) =>
    sampleRow({ company_id: companyId, account_group_key: mctPersistAccountGroupKey(companyId, `er:v1:id:${companyId}`) }),
  );
  return mutate ? mutate(rows) : rows;
}

function mctInput(overrides: Partial<ServiceFirstInput> = {}): ServiceFirstInput {
  return {
    serviceId: MCT_SERVICE_ID,
    serviceCode: "MCT",
    serviceName: "Metering, Calibration & Topography",
    companyId: "company-demo",
    companyName: "Example Yanbu Polymer Operations (HYPOTHETICAL)",
    industry: "Petrochemicals",
    subsector: "Polyethylene manufacturing",
    customerType: "Manufacturer",
    entityType: "FACILITY",
    parentCompanyName: "Example Parent",
    isExistingGeochemCustomer: null,
    accountStatus: "Prospect",
    verifiedCities: ["Yanbu"],
    importedCity: "Yanbu",
    companyServicesNeed: null,
    companyServicesFitRating: null,
    ...overrides,
  };
}

export function runMctWave1SelfTest(): { ok: boolean; failures: string[] } {
  const failures: string[] = [];
  const manifest = assertMctWave1ManifestIntegrity();
  if (!manifest.ok) failures.push(...manifest.errors);
  if (MCT_WAVE1_COMPANY_IDS.length !== MCT_WAVE1_EXPECTED_COUNT) failures.push("Wave-1 id count");
  if (!MCT_WAVE1_COMPANY_IDS.includes(MCT_PETRO_RABIGH_REFINING_ID)) {
    failures.push("Refining Operations must remain a frozen MCT Wave-1 id");
  }
  if (!MCT_WAVE1_COMPANY_IDS.includes(MCT_PETRO_RABIGH_POLYMER_ID)) {
    failures.push("Polymer Operations must remain a frozen MCT Wave-1 id");
  }
  const refiningKey = mctPersistAccountGroupKey(MCT_PETRO_RABIGH_REFINING_ID, MCT_PETRO_RABIGH_ER_GROUP_KEY);
  const polymerKey = mctPersistAccountGroupKey(MCT_PETRO_RABIGH_POLYMER_ID, MCT_PETRO_RABIGH_ER_GROUP_KEY);
  if (refiningKey === polymerKey || refiningKey === MCT_PETRO_RABIGH_ER_GROUP_KEY) {
    failures.push("Rabigh plants must not share the live ER group key on MCT persist");
  }

  const personas = validateServicePersonaMap();
  if (!personas.ok) failures.push(...personas.errors);
  if (PCH_CONTACT_PERSONAS.length !== 8) failures.push("PCH personas must stay 8");
  if (OCM_CONTACT_PERSONAS.length !== 8) failures.push("OCM personas must stay 8");
  if (LAB_CONTACT_PERSONAS.length !== 8) failures.push("LAB personas must stay 8");
  if (MCT_CONTACT_PERSONAS.length !== 8) failures.push("MCT personas must be 8");

  if (rejectNonMctServiceId(PCH_SERVICE_ID) == null) failures.push("writer must reject PCH service_id");
  if (rejectNonMctServiceId(ENV_SERVICE_ID) == null) failures.push("writer must reject ENV service_id");
  if (rejectNonMctServiceId(INS_SERVICE_ID) == null) failures.push("writer must reject INS service_id");
  if (rejectNonMctServiceId(PET_SERVICE_ID) == null) failures.push("writer must reject PET service_id");
  if (rejectNonMctServiceId(OCM_SERVICE_ID) == null) failures.push("writer must reject OCM service_id");
  if (rejectNonMctServiceId(LAB_SERVICE_ID) == null) failures.push("writer must reject LAB service_id");
  if (rejectNonMctServiceId(MCT_SERVICE_ID) != null) failures.push("writer must accept MCT service_id");

  const plant = scoreServiceAccount(mctInput());
  if (plant.eligibility !== "ELIGIBLE") failures.push("polymer/polyethylene plant must be MCT eligible");
  const medGeo = scoreServiceAccount(mctInput({ verifiedCities: [], importedCity: "Jubail" }));
  if (medGeo.eligibility !== "ELIGIBLE") failures.push("unverified-city polymer plant must stay MCT eligible");
  if (medGeo.tier === "Tier 1") failures.push("do not force MCT Tier 1 when geography is unknown");
  const office = scoreServiceAccount(
    mctInput({
      companyName: "Generic Industrial Office",
      industry: "Industrial Manufacturing",
      subsector: "Corporate headquarters",
      isExistingGeochemCustomer: "Yes",
    }),
  );
  if (office.eligibility !== "OUT_OF_SCOPE") {
    failures.push("industry-only / cross-sell-only industrial office must be MCT OUT_OF_SCOPE");
  }
  const competitor = scoreServiceAccount(
    mctInput({
      companyName: "Arabian Calibration Company",
      industry: "Industrial Manufacturing",
      subsector: "Calibration Services",
    }),
  );
  if (competitor.eligibility !== "OUT_OF_SCOPE") failures.push("calibration-service competitor must be MCT OUT_OF_SCOPE");
  const epc = scoreServiceAccount(mctInput({ industry: "EPC / Projects", subsector: "Engineering" }));
  if (epc.eligibility !== "OUT_OF_SCOPE") failures.push("EPC must stay outside MCT eligible industries");
  const topoNone = scoreServiceAccount(
    mctInput({
      companyName: "Generic Chemicals Trading",
      industry: "Chemicals",
      subsector: "Trading",
    }),
  );
  if (topoNone.eligibility !== "OUT_OF_SCOPE") {
    failures.push("chemicals without metering/calibration/topography evidence must be MCT OUT_OF_SCOPE");
  }

  const valid = validateMctWave1Payload(fullPayload());
  if (!valid.ok) failures.push(`valid payload failed: ${valid.errors.join("; ")}`);

  const dup = validateMctWave1Payload(fullPayload((rows) => [...rows, sampleRow({ company_id: MCT_WAVE1_COMPANY_IDS[0] })]));
  if (dup.ok) failures.push("duplicate MCT payload must fail");

  const unexpected = validateMctWave1Payload(
    fullPayload((rows) => {
      rows[0] = sampleRow({
        company_id: "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee",
        account_group_key: "er:v1:id:aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee",
      });
      return rows;
    }),
  );
  if (unexpected.ok) failures.push("unexpected MCT company must fail");

  const missing = validateMctWave1Payload(fullPayload((rows) => rows.slice(1)));
  if (missing.ok) failures.push("missing approved MCT company must fail");

  const pchPayload = validateMctWave1Payload(
    fullPayload((rows) => {
      rows[0] = { ...rows[0], service_id: PCH_SERVICE_ID };
      return rows;
    }),
  );
  if (pchPayload.ok) failures.push("MCT payload with PCH service_id must fail");

  const labPayload = validateMctWave1Payload(
    fullPayload((rows) => {
      rows[0] = { ...rows[0], service_id: LAB_SERVICE_ID };
      return rows;
    }),
  );
  if (labPayload.ok) failures.push("MCT payload with LAB service_id must fail");

  const sharedRabigh = validateMctWave1Payload(
    fullPayload((rows) =>
      rows.map((row) =>
        row.company_id === MCT_PETRO_RABIGH_REFINING_ID || row.company_id === MCT_PETRO_RABIGH_POLYMER_ID
          ? { ...row, account_group_key: MCT_PETRO_RABIGH_ER_GROUP_KEY }
          : row,
      ),
    ),
  );
  if (sharedRabigh.ok) failures.push("shared Rabigh ER group key must fail MCT payload validation");

  const insertPlan = planMctWave1Persist({
    pchCurrentCount: 350,
    envCurrentCount: 24,
    insCurrentCount: 22,
    petCurrentCount: 18,
    ocmCurrentCount: 25,
    labCurrentCount: 21,
    mctCurrentCount: 0,
    mctCurrentCompanyIds: [],
    payload: fullPayload(),
  });
  if (!insertPlan.ok || insertPlan.action !== "insert") failures.push(`empty MCT should insert: ${insertPlan.errors.join("; ")}`);

  const noopPlan = planMctWave1Persist({
    pchCurrentCount: 350,
    envCurrentCount: 24,
    insCurrentCount: 22,
    petCurrentCount: 18,
    ocmCurrentCount: 25,
    labCurrentCount: 21,
    mctCurrentCount: 26,
    mctCurrentCompanyIds: [...MCT_WAVE1_COMPANY_IDS],
    payload: fullPayload(),
  });
  if (!noopPlan.ok || noopPlan.action !== "noop") failures.push("rerunning MCT persist must be idempotent noop");

  const pchBroken = planMctWave1Persist({
    pchCurrentCount: 349,
    envCurrentCount: 24,
    insCurrentCount: 22,
    petCurrentCount: 18,
    ocmCurrentCount: 25,
    labCurrentCount: 21,
    mctCurrentCount: 0,
    mctCurrentCompanyIds: [],
    payload: fullPayload(),
  });
  if (pchBroken.ok) failures.push("PCH count !== 350 must abort persist");

  const labBroken = planMctWave1Persist({
    pchCurrentCount: 350,
    envCurrentCount: 24,
    insCurrentCount: 22,
    petCurrentCount: 18,
    ocmCurrentCount: 25,
    labCurrentCount: 20,
    mctCurrentCount: 0,
    mctCurrentCompanyIds: [],
    payload: fullPayload(),
  });
  if (labBroken.ok) failures.push("LAB count !== 21 must abort persist");

  const rollback = planMctWave1Rollback({
    pchCurrentCount: 350,
    envCurrentCount: 24,
    insCurrentCount: 22,
    petCurrentCount: 18,
    ocmCurrentCount: 25,
    labCurrentCount: 21,
    mctCurrentCompanyIds: [...MCT_WAVE1_COMPANY_IDS],
  });
  if (!rollback.ok || rollback.action !== "rollback") {
    failures.push("Wave-1 rollback plan must pass with PCH 350 ENV 24 INS 22 PET 18 OCM 25 LAB 21");
  }

  if (serviceReadiness("PCH") !== "CONFIGURED") failures.push("PCH readiness");
  if (serviceReadiness("LAB", 21) !== "CONFIGURED") failures.push("LAB readiness at count 21");
  if (serviceReadiness("MCT") !== "NOT_CONFIGURED") failures.push("MCT readiness at count 0");
  if (serviceReadiness("MCT", 26) !== "CONFIGURED") failures.push("MCT readiness at count 26");
  if (serviceReadiness("MCT", 25) !== "NOT_CONFIGURED") failures.push("MCT must not be CONFIGURED at count 25");

  return { ok: failures.length === 0, failures };
}

if (process.argv[1]?.includes("run-mct-wave1-self-test")) {
  const result = runMctWave1SelfTest();
  console.log(JSON.stringify(result, null, 2));
  if (!result.ok) process.exit(1);
}
