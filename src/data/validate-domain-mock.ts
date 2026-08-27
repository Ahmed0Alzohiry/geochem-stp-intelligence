import { calculateTargetScore } from "@/lib/scoring-engine";
import { compareTargetSnapshots } from "@/lib/compare-snapshots";
import { scoringCriteria } from "@/data/reference-data";
import {
  domainActivities,
  domainCompanies,
  domainCompanyScores,
  domainCompanyServices,
  domainContacts,
  domainOpportunities,
  domainTargetSnapshots,
} from "@/data/map-ui-mock-to-domain";

const missing = calculateTargetScore({
  criteria: scoringCriteria,
  ratings: [],
});

if (missing.status !== "incomplete" || missing.missingCriterionIds.length !== scoringCriteria.length) {
  throw new Error("Missing ratings must yield an incomplete score, not zero.");
}

const badWeights = calculateTargetScore({
  criteria: scoringCriteria.map((criterion) => ({ ...criterion, weight: 10 })),
  ratings: scoringCriteria.map((criterion) => ({ criterionId: criterion.id, rating: 4 })),
});

if (badWeights.status !== "invalid") {
  throw new Error("Weights that do not total 100% must be invalid.");
}

const complete = calculateTargetScore({
  criteria: scoringCriteria,
  ratings: scoringCriteria.map((criterion) => ({ criterionId: criterion.id, rating: 5 })),
});

if (complete.scoreOutOf5 !== 5 || complete.scoreOutOf100 !== 100 || complete.tier !== "Tier 1") {
  throw new Error(`Unexpected perfect score: ${JSON.stringify(complete)}`);
}

const sample = domainTargetSnapshots[0];
if (!sample?.id || !sample.weightConfigurationSnapshot || !sample.ratingSnapshot.length || !sample.tierThresholdSnapshot) {
  throw new Error("Target snapshots are not audit-ready.");
}

const declined = {
  ...sample,
  id: `${sample.id}-prev`,
  scoreOutOf5: Number((sample.scoreOutOf5 - 0.4).toFixed(2)),
  scoreOutOf100: Math.max(0, sample.scoreOutOf100 - 8),
  ratingSnapshot: sample.ratingSnapshot.map((item) =>
    item.criterionName === "Accessibility"
      ? { ...item, rating: 2 as const, justification: "Limited site access (demo previous)." }
      : item,
  ),
};

const currentWithReason = {
  ...sample,
  changeReason: "Vendor registration completed.",
  ratingSnapshot: sample.ratingSnapshot.map((item) =>
    item.criterionName === "Accessibility"
      ? { ...item, rating: 4 as const, justification: "Vendor registration completed." }
      : item,
  ),
};

const comparison = compareTargetSnapshots(declined, currentWithReason);
if (comparison.criteriaImproved.length === 0 || comparison.reasonForChange !== "Vendor registration completed.") {
  throw new Error(`Snapshot comparison failed: ${JSON.stringify(comparison)}`);
}

console.log(
  JSON.stringify(
    {
      companies: domainCompanies.length,
      companyServices: domainCompanyServices.length,
      contacts: domainContacts.length,
      scores: domainCompanyScores.length,
      snapshots: domainTargetSnapshots.length,
      opportunities: domainOpportunities.length,
      activities: domainActivities.length,
      sampleSnapshotId: domainTargetSnapshots[0]?.id,
      snapshotHasFrozenWeights: Boolean(domainTargetSnapshots[0]?.weightConfigurationSnapshot),
      comparisonExample: {
        previousScore: comparison.previousScoreOutOf5,
        currentScore: comparison.currentScoreOutOf5,
        scoreChange: comparison.scoreChange,
        improved: comparison.criteriaImproved.map((item) => `${item.criterionName}: ${item.previousRating} → ${item.currentRating}`),
        reasonForChange: comparison.reasonForChange,
      },
      missingRatingsStatus: missing.status,
    },
    null,
    2,
  ),
);
