/**
 * PET Wave-1 persist gate self-test. No database writes.
 */
import { ENV_SERVICE_ID, PCH_SERVICE_ID } from "./env-wave1-manifest";
import { INS_SERVICE_ID } from "./ins-wave1-manifest";
import {
  assertPetWave1ManifestIntegrity,
  PET_SERVICE_ID,
  PET_WAVE1_COMPANY_IDS,
  PET_WAVE1_EXPECTED_COUNT,
} from "./pet-wave1-manifest";
import { planPetWave1Persist, planPetWave1Rollback, rejectNonPetServiceId, validatePetWave1Payload } from "./pet-wave1-gates";
import type { CompanyServiceStpScoreInsert } from "./stp-persist-row";
import { serviceReadiness } from "./service-registry";
import { PCH_CONTACT_PERSONAS, validateServicePersonaMap } from "../contacts/service-persona-map";

function sampleRow(overrides: Partial<CompanyServiceStpScoreInsert> = {}): CompanyServiceStpScoreInsert {
  const companyId = overrides.company_id ?? PET_WAVE1_COMPANY_IDS[0];
  return {
    company_id: companyId,
    service_id: PET_SERVICE_ID,
    account_group_key: `er:v1:id:${companyId}`,
    entity_type: "FACILITY",
    is_account_group_representative: true,
    is_current: true,
    eligibility: "ELIGIBLE",
    eligibility_reason: "in scope",
    commercial_score: 94.9,
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
      "For test: GEOCHEM petroleum inspection and testing: quantity and quality inspection, cargo and ship/shore verification, sampling, tank/terminal measurement, custody transfer, and loss control.",
    targeting_reason: "test",
    recommended_contact_roles: ["Technical", "Decision Maker"],
    recommended_departments: ["Inspection", "Laboratory", "Engineering"],
    dimension_snapshot: [],
    scoring_model_version: "6.4.0",
    scored_at: new Date().toISOString(),
    ...overrides,
  };
}

function fullPayload(mutate?: (rows: CompanyServiceStpScoreInsert[]) => CompanyServiceStpScoreInsert[]): CompanyServiceStpScoreInsert[] {
  const rows = PET_WAVE1_COMPANY_IDS.map((companyId) => sampleRow({ company_id: companyId, account_group_key: `er:v1:id:${companyId}` }));
  return mutate ? mutate(rows) : rows;
}

export function runPetWave1SelfTest(): { ok: boolean; failures: string[] } {
  const failures: string[] = [];
  const manifest = assertPetWave1ManifestIntegrity();
  if (!manifest.ok) failures.push(...manifest.errors);
  if (PET_WAVE1_COMPANY_IDS.length !== PET_WAVE1_EXPECTED_COUNT) failures.push("Wave-1 id count");

  const personas = validateServicePersonaMap();
  if (!personas.ok) failures.push(...personas.errors);
  if (PCH_CONTACT_PERSONAS.length !== 8) failures.push("PCH personas must stay 8");

  if (rejectNonPetServiceId(PCH_SERVICE_ID) == null) failures.push("writer must reject PCH service_id");
  if (rejectNonPetServiceId(ENV_SERVICE_ID) == null) failures.push("writer must reject ENV service_id");
  if (rejectNonPetServiceId(INS_SERVICE_ID) == null) failures.push("writer must reject INS service_id");
  if (rejectNonPetServiceId(PET_SERVICE_ID) != null) failures.push("writer must accept PET service_id");

  const valid = validatePetWave1Payload(fullPayload());
  if (!valid.ok) failures.push(`valid payload failed: ${valid.errors.join("; ")}`);

  const dup = validatePetWave1Payload(fullPayload((rows) => [...rows, sampleRow({ company_id: PET_WAVE1_COMPANY_IDS[0] })]));
  if (dup.ok) failures.push("duplicate PET payload must fail");

  const unexpected = validatePetWave1Payload(
    fullPayload((rows) => {
      rows[0] = sampleRow({
        company_id: "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee",
        account_group_key: "er:v1:id:aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee",
      });
      return rows;
    }),
  );
  if (unexpected.ok) failures.push("unexpected PET company must fail");

  const missing = validatePetWave1Payload(fullPayload((rows) => rows.slice(1)));
  if (missing.ok) failures.push("missing approved PET company must fail");

  const pchPayload = validatePetWave1Payload(
    fullPayload((rows) => {
      rows[0] = { ...rows[0], service_id: PCH_SERVICE_ID };
      return rows;
    }),
  );
  if (pchPayload.ok) failures.push("PET payload with PCH service_id must fail");

  const envPayload = validatePetWave1Payload(
    fullPayload((rows) => {
      rows[0] = { ...rows[0], service_id: ENV_SERVICE_ID };
      return rows;
    }),
  );
  if (envPayload.ok) failures.push("PET payload with ENV service_id must fail");

  const insPayload = validatePetWave1Payload(
    fullPayload((rows) => {
      rows[0] = { ...rows[0], service_id: INS_SERVICE_ID };
      return rows;
    }),
  );
  if (insPayload.ok) failures.push("PET payload with INS service_id must fail");

  const insertPlan = planPetWave1Persist({
    pchCurrentCount: 350,
    envCurrentCount: 24,
    insCurrentCount: 22,
    petCurrentCount: 0,
    petCurrentCompanyIds: [],
    payload: fullPayload(),
  });
  if (!insertPlan.ok || insertPlan.action !== "insert") failures.push(`empty PET should insert: ${insertPlan.errors.join("; ")}`);

  const noopPlan = planPetWave1Persist({
    pchCurrentCount: 350,
    envCurrentCount: 24,
    insCurrentCount: 22,
    petCurrentCount: 18,
    petCurrentCompanyIds: [...PET_WAVE1_COMPANY_IDS],
    payload: fullPayload(),
  });
  if (!noopPlan.ok || noopPlan.action !== "noop") failures.push("rerunning PET persist must be idempotent noop");

  const pchBroken = planPetWave1Persist({
    pchCurrentCount: 349,
    envCurrentCount: 24,
    insCurrentCount: 22,
    petCurrentCount: 0,
    petCurrentCompanyIds: [],
    payload: fullPayload(),
  });
  if (pchBroken.ok) failures.push("PCH count !== 350 must abort persist");

  const envBroken = planPetWave1Persist({
    pchCurrentCount: 350,
    envCurrentCount: 23,
    insCurrentCount: 22,
    petCurrentCount: 0,
    petCurrentCompanyIds: [],
    payload: fullPayload(),
  });
  if (envBroken.ok) failures.push("ENV count !== 24 must abort persist");

  const insBroken = planPetWave1Persist({
    pchCurrentCount: 350,
    envCurrentCount: 24,
    insCurrentCount: 21,
    petCurrentCount: 0,
    petCurrentCompanyIds: [],
    payload: fullPayload(),
  });
  if (insBroken.ok) failures.push("INS count !== 22 must abort persist");

  const rollback = planPetWave1Rollback({
    pchCurrentCount: 350,
    envCurrentCount: 24,
    insCurrentCount: 22,
    petCurrentCompanyIds: [...PET_WAVE1_COMPANY_IDS],
  });
  if (!rollback.ok || rollback.action !== "rollback") failures.push("Wave-1 rollback plan must pass with PCH 350 ENV 24 INS 22");

  if (serviceReadiness("PCH") !== "CONFIGURED") failures.push("PCH readiness");
  if (serviceReadiness("PET") !== "NOT_CONFIGURED") failures.push("PET readiness at count 0");
  if (serviceReadiness("PET", 18) !== "CONFIGURED") failures.push("PET readiness at count 18");
  if (serviceReadiness("PET", 17) !== "NOT_CONFIGURED") failures.push("PET must not be CONFIGURED at count 17");

  return { ok: failures.length === 0, failures };
}

if (process.argv[1]?.includes("run-pet-wave1-self-test")) {
  const result = runPetWave1SelfTest();
  console.log(JSON.stringify(result, null, 2));
  if (!result.ok) process.exit(1);
}
