/**
 * Canonical, configurable target-score calculator.
 * Production path: ScoringSettings → criteria/weights (passed in) → this engine → score → tier.
 * Do not add another scoring implementation.
 */
import type { ScoringCriterion, ScoringIssue, TargetScoreResult, TargetTier, TierThresholds } from "@/types/targeting";

export const DEFAULT_TIER_THRESHOLDS: TierThresholds = {
  tier1Min: 4,
  tier2Min: 3,
  tier3Min: 2,
};

const WEIGHT_TOTAL = 100;
const WEIGHT_TOLERANCE = 0.01;
const MIN_RATING = 1;
const MAX_RATING = 5;

export interface CriterionRatingInput {
  criterionId: string;
  rating: number;
}

function roundTo(value: number, decimals: number) {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

export function validateWeights(criteria: ScoringCriterion[]): ScoringIssue[] {
  const active = criteria.filter((criterion) => criterion.active);
  const weightTotal = active.reduce((sum, criterion) => sum + criterion.weight, 0);
  const issues: ScoringIssue[] = [];

  if (Math.abs(weightTotal - WEIGHT_TOTAL) > WEIGHT_TOLERANCE) {
    issues.push({
      code: "WEIGHTS_NOT_100",
      message: `Active scoring weights total ${weightTotal}%, but must equal ${WEIGHT_TOTAL}%.`,
    });
  }

  return issues;
}

export function classifyTier(
  scoreOutOf5: number,
  thresholds: TierThresholds = DEFAULT_TIER_THRESHOLDS,
): TargetTier {
  if (scoreOutOf5 >= thresholds.tier1Min) return "Tier 1";
  if (scoreOutOf5 >= thresholds.tier2Min) return "Tier 2";
  if (scoreOutOf5 >= thresholds.tier3Min) return "Tier 3";
  return "Low Priority";
}

/**
 * Weighted target score.
 *
 * scoreOutOf5 = Σ (rating × weight%) / 100
 * scoreOutOf100 = (scoreOutOf5 / 5) × 100
 *
 * Weights are passed in — never hard-coded here.
 * Missing ratings are reported and block a complete score; they are not treated as 0.
 */
export function calculateTargetScore(input: {
  criteria: ScoringCriterion[];
  ratings: CriterionRatingInput[];
  thresholds?: TierThresholds;
}): TargetScoreResult {
  const thresholds = input.thresholds ?? DEFAULT_TIER_THRESHOLDS;
  const activeCriteria = input.criteria.filter((criterion) => criterion.active);
  const weightTotal = activeCriteria.reduce((sum, criterion) => sum + criterion.weight, 0);
  const issues: ScoringIssue[] = [...validateWeights(input.criteria)];

  const ratingsByCriterion = new Map<string, number[]>();
  for (const rating of input.ratings) {
    const existing = ratingsByCriterion.get(rating.criterionId) ?? [];
    existing.push(rating.rating);
    ratingsByCriterion.set(rating.criterionId, existing);
  }

  const activeIds = new Set(activeCriteria.map((criterion) => criterion.id));
  for (const criterionId of ratingsByCriterion.keys()) {
    if (!activeIds.has(criterionId)) {
      issues.push({
        code: "INACTIVE_CRITERION_RATED",
        criterionId,
        message: `A rating was supplied for inactive or unknown criterion "${criterionId}".`,
      });
    }
  }

  const missingCriterionIds: string[] = [];

  for (const criterion of activeCriteria) {
    const values = ratingsByCriterion.get(criterion.id) ?? [];
    if (values.length === 0) {
      missingCriterionIds.push(criterion.id);
      issues.push({
        code: "MISSING_RATING",
        criterionId: criterion.id,
        message: `Missing rating for "${criterion.name}". Score is incomplete; missing ratings are not treated as zero.`,
      });
      continue;
    }
    if (values.length > 1) {
      issues.push({
        code: "DUPLICATE_RATING",
        criterionId: criterion.id,
        message: `Multiple ratings supplied for "${criterion.name}".`,
      });
    }
    const rating = values[0];
    if (!Number.isFinite(rating) || rating < MIN_RATING || rating > MAX_RATING || !Number.isInteger(rating)) {
      issues.push({
        code: "INVALID_RATING",
        criterionId: criterion.id,
        message: `Rating for "${criterion.name}" must be an integer from ${MIN_RATING} to ${MAX_RATING}. Received ${rating}.`,
      });
    }
  }

  const blocking = issues.some(
    (issue) =>
      issue.code === "WEIGHTS_NOT_100" ||
      issue.code === "INVALID_RATING" ||
      issue.code === "DUPLICATE_RATING",
  );

  if (blocking) {
    return {
      status: "invalid",
      scoreOutOf5: null,
      scoreOutOf100: null,
      tier: null,
      weightTotal,
      missingCriterionIds,
      issues,
    };
  }

  if (missingCriterionIds.length > 0) {
    return {
      status: "incomplete",
      scoreOutOf5: null,
      scoreOutOf100: null,
      tier: null,
      weightTotal,
      missingCriterionIds,
      issues,
    };
  }

  const weightedSum = activeCriteria.reduce((sum, criterion) => {
    const rating = ratingsByCriterion.get(criterion.id)?.[0] ?? 0;
    return sum + rating * (criterion.weight / WEIGHT_TOTAL);
  }, 0);

  const scoreOutOf5 = roundTo(weightedSum, 2);
  const scoreOutOf100 = roundTo((scoreOutOf5 / MAX_RATING) * 100, 0);

  return {
    status: "complete",
    scoreOutOf5,
    scoreOutOf100,
    tier: classifyTier(scoreOutOf5, thresholds),
    weightTotal,
    missingCriterionIds,
    issues,
  };
}

/**
 * Converts a 0–100 demo display score into a 1–5 domain rating.
 * Used only to migrate existing mock UI values — not a real assessment.
 */
export function demoDisplayScoreToRating(score0to100: number): 1 | 2 | 3 | 4 | 5 {
  const scaled = Math.round(score0to100 / 20);
  const clamped = Math.min(MAX_RATING, Math.max(MIN_RATING, scaled));
  return clamped as 1 | 2 | 3 | 4 | 5;
}
