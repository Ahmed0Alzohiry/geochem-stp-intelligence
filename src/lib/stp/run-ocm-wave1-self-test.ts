/**
 * OCM Wave-1 persist gate self-test. No database writes.
 */
import { ENV_SERVICE_ID, PCH_SERVICE_ID } from "./env-wave1-manifest";
import { INS_SERVICE_ID } from "./ins-wave1-manifest";
import { PET_SERVICE_ID } from "./pet-wave1-manifest";
import {
  assertOcmWave1ManifestIntegrity,
  OCM_PETRO_RABIGH_POLYMER_ID,
  OCM_PETRO_RABIGH_REFINING_ID,
  OCM_SERVICE_ID,
  OCM_WAVE1_COMPANY_IDS,
  OCM_WAVE1_EXPECTED_COUNT,
} from "./ocm-wave1-manifest";
import {
  planOcmWave1Persist,
  planOcmWave1Rollback,
  rejectNonOcmServiceId,
  validateOcmWave1Payload,
} from "./ocm-wave1-gates";
import type { CompanyServiceStpScoreInsert } from "./stp-persist-row";
import { serviceReadiness } from "./service-registry";
import { OCM_CONTACT_PERSONAS, PCH_CONTACT_PERSONAS, validateServicePersonaMap } from "../contacts/service-persona-map";
import { scoreServiceAccount } from "./score";
import type { ServiceFirstInput } from "./types";

function sampleRow(overrides: Partial<CompanyServiceStpScoreInsert> = {}): CompanyServiceStpScoreInsert {
  const companyId = overrides.company_id ?? OCM_WAVE1_COMPANY_IDS[0];
  return {
    company_id: companyId,
    service_id: OCM_SERVICE_ID,
    account_group_key: `er:v1:id:${companyId}`,
    entity_type: "FACILITY",
    is_account_group_representative: true,
    is_current: true,
    eligibility: "ELIGIBLE",
    eligibility_reason: "in scope",
    commercial_score: 76.9,
    known_weight_total: 50,
    ranking_eligible: false,
    tier: "Tier 3",
    industry_fit: 100,
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
      "For test: GEOCHEM oil analysis and condition-monitoring support for rotating equipment, lubricant health, contamination, wear detection, and predictive maintenance.",
    targeting_reason: "test",
    recommended_contact_roles: ["Technical", "Influencer", "Decision Maker"],
    recommended_departments: ["Reliability", "Maintenance", "Laboratory"],
    dimension_snapshot: [],
    scoring_model_version: "6.4.0",
    scored_at: new Date().toISOString(),
    ...overrides,
  };
}

function fullPayload(mutate?: (rows: CompanyServiceStpScoreInsert[]) => CompanyServiceStpScoreInsert[]): CompanyServiceStpScoreInsert[] {
  const rows = OCM_WAVE1_COMPANY_IDS.map((companyId) => sampleRow({ company_id: companyId, account_group_key: `er:v1:id:${companyId}` }));
  return mutate ? mutate(rows) : rows;
}

function ocmInput(overrides: Partial<ServiceFirstInput> = {}): ServiceFirstInput {
  return {
    serviceId: OCM_SERVICE_ID,
    serviceCode: "OCM",
    serviceName: "Oil Condition Monitoring",
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

export function runOcmWave1SelfTest(): { ok: boolean; failures: string[] } {
  const failures: string[] = [];
  const manifest = assertOcmWave1ManifestIntegrity();
  if (!manifest.ok) failures.push(...manifest.errors);
  if (OCM_WAVE1_COMPANY_IDS.length !== OCM_WAVE1_EXPECTED_COUNT) failures.push("Wave-1 id count");
  if (OCM_WAVE1_COMPANY_IDS.includes(OCM_PETRO_RABIGH_REFINING_ID)) {
    failures.push("Refining Operations must not be a second Wave-1 persist id");
  }
  if (!OCM_WAVE1_COMPANY_IDS.includes(OCM_PETRO_RABIGH_POLYMER_ID)) {
    failures.push("Polymer Operations must remain the Rabigh Wave-1 id");
  }

  const personas = validateServicePersonaMap();
  if (!personas.ok) failures.push(...personas.errors);
  if (PCH_CONTACT_PERSONAS.length !== 8) failures.push("PCH personas must stay 8");
  if (OCM_CONTACT_PERSONAS.length !== 8) failures.push("OCM personas must be 8");

  if (rejectNonOcmServiceId(PCH_SERVICE_ID) == null) failures.push("writer must reject PCH service_id");
  if (rejectNonOcmServiceId(ENV_SERVICE_ID) == null) failures.push("writer must reject ENV service_id");
  if (rejectNonOcmServiceId(INS_SERVICE_ID) == null) failures.push("writer must reject INS service_id");
  if (rejectNonOcmServiceId(PET_SERVICE_ID) == null) failures.push("writer must reject PET service_id");
  if (rejectNonOcmServiceId(OCM_SERVICE_ID) != null) failures.push("writer must accept OCM service_id");

  const plant = scoreServiceAccount(ocmInput());
  if (plant.eligibility !== "ELIGIBLE") failures.push("polymer/polyethylene plant must be OCM eligible");
  const medGeo = scoreServiceAccount(ocmInput({ verifiedCities: [], importedCity: "Jubail" }));
  if (medGeo.eligibility !== "ELIGIBLE") failures.push("unverified-city polymer plant must stay OCM eligible");
  if (medGeo.tier === "Tier 1") failures.push("do not force OCM Tier 1 when geography is unknown");
  const office = scoreServiceAccount(
    ocmInput({ companyName: "Generic Industrial Office", industry: "Industrial Manufacturing", subsector: "Corporate headquarters" }),
  );
  if (office.eligibility !== "OUT_OF_SCOPE") failures.push("industry-only industrial office must be OCM OUT_OF_SCOPE");
  const epc = scoreServiceAccount(ocmInput({ industry: "EPC / Projects", subsector: "Engineering" }));
  if (epc.eligibility !== "OUT_OF_SCOPE") failures.push("EPC must stay outside OCM eligible industries");

  const valid = validateOcmWave1Payload(fullPayload());
  if (!valid.ok) failures.push(`valid payload failed: ${valid.errors.join("; ")}`);

  const dup = validateOcmWave1Payload(fullPayload((rows) => [...rows, sampleRow({ company_id: OCM_WAVE1_COMPANY_IDS[0] })]));
  if (dup.ok) failures.push("duplicate OCM payload must fail");

  const unexpected = validateOcmWave1Payload(
    fullPayload((rows) => {
      rows[0] = sampleRow({
        company_id: "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee",
        account_group_key: "er:v1:id:aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee",
      });
      return rows;
    }),
  );
  if (unexpected.ok) failures.push("unexpected OCM company must fail");

  const missing = validateOcmWave1Payload(fullPayload((rows) => rows.slice(1)));
  if (missing.ok) failures.push("missing approved OCM company must fail");

  const pchPayload = validateOcmWave1Payload(
    fullPayload((rows) => {
      rows[0] = { ...rows[0], service_id: PCH_SERVICE_ID };
      return rows;
    }),
  );
  if (pchPayload.ok) failures.push("OCM payload with PCH service_id must fail");

  const petPayload = validateOcmWave1Payload(
    fullPayload((rows) => {
      rows[0] = { ...rows[0], service_id: PET_SERVICE_ID };
      return rows;
    }),
  );
  if (petPayload.ok) failures.push("OCM payload with PET service_id must fail");

  const insertPlan = planOcmWave1Persist({
    pchCurrentCount: 350,
    envCurrentCount: 24,
    insCurrentCount: 22,
    petCurrentCount: 18,
    ocmCurrentCount: 0,
    ocmCurrentCompanyIds: [],
    payload: fullPayload(),
  });
  if (!insertPlan.ok || insertPlan.action !== "insert") failures.push(`empty OCM should insert: ${insertPlan.errors.join("; ")}`);

  const noopPlan = planOcmWave1Persist({
    pchCurrentCount: 350,
    envCurrentCount: 24,
    insCurrentCount: 22,
    petCurrentCount: 18,
    ocmCurrentCount: 25,
    ocmCurrentCompanyIds: [...OCM_WAVE1_COMPANY_IDS],
    payload: fullPayload(),
  });
  if (!noopPlan.ok || noopPlan.action !== "noop") failures.push("rerunning OCM persist must be idempotent noop");

  const pchBroken = planOcmWave1Persist({
    pchCurrentCount: 349,
    envCurrentCount: 24,
    insCurrentCount: 22,
    petCurrentCount: 18,
    ocmCurrentCount: 0,
    ocmCurrentCompanyIds: [],
    payload: fullPayload(),
  });
  if (pchBroken.ok) failures.push("PCH count !== 350 must abort persist");

  const petBroken = planOcmWave1Persist({
    pchCurrentCount: 350,
    envCurrentCount: 24,
    insCurrentCount: 22,
    petCurrentCount: 17,
    ocmCurrentCount: 0,
    ocmCurrentCompanyIds: [],
    payload: fullPayload(),
  });
  if (petBroken.ok) failures.push("PET count !== 18 must abort persist");

  const rollback = planOcmWave1Rollback({
    pchCurrentCount: 350,
    envCurrentCount: 24,
    insCurrentCount: 22,
    petCurrentCount: 18,
    ocmCurrentCompanyIds: [...OCM_WAVE1_COMPANY_IDS],
  });
  if (!rollback.ok || rollback.action !== "rollback") failures.push("Wave-1 rollback plan must pass with PCH 350 ENV 24 INS 22 PET 18");

  if (serviceReadiness("PCH") !== "CONFIGURED") failures.push("PCH readiness");
  if (serviceReadiness("OCM") !== "NOT_CONFIGURED") failures.push("OCM readiness at count 0");
  if (serviceReadiness("OCM", 25) !== "CONFIGURED") failures.push("OCM readiness at count 25");
  if (serviceReadiness("OCM", 24) !== "NOT_CONFIGURED") failures.push("OCM must not be CONFIGURED at count 24");

  return { ok: failures.length === 0, failures };
}

if (process.argv[1]?.includes("run-ocm-wave1-self-test")) {
  const result = runOcmWave1SelfTest();
  console.log(JSON.stringify(result, null, 2));
  if (!result.ok) process.exit(1);
}
