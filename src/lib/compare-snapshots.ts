import type {
  CompanyTargetSnapshot,
  ScoringSettings,
  SnapshotComparison,
  TierThresholdSnapshot,
  WeightConfigurationSnapshot,
} from "@/types/targeting";

export function freezeWeightConfiguration(
  settings: ScoringSettings,
  capturedAt: string,
): WeightConfigurationSnapshot {
  return {
    scoringModelVersion: settings.scoringModelVersion,
    capturedAt,
    criteria: settings.criteria.map((criterion) => ({
      id: criterion.id,
      name: criterion.name,
      weight: criterion.weight,
      active: criterion.active,
    })),
  };
}

export function freezeTierThresholds(
  settings: ScoringSettings,
  capturedAt: string,
): TierThresholdSnapshot {
  return {
    tierThresholdVersion: settings.tierThresholdVersion,
    capturedAt,
    thresholds: { ...settings.tierThresholds },
  };
}

/**
 * Compares two historical targeting snapshots.
 * Does not recalculate scores — uses values frozen on each snapshot.
 */
export function compareTargetSnapshots(
  previous: CompanyTargetSnapshot,
  current: CompanyTargetSnapshot,
): SnapshotComparison {
  const previousByCriterion = new Map(
    previous.ratingSnapshot.map((item) => [item.criterionId, item]),
  );

  const criteriaImproved: SnapshotComparison["criteriaImproved"] = [];
  const criteriaDeclined: SnapshotComparison["criteriaDeclined"] = [];

  for (const currentRating of current.ratingSnapshot) {
    const previousRating = previousByCriterion.get(currentRating.criterionId);
    if (!previousRating) continue;

    if (currentRating.rating > previousRating.rating) {
      criteriaImproved.push({
        criterionId: currentRating.criterionId,
        criterionName: currentRating.criterionName,
        previousRating: previousRating.rating,
        currentRating: currentRating.rating,
        reason: currentRating.justification || current.changeReason || null,
      });
    } else if (currentRating.rating < previousRating.rating) {
      criteriaDeclined.push({
        criterionId: currentRating.criterionId,
        criterionName: currentRating.criterionName,
        previousRating: previousRating.rating,
        currentRating: currentRating.rating,
        reason: currentRating.justification || current.changeReason || null,
      });
    }
  }

  return {
    previousScoreOutOf5: previous.scoreOutOf5,
    currentScoreOutOf5: current.scoreOutOf5,
    scoreChange: Number((current.scoreOutOf5 - previous.scoreOutOf5).toFixed(2)),
    previousScoreOutOf100: previous.scoreOutOf100,
    currentScoreOutOf100: current.scoreOutOf100,
    previousTier: previous.tier,
    currentTier: current.tier,
    criteriaImproved,
    criteriaDeclined,
    reasonForChange: current.changeReason,
  };
}
