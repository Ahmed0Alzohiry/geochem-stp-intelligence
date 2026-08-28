/**
 * LAB Wave-1 persist/rollback gates. Pure functions — no database I/O.
 * Never accepts PCH, ENV, INS, PET, or OCM service_ids. Persist requires --write on the LAB writer.
 */
import type { CompanyServiceStpScoreInsert } from "./stp-persist-row";
import { validateStpPayload } from "./stp-persist-row";
import { ENV_SERVICE_ID, PCH_EXPECTED_CURRENT_COUNT, PCH_SERVICE_ID } from "./env-wave1-manifest";
import { ENV_EXPECTED_CURRENT_COUNT, INS_SERVICE_ID, INS_WAVE1_EXPECTED_COUNT } from "./ins-wave1-manifest";
import { OCM_SERVICE_ID, OCM_WAVE1_EXPECTED_COUNT, PET_EXPECTED_CURRENT_COUNT } from "./ocm-wave1-manifest";
import { PET_SERVICE_ID } from "./pet-wave1-manifest";
import {
  LAB_PETRO_RABIGH_ER_GROUP_KEY,
  LAB_PETRO_RABIGH_POLYMER_ID,
  LAB_PETRO_RABIGH_REFINING_ID,
  LAB_SERVICE_ID,
  LAB_WAVE1_COMPANY_IDS,
  LAB_WAVE1_EXPECTED_COUNT,
  labWave1CompanyIdSet,
} from "./lab-wave1-manifest";

export type LabPersistPlanAction = "insert" | "noop" | "rollback" | "abort";

export type LabWave1GateResult = {
  ok: boolean;
  action: LabPersistPlanAction;
  errors: string[];
};

export function rejectNonLabServiceId(serviceId: string): string | null {
  if (serviceId === PCH_SERVICE_ID) return "LAB writer rejected PCH service_id.";
  if (serviceId === ENV_SERVICE_ID) return "LAB writer rejected ENV service_id.";
  if (serviceId === INS_SERVICE_ID) return "LAB writer rejected INS service_id.";
  if (serviceId === PET_SERVICE_ID) return "LAB writer rejected PET service_id.";
  if (serviceId === OCM_SERVICE_ID) return "LAB writer rejected OCM service_id.";
  if (serviceId !== LAB_SERVICE_ID) return `LAB writer rejected non-LAB service_id ${serviceId}.`;
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

export function assertOcmProtected(ocmCurrentCount: number | null): string | null {
  if (ocmCurrentCount !== OCM_WAVE1_EXPECTED_COUNT) {
    return `OCM protection abort: current count ${ocmCurrentCount} !== ${OCM_WAVE1_EXPECTED_COUNT}.`;
  }
  return null;
}

export function validateLabWave1Payload(rows: CompanyServiceStpScoreInsert[]): LabWave1GateResult {
  const errors: string[] = [];
  const approved = labWave1CompanyIdSet();

  if (rows.length !== LAB_WAVE1_EXPECTED_COUNT) {
    errors.push(`Expected LAB Wave-1 count ${LAB_WAVE1_EXPECTED_COUNT}, got ${rows.length}.`);
  }

  for (const row of rows) {
    const rejected = rejectNonLabServiceId(row.service_id);
    if (rejected) errors.push(rejected);
    if (!approved.has(row.company_id)) errors.push(`Unexpected LAB company ${row.company_id}.`);
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
    if (
      (row.company_id === LAB_PETRO_RABIGH_POLYMER_ID || row.company_id === LAB_PETRO_RABIGH_REFINING_ID) &&
      row.account_group_key === LAB_PETRO_RABIGH_ER_GROUP_KEY
    ) {
      errors.push(
        `Petro Rabigh plant ${row.company_id} must use a facility-scoped LAB group key so both plants can persist.`,
      );
    }
  }

  const payloadIds = rows.map((row) => row.company_id);
  const unique = new Set(payloadIds);
  if (unique.size !== payloadIds.length) errors.push("Duplicate company_id + service_id in LAB payload.");
  if (payloadIds.join(",") !== LAB_WAVE1_COMPANY_IDS.join(",")) {
    errors.push("LAB payload order must match frozen Wave-1 rank order.");
  }

  for (const companyId of LAB_WAVE1_COMPANY_IDS) {
    if (!unique.has(companyId)) errors.push(`Missing approved LAB company ${companyId}.`);
  }

  const groups = rows.map((row) => row.account_group_key);
  if (new Set(groups).size !== groups.length) errors.push("Duplicate account_group_key in LAB Wave-1 payload.");

  const schema = validateStpPayload(rows, LAB_SERVICE_ID);
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

export function planLabWave1Persist(opts: {
  pchCurrentCount: number | null;
  envCurrentCount: number | null;
  insCurrentCount: number | null;
  petCurrentCount: number | null;
  ocmCurrentCount: number | null;
  labCurrentCount: number | null;
  labCurrentCompanyIds: string[];
  payload: CompanyServiceStpScoreInsert[];
}): LabWave1GateResult {
  const errors: string[] = [];
  const pch = assertPchProtected(opts.pchCurrentCount);
  if (pch) errors.push(pch);
  const env = assertEnvProtected(opts.envCurrentCount);
  if (env) errors.push(env);
  const ins = assertInsProtected(opts.insCurrentCount);
  if (ins) errors.push(ins);
  const pet = assertPetProtected(opts.petCurrentCount);
  if (pet) errors.push(pet);
  const ocm = assertOcmProtected(opts.ocmCurrentCount);
  if (ocm) errors.push(ocm);

  const payloadCheck = validateLabWave1Payload(opts.payload);
  if (!payloadCheck.ok) errors.push(...payloadCheck.errors);

  const labIds = [...new Set(opts.labCurrentCompanyIds)];
  const approved = labWave1CompanyIdSet();
  if (labIds.some((id) => !approved.has(id))) {
    errors.push("Existing LAB current rows include unexpected companies.");
  }

  if (errors.length > 0) {
    return { ok: false, action: "abort", errors: [...new Set(errors)] };
  }

  if (opts.labCurrentCount === LAB_WAVE1_EXPECTED_COUNT && labIds.length === LAB_WAVE1_EXPECTED_COUNT) {
    const missing = LAB_WAVE1_COMPANY_IDS.filter((id) => !labIds.includes(id));
    if (missing.length === 0) {
      return { ok: true, action: "noop", errors: [] };
    }
    return {
      ok: false,
      action: "abort",
      errors: [`LAB current count is ${LAB_WAVE1_EXPECTED_COUNT} but missing approved ids: ${missing.join(", ")}`],
    };
  }

  if ((opts.labCurrentCount ?? 0) > 0) {
    return {
      ok: false,
      action: "abort",
      errors: [`LAB current count ${opts.labCurrentCount} is not 0 or ${LAB_WAVE1_EXPECTED_COUNT}; refuse to write.`],
    };
  }

  return { ok: true, action: "insert", errors: [] };
}

export function planLabWave1Rollback(opts: {
  pchCurrentCount: number | null;
  envCurrentCount: number | null;
  insCurrentCount: number | null;
  petCurrentCount: number | null;
  ocmCurrentCount: number | null;
  labCurrentCompanyIds: string[];
}): LabWave1GateResult {
  const errors: string[] = [];
  const pch = assertPchProtected(opts.pchCurrentCount);
  if (pch) errors.push(pch);
  const env = assertEnvProtected(opts.envCurrentCount);
  if (env) errors.push(env);
  const ins = assertInsProtected(opts.insCurrentCount);
  if (ins) errors.push(ins);
  const pet = assertPetProtected(opts.petCurrentCount);
  if (pet) errors.push(pet);
  const ocm = assertOcmProtected(opts.ocmCurrentCount);
  if (ocm) errors.push(ocm);
  const approved = labWave1CompanyIdSet();
  if (opts.labCurrentCompanyIds.some((id) => !approved.has(id))) {
    errors.push("Rollback abort: LAB current rows include companies outside Wave-1.");
  }
  if (errors.length > 0) return { ok: false, action: "abort", errors };
  return { ok: true, action: "rollback", errors: [] };
}
