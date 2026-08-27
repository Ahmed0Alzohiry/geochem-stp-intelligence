/**
 * LEGACY_DEMO_ONLY
 *
 * UI-only helper for the existing mock dashboard (0–100 display scores).
 * This is NOT the production scoring model and must be removed when the UI
 * is connected to ScoringSettings → scoring-engine.
 *
 * Canonical, configurable scoring lives in `src/lib/scoring-engine.ts`.
 * Do not add another scoring implementation.
 */
import { TIER_THRESHOLDS } from "@/lib/constants";
import type { ScoringCriteria, TargetTier } from "@/types";

const WEIGHTS: Record<keyof ScoringCriteria, number> = {
  marketPotential: 0.18,
  serviceFit: 0.16,
  recurringRevenue: 0.14,
  crossSelling: 0.1,
  accessibility: 0.1,
  competitiveIntensity: 0.08,
  marginPotential: 0.12,
  geographicFit: 0.12,
};

export function computeTargetScore(scoring: ScoringCriteria) {
  const weighted =
    scoring.marketPotential * WEIGHTS.marketPotential +
    scoring.serviceFit * WEIGHTS.serviceFit +
    scoring.recurringRevenue * WEIGHTS.recurringRevenue +
    scoring.crossSelling * WEIGHTS.crossSelling +
    scoring.accessibility * WEIGHTS.accessibility +
    scoring.competitiveIntensity * WEIGHTS.competitiveIntensity +
    scoring.marginPotential * WEIGHTS.marginPotential +
    scoring.geographicFit * WEIGHTS.geographicFit;

  return Math.round(weighted);
}

export function tierFromScore(score: number): TargetTier {
  if (score >= TIER_THRESHOLDS.tier1) return "Tier 1";
  if (score >= TIER_THRESHOLDS.tier2) return "Tier 2";
  if (score >= TIER_THRESHOLDS.tier3) return "Tier 3";
  return "Watch";
}
