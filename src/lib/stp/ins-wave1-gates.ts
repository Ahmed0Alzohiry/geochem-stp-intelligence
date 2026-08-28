/**
 * INS Wave-1 persist/rollback gates. Pure functions — no database I/O.
 * Never accepts PCH or ENV service_ids. Persist requires an explicit --write on the INS writer.
 */
import type { CompanyServiceStpScoreInsert } from "./stp-persist-row";
import { validateStpPayload } from "./stp-persist-row";
import { ENV_SERVICE_ID, PCH_EXPECTED_CURRENT_COUNT, PCH_SERVICE_ID } from "./env-wave1-manifest";
import {
  ENV_EXPECTED_CURRENT_COUNT,
  INS_SERVICE_ID,
  INS_WAVE1_COMPANY_IDS,
  INS_WAVE1_EXPECTED_COUNT,
  insWave1CompanyIdSet,
} from "./ins-wave1-manifest";

export type InsPersistPlanAction = "insert" | "noop" | "rollback" | "abort";

export type InsWave1GateResult = {
  ok: boolean;
  action: InsPersistPlanAction;
  errors: string[];
};

export function rejectNonInsServiceId(serviceId: string): string | null {
  if (serviceId === PCH_SERVICE_ID) return "INS writer rejected PCH service_id.";
  if (serviceId === ENV_SERVICE_ID) return "INS writer rejected ENV service_id.";
  if (serviceId !== INS_SERVICE_ID) return `INS writer rejected non-INS service_id ${serviceId}.`;
  return null;
}

export function assertPchProtected(pchCurrentCount: number | null): string | null {
  if (pchCurrentCount !== PCH_EXPECTED_CURRENT_COUNT) {
    return `PCH protection abort: current count ${pchCurrentCount} !== ${PCH_EXPECTED_CURRENT_COUNT}.`;
  }
  return null;
}

export function assertEnvProtected(envCurrentCount: number | null): string | null {
  if (envCurrentCount !== ENV_EXPECTED_CURRENT_COUNT) {
    return `ENV protection abort: current count ${envCurrentCount} !== ${ENV_EXPECTED_CURRENT_COUNT}.`;
  }
  return null;
}

export function validateInsWave1Payload(rows: CompanyServiceStpScoreInsert[]): InsWave1GateResult {
  const errors: string[] = [];
  const approved = insWave1CompanyIdSet();

  if (rows.length !== INS_WAVE1_EXPECTED_COUNT) {
    errors.push(`Expected INS Wave-1 count ${INS_WAVE1_EXPECTED_COUNT}, got ${rows.length}.`);
  }

  for (const row of rows) {
    const rejected = rejectNonInsServiceId(row.service_id);
    if (rejected) errors.push(rejected);
    if (!approved.has(row.company_id)) errors.push(`Unexpected INS company ${row.company_id}.`);
    if (row.commercial_score == null) errors.push(`Missing score for ${row.company_id}.`);
    if (row.tier == null) errors.push(`Missing tier for ${row.company_id}.`);
    if (row.application_fit == null) errors.push(`Missing application_fit for ${row.company_id}.`);
    if (row.data_confidence_score == null || !row.data_confidence_band) {
      errors.push(`Missing data_confidence for ${row.company_id}.`);
    }
    if (row.ranking_eligible !== true) errors.push(`ranking_eligible must be true for ${row.company_id}.`);
    if (!row.positioning_statement) errors.push(`Missing positioning for ${row.company_id}.`);
    if (row.data_confidence_band === "LOW") errors.push(`LOW data confidence is not allowed for ${row.company_id}.`);
    if (row.tier === "Watchlist") errors.push(`Watchlist is not allowed for Wave-1 ${row.company_id}.`);
    if (row.eligibility !== "ELIGIBLE") errors.push(`Wave-1 row must be ELIGIBLE: ${row.company_id}.`);
    if (row.entity_type === "RELATED" || row.entity_type === "REVIEW") {
      errors.push(`RELATED/REVIEW is not allowed for ${row.company_id}.`);
    }
  }

  const payloadIds = rows.map((row) => row.company_id);
  const unique = new Set(payloadIds);
  if (unique.size !== payloadIds.length) errors.push("Duplicate company_id + service_id in INS payload.");
  if (payloadIds.join(",") !== INS_WAVE1_COMPANY_IDS.join(",")) {
    errors.push("INS payload order must match frozen Wave-1 rank order.");
  }

  for (const companyId of INS_WAVE1_COMPANY_IDS) {
    if (!unique.has(companyId)) errors.push(`Missing approved INS company ${companyId}.`);
  }

  const schema = validateStpPayload(rows, INS_SERVICE_ID);
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

export function planInsWave1Persist(opts: {
  pchCurrentCount: number | null;
  envCurrentCount: number | null;
  insCurrentCount: number | null;
  insCurrentCompanyIds: string[];
  payload: CompanyServiceStpScoreInsert[];
}): InsWave1GateResult {
  const errors: string[] = [];
  const pch = assertPchProtected(opts.pchCurrentCount);
  if (pch) errors.push(pch);
  const env = assertEnvProtected(opts.envCurrentCount);
  if (env) errors.push(env);

  const payloadCheck = validateInsWave1Payload(opts.payload);
  if (!payloadCheck.ok) errors.push(...payloadCheck.errors);

  const insIds = [...new Set(opts.insCurrentCompanyIds)];
  const approved = insWave1CompanyIdSet();
  if (insIds.some((id) => !approved.has(id))) {
    errors.push("Existing INS current rows include unexpected companies.");
  }

  if (errors.length > 0) {
    return { ok: false, action: "abort", errors: [...new Set(errors)] };
  }

  if (opts.insCurrentCount === INS_WAVE1_EXPECTED_COUNT && insIds.length === INS_WAVE1_EXPECTED_COUNT) {
    const missing = INS_WAVE1_COMPANY_IDS.filter((id) => !insIds.includes(id));
    if (missing.length === 0) {
      return { ok: true, action: "noop", errors: [] };
    }
    return { ok: false, action: "abort", errors: [`INS current count is ${INS_WAVE1_EXPECTED_COUNT} but missing approved ids: ${missing.join(", ")}`] };
  }

  if ((opts.insCurrentCount ?? 0) > 0) {
    return {
      ok: false,
      action: "abort",
      errors: [`INS current count ${opts.insCurrentCount} is not 0 or ${INS_WAVE1_EXPECTED_COUNT}; refuse to write.`],
    };
  }

  return { ok: true, action: "insert", errors: [] };
}

export function planInsWave1Rollback(opts: {
  pchCurrentCount: number | null;
  envCurrentCount: number | null;
  insCurrentCompanyIds: string[];
}): InsWave1GateResult {
  const errors: string[] = [];
  const pch = assertPchProtected(opts.pchCurrentCount);
  if (pch) errors.push(pch);
  const env = assertEnvProtected(opts.envCurrentCount);
  if (env) errors.push(env);
  const approved = insWave1CompanyIdSet();
  if (opts.insCurrentCompanyIds.some((id) => !approved.has(id))) {
    errors.push("Rollback abort: INS current rows include companies outside Wave-1.");
  }
  if (errors.length > 0) return { ok: false, action: "abort", errors };
  return { ok: true, action: "rollback", errors: [] };
}
