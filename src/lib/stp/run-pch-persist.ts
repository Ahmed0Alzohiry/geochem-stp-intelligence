/**
 * STEP 6.11 PCH persist writer.
 * INSERT into company_service_stp_scores only when --write is passed.
 * Does not UPDATE public.companies or public.company_locations.
 */
import { createSupabaseBrowserClient } from "../supabase/client";
import { buildLivePchPersistPayload, loadEnvLocal } from "./build-pch-persist-payload";
import { SERVICE_STP_CURRENT_VIEW, SERVICE_STP_TABLE } from "./persistence-readiness";
import { validateStpPayload } from "./stp-persist-row";
import { SERVICE_FIRST_MODEL_VERSION } from "./types";

const CHUNK = 50;
const EXPECTED_ROWS = 350;

function hasFlag(name: string): boolean {
  return process.argv.includes(name);
}

async function countTable(table: string, idCol = "id") {
  const supabase = createSupabaseBrowserClient();
  const { count, error } = await supabase.from(table).select(idCol, { count: "exact", head: true });
  return { count: error ? null : (count ?? 0), error: error?.message ?? null };
}

async function main() {
  loadEnvLocal();
  const write = hasFlag("--write");
  const supabase = createSupabaseBrowserClient();
  const scoredAt = new Date().toISOString();
  const { pch, payload, groupedCount, relatedSkippedGroups } = await buildLivePchPersistPayload(scoredAt);
  const validation = validateStpPayload(payload, pch.id);
  const uniqueGroups = new Set(payload.map((row) => row.account_group_key));
  const before = {
    stp: await countTable(SERVICE_STP_TABLE),
    companies: await countTable("companies"),
    locations: await countTable("company_locations"),
    v1Scores: await countTable("company_scores"),
  };

  const gates = {
    schemaValid: validation.schemaValid,
    expectedRowCount: payload.length === EXPECTED_ROWS && groupedCount === EXPECTED_ROWS,
    uniqueGroups: uniqueGroups.size === payload.length,
    relatedReps: validation.relatedRepresentatives === 0,
    tableEmpty: before.stp.count === 0,
    allPch: payload.every((row) => row.service_id === pch.id),
    allCurrentReps: payload.every((row) => row.is_current && row.is_account_group_representative),
  };
  const canWrite = Object.values(gates).every(Boolean);

  let written = 0;
  let writeError: string | null = null;
  if (write) {
    if (!canWrite) {
      writeError = `Persist gates failed: ${JSON.stringify(gates)}`;
    } else {
      for (let i = 0; i < payload.length; i += CHUNK) {
        const chunk = payload.slice(i, i + CHUNK);
        const { error } = await supabase.from(SERVICE_STP_TABLE).insert(chunk);
        if (error) {
          writeError = [error.message, error.code, error.details, error.hint].filter(Boolean).join(" | ");
          break;
        }
        written += chunk.length;
      }
    }
  }

  const stored = await supabase
    .from(SERVICE_STP_TABLE)
    .select(
      "id, company_id, service_id, account_group_key, entity_type, is_account_group_representative, is_current, eligibility, commercial_score, tier, application_fit, scoring_model_version",
    )
    .eq("service_id", pch.id);
  const rows = stored.data ?? [];
  const storedGroups = new Set(rows.map((row) => row.account_group_key));
  const after = {
    stp: await countTable(SERVICE_STP_TABLE),
    currentView: await countTable(SERVICE_STP_CURRENT_VIEW),
    companies: await countTable("companies"),
    locations: await countTable("company_locations"),
    v1Scores: await countTable("company_scores"),
  };

  const verify = {
    storedRows: rows.length,
    uniqueAccountGroups: storedGroups.size,
    allCurrent: rows.every((row) => row.is_current === true),
    allRepresentatives: rows.every((row) => row.is_account_group_representative === true),
    relatedRepresentatives: rows.filter((row) => row.entity_type === "RELATED" || row.entity_type === "REVIEW").length,
    allPchServiceId: rows.every((row) => row.service_id === pch.id),
    companiesUnchanged: after.companies.count === before.companies.count,
    locationsUnchanged: after.locations.count === before.locations.count,
    v1ScoresStillEmpty: after.v1Scores.count === 0,
    storedError: stored.error?.message ?? null,
  };

  console.log(
    JSON.stringify(
      {
        step: "6.11",
        writeFlag: write,
        persisted: write && !writeError && written === EXPECTED_ROWS,
        modelVersion: SERVICE_FIRST_MODEL_VERSION,
        pchService: pch,
        relatedSkippedGroups,
        gates,
        canWrite,
        written,
        writeError,
        payloadRows: payload.length,
        uniquePayloadGroups: uniqueGroups.size,
        before,
        after,
        verify,
      },
      null,
      2,
    ),
  );

  if (write && (writeError || written !== EXPECTED_ROWS)) process.exitCode = 1;
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
