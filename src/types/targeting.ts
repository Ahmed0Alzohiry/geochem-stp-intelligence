/**
 * Criterion ratings use a 1–5 scale.
 * For Competitive Intensity the direction is explicit:
 * 5 = Favorable / low competitive pressure
 * 1 = Unfavorable / very high competitive pressure
 */
export type CriterionRating = 1 | 2 | 3 | 4 | 5;

export type TargetTier = "Tier 1" | "Tier 2" | "Tier 3" | "Low Priority";

export type AssessmentStatus = "Draft" | "Incomplete" | "Complete" | "Superseded";

export type EvidenceQuality =
  | "Verified"
  | "Strong Evidence"
  | "Strategic Estimate"
  | "Unknown";

export type DataConfidence = "Verified" | "Probable" | "Estimated" | "Unknown";

export type AssessmentSource = "DEMO / MOCK ASSESSMENT" | "ANALYST ASSESSMENT";

export interface ScoringCriterion {
  id: string;
  name: string;
  description: string;
  /**
   * Percentage weight. Active criteria must sum to 100.
   * Configurable from Settings — never hard-coded in the scoring function.
   */
  weight: number;
  active: boolean;
  /**
   * Documents how a high rating should be interpreted.
   */
  highRatingMeans: string;
}

/**
 * Configurable cut-offs on the 0–5 target score scale.
 */
export interface TierThresholds {
  tier1Min: number;
  tier2Min: number;
  tier3Min: number;
}

/**
 * Canonical scoring configuration.
 * Production UI path: ScoringSettings → ScoringCriteria → scoring engine → score → tier → UI.
 */
export interface ScoringSettings {
  scoringModelVersion: string;
  tierThresholdVersion: string;
  criteria: ScoringCriterion[];
  tierThresholds: TierThresholds;
}

export interface WeightConfigurationSnapshot {
  scoringModelVersion: string;
  capturedAt: string;
  criteria: Array<{
    id: string;
    name: string;
    weight: number;
    active: boolean;
  }>;
}

export interface TierThresholdSnapshot {
  tierThresholdVersion: string;
  capturedAt: string;
  thresholds: TierThresholds;
}

export interface RatingSnapshotItem {
  criterionId: string;
  criterionName: string;
  rating: CriterionRating;
  justification: string;
  evidenceQuality: EvidenceQuality;
}

export interface CompanyScore {
  id: string;
  companyId: string;
  criterionId: string;
  rating: CriterionRating;
  justification: string;
  evidenceSource: string;
  evidenceUrl: string | null;
  evidenceDate: string | null;
  evidenceQuality: EvidenceQuality;
  assessedBy: string;
  assessedAt: string;
}

/**
 * Point-in-time targeting assessment.
 * Stores the weights, ratings, and thresholds used at calculation time
 * so later Settings changes do not rewrite history.
 */
export interface CompanyTargetSnapshot {
  id: string;
  companyId: string;
  scoreOutOf5: number;
  scoreOutOf100: number;
  tier: TargetTier;
  assessmentStatus: AssessmentStatus;
  assessmentDate: string;
  assessedBy: string;
  scoringModelVersion: string;
  tierThresholdVersion: string;
  weightConfigurationSnapshot: WeightConfigurationSnapshot;
  ratingSnapshot: RatingSnapshotItem[];
  tierThresholdSnapshot: TierThresholdSnapshot;
  changeReason: string;
  notes: string;
  createdAt: string;
  assessmentSource: AssessmentSource;
}

export interface CriterionRatingChange {
  criterionId: string;
  criterionName: string;
  previousRating: CriterionRating;
  currentRating: CriterionRating;
  reason: string | null;
}

export interface SnapshotComparison {
  previousScoreOutOf5: number;
  currentScoreOutOf5: number;
  scoreChange: number;
  previousScoreOutOf100: number;
  currentScoreOutOf100: number;
  previousTier: TargetTier;
  currentTier: TargetTier;
  criteriaImproved: CriterionRatingChange[];
  criteriaDeclined: CriterionRatingChange[];
  reasonForChange: string;
}

export interface ScoringIssue {
  code:
    | "WEIGHTS_NOT_100"
    | "INACTIVE_CRITERION_RATED"
    | "MISSING_RATING"
    | "INVALID_RATING"
    | "DUPLICATE_RATING";
  message: string;
  criterionId?: string;
}

export interface TargetScoreResult {
  status: "complete" | "incomplete" | "invalid";
  scoreOutOf5: number | null;
  scoreOutOf100: number | null;
  tier: TargetTier | null;
  weightTotal: number;
  missingCriterionIds: string[];
  issues: ScoringIssue[];
}
