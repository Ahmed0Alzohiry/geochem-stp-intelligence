/**
 * INS Wave-1 persist gate self-test. No database writes.
 */
import { ENV_SERVICE_ID, PCH_SERVICE_ID } from "./env-wave1-manifest";
import {
  assertInsWave1ManifestIntegrity,
  INS_SERVICE_ID,
  INS_WAVE1_COMPANY_IDS,
  INS_WAVE1_EXPECTED_COUNT,
} from "./ins-wave1-manifest";
import { planInsWave1Persist, planInsWave1Rollback, rejectNonInsServiceId, validateInsWave1Payload } from "./ins-wave1-gates";
import type { CompanyServiceStpScoreInsert } from "./stp-persist-row";
import { serviceReadiness } from "./service-registry";
import { INS_CONTACT_PERSONAS, PCH_CONTACT_PERSONAS, validateServicePersonaMap } from "../contacts/service-persona-map";

function sampleRow(overrides: Partial<CompanyServiceStpScoreInsert> = {}): CompanyServiceStpScoreInsert {
  const companyId = overrides.company_id ?? INS_WAVE1_COMPANY_IDS[0];
  return {
    company_id: companyId,
    service_id: INS_SERVICE_ID,
    account_group_key: `er:v1:id:${companyId}`,
    entity_type: "FACILITY",
    is_account_group_representative: true,
    is_current: true,
    eligibility: "ELIGIBLE",
    eligibility_reason: "in scope",
    commercial_score: 76.9,
    known_weight_total: 58,
    ranking_eligible: true,
    tier: "Tier 2",
    industry_fit: 90,
    application_fit: 48,
    service_need_fit: null,
    commercial_potential: null,
    customer_type_fit: 90,
    geographic_fit: 100,
    strategic_fit: 90,
    data_confidence_score: 83,
    data_confidence_band: "HIGH",
    data_confidence_explanation: "test",
    positioning_statement: "For test: GEOCHEM industrial inspection programs for plants, pipelines, and integrity-critical assets.",
    targeting_reason: "test",
    recommended_contact_roles: ["Technical"],
    recommended_departments: ["Inspection"],
    dimension_snapshot: [],
    scoring_model_version: "6.4.0",
    scored_at: new Date().toISOString(),
    ...overrides,
  };
}

function fullPayload(mutate?: (rows: CompanyServiceStpScoreInsert[]) => CompanyServiceStpScoreInsert[]): CompanyServiceStpScoreInsert[] {
  const rows = INS_WAVE1_COMPANY_IDS.map((companyId) => sampleRow({ company_id: companyId, account_group_key: `er:v1:id:${companyId}` }));
  return mutate ? mutate(rows) : rows;
}

export function runInsWave1SelfTest(): { ok: boolean; failures: string[] } {
  const failures: string[] = [];
  const manifest = assertInsWave1ManifestIntegrity();
  if (!manifest.ok) failures.push(...manifest.errors);
  if (INS_WAVE1_COMPANY_IDS.length !== INS_WAVE1_EXPECTED_COUNT) failures.push("Wave-1 id count");

  const personas = validateServicePersonaMap();
  if (!personas.ok) failures.push(...personas.errors);
  if (INS_CONTACT_PERSONAS.length !== 8) failures.push("INS personas must be 8");
  if (PCH_CONTACT_PERSONAS.length !== 8) failures.push("PCH personas must stay 8");

  if (rejectNonInsServiceId(PCH_SERVICE_ID) == null) failures.push("writer must reject PCH service_id");
  if (rejectNonInsServiceId(ENV_SERVICE_ID) == null) failures.push("writer must reject ENV service_id");
  if (rejectNonInsServiceId(INS_SERVICE_ID) != null) failures.push("writer must accept INS service_id");

  const valid = validateInsWave1Payload(fullPayload());
  if (!valid.ok) failures.push(`valid payload failed: ${valid.errors.join("; ")}`);

  const dup = validateInsWave1Payload(fullPayload((rows) => [...rows, sampleRow({ company_id: INS_WAVE1_COMPANY_IDS[0] })]));
  if (dup.ok) failures.push("duplicate INS payload must fail");

  const unexpected = validateInsWave1Payload(
    fullPayload((rows) => {
      rows[0] = sampleRow({
        company_id: "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee",
        account_group_key: "er:v1:id:aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee",
      });
      return rows;
    }),
  );
  if (unexpected.ok) failures.push("unexpected INS company must fail");

  const missing = validateInsWave1Payload(fullPayload((rows) => rows.slice(1)));
  if (missing.ok) failures.push("missing approved INS company must fail");

  const pchPayload = validateInsWave1Payload(
    fullPayload((rows) => {
      rows[0] = { ...rows[0], service_id: PCH_SERVICE_ID };
      return rows;
    }),
  );
  if (pchPayload.ok) failures.push("INS payload with PCH service_id must fail");

  const envPayload = validateInsWave1Payload(
    fullPayload((rows) => {
      rows[0] = { ...rows[0], service_id: ENV_SERVICE_ID };
      return rows;
    }),
  );
  if (envPayload.ok) failures.push("INS payload with ENV service_id must fail");

  const insertPlan = planInsWave1Persist({
    pchCurrentCount: 350,
    envCurrentCount: 24,
    insCurrentCount: 0,
    insCurrentCompanyIds: [],
    payload: fullPayload(),
  });
  if (!insertPlan.ok || insertPlan.action !== "insert") failures.push(`empty INS should insert: ${insertPlan.errors.join("; ")}`);

  const noopPlan = planInsWave1Persist({
    pchCurrentCount: 350,
    envCurrentCount: 24,
    insCurrentCount: 22,
    insCurrentCompanyIds: [...INS_WAVE1_COMPANY_IDS],
    payload: fullPayload(),
  });
  if (!noopPlan.ok || noopPlan.action !== "noop") failures.push("rerunning INS persist must be idempotent noop");

  const pchBroken = planInsWave1Persist({
    pchCurrentCount: 349,
    envCurrentCount: 24,
    insCurrentCount: 0,
    insCurrentCompanyIds: [],
    payload: fullPayload(),
  });
  if (pchBroken.ok) failures.push("PCH count !== 350 must abort persist");

  const envBroken = planInsWave1Persist({
    pchCurrentCount: 350,
    envCurrentCount: 23,
    insCurrentCount: 0,
    insCurrentCompanyIds: [],
    payload: fullPayload(),
  });
  if (envBroken.ok) failures.push("ENV count !== 24 must abort persist");

  const rollback = planInsWave1Rollback({
    pchCurrentCount: 350,
    envCurrentCount: 24,
    insCurrentCompanyIds: [...INS_WAVE1_COMPANY_IDS],
  });
  if (!rollback.ok || rollback.action !== "rollback") failures.push("Wave-1 rollback plan must pass with PCH 350 ENV 24");

  if (serviceReadiness("PCH") !== "CONFIGURED") failures.push("PCH readiness");
  if (serviceReadiness("ENV") !== "NOT_CONFIGURED") failures.push("ENV readiness at count 0");
  if (serviceReadiness("ENV", 24) !== "CONFIGURED") failures.push("ENV readiness at count 24");
  if (serviceReadiness("INS") !== "NOT_CONFIGURED") failures.push("INS readiness at count 0");
  if (serviceReadiness("INS", 22) !== "CONFIGURED") failures.push("INS readiness at count 22");
  if (serviceReadiness("PET") !== "NOT_CONFIGURED") failures.push("PET readiness at count 0");
  if (serviceReadiness("PET", 18) !== "CONFIGURED") failures.push("PET readiness at count 18");

  return { ok: failures.length === 0, failures };
}

if (process.argv[1]?.includes("run-ins-wave1-self-test")) {
  const result = runInsWave1SelfTest();
  console.log(JSON.stringify(result, null, 2));
  if (!result.ok) process.exit(1);
}
