/**
 * STEP 6.5 service-first score persistence readiness.
 * Schema design only. Do not persist scores from this module.
 */

export const SERVICE_STP_SCHEMA_VERSION = "6.5.0";
export const SERVICE_STP_TABLE = "company_service_stp_scores";
export const SERVICE_STP_CURRENT_VIEW = "company_service_stp_current";
export const PROPOSED_MIGRATION_FILE = "supabase/migrations/007_company_service_stp_scores.sql";

export const EXISTING_SCORE_TABLES = {
  companyScores: {
    table: "company_scores",
    grain: "company_id × criterion_id (1–5 ratings, historical rows allowed)",
    hasServiceId: false,
    canStorePerServiceStp: false,
  },
  companyTargetSnapshots: {
    table: "company_target_snapshots",
    grain: "company_id snapshot (latest view is DISTINCT ON company_id only)",
    hasServiceId: false,
    canStorePerServiceStp: false,
  },
  companyServices: {
    table: "company_services",
    grain: "UNIQUE (company_id, service_id) need/fit matrix — not STP scores",
    hasServiceId: true,
    canStorePerServiceStp: false,
  },
} as const;

export const REQUIRED_STP_OUTPUTS = [
  { field: "commercial_score", source: "ServiceFirstScore.commercialScore" },
  { field: "tier", source: "ServiceFirstScore.tier" },
  { field: "eligibility", source: "ServiceFirstScore.eligibility" },
  { field: "industry_fit", source: "dimensions.industryFit.rawScore" },
  { field: "application_fit", source: "dimensions.subsectorFit.rawScore" },
  { field: "service_need_fit", source: "dimensions.serviceNeedFit.rawScore" },
  { field: "commercial_potential", source: "dimensions.commercialPotential.rawScore" },
  { field: "geographic_fit", source: "dimensions.geographicFit.rawScore" },
  { field: "strategic_fit", source: "dimensions.strategicAccountFit.rawScore" },
  { field: "data_confidence_score / data_confidence_band", source: "dataConfidence* (separate from commercial_score)" },
  { field: "positioning_statement", source: "positioningStatement" },
  { field: "targeting_reason", source: "targetingReason (Why Target)" },
  { field: "recommended_contact_roles", source: "recommendedContactRoles" },
  { field: "account_group_key", source: "company_entity_resolution.account_group_key" },
  { field: "scoring_model_version", source: "SERVICE_FIRST_MODEL_VERSION" },
  { field: "scored_at", source: "write timestamp" },
] as const;

export type PersistGate = {
  id: string;
  requiredBeforeScoreWrites: boolean;
  status: "PASS" | "FAIL" | "PENDING";
  detail: string;
};

export function uniquenessModel(): string {
  return [
    "Partial unique index (company_id, service_id) WHERE is_current — one current score per company per service.",
    "Partial unique index (account_group_key, service_id) WHERE is_current AND is_account_group_representative — one current ranked representative per account group per service (STEP 6.4).",
    "CHECK: RELATED/REVIEW rows cannot be is_account_group_representative.",
    "Historical rows allowed with is_current = false.",
  ].join(" ");
}

export function persistGates(opts: {
  stpTableExists: boolean;
  companyScoresHasServiceId: boolean;
  snapshotHasServiceId: boolean;
  companyScoresRows: number;
  snapshotRows: number;
  stpScoreRows: number | null;
}): PersistGate[] {
  return [
    {
      id: "migration-007-applied",
      requiredBeforeScoreWrites: true,
      status: opts.stpTableExists ? "PASS" : "FAIL",
      detail: opts.stpTableExists
        ? `${SERVICE_STP_TABLE} is visible.`
        : `${SERVICE_STP_TABLE} is not in the live database. Apply ${PROPOSED_MIGRATION_FILE} manually; do not auto-execute.`,
    },
    {
      id: "do-not-reuse-v1-score-tables",
      requiredBeforeScoreWrites: true,
      status: !opts.companyScoresHasServiceId && !opts.snapshotHasServiceId ? "PASS" : "FAIL",
      detail:
        "company_scores / company_target_snapshots remain the v1 company-wide 1–5 model. Service-first STP must use company_service_stp_scores.",
    },
    {
      id: "no-score-writes-in-6-5",
      requiredBeforeScoreWrites: true,
      status: (opts.companyScoresRows === 0 && opts.snapshotRows === 0 && (opts.stpScoreRows ?? 0) === 0) ? "PASS" : "FAIL",
      detail: `Live rows: company_scores=${opts.companyScoresRows}, snapshots=${opts.snapshotRows}, stp=${opts.stpScoreRows ?? "n/a"}.`,
    },
    {
      id: "source-company-fields-untouched",
      requiredBeforeScoreWrites: true,
      status: "PASS",
      detail: "007 does not ALTER public.companies. Persist writers must not UPDATE company_name, legal_name, parent_company_name, city, or other source fields.",
    },
    {
      id: "account-group-representative-only",
      requiredBeforeScoreWrites: true,
      status: "PENDING",
      detail: "Writer must persist collapseByAccountGroup representatives only (RELATED/REVIEW excluded). Not implemented in STEP 6.5.",
    },
    {
      id: "explicit-write-flag",
      requiredBeforeScoreWrites: true,
      status: "FAIL",
      detail: "No persist writer exists yet. A later step must require an explicit --write flag and a selected service_id.",
    },
    {
      id: "insert-policy-not-granted",
      requiredBeforeScoreWrites: true,
      status: "PASS",
      detail: "007 grants SELECT only. Anon/authenticated INSERT stays blocked until a dedicated persist step adds write policy.",
    },
    {
      id: "data-confidence-separate",
      requiredBeforeScoreWrites: true,
      status: "PASS",
      detail: "Schema stores data_confidence_* columns separately from commercial_score.",
    },
    {
      id: "pch-persist-authorization",
      requiredBeforeScoreWrites: true,
      status: "FAIL",
      detail: "STEP 6.4 left SAFE TO PERSIST PCH SCORES = NO. Do not write PCH rows in 6.5 or immediately after applying 007.",
    },
  ];
}
