/**
 * STEP 6.5 read-only persistence-readiness probe.
 * Does not apply migrations and does not persist scores.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createSupabaseBrowserClient } from "../supabase/client";
import {
  EXISTING_SCORE_TABLES,
  PROPOSED_MIGRATION_FILE,
  REQUIRED_STP_OUTPUTS,
  SERVICE_STP_SCHEMA_VERSION,
  SERVICE_STP_TABLE,
  persistGates,
  uniquenessModel,
} from "./persistence-readiness";

function loadEnvLocal() {
  const envPath = resolve(process.cwd(), ".env.local");
  const text = readFileSync(envPath, "utf8");
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim();
    if (!process.env[key]) process.env[key] = value;
  }
}

async function countTable(table: string, idCol = "id") {
  const supabase = createSupabaseBrowserClient();
  const { count, error } = await supabase.from(table).select(idCol, { count: "exact", head: true });
  const missing = !!error && /does not exist|schema cache/i.test(error.message);
  return {
    table,
    count: error ? null : (count ?? 0),
    error: error ? `${error.code ?? ""} ${error.message}`.trim() : null,
    exists: !missing,
  };
}

async function columnExists(table: string, column: string): Promise<boolean> {
  const supabase = createSupabaseBrowserClient();
  const { error } = await supabase.from(table).select(column).limit(1);
  if (!error) return true;
  return !/does not exist|schema cache/i.test(error.message);
}

async function selectProbe(table: string, fields: string) {
  const supabase = createSupabaseBrowserClient();
  const { error } = await supabase.from(table).select(fields).limit(1);
  return { table, fields, error: error ? `${error.code ?? ""} ${error.message}`.trim() : null };
}

async function main() {
  loadEnvLocal();
  const supabase = createSupabaseBrowserClient();

  const services = await supabase.from("services").select("id, name, service_code, active").order("service_code");
  const counts = {
    companies: await countTable("companies"),
    services: await countTable("services"),
    companyServices: await countTable("company_services"),
    companyScores: await countTable("company_scores"),
    snapshots: await countTable("company_target_snapshots"),
    entityResolution: await countTable("company_entity_resolution", "company_id"),
    stpScores: await countTable(SERVICE_STP_TABLE),
  };

  const companyScoresHasServiceId = await columnExists("company_scores", "service_id");
  const snapshotHasServiceId = await columnExists("company_target_snapshots", "service_id");
  const v1ScoreShape = await selectProbe(
    "company_scores",
    "id, company_id, criterion_id, rating, assessed_at",
  );
  const v1SnapshotShape = await selectProbe(
    "company_target_snapshots",
    "id, company_id, score_out_of_100, tier, assessment_status, scoring_model_version",
  );
  const stpShape = await selectProbe(
    SERVICE_STP_TABLE,
    "id, company_id, service_id, account_group_key, is_account_group_representative, is_current, eligibility, commercial_score, tier, industry_fit, application_fit, service_need_fit, commercial_potential, geographic_fit, strategic_fit, data_confidence_score, data_confidence_band, positioning_statement, targeting_reason, recommended_contact_roles, scoring_model_version, scored_at",
  );
  const stpTableExists = !stpShape.error;

  const gates = persistGates({
    stpTableExists,
    companyScoresHasServiceId,
    snapshotHasServiceId,
    companyScoresRows: counts.companyScores.count ?? -1,
    snapshotRows: counts.snapshots.count ?? -1,
    stpScoreRows: stpTableExists ? counts.stpScores.count : null,
  });

  console.log(
    JSON.stringify(
      {
        persisted: false,
        databaseWrites: 0,
        scoresWritten: 0,
        tiersWritten: 0,
        schemaVersion: SERVICE_STP_SCHEMA_VERSION,
        proposedMigrationFile: PROPOSED_MIGRATION_FILE,
        existingScoreTables: EXISTING_SCORE_TABLES,
        live: {
          services: services.data ?? [],
          servicesError: services.error?.message ?? null,
          counts,
          companyScoresHasServiceId,
          snapshotHasServiceId,
          stpTableExists,
          v1ScoreShape,
          v1SnapshotShape,
          stpShape,
        },
        requiredOutputs: REQUIRED_STP_OUTPUTS,
        uniquenessModel: uniquenessModel(),
        persistGates: gates,
      },
      null,
      2,
    ),
  );
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
