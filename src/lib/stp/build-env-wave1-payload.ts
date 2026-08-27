/**
 * Build the ENV Wave-1 STP payload from the live 6.4.0 engine.
 * SELECT + in-memory score only. Does not write.
 */
import { buildLiveServicePersistPayload, loadEnvLocal } from "./build-pch-persist-payload";
import { ENV_SERVICE_ID, ENV_WAVE1_COMPANY_IDS, ENV_WAVE1_EXPECTED_COUNT, envWave1CompanyIdSet } from "./env-wave1-manifest";
import { validateEnvWave1Payload } from "./env-wave1-gates";
import type { CompanyServiceStpScoreInsert } from "./stp-persist-row";

export async function buildEnvWave1PersistPayload(scoredAt: string): Promise<{
  service: { id: string; name: string; service_code: string };
  payload: CompanyServiceStpScoreInsert[];
  envUniverseCount: number;
}> {
  loadEnvLocal();
  const result = await buildLiveServicePersistPayload("ENV", scoredAt);
  if (result.service.id !== ENV_SERVICE_ID) {
    throw new Error(`Live ENV service_id ${result.service.id} !== frozen ${ENV_SERVICE_ID}`);
  }
  const approved = envWave1CompanyIdSet();
  const payload = result.payload.filter((row) => approved.has(row.company_id));
  const ordered = ENV_WAVE1_COMPANY_IDS.map((companyId) => payload.find((row) => row.company_id === companyId)).filter(
    (row): row is CompanyServiceStpScoreInsert => Boolean(row),
  );
  if (ordered.length !== ENV_WAVE1_EXPECTED_COUNT) {
    const missing = ENV_WAVE1_COMPANY_IDS.filter((id) => !payload.some((row) => row.company_id === id));
    throw new Error(`ENV Wave-1 payload missing ${missing.length} approved companies: ${missing.join(", ")}`);
  }
  const check = validateEnvWave1Payload(ordered);
  if (!check.ok) throw new Error(check.errors.join(" | "));
  return { service: result.service, payload: ordered, envUniverseCount: result.payload.length };
}
