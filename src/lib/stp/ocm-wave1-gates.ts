/**
 * OCM Wave-1 persist/rollback gates. Pure functions — no database I/O.
 * Never accepts PCH, ENV, INS, or PET service_ids. Persist requires --write on the OCM writer.
 * ranking_eligible may be false: frozen APPROVE sites are often Prospect without HIGH geo.
 */
import type { CompanyServiceStpScoreInsert } from "./stp-persist-row";
import { validateStpPayload } from "./stp-persist-row";
import { ENV_SERVICE_ID, PCH_EXPECTED_CURRENT_COUNT, PCH_SERVICE_ID } from "./env-wave1-manifest";
import { ENV_EXPECTED_CURRENT_COUNT, INS_SERVICE_ID, INS_WAVE1_EXPECTED_COUNT } from "./ins-wave1-manifest";
import {
  OCM_PETRO_RABIGH_REFINING_ID,
  OCM_SERVICE_ID,
  OCM_WAVE1_COMPANY_IDS,
  OCM_WAVE1_EXPECTED_COUNT,
  ocmWave1CompanyIdSet,
  PET_EXPECTED_CURRENT_COUNT,
} from "./ocm-wave1-manifest";
import { PET_SERVICE_ID } from "./pet-wave1-manifest";

export type OcmPersistPlanAction = "insert" | "noop" | "rollback" | "abort";

export type OcmWave1GateResult = {
  ok: boolean;
  action: OcmPersistPlanAction;
  errors: string[];
};

export function rejectNonOcmServiceId(serviceId: string): string | null {
  if (serviceId === PCH_SERVICE_ID) return "OCM writer rejected PCH service_id.";
  if (serviceId === ENV_SERVICE_ID) return "OCM writer rejected ENV service_id.";
  if (serviceId === INS_SERVICE_ID) return "OCM writer rejected INS service_id.";
  if (serviceId === PET_SERVICE_ID) return "OCM writer rejected PET service_id.";
  if (serviceId !== OCM_SERVICE_ID) return `OCM writer rejected non-OCM service_id ${serviceId}.`;
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

export function assertInsProtected(insCurrentCount: number | null): string | null {
  if (insCurrentCount !== INS_WAVE1_EXPECTED_COUNT) {
    return `INS protection abort: current count ${insCurrentCount} !== ${INS_WAVE1_EXPECTED_COUNT}.`;
  }
  return null;
}

export function assertPetProtected(petCurrentCount: number | null): string | null {
  if (petCurrentCount !== PET_EXPECTED_CURRENT_COUNT) {
    return `PET protection abort: current count ${petCurrentCount} !== ${PET_EXPECTED_CURRENT_COUNT}.`;
  }
  return null;
}

export function validateOcmWave1Payload(rows: CompanyServiceStpScoreInsert[]): OcmWave1GateResult {
  const errors: string[] = [];
  const approved = ocmWave1CompanyIdSet();

  if (rows.length !== OCM_WAVE1_EXPECTED_COUNT) {
    errors.push(`Expected OCM Wave-1 count ${OCM_WAVE1_EXPECTED_COUNT}, got ${rows.length}.`);
  }

  for (const row of rows) {
    const rejected = rejectNonOcmServiceId(row.service_id);
    if (rejected) errors.push(rejected);
    if (!approved.has(row.company_id)) errors.push(`Unexpected OCM company ${row.company_id}.`);
    if (row.company_id === OCM_PETRO_RABIGH_REFINING_ID) {
      errors.push("Petro Rabigh Refining is not a Wave-1 persist row; it shares the Polymer account group.");
    }
    if (row.commercial_score == null) errors.push(`Missing score for ${row.company_id}.`);
    if (row.tier == null) errors.push(`Missing tier for ${row.company_id}.`);
    if (row.application_fit == null) errors.push(`Missing application_fit for ${row.company_id}.`);
    if (row.data_confidence_score == null || !row.data_confidence_band) {
      errors.push(`Missing data_confidence for ${row.company_id}.`);
    }
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
  if (unique.size !== payloadIds.length) errors.push("Duplicate company_id + service_id in OCM payload.");
  if (payloadIds.join(",") !== OCM_WAVE1_COMPANY_IDS.join(",")) {
    errors.push("OCM payload order must match frozen Wave-1 rank order.");
  }

  for (const companyId of OCM_WAVE1_COMPANY_IDS) {
    if (!unique.has(companyId)) errors.push(`Missing approved OCM company ${companyId}.`);
  }

  const groups = rows.map((row) => row.account_group_key);
  if (new Set(groups).size !== groups.length) errors.push("Duplicate account_group_key in OCM Wave-1 payload.");

  const schema = validateStpPayload(rows, OCM_SERVICE_ID);
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

export function planOcmWave1Persist(opts: {
  pchCurrentCount: number | null;
  envCurrentCount: number | null;
  insCurrentCount: number | null;
  petCurrentCount: number | null;
  ocmCurrentCount: number | null;
  ocmCurrentCompanyIds: string[];
  payload: CompanyServiceStpScoreInsert[];
}): OcmWave1GateResult {
  const errors: string[] = [];
  const pch = assertPchProtected(opts.pchCurrentCount);
  if (pch) errors.push(pch);
  const env = assertEnvProtected(opts.envCurrentCount);
  if (env) errors.push(env);
  const ins = assertInsProtected(opts.insCurrentCount);
  if (ins) errors.push(ins);
  const pet = assertPetProtected(opts.petCurrentCount);
  if (pet) errors.push(pet);

  const payloadCheck = validateOcmWave1Payload(opts.payload);
  if (!payloadCheck.ok) errors.push(...payloadCheck.errors);

  const ocmIds = [...new Set(opts.ocmCurrentCompanyIds)];
  const approved = ocmWave1CompanyIdSet();
  if (ocmIds.some((id) => !approved.has(id))) {
    errors.push("Existing OCM current rows include unexpected companies.");
  }

  if (errors.length > 0) {
    return { ok: false, action: "abort", errors: [...new Set(errors)] };
  }

  if (opts.ocmCurrentCount === OCM_WAVE1_EXPECTED_COUNT && ocmIds.length === OCM_WAVE1_EXPECTED_COUNT) {
    const missing = OCM_WAVE1_COMPANY_IDS.filter((id) => !ocmIds.includes(id));
    if (missing.length === 0) {
      return { ok: true, action: "noop", errors: [] };
    }
    return {
      ok: false,
      action: "abort",
      errors: [`OCM current count is ${OCM_WAVE1_EXPECTED_COUNT} but missing approved ids: ${missing.join(", ")}`],
    };
  }

  if ((opts.ocmCurrentCount ?? 0) > 0) {
    return {
      ok: false,
      action: "abort",
      errors: [`OCM current count ${opts.ocmCurrentCount} is not 0 or ${OCM_WAVE1_EXPECTED_COUNT}; refuse to write.`],
    };
  }

  return { ok: true, action: "insert", errors: [] };
}

export function planOcmWave1Rollback(opts: {
  pchCurrentCount: number | null;
  envCurrentCount: number | null;
  insCurrentCount: number | null;
  petCurrentCount: number | null;
  ocmCurrentCompanyIds: string[];
}): OcmWave1GateResult {
  const errors: string[] = [];
  const pch = assertPchProtected(opts.pchCurrentCount);
  if (pch) errors.push(pch);
  const env = assertEnvProtected(opts.envCurrentCount);
  if (env) errors.push(env);
  const ins = assertInsProtected(opts.insCurrentCount);
  if (ins) errors.push(ins);
  const pet = assertPetProtected(opts.petCurrentCount);
  if (pet) errors.push(pet);
  const approved = ocmWave1CompanyIdSet();
  if (opts.ocmCurrentCompanyIds.some((id) => !approved.has(id))) {
    errors.push("Rollback abort: OCM current rows include companies outside Wave-1.");
  }
  if (errors.length > 0) return { ok: false, action: "abort", errors };
  return { ok: true, action: "rollback", errors: [] };
}
