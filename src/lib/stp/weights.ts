import type { DimensionKey } from "./types";

/** Commercial weights only. Data confidence is scored separately and is not in this total. */
export const COMMERCIAL_WEIGHTS: Record<DimensionKey, number> = {
  industryFit: 22,
  subsectorFit: 20,
  serviceNeedFit: 18,
  commercialPotential: 12,
  customerTypeFit: 12,
  geographicFit: 8,
  strategicAccountFit: 8,
};

export const COMMERCIAL_WEIGHT_TOTAL = Object.values(COMMERCIAL_WEIGHTS).reduce((sum, weight) => sum + weight, 0);

export const TIER_THRESHOLDS = {
  tier1Min: 70,
  tier2Min: 55,
  tier3Min: 42,
} as const;

/** Minimum known commercial weight before a high tier is allowed. UNKNOWN is still excluded (not scored as 0). */
export const KNOWN_WEIGHT_FLOOR = {
  tier1: 70,
  tier2: 58,
  tier3: 42,
  ranking: 58,
} as const;

export const PCH_TIER2_MIN_APPLICATION_FIT = 70;

export const DATA_CONFIDENCE_BANDS = {
  highMin: 70,
  mediumMin: 40,
} as const;

if (COMMERCIAL_WEIGHT_TOTAL !== 100) {
  throw new Error(`STEP 6.1 commercial weights must total 100. Found ${COMMERCIAL_WEIGHT_TOTAL}.`);
}

export const DIMENSION_LABELS: Record<DimensionKey, string> = {
  industryFit: "Industry Fit",
  subsectorFit: "Subsector / Application Fit",
  serviceNeedFit: "Service Need / Use-Case Fit",
  commercialPotential: "Commercial Potential",
  customerTypeFit: "Customer Type Fit",
  geographicFit: "Geographic Fit",
  strategicAccountFit: "Strategic Account Fit",
};
