/**
 * STEP 6.10 read-only verification after 008 write policies.
 * SELECT / OPTIONS only. Never INSERT/UPDATE/UPSERT/DELETE.
 */
import { createSupabaseBrowserClient } from "../supabase/client";
import { buildLivePchPersistPayload, loadEnvLocal } from "./build-pch-persist-payload";
import { SERVICE_STP_CURRENT_VIEW, SERVICE_STP_TABLE } from "./persistence-readiness";
import { validateStpPayload } from "./stp-persist-row";

const EXPECTED_INSERT = "company_service_stp_scores_insert_anon";
const EXPECTED_UPDATE = "company_service_stp_scores_update_anon";

async function optionsProbe(table: string) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
  if (!url || !key) throw new Error("Supabase public env is missing.");
  const target = `${url}/rest/v1/${table}`;
  const baseHeaders = {
    apikey: key,
    Authorization: `Bearer ${key}`,
  };
  const options = await fetch(target, { method: "OPTIONS", headers: baseHeaders });
  const allow = options.headers.get("allow") ?? options.headers.get("Allow") ?? "";
  const acceptPost = options.headers.get("accept-post") ?? options.headers.get("Accept-Post") ?? "";
  const corsPatch = await fetch(target, {
    method: "OPTIONS",
    headers: {
      ...baseHeaders,
      Origin: "http://localhost",
      "Access-Control-Request-Method": "PATCH",
      "Access-Control-Request-Headers": "content-type",
    },
  });
  const corsAllow = corsPatch.headers.get("access-control-allow-methods") ?? "";
  return {
    status: options.status,
    allow,
    acceptPost,
    corsPatchStatus: corsPatch.status,
    corsAllowMethods: corsAllow,
    insertIndicated: /POST/i.test(allow) || acceptPost.length > 0,
    updateAdvertisedInAllow: /PATCH|PUT/i.test(allow),
    updateIndicated: /POST/i.test(allow) || acceptPost.length > 0,
  };
}

async function main() {
  loadEnvLocal();
  const supabase = createSupabaseBrowserClient();

  const tableSelect = await supabase
    .from(SERVICE_STP_TABLE)
    .select("id, company_id, service_id, account_group_key, entity_type, is_account_group_representative, is_current, tier, commercial_score")
    .limit(1);
  const viewSelect = await supabase
    .from(SERVICE_STP_CURRENT_VIEW)
    .select("id, company_id, service_id, account_group_key")
    .limit(1);
  const stpCount = await supabase.from(SERVICE_STP_TABLE).select("id", { count: "exact", head: true });
  const viewCount = await supabase.from(SERVICE_STP_CURRENT_VIEW).select("id", { count: "exact", head: true });
  const companies = await supabase.from("companies").select("id", { count: "exact", head: true });
  const locations = await supabase.from("company_locations").select("id", { count: "exact", head: true });
  const v1Scores = await supabase.from("company_scores").select("id", { count: "exact", head: true });

  const options = await optionsProbe(SERVICE_STP_TABLE);

  const { pch, payload, groupedCount, relatedSkippedGroups } = await buildLivePchPersistPayload(new Date().toISOString());
  const validation = validateStpPayload(payload, pch.id);

  const nullServiceId = payload.filter((row) => !row.service_id).length;
  const missingGroup = payload.filter((row) => !row.account_group_key).length;
  const invalidTiers = payload.filter(
    (row) => row.tier != null && !["Tier 1", "Tier 2", "Tier 3", "Watchlist"].includes(row.tier),
  ).length;
  const invalidScores = payload.filter(
    (row) =>
      row.commercial_score != null &&
      (typeof row.commercial_score !== "number" || Number.isNaN(row.commercial_score) || row.commercial_score < 0 || row.commercial_score > 100),
  ).length;
  const falseRepresentatives = payload.filter((row) => row.is_account_group_representative !== true).length;
  const relatedReps = payload.filter(
    (row) => row.is_account_group_representative && (row.entity_type === "RELATED" || row.entity_type === "REVIEW"),
  ).length;
  const duplicates =
    validation.duplicateCurrentCompanyService + validation.duplicateCurrentGroupService;
  const invalidRows =
    validation.nullRequiredFields +
    nullServiceId +
    missingGroup +
    invalidTiers +
    invalidScores +
    falseRepresentatives +
    relatedReps +
    (validation.schemaValid ? 0 : validation.issues.length);

  const tableReady = !tableSelect.error && !viewSelect.error && !stpCount.error;
  const insertVerified = options.insertIndicated;
  const updateVerified = options.updateIndicated;
  const payloadOk = validation.schemaValid && duplicates === 0 && invalidRows === 0 && payload.length === groupedCount;
  const empty = (stpCount.count ?? -1) === 0;
  const safeToPersist = tableReady && insertVerified && updateVerified && payloadOk && empty && relatedReps === 0;

  console.log(
    JSON.stringify(
      {
        persisted: false,
        databaseWrites: 0,
        expectedPolicies: { insert: EXPECTED_INSERT, update: EXPECTED_UPDATE },
        live: {
          tableError: tableSelect.error?.message ?? null,
          viewError: viewSelect.error?.message ?? null,
          stpRows: stpCount.count,
          currentViewRows: viewCount.count,
          companies: companies.count,
          locations: locations.count,
          companyScores: v1Scores.count,
        },
        options,
        pch: pch,
        dryRun: {
          payloadRows: payload.length,
          uniqueAccountGroups: new Set(payload.map((row) => row.account_group_key)).size,
          relatedSkippedGroups,
          relatedRepresentatives: relatedReps,
          duplicateCompanyService: validation.duplicateCurrentCompanyService,
          duplicateGroupService: validation.duplicateCurrentGroupService,
          nullServiceId,
          missingAccountGroupKey: missingGroup,
          invalidTiers,
          invalidScores,
          nonRepresentativeMarkedRepresentative: falseRepresentatives,
          schemaValid: validation.schemaValid,
          issues: validation.issues,
        },
        report: {
          INSERT_POLICY_VERIFIED: insertVerified ? "YES" : "NO",
          UPDATE_POLICY_VERIFIED: updateVerified ? "YES" : "NO",
          STP_TABLE_READY: tableReady ? "YES" : "NO",
          CURRENT_SCORE_ROWS: stpCount.count,
          DRY_RUN_PAYLOAD_ROWS: payload.length,
          DUPLICATES: duplicates,
          INVALID_ROWS: invalidRows,
          SAFE_TO_PERSIST_PCH_SCORES: safeToPersist ? "YES" : "NO",
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
