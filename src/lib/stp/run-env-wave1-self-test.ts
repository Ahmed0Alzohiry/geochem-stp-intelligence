/**
 * ENV Wave-1 persist gate self-test. No database writes.
 */
import { assertEnvWave1ManifestIntegrity, ENV_SERVICE_ID, ENV_WAVE1_COMPANY_IDS, ENV_WAVE1_EXPECTED_COUNT, PCH_SERVICE_ID } from "./env-wave1-manifest";
import { planEnvWave1Persist, planEnvWave1Rollback, rejectNonEnvServiceId, validateEnvWave1Payload } from "./env-wave1-gates";
import type { CompanyServiceStpScoreInsert } from "./stp-persist-row";
import { serviceReadiness } from "./service-registry";
import { ENV_CONTACT_PERSONAS, PCH_CONTACT_PERSONAS, validateServicePersonaMap } from "../contacts/service-persona-map";

function sampleRow(overrides: Partial<CompanyServiceStpScoreInsert> = {}): CompanyServiceStpScoreInsert {
  const companyId = overrides.company_id ?? ENV_WAVE1_COMPANY_IDS[0];
  return {
    company_id: companyId,
    service_id: ENV_SERVICE_ID,
    account_group_key: `er:v1:id:${companyId}`,
    entity_type: "ACCOUNT",
    is_account_group_representative: true,
    is_current: true,
    eligibility: "ELIGIBLE",
    eligibility_reason: "in scope",
    commercial_score: 71,
    known_weight_total: 62,
    ranking_eligible: true,
    tier: "Tier 2",
    industry_fit: 82,
    application_fit: 48,
    service_need_fit: null,
    commercial_potential: null,
    customer_type_fit: 90,
    geographic_fit: null,
    strategic_fit: 70,
    data_confidence_score: 67,
    data_confidence_band: "MEDIUM",
    data_confidence_explanation: "test",
    positioning_statement: "For test: GEOCHEM environmental testing for soil, water, wastewater, and compliance monitoring at industrial sites.",
    targeting_reason: "test",
    recommended_contact_roles: ["Technical"],
    recommended_departments: ["Environment"],
    dimension_snapshot: [],
    scoring_model_version: "6.4.0",
    scored_at: new Date().toISOString(),
    ...overrides,
  };
}

function fullPayload(mutate?: (rows: CompanyServiceStpScoreInsert[]) => CompanyServiceStpScoreInsert[]): CompanyServiceStpScoreInsert[] {
  const rows = ENV_WAVE1_COMPANY_IDS.map((companyId) => sampleRow({ company_id: companyId, account_group_key: `er:v1:id:${companyId}` }));
  return mutate ? mutate(rows) : rows;
}

export function runEnvWave1SelfTest(): { ok: boolean; failures: string[] } {
  const failures: string[] = [];
  const manifest = assertEnvWave1ManifestIntegrity();
  if (!manifest.ok) failures.push(...manifest.errors);
  if (ENV_WAVE1_COMPANY_IDS.length !== ENV_WAVE1_EXPECTED_COUNT) failures.push("Wave-1 id count");

  const personas = validateServicePersonaMap();
  if (!personas.ok) failures.push(...personas.errors);
  if (PCH_CONTACT_PERSONAS.some((row) => row.serviceCode !== "PCH")) failures.push("PCH personas mutated");
  if (ENV_CONTACT_PERSONAS.length !== 8) failures.push("ENV personas must be 8");
  if (PCH_CONTACT_PERSONAS.length !== 8) failures.push("PCH personas must stay 8");

  if (rejectNonEnvServiceId(PCH_SERVICE_ID) == null) failures.push("writer must reject PCH service_id");
  if (rejectNonEnvServiceId("4f2e1c0a-5dbf-42cf-9a11-112c2aad375b") == null) failures.push("writer must reject PET service_id");
  if (rejectNonEnvServiceId(ENV_SERVICE_ID) != null) failures.push("writer must accept ENV service_id");

  const valid = validateEnvWave1Payload(fullPayload());
  if (!valid.ok) failures.push(`valid payload failed: ${valid.errors.join("; ")}`);

  const dup = validateEnvWave1Payload(fullPayload((rows) => [...rows, sampleRow({ company_id: ENV_WAVE1_COMPANY_IDS[0] })]));
  if (dup.ok) failures.push("duplicate ENV payload must fail");

  const unexpected = validateEnvWave1Payload(fullPayload((rows) => {
    rows[0] = sampleRow({ company_id: "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee", account_group_key: "er:v1:id:aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee" });
    return rows;
  }));
  if (unexpected.ok) failures.push("unexpected ENV company must fail");

  const missing = validateEnvWave1Payload(fullPayload((rows) => rows.slice(1)));
  if (missing.ok) failures.push("missing approved ENV company must fail");

  const pchPayload = validateEnvWave1Payload(fullPayload((rows) => {
    rows[0] = { ...rows[0], service_id: PCH_SERVICE_ID };
    return rows;
  }));
  if (pchPayload.ok) failures.push("ENV payload with PCH service_id must fail");

  const insertPlan = planEnvWave1Persist({
    pchCurrentCount: 350,
    envCurrentCount: 0,
    envCurrentCompanyIds: [],
    payload: fullPayload(),
  });
  if (!insertPlan.ok || insertPlan.action !== "insert") failures.push(`empty ENV should insert: ${insertPlan.errors.join("; ")}`);

  const noopPlan = planEnvWave1Persist({
    pchCurrentCount: 350,
    envCurrentCount: 24,
    envCurrentCompanyIds: [...ENV_WAVE1_COMPANY_IDS],
    payload: fullPayload(),
  });
  if (!noopPlan.ok || noopPlan.action !== "noop") failures.push("rerunning ENV persist must be idempotent noop");

  const pchBroken = planEnvWave1Persist({
    pchCurrentCount: 349,
    envCurrentCount: 0,
    envCurrentCompanyIds: [],
    payload: fullPayload(),
  });
  if (pchBroken.ok) failures.push("PCH count !== 350 must abort persist");

  const rollback = planEnvWave1Rollback({
    pchCurrentCount: 350,
    envCurrentCount: 24,
    envCurrentCompanyIds: [...ENV_WAVE1_COMPANY_IDS],
  });
  if (!rollback.ok || rollback.action !== "rollback") failures.push("Wave-1 rollback plan must pass with PCH 350");

  const rollbackPch = planEnvWave1Rollback({
    pchCurrentCount: 351,
    envCurrentCount: 24,
    envCurrentCompanyIds: [...ENV_WAVE1_COMPANY_IDS],
  });
  if (rollbackPch.ok) failures.push("rollback must abort when PCH is not 350");

  if (serviceReadiness("PCH") !== "CONFIGURED") failures.push("PCH readiness");
  if (serviceReadiness("ENV") !== "NOT_CONFIGURED") failures.push("ENV readiness at count 0");
  if (serviceReadiness("ENV", 24) !== "CONFIGURED") failures.push("ENV readiness at count 24");
  if (serviceReadiness("INS") !== "NOT_CONFIGURED") failures.push("INS readiness at count 0");
  if (serviceReadiness("INS", 22) !== "CONFIGURED") failures.push("INS readiness at count 22");

  return { ok: failures.length === 0, failures };
}

if (process.argv[1]?.includes("run-env-wave1-self-test")) {
  const result = runEnvWave1SelfTest();
  console.log(JSON.stringify(result, null, 2));
  if (!result.ok) process.exit(1);
}
