/**
 * ENV Wave-1 persist/rollback gates. Pure functions — no database I/O.
 * Never accepts PCH or other non-ENV service_ids.
 */
import type { CompanyServiceStpScoreInsert } from "./stp-persist-row";
import { validateStpPayload } from "./stp-persist-row";
import {
  ENV_SERVICE_ID,
  ENV_WAVE1_COMPANY_IDS,
  ENV_WAVE1_EXPECTED_COUNT,
  PCH_EXPECTED_CURRENT_COUNT,
  PCH_SERVICE_ID,
  envWave1CompanyIdSet,
} from "./env-wave1-manifest";

export type PersistPlanAction = "insert" | "noop" | "rollback" | "abort";

export type EnvWave1GateResult = {
  ok: boolean;
  action: PersistPlanAction;
  errors: string[];
};

export function rejectNonEnvServiceId(serviceId: string): string | null {
  if (serviceId === PCH_SERVICE_ID) return "ENV writer rejected PCH service_id.";
  if (serviceId !== ENV_SERVICE_ID) return `ENV writer rejected non-ENV service_id ${serviceId}.`;
  return null;
}

export function assertPchProtected(pchCurrentCount: number | null): string | null {
  if (pchCurrentCount !== PCH_EXPECTED_CURRENT_COUNT) {
    return `PCH protection abort: current count ${pchCurrentCount} !== ${PCH_EXPECTED_CURRENT_COUNT}.`;
  }
  return null;
}

export function validateEnvWave1Payload(rows: CompanyServiceStpScoreInsert[]): EnvWave1GateResult {
  const errors: string[] = [];
  const approved = envWave1CompanyIdSet();

  if (rows.length !== ENV_WAVE1_EXPECTED_COUNT) {
    errors.push(`Expected ENV Wave-1 count ${ENV_WAVE1_EXPECTED_COUNT}, got ${rows.length}.`);
  }

  for (const row of rows) {
    const rejected = rejectNonEnvServiceId(row.service_id);
    if (rejected) errors.push(rejected);
    if (!approved.has(row.company_id)) errors.push(`Unexpected ENV company ${row.company_id}.`);
    if (row.commercial_score == null) errors.push(`Missing score for ${row.company_id}.`);
    if (row.tier == null) errors.push(`Missing tier for ${row.company_id}.`);
    if (row.application_fit == null) errors.push(`Missing application_fit for ${row.company_id}.`);
    if (row.data_confidence_score == null || !row.data_confidence_band) {
      errors.push(`Missing data_confidence for ${row.company_id}.`);
    }
    if (row.ranking_eligible !== true) errors.push(`ranking_eligible must be true for ${row.company_id}.`);
    if (!row.positioning_statement) errors.push(`Missing positioning for ${row.company_id}.`);
  }

  const payloadIds = rows.map((row) => row.company_id);
  const unique = new Set(payloadIds);
  if (unique.size !== payloadIds.length) errors.push("Duplicate company_id + service_id in ENV payload.");

  for (const companyId of ENV_WAVE1_COMPANY_IDS) {
    if (!unique.has(companyId)) errors.push(`Missing approved ENV company ${companyId}.`);
  }

  const schema = validateStpPayload(rows, ENV_SERVICE_ID);
  if (!schema.schemaValid) {
    errors.push(...schema.issues.map((issue) => `${issue.field}: ${issue.detail}`));
  }
  if (schema.relatedRepresentatives > 0) errors.push("RELATED/REVIEW representatives are not allowed.");

  const uniqueErrors = [...new Set(errors)];
  return {
    ok: uniqueErrors.length === 0,
    action: uniqueErrors.length === 0 ? "insert" : "abort",
    errors: uniqueErrors,
  };
}

export function planEnvWave1Persist(opts: {
  pchCurrentCount: number | null;
  envCurrentCount: number | null;
  envCurrentCompanyIds: string[];
  payload: CompanyServiceStpScoreInsert[];
}): EnvWave1GateResult {
  const errors: string[] = [];
  const pch = assertPchProtected(opts.pchCurrentCount);
  if (pch) errors.push(pch);

  const payloadCheck = validateEnvWave1Payload(opts.payload);
  if (!payloadCheck.ok) errors.push(...payloadCheck.errors);

  const envIds = [...new Set(opts.envCurrentCompanyIds)];
  const approved = envWave1CompanyIdSet();
  if (envIds.some((id) => !approved.has(id))) {
    errors.push("Existing ENV current rows include unexpected companies.");
  }

  if (errors.length > 0) {
    return { ok: false, action: "abort", errors: [...new Set(errors)] };
  }

  if (opts.envCurrentCount === ENV_WAVE1_EXPECTED_COUNT && envIds.length === ENV_WAVE1_EXPECTED_COUNT) {
    const missing = ENV_WAVE1_COMPANY_IDS.filter((id) => !envIds.includes(id));
    if (missing.length === 0) {
      return { ok: true, action: "noop", errors: [] };
    }
    return { ok: false, action: "abort", errors: [`ENV current count is 24 but missing approved ids: ${missing.join(", ")}`] };
  }

  if ((opts.envCurrentCount ?? 0) > 0) {
    return {
      ok: false,
      action: "abort",
      errors: [`ENV current count ${opts.envCurrentCount} is not 0 or ${ENV_WAVE1_EXPECTED_COUNT}; refuse to write.`],
    };
  }

  return { ok: true, action: "insert", errors: [] };
}

export function planEnvWave1Rollback(opts: {
  pchCurrentCount: number | null;
  envCurrentCount: number | null;
  envCurrentCompanyIds: string[];
}): EnvWave1GateResult {
  const errors: string[] = [];
  const pch = assertPchProtected(opts.pchCurrentCount);
  if (pch) errors.push(pch);
  const approved = envWave1CompanyIdSet();
  if (opts.envCurrentCompanyIds.some((id) => !approved.has(id))) {
    errors.push("Rollback abort: ENV current rows include companies outside Wave-1.");
  }
  if (errors.length > 0) return { ok: false, action: "abort", errors };
  return { ok: true, action: "rollback", errors: [] };
}
