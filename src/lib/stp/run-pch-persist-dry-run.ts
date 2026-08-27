/**
 * STEP 6.7 PCH persist dry-run.
 * Maps STEP 6.4 account-group representatives to company_service_stp_scores rows.
 * SELECT only. Never INSERT/UPDATE/UPSERT/DELETE.
 */
import { createSupabaseBrowserClient } from "../supabase/client";
import { buildLivePchPersistPayload, loadEnvLocal } from "./build-pch-persist-payload";
import { SERVICE_STP_TABLE } from "./persistence-readiness";
import { validateStpPayload } from "./stp-persist-row";
import { SERVICE_FIRST_MODEL_VERSION } from "./types";

async function main() {
  loadEnvLocal();
  const supabase = createSupabaseBrowserClient();
  const scoredAt = new Date().toISOString();
  const { pch, payload } = await buildLivePchPersistPayload(scoredAt);
  const validation = validateStpPayload(payload, pch.id);
  const uniqueGroups = new Set(payload.map((row) => row.account_group_key));
  const ranked = [...payload].sort((a, b) => (b.commercial_score ?? 0) - (a.commercial_score ?? 0));
  const top20 = ranked.slice(0, 20).map((row, index) => ({
    rank: index + 1,
    companyId: row.company_id,
    accountGroup: row.account_group_key,
    service: `${pch.service_code} / ${pch.name}`,
    commercialScore: row.commercial_score,
    tier: row.tier,
    applicationFit: row.application_fit,
    dataConfidence: `${row.data_confidence_band} ${row.data_confidence_score}`,
    positioning: row.positioning_statement,
    whyTarget: row.targeting_reason,
    recommendedContactRoles: row.recommended_contact_roles,
    entityType: row.entity_type,
    serviceId: row.service_id,
  }));

  const afterCounts = {
    stp: await supabase.from(SERVICE_STP_TABLE).select("id", { count: "exact", head: true }),
    scores: await supabase.from("company_scores").select("id", { count: "exact", head: true }),
    snapshots: await supabase.from("company_target_snapshots").select("id", { count: "exact", head: true }),
    companies: await supabase.from("companies").select("id", { count: "exact", head: true }),
    locations: await supabase.from("company_locations").select("id", { count: "exact", head: true }),
  };

  const persistPayloadReady =
    validation.schemaValid && uniqueGroups.size === payload.length && validation.relatedRepresentatives === 0;

  console.log(
    JSON.stringify(
      {
        persisted: false,
        dryRun: true,
        databaseWrites: 0,
        scoresWritten: 0,
        tiersWritten: 0,
        modelVersion: SERVICE_FIRST_MODEL_VERSION,
        pchService: { id: pch.id, name: pch.name, service_code: pch.service_code, hardcoded: false },
        rowsThatWouldBeWritten: payload.length,
        uniqueAccountGroups: uniqueGroups.size,
        payloadMatchesUniqueGroups: payload.length === uniqueGroups.size,
        validation,
        top20,
        liveAfterSelectOnly: {
          company_service_stp_scores: afterCounts.stp.count,
          company_scores: afterCounts.scores.count,
          company_target_snapshots: afterCounts.snapshots.count,
          companies: afterCounts.companies.count,
          company_locations: afterCounts.locations.count,
          errors: {
            stp: afterCounts.stp.error?.message ?? null,
            scores: afterCounts.scores.error?.message ?? null,
          },
        },
        report: {
          PCH_SERVICE_RESOLVED: Boolean(pch.id),
          SERVICE_ID_VALID: payload.every((row) => row.service_id === pch.id),
          PAYLOAD_SCHEMA_VALID: validation.schemaValid ? "PASS" : "FAIL",
          ACCOUNT_GROUP_UNIQUENESS:
            uniqueGroups.size === payload.length && validation.duplicateCurrentGroupService === 0 ? "PASS" : "FAIL",
          RELATED_REPRESENTATIVES: validation.relatedRepresentatives,
          DUPLICATE_CURRENT_ROWS: validation.duplicateCurrentCompanyService + validation.duplicateCurrentGroupService,
          NULL_REQUIRED_FIELDS: validation.nullRequiredFields,
          PERSIST_PAYLOAD_READY: persistPayloadReady,
          SAFE_TO_CREATE_PERSIST_WRITER: persistPayloadReady,
        },
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
