/**
 * LAB Wave-1 persist gate self-test. No database writes.
 */
import { ENV_SERVICE_ID, PCH_SERVICE_ID } from "./env-wave1-manifest";
import { INS_SERVICE_ID } from "./ins-wave1-manifest";
import { MCT_SERVICE_ID } from "./mct-wave1-manifest";
import { OCM_SERVICE_ID } from "./ocm-wave1-manifest";
import { PET_SERVICE_ID } from "./pet-wave1-manifest";
import {
  assertLabWave1ManifestIntegrity,
  LAB_PETRO_RABIGH_ER_GROUP_KEY,
  LAB_PETRO_RABIGH_POLYMER_ID,
  LAB_PETRO_RABIGH_REFINING_ID,
  LAB_SERVICE_ID,
  LAB_WAVE1_COMPANY_IDS,
  LAB_WAVE1_EXPECTED_COUNT,
  labPersistAccountGroupKey,
} from "./lab-wave1-manifest";
import {
  planLabWave1Persist,
  planLabWave1Rollback,
  rejectNonLabServiceId,
  validateLabWave1Payload,
} from "./lab-wave1-gates";
import type { CompanyServiceStpScoreInsert } from "./stp-persist-row";
import { serviceReadiness } from "./service-registry";
import {
  LAB_CONTACT_PERSONAS,
  OCM_CONTACT_PERSONAS,
  PCH_CONTACT_PERSONAS,
  validateServicePersonaMap,
} from "../contacts/service-persona-map";
import { scoreServiceAccount } from "./score";
import type { ServiceFirstInput } from "./types";

function sampleRow(overrides: Partial<CompanyServiceStpScoreInsert> = {}): CompanyServiceStpScoreInsert {
  const companyId = overrides.company_id ?? LAB_WAVE1_COMPANY_IDS[0];
  return {
    company_id: companyId,
    service_id: LAB_SERVICE_ID,
    account_group_key: labPersistAccountGroupKey(companyId, `er:v1:id:${companyId}`),
    entity_type: "FACILITY",
    is_account_group_representative: true,
    is_current: true,
    eligibility: "ELIGIBLE",
    eligibility_reason: "in scope",
    commercial_score: 76.9,
    known_weight_total: 50,
    ranking_eligible: false,
    tier: "Tier 3",
    industry_fit: 88,
    application_fit: 96,
    service_need_fit: null,
    commercial_potential: null,
    customer_type_fit: null,
    geographic_fit: null,
    strategic_fit: 90,
    data_confidence_score: 67,
    data_confidence_band: "MEDIUM",
    data_confidence_explanation: "test",
    positioning_statement:
      "For test: GEOCHEM laboratory and testing services for product specification and process-stream QC.",
    targeting_reason: "test",
    recommended_contact_roles: ["Technical", "Procurement"],
    recommended_departments: ["Laboratory", "QA/QC"],
    dimension_snapshot: [],
    scoring_model_version: "6.4.0",
    scored_at: new Date().toISOString(),
    ...overrides,
  };
}

function fullPayload(mutate?: (rows: CompanyServiceStpScoreInsert[]) => CompanyServiceStpScoreInsert[]): CompanyServiceStpScoreInsert[] {
  const rows = LAB_WAVE1_COMPANY_IDS.map((companyId) =>
    sampleRow({ company_id: companyId, account_group_key: labPersistAccountGroupKey(companyId, `er:v1:id:${companyId}`) }),
  );
  return mutate ? mutate(rows) : rows;
}

function labInput(overrides: Partial<ServiceFirstInput> = {}): ServiceFirstInput {
  return {
    serviceId: LAB_SERVICE_ID,
    serviceCode: "LAB",
    serviceName: "Laboratory / Testing Services",
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

export function runLabWave1SelfTest(): { ok: boolean; failures: string[] } {
  const failures: string[] = [];
  const manifest = assertLabWave1ManifestIntegrity();
  if (!manifest.ok) failures.push(...manifest.errors);
  if (LAB_WAVE1_COMPANY_IDS.length !== LAB_WAVE1_EXPECTED_COUNT) failures.push("Wave-1 id count");
  if (!LAB_WAVE1_COMPANY_IDS.includes(LAB_PETRO_RABIGH_REFINING_ID)) {
    failures.push("Refining Operations must remain a frozen LAB Wave-1 id");
  }
  if (!LAB_WAVE1_COMPANY_IDS.includes(LAB_PETRO_RABIGH_POLYMER_ID)) {
    failures.push("Polymer Operations must remain a frozen LAB Wave-1 id");
  }
  const refiningKey = labPersistAccountGroupKey(LAB_PETRO_RABIGH_REFINING_ID, LAB_PETRO_RABIGH_ER_GROUP_KEY);
  const polymerKey = labPersistAccountGroupKey(LAB_PETRO_RABIGH_POLYMER_ID, LAB_PETRO_RABIGH_ER_GROUP_KEY);
  if (refiningKey === polymerKey || refiningKey === LAB_PETRO_RABIGH_ER_GROUP_KEY) {
    failures.push("Rabigh plants must not share the live ER group key on LAB persist");
  }

  const personas = validateServicePersonaMap();
  if (!personas.ok) failures.push(...personas.errors);
  if (PCH_CONTACT_PERSONAS.length !== 8) failures.push("PCH personas must stay 8");
  if (OCM_CONTACT_PERSONAS.length !== 8) failures.push("OCM personas must stay 8");
  if (LAB_CONTACT_PERSONAS.length !== 8) failures.push("LAB personas must be 8");

  if (rejectNonLabServiceId(PCH_SERVICE_ID) == null) failures.push("writer must reject PCH service_id");
  if (rejectNonLabServiceId(ENV_SERVICE_ID) == null) failures.push("writer must reject ENV service_id");
  if (rejectNonLabServiceId(INS_SERVICE_ID) == null) failures.push("writer must reject INS service_id");
  if (rejectNonLabServiceId(PET_SERVICE_ID) == null) failures.push("writer must reject PET service_id");
  if (rejectNonLabServiceId(OCM_SERVICE_ID) == null) failures.push("writer must reject OCM service_id");
  if (rejectNonLabServiceId(MCT_SERVICE_ID) == null) failures.push("writer must reject MCT service_id");
  if (rejectNonLabServiceId(LAB_SERVICE_ID) != null) failures.push("writer must accept LAB service_id");

  const plant = scoreServiceAccount(labInput());
  if (plant.eligibility !== "ELIGIBLE") failures.push("polymer/polyethylene plant must be LAB eligible");
  const medGeo = scoreServiceAccount(labInput({ verifiedCities: [], importedCity: "Jubail" }));
  if (medGeo.eligibility !== "ELIGIBLE") failures.push("unverified-city polymer plant must stay LAB eligible");
  if (medGeo.tier === "Tier 1") failures.push("do not force LAB Tier 1 when geography is unknown");
  const office = scoreServiceAccount(
    labInput({
      companyName: "Generic Industrial Office",
      industry: "Industrial Manufacturing",
      subsector: "Corporate headquarters",
      isExistingGeochemCustomer: "Yes",
    }),
  );
  if (office.eligibility !== "OUT_OF_SCOPE") {
    failures.push("industry-only / cross-sell-only industrial office must be LAB OUT_OF_SCOPE");
  }
  const competitor = scoreServiceAccount(
    labInput({ companyName: "SGS Inspection Services", industry: "Industrial Manufacturing", subsector: "Inspection" }),
  );
  if (competitor.eligibility !== "OUT_OF_SCOPE") failures.push("SGS competitor must be LAB OUT_OF_SCOPE");
  const industrialServices = scoreServiceAccount(
    labInput({ companyName: "Intertek Laboratory", industry: "Industrial Services", subsector: "Testing" }),
  );
  if (industrialServices.eligibility !== "OUT_OF_SCOPE") {
    failures.push("Industrial Services / TIC names must stay outside LAB eligible industries");
  }
  const epc = scoreServiceAccount(labInput({ industry: "EPC / Projects", subsector: "Engineering" }));
  if (epc.eligibility !== "OUT_OF_SCOPE") failures.push("EPC must stay outside LAB eligible industries");

  const valid = validateLabWave1Payload(fullPayload());
  if (!valid.ok) failures.push(`valid payload failed: ${valid.errors.join("; ")}`);

  const dup = validateLabWave1Payload(fullPayload((rows) => [...rows, sampleRow({ company_id: LAB_WAVE1_COMPANY_IDS[0] })]));
  if (dup.ok) failures.push("duplicate LAB payload must fail");

  const unexpected = validateLabWave1Payload(
    fullPayload((rows) => {
      rows[0] = sampleRow({
        company_id: "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee",
        account_group_key: "er:v1:id:aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee",
      });
      return rows;
    }),
  );
  if (unexpected.ok) failures.push("unexpected LAB company must fail");

  const missing = validateLabWave1Payload(fullPayload((rows) => rows.slice(1)));
  if (missing.ok) failures.push("missing approved LAB company must fail");

  const pchPayload = validateLabWave1Payload(
    fullPayload((rows) => {
      rows[0] = { ...rows[0], service_id: PCH_SERVICE_ID };
      return rows;
    }),
  );
  if (pchPayload.ok) failures.push("LAB payload with PCH service_id must fail");

  const ocmPayload = validateLabWave1Payload(
    fullPayload((rows) => {
      rows[0] = { ...rows[0], service_id: OCM_SERVICE_ID };
      return rows;
    }),
  );
  if (ocmPayload.ok) failures.push("LAB payload with OCM service_id must fail");

  const sharedRabigh = validateLabWave1Payload(
    fullPayload((rows) =>
      rows.map((row) =>
        row.company_id === LAB_PETRO_RABIGH_REFINING_ID || row.company_id === LAB_PETRO_RABIGH_POLYMER_ID
          ? { ...row, account_group_key: LAB_PETRO_RABIGH_ER_GROUP_KEY }
          : row,
      ),
    ),
  );
  if (sharedRabigh.ok) failures.push("shared Rabigh ER group key must fail LAB payload validation");

  const insertPlan = planLabWave1Persist({
    pchCurrentCount: 350,
    envCurrentCount: 24,
    insCurrentCount: 22,
    petCurrentCount: 18,
    ocmCurrentCount: 25,
    labCurrentCount: 0,
    labCurrentCompanyIds: [],
    payload: fullPayload(),
  });
  if (!insertPlan.ok || insertPlan.action !== "insert") failures.push(`empty LAB should insert: ${insertPlan.errors.join("; ")}`);

  const noopPlan = planLabWave1Persist({
    pchCurrentCount: 350,
    envCurrentCount: 24,
    insCurrentCount: 22,
    petCurrentCount: 18,
    ocmCurrentCount: 25,
    labCurrentCount: 21,
    labCurrentCompanyIds: [...LAB_WAVE1_COMPANY_IDS],
    payload: fullPayload(),
  });
  if (!noopPlan.ok || noopPlan.action !== "noop") failures.push("rerunning LAB persist must be idempotent noop");

  const pchBroken = planLabWave1Persist({
    pchCurrentCount: 349,
    envCurrentCount: 24,
    insCurrentCount: 22,
    petCurrentCount: 18,
    ocmCurrentCount: 25,
    labCurrentCount: 0,
    labCurrentCompanyIds: [],
    payload: fullPayload(),
  });
  if (pchBroken.ok) failures.push("PCH count !== 350 must abort persist");

  const ocmBroken = planLabWave1Persist({
    pchCurrentCount: 350,
    envCurrentCount: 24,
    insCurrentCount: 22,
    petCurrentCount: 18,
    ocmCurrentCount: 24,
    labCurrentCount: 0,
    labCurrentCompanyIds: [],
    payload: fullPayload(),
  });
  if (ocmBroken.ok) failures.push("OCM count !== 25 must abort persist");

  const rollback = planLabWave1Rollback({
    pchCurrentCount: 350,
    envCurrentCount: 24,
    insCurrentCount: 22,
    petCurrentCount: 18,
    ocmCurrentCount: 25,
    labCurrentCompanyIds: [...LAB_WAVE1_COMPANY_IDS],
  });
  if (!rollback.ok || rollback.action !== "rollback") {
    failures.push("Wave-1 rollback plan must pass with PCH 350 ENV 24 INS 22 PET 18 OCM 25");
  }

  if (serviceReadiness("PCH") !== "CONFIGURED") failures.push("PCH readiness");
  if (serviceReadiness("LAB") !== "NOT_CONFIGURED") failures.push("LAB readiness at count 0");
  if (serviceReadiness("LAB", 21) !== "CONFIGURED") failures.push("LAB readiness at count 21");
  if (serviceReadiness("LAB", 20) !== "NOT_CONFIGURED") failures.push("LAB must not be CONFIGURED at count 20");

  return { ok: failures.length === 0, failures };
}

if (process.argv[1]?.includes("run-lab-wave1-self-test")) {
  const result = runLabWave1SelfTest();
  console.log(JSON.stringify(result, null, 2));
  if (!result.ok) process.exit(1);
}
