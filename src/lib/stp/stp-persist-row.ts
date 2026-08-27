/**
 * STEP 6.7 in-memory mapping onto company_service_stp_scores.
 * Does not write to the database.
 */
import type { DimensionKey, EligibilityDecision, ServiceFirstScore } from "./types";
import type { ScoredAccount } from "./account-group";
import { SERVICE_FIRST_MODEL_VERSION } from "./types";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ELIGIBILITY = new Set<EligibilityDecision>(["ELIGIBLE", "OUT_OF_SCOPE", "INSUFFICIENT_TO_ELIGIBLE"]);
const TIERS = new Set(["Tier 1", "Tier 2", "Tier 3", "Watchlist"]);
const CONFIDENCE = new Set(["HIGH", "MEDIUM", "LOW"]);
const ENTITIES = new Set(["ACCOUNT", "FACILITY", "BRANCH", "RELATED", "REVIEW"]);

export type CompanyServiceStpScoreInsert = {
  company_id: string;
  service_id: string;
  account_group_key: string;
  entity_type: "ACCOUNT" | "FACILITY" | "BRANCH" | "RELATED" | "REVIEW" | null;
  is_account_group_representative: boolean;
  is_current: boolean;
  eligibility: EligibilityDecision;
  eligibility_reason: string | null;
  commercial_score: number | null;
  known_weight_total: number;
  ranking_eligible: boolean;
  tier: "Tier 1" | "Tier 2" | "Tier 3" | "Watchlist" | null;
  industry_fit: number | null;
  application_fit: number | null;
  service_need_fit: number | null;
  commercial_potential: number | null;
  customer_type_fit: number | null;
  geographic_fit: number | null;
  strategic_fit: number | null;
  data_confidence_score: number;
  data_confidence_band: "HIGH" | "MEDIUM" | "LOW";
  data_confidence_explanation: string | null;
  positioning_statement: string | null;
  targeting_reason: string | null;
  recommended_contact_roles: string[];
  recommended_departments: string[];
  dimension_snapshot: ServiceFirstScore["dimensions"];
  scoring_model_version: string;
  scored_at: string;
};

function dimRaw(score: ServiceFirstScore, key: DimensionKey): number | null {
  const row = score.dimensions.find((item) => item.key === key);
  if (!row || row.status !== "KNOWN" || row.rawScore == null) return null;
  return row.rawScore;
}

export function mapScoredAccountToStpRow(
  account: ScoredAccount,
  opts: { scoredAt: string; isRepresentative?: boolean },
): CompanyServiceStpScoreInsert {
  const { input, result, accountGroupKey } = account;
  return {
    company_id: input.companyId,
    service_id: result.serviceId,
    account_group_key: accountGroupKey,
    entity_type: input.entityType,
    is_account_group_representative: opts.isRepresentative ?? true,
    is_current: true,
    eligibility: result.eligibility,
    eligibility_reason: result.eligibilityReason,
    commercial_score: result.commercialScore,
    known_weight_total: result.knownWeightTotal,
    ranking_eligible: result.rankingEligible,
    tier: result.tier,
    industry_fit: dimRaw(result, "industryFit"),
    application_fit: dimRaw(result, "subsectorFit"),
    service_need_fit: dimRaw(result, "serviceNeedFit"),
    commercial_potential: dimRaw(result, "commercialPotential"),
    customer_type_fit: dimRaw(result, "customerTypeFit"),
    geographic_fit: dimRaw(result, "geographicFit"),
    strategic_fit: dimRaw(result, "strategicAccountFit"),
    data_confidence_score: result.dataConfidenceScore,
    data_confidence_band: result.dataConfidenceBand,
    data_confidence_explanation: result.dataConfidenceExplanation,
    positioning_statement: result.positioningStatement,
    targeting_reason: result.targetingReason,
    recommended_contact_roles: [...result.recommendedContactRoles],
    recommended_departments: [...result.recommendedDepartments],
    dimension_snapshot: result.dimensions,
    scoring_model_version: result.modelVersion || SERVICE_FIRST_MODEL_VERSION,
    scored_at: opts.scoredAt,
  };
}

export type PayloadIssue = { index: number; companyId: string; field: string; detail: string };

export function validateStpPayload(
  rows: CompanyServiceStpScoreInsert[],
  expectedServiceId: string,
): {
  schemaValid: boolean;
  nullRequiredFields: number;
  relatedRepresentatives: number;
  duplicateCurrentCompanyService: number;
  duplicateCurrentGroupService: number;
  issues: PayloadIssue[];
} {
  const issues: PayloadIssue[] = [];
  const companyService = new Map<string, number>();
  const groupService = new Map<string, number>();
  let nullRequiredFields = 0;

  rows.forEach((row, index) => {
    const fail = (field: string, detail: string) => {
      issues.push({ index, companyId: row.company_id, field, detail });
    };

    const required: Array<[string, unknown]> = [
      ["company_id", row.company_id],
      ["service_id", row.service_id],
      ["account_group_key", row.account_group_key],
      ["is_account_group_representative", row.is_account_group_representative],
      ["is_current", row.is_current],
      ["eligibility", row.eligibility],
      ["eligibility_reason", row.eligibility_reason],
      ["known_weight_total", row.known_weight_total],
      ["ranking_eligible", row.ranking_eligible],
      ["data_confidence_score", row.data_confidence_score],
      ["data_confidence_band", row.data_confidence_band],
      ["positioning_statement", row.positioning_statement],
      ["targeting_reason", row.targeting_reason],
      ["recommended_contact_roles", row.recommended_contact_roles],
      ["scoring_model_version", row.scoring_model_version],
      ["scored_at", row.scored_at],
    ];
    for (const [field, value] of required) {
      if (value == null || value === "") {
        nullRequiredFields += 1;
        fail(field, "required field is null or empty");
      }
    }

    if (!UUID_RE.test(row.company_id)) fail("company_id", "not a UUID");
    if (!UUID_RE.test(row.service_id)) fail("service_id", "not a UUID");
    if (row.service_id !== expectedServiceId) fail("service_id", "does not match expected service_id");
    if (!ELIGIBILITY.has(row.eligibility)) fail("eligibility", `invalid ${row.eligibility}`);
    if (row.tier != null && !TIERS.has(row.tier)) fail("tier", `invalid ${row.tier}`);
    if (!CONFIDENCE.has(row.data_confidence_band)) fail("data_confidence_band", `invalid ${row.data_confidence_band}`);
    if (row.entity_type != null && !ENTITIES.has(row.entity_type)) fail("entity_type", `invalid ${row.entity_type}`);
    if (typeof row.is_current !== "boolean") fail("is_current", "must be boolean");
    if (typeof row.is_account_group_representative !== "boolean") fail("is_account_group_representative", "must be boolean");
    if (typeof row.ranking_eligible !== "boolean") fail("ranking_eligible", "must be boolean");
    if (typeof row.known_weight_total !== "number" || Number.isNaN(row.known_weight_total)) fail("known_weight_total", "must be number");
    if (typeof row.data_confidence_score !== "number" || Number.isNaN(row.data_confidence_score)) fail("data_confidence_score", "must be number");
    if (row.commercial_score != null && (typeof row.commercial_score !== "number" || Number.isNaN(row.commercial_score))) {
      fail("commercial_score", "must be number or null");
    }
    if (!Array.isArray(row.recommended_contact_roles) || row.recommended_contact_roles.some((item) => typeof item !== "string")) {
      fail("recommended_contact_roles", "must be string[]");
    }
    if (Number.isNaN(Date.parse(row.scored_at))) fail("scored_at", "not an ISO timestamp");
    if (row.is_account_group_representative && (row.entity_type === "RELATED" || row.entity_type === "REVIEW")) {
      fail("entity_type", "RELATED/REVIEW cannot be a representative");
    }
    if (row.eligibility === "ELIGIBLE" && row.commercial_score == null) fail("commercial_score", "ELIGIBLE row missing commercial_score");
    if (row.eligibility === "ELIGIBLE" && row.tier == null) fail("tier", "ELIGIBLE row missing tier");

    if (row.is_current) {
      const companyKey = `${row.company_id}::${row.service_id}`;
      companyService.set(companyKey, (companyService.get(companyKey) ?? 0) + 1);
      if (row.is_account_group_representative) {
        const groupKey = `${row.account_group_key}::${row.service_id}`;
        groupService.set(groupKey, (groupService.get(groupKey) ?? 0) + 1);
      }
    }
  });

  for (const [key, count] of companyService) {
    if (count > 1) issues.push({ index: -1, companyId: key.split("::")[0], field: "company_id+service_id", detail: `duplicate current rows: ${count}` });
  }
  for (const [key, count] of groupService) {
    if (count > 1) issues.push({ index: -1, companyId: key.split("::")[0], field: "account_group_key+service_id", detail: `duplicate current representative rows: ${count}` });
  }

  return {
    schemaValid: issues.length === 0,
    nullRequiredFields,
    relatedRepresentatives: rows.filter(
      (row) => row.is_account_group_representative && (row.entity_type === "RELATED" || row.entity_type === "REVIEW"),
    ).length,
    duplicateCurrentCompanyService: [...companyService.values()].filter((count) => count > 1).length,
    duplicateCurrentGroupService: [...groupService.values()].filter((count) => count > 1).length,
    issues: issues.slice(0, 40),
  };
}
