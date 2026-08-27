import type { CrmStage, ScoringWeight } from "@/types";

export const APP_NAME = "GEOCHEM STP Intelligence";
export const COMPANY_NAME = "GEOCHEM ARABIA LIMITED";

export const NAV_ITEMS = [
  { href: "/", label: "Dashboard", icon: "LayoutDashboard" },
  { href: "/companies", label: "Companies", icon: "Building2" },
  { href: "/segmentation", label: "Segmentation", icon: "Layers" },
  { href: "/targeting", label: "Targeting", icon: "Target" },
  { href: "/crm", label: "CRM", icon: "Kanban" },
  { href: "/settings", label: "Settings", icon: "Settings" },
] as const;

export const CRM_STAGES: CrmStage[] = [
  "Lead",
  "Qualified",
  "Contacted",
  "Meeting",
  "Proposal",
  "Negotiation",
  "Won",
  "Lost",
];

/**
 * LEGACY_DEMO_ONLY
 *
 * Frozen 0–100 display weights for the current frontend only.
 * Production scoring must use:
 *   ScoringSettings → ScoringCriteria → scoring-engine → Target Score → Tier → UI
 *
 * Canonical weights live in `src/data/reference-data.ts` (`scoringSettings`).
 * Remove this export when the UI is connected to the canonical scoring engine.
 * Do not add a second scoring formula.
 */
export const LEGACY_DEMO_ONLY_SCORING_WEIGHTS: ScoringWeight[] = [
  {
    key: "marketPotential",
    label: "Market Potential",
    weight: 18,
    description: "Size of addressable laboratory and geochemistry spend.",
  },
  {
    key: "serviceFit",
    label: "GEOCHEM Service Fit",
    weight: 16,
    description: "Alignment with current GEOCHEM Arabia capabilities.",
  },
  {
    key: "recurringRevenue",
    label: "Recurring Revenue Potential",
    weight: 14,
    description: "Likelihood of multi-year testing programs.",
  },
  {
    key: "crossSelling",
    label: "Cross-Selling Potential",
    weight: 10,
    description: "Ability to expand across adjacent GEOCHEM services.",
  },
  {
    key: "accessibility",
    label: "Accessibility",
    weight: 10,
    description: "Ease of reaching decision makers and labs.",
  },
  {
    key: "competitiveIntensity",
    label: "Competitive Intensity",
    weight: 8,
    description: "Inverted: lower competition scores higher.",
  },
  {
    key: "marginPotential",
    label: "Margin Potential",
    weight: 12,
    description: "Expected contribution margin on typical workscopes.",
  },
  {
    key: "geographicFit",
    label: "Geographic Fit",
    weight: 12,
    description: "Proximity to GEOCHEM operations and logistics.",
  },
];

/** @deprecated LEGACY_DEMO_ONLY — alias so today's UI keeps compiling. Remove with the legacy weights. */
export const SCORING_WEIGHTS = LEGACY_DEMO_ONLY_SCORING_WEIGHTS;

/**
 * LEGACY_DEMO_ONLY
 * 0–100 dashboard cut-offs. Canonical 0–5 thresholds are in ScoringSettings.
 * Remove when the UI uses `classifyTier()` from the scoring engine.
 */
export const LEGACY_DEMO_ONLY_TIER_THRESHOLDS = {
  tier1: 80,
  tier2: 65,
  tier3: 50,
} as const;

/** @deprecated LEGACY_DEMO_ONLY — alias for the current Settings / dashboard helper. */
export const TIER_THRESHOLDS = LEGACY_DEMO_ONLY_TIER_THRESHOLDS;
