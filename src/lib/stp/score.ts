import { decideEligibility, hasOcmApplicationEvidence, industryEligible, subsectorSuggestsApplication } from "./eligibility";
import { positioningFor, SERVICE_PLAYBOOK } from "./positioning";
import type {
  CommercialTier,
  DataConfidenceBand,
  DimensionKey,
  DimensionResult,
  ServiceCode,
  ServiceFirstInput,
  ServiceFirstScore,
} from "./types";
import { COMMERCIAL_WEIGHTS, DATA_CONFIDENCE_BANDS, DIMENSION_LABELS, KNOWN_WEIGHT_FLOOR, PCH_TIER2_MIN_APPLICATION_FIT, TIER_THRESHOLDS } from "./weights";
import { SERVICE_FIRST_MODEL_VERSION } from "./types";

function text(value: string | null | undefined): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

const WESTERN_VERIFIED = new Set(["Yanbu", "Jeddah", "Rabigh"]);
const OTHER_INDUSTRIAL = /jubail|dammam|khobar|ras tanura|ras al khair|dhahran|jazan|yanbu|jeddah|rabigh/i;

const INDUSTRY_STRENGTH: Record<ServiceCode, Record<string, number>> = {
  PET: { "Oil & Gas": 100, Refining: 90, Petrochemicals: 78, "Marine / Ports": 88 },
  PCH: { Petrochemicals: 100, Refining: 88, "Oil & Gas": 78, Chemicals: 72 },
  MIN: { "Mining & Minerals": 100 },
  ENV: {
    "Water & Wastewater": 100,
    "Oil & Gas": 82,
    Refining: 82,
    Petrochemicals: 82,
    Chemicals: 78,
    "Mining & Minerals": 76,
    "Power & Utilities": 74,
    "Industrial Manufacturing": 70,
  },
  OCM: {
    "Oil & Gas": 92,
    Refining: 100,
    Petrochemicals: 90,
    "Power & Utilities": 88,
    "Water & Wastewater": 82,
    "Mining & Minerals": 80,
    "Industrial Manufacturing": 78,
    Chemicals: 76,
  },
  MCT: {
    "Oil & Gas": 90,
    Refining: 92,
    Petrochemicals: 88,
    "Power & Utilities": 84,
    "Water & Wastewater": 80,
    "Mining & Minerals": 78,
  },
  INS: {
    "Oil & Gas": 90,
    Refining: 92,
    Petrochemicals: 90,
    "Mining & Minerals": 84,
    "Power & Utilities": 82,
    "Industrial Manufacturing": 80,
    "EPC / Projects": 72,
    "Marine / Ports": 70,
  },
  LAB: {
    Petrochemicals: 90,
    Chemicals: 90,
    Refining: 88,
    "Oil & Gas": 86,
    "Water & Wastewater": 84,
    "Mining & Minerals": 82,
    "Industrial Manufacturing": 80,
    "Power & Utilities": 78,
  },
};

const CUSTOMER_TYPE_SCORE: Record<string, number> = {
  "Asset Owner": 100,
  Operator: 92,
  Manufacturer: 86,
  "Government Entity": 78,
  "O&M Contractor": 64,
  "EPC Contractor": 58,
  "Technical Partner": 50,
  Trader: 24,
};

function dim(
  key: DimensionKey,
  status: DimensionResult["status"],
  rawScore: number | null,
  explanation: string,
): DimensionResult {
  return {
    key,
    label: DIMENSION_LABELS[key],
    weight: COMMERCIAL_WEIGHTS[key],
    status,
    rawScore,
    explanation,
  };
}

function scoreIndustry(input: ServiceFirstInput): DimensionResult {
  const industry = text(input.industry);
  if (!industry) return dim("industryFit", "UNKNOWN", null, "Industry is missing; not treated as poor fit.");
  const table = INDUSTRY_STRENGTH[input.serviceCode];
  const raw = table[industry];
  if (raw == null) {
    return dim("industryFit", "UNKNOWN", null, `${industry} has no mapped strength for ${input.serviceCode}.`);
  }
  return dim("industryFit", "KNOWN", raw, `${industry} maps to ${raw}/100 industry fit for ${input.serviceCode}.`);
}

function scoreSubsector(input: ServiceFirstInput): DimensionResult {
  const subsector = text(input.subsector);
  if (input.serviceCode === "OCM") {
    if (hasOcmApplicationEvidence(input.companyName, subsector)) {
      return dim(
        "subsectorFit",
        "KNOWN",
        96,
        "Name/subsector indicates rotating equipment, lubrication, or plant-intensity OCM demand.",
      );
    }
    if (!subsector) return dim("subsectorFit", "UNKNOWN", null, "Subsector is missing; not inferred from industry.");
    return dim(
      "subsectorFit",
      "KNOWN",
      48,
      `Subsector "${subsector}" is in an OCM industry but is not a direct rotating-equipment / lube-oil application.`,
    );
  }
  if (!subsector) return dim("subsectorFit", "UNKNOWN", null, "Subsector is missing; not inferred from industry.");
  if (subsectorSuggestsApplication(input.serviceCode, subsector)) {
    return dim("subsectorFit", "KNOWN", 96, `Subsector "${subsector}" indicates a direct application for ${input.serviceCode}.`);
  }
  if (industryEligible(input.serviceCode, input.industry)) {
    return dim(
      "subsectorFit",
      "KNOWN",
      48,
      `Subsector "${subsector}" is in an eligible industry but is not a direct ${input.serviceCode} application phrase.`,
    );
  }
  return dim("subsectorFit", "UNKNOWN", null, `Subsector "${subsector}" cannot be scored for this service.`);
}

function scoreServiceNeed(input: ServiceFirstInput): DimensionResult {
  if (input.companyServicesNeed === "High" || (input.companyServicesFitRating != null && input.companyServicesFitRating >= 4)) {
    return dim("serviceNeedFit", "KNOWN", 100, "company_services records High need or fit rating ≥ 4 for this service.");
  }
  if (input.companyServicesNeed === "Medium" || input.companyServicesFitRating === 3) {
    return dim("serviceNeedFit", "KNOWN", 70, "company_services records Medium need for this service.");
  }
  if (input.companyServicesNeed === "Low" || input.companyServicesFitRating === 1 || input.companyServicesFitRating === 2) {
    return dim("serviceNeedFit", "KNOWN", 28, "company_services records Low need / weak fit for this service.");
  }
  return dim(
    "serviceNeedFit",
    "UNKNOWN",
    null,
    "No company_services row and no use-case text; subsector is not reused here (avoids double-count).",
  );
}

function scoreCommercial(input: ServiceFirstInput): DimensionResult {
  const existing = text(input.isExistingGeochemCustomer);
  const status = text(input.accountStatus);
  if (existing === "Yes" || status === "Current Customer") {
    const raw = existing === "Yes" ? 92 : 80;
    return dim(
      "commercialPotential",
      "KNOWN",
      raw,
      `Uses relationship evidence only (${existing === "Yes" ? "existing GEOCHEM customer" : status}). Customer type is scored separately. company_size is not invented.`,
    );
  }
  if (status === "Former Customer") {
    return dim("commercialPotential", "KNOWN", 48, "Former customer relationship only; spend/size not invented.");
  }
  return dim(
    "commercialPotential",
    "UNKNOWN",
    null,
    "No relationship or size/spend evidence. Prospect is not treated as low potential.",
  );
}

function scoreCustomerType(input: ServiceFirstInput): DimensionResult {
  const type = text(input.customerType);
  if (!type) return dim("customerTypeFit", "UNKNOWN", null, "Customer type is missing.");
  const raw = CUSTOMER_TYPE_SCORE[type];
  if (raw == null) return dim("customerTypeFit", "UNKNOWN", null, `Unmapped customer type "${type}".`);
  const fit = Math.round(raw * 0.9);
  return dim("customerTypeFit", "KNOWN", fit, `${type} is a B2B/B2G class scored for buying laboratory/inspection services.`);
}

function scoreGeography(input: ServiceFirstInput): DimensionResult {
  const verified = input.verifiedCities.filter((city) => text(city));
  if (verified.length === 0) {
    return dim(
      "geographicFit",
      "UNKNOWN",
      null,
      "No verified company_locations row. Imported companies.city is not used. Missing location is UNKNOWN, not zero.",
    );
  }
  if (verified.some((city) => WESTERN_VERIFIED.has(city))) {
    return dim(
      "geographicFit",
      "KNOWN",
      100,
      `Verified operating site in ${verified.join(", ")} (Yanbu / Jeddah / Rabigh cluster).`,
    );
  }
  if (verified.some((city) => OTHER_INDUSTRIAL.test(city))) {
    return dim("geographicFit", "KNOWN", 72, `Verified site in ${verified.join(", ")} (industrial KSA, not Western cluster).`);
  }
  return dim("geographicFit", "KNOWN", 50, `Verified site in ${verified.join(", ")}.`);
}

function scoreStrategic(input: ServiceFirstInput): DimensionResult {
  const entity = input.entityType;
  if (!entity) return dim("strategicAccountFit", "UNKNOWN", null, "Entity resolution type is missing.");
  if (entity === "FACILITY") {
    const parent = text(input.parentCompanyName);
    return dim(
      "strategicAccountFit",
      "KNOWN",
      parent ? 90 : 78,
      parent
        ? `FACILITY record under ${parent}; score the site for operations demand, not parent HQ location.`
        : "FACILITY record without parent name; treated as an operating site.",
    );
  }
  if (entity === "ACCOUNT") {
    return dim("strategicAccountFit", "KNOWN", 70, "ACCOUNT record; group-level targeting, not a copied facility city.");
  }
  if (entity === "BRANCH") {
    return dim("strategicAccountFit", "KNOWN", 55, "BRANCH record; lower than operating facility.");
  }
  if (entity === "RELATED") {
    return dim("strategicAccountFit", "KNOWN", 40, "RELATED record; do not treat as the buying account.");
  }
  return dim("strategicAccountFit", "UNKNOWN", null, "REVIEW records are not auto-scored.");
}

function commercialFromDimensions(dimensions: DimensionResult[]): { score: number | null; knownWeightTotal: number } {
  const known = dimensions.filter((row) => row.status === "KNOWN" && row.rawScore != null);
  const knownWeightTotal = known.reduce((sum, row) => sum + row.weight, 0);
  if (knownWeightTotal <= 0) return { score: null, knownWeightTotal: 0 };
  const weighted = known.reduce((sum, row) => sum + (row.rawScore as number) * row.weight, 0);
  return { score: Math.round((weighted / knownWeightTotal) * 10) / 10, knownWeightTotal };
}

function dataConfidence(input: ServiceFirstInput, dimensions: DimensionResult[]): {
  score: number;
  band: DataConfidenceBand;
  explanation: string;
} {
  const checks = [
    Boolean(text(input.industry)),
    Boolean(text(input.subsector)),
    Boolean(text(input.customerType)),
    Boolean(input.entityType),
    input.verifiedCities.length > 0,
    input.companyServicesNeed != null || input.companyServicesFitRating != null,
  ];
  const score = Math.round((checks.filter(Boolean).length / checks.length) * 100);
  const band: DataConfidenceBand =
    score >= DATA_CONFIDENCE_BANDS.highMin ? "HIGH" : score >= DATA_CONFIDENCE_BANDS.mediumMin ? "MEDIUM" : "LOW";
  const unknownDims = dimensions.filter((row) => row.status === "UNKNOWN").map((row) => row.label);
  return {
    score,
    band,
    explanation: `Evidence completeness ${score}/100 (${band}). Unknown commercial dimensions: ${unknownDims.join(", ") || "none"}. Completeness is not added into the commercial score.`,
  };
}

function applyKnownWeightFloor(
  tier: CommercialTier,
  knownWeightTotal: number,
): { tier: CommercialTier; reason: string | null } {
  if (knownWeightTotal < KNOWN_WEIGHT_FLOOR.tier3) {
    return {
      tier: "Watchlist",
      reason: `Known-weight floor: ${knownWeightTotal}% < ${KNOWN_WEIGHT_FLOOR.tier3}% (Tier 3 minimum). UNKNOWN dimensions were not scored as zero.`,
    };
  }
  if ((tier === "Tier 1" || tier === "Tier 2") && knownWeightTotal < KNOWN_WEIGHT_FLOOR.tier2) {
    return {
      tier: "Tier 3",
      reason: `Known-weight floor: ${knownWeightTotal}% < ${KNOWN_WEIGHT_FLOOR.tier2}% (Tier 2 minimum). Commercial score was not reduced for UNKNOWN factors.`,
    };
  }
  if (tier === "Tier 1" && knownWeightTotal < KNOWN_WEIGHT_FLOOR.tier1) {
    return {
      tier: "Tier 2",
      reason: `Known-weight floor: ${knownWeightTotal}% < ${KNOWN_WEIGHT_FLOOR.tier1}% (Tier 1 minimum).`,
    };
  }
  return { tier, reason: null };
}

function applicationFitValue(dimensions: DimensionResult[]): number | null {
  const row = dimensions.find((item) => item.key === "subsectorFit");
  if (!row || row.status !== "KNOWN" || row.rawScore == null) return null;
  return row.rawScore;
}

function applyPchApplicationFloor(
  serviceCode: ServiceFirstInput["serviceCode"],
  tier: CommercialTier,
  dimensions: DimensionResult[],
): { tier: CommercialTier; reason: string | null } {
  if (serviceCode !== "PCH") return { tier, reason: null };
  if (tier !== "Tier 1" && tier !== "Tier 2") return { tier, reason: null };
  const applicationFit = applicationFitValue(dimensions);
  if (applicationFit != null && applicationFit >= PCH_TIER2_MIN_APPLICATION_FIT) return { tier, reason: null };
  return {
    tier: "Tier 3",
    reason: `PCH Tier 2 requires Application Fit ≥ ${PCH_TIER2_MIN_APPLICATION_FIT} (found ${applicationFit ?? "UNKNOWN"}).`,
  };
}

function classifyTier(commercial: number): CommercialTier {
  if (commercial >= TIER_THRESHOLDS.tier1Min) return "Tier 1";
  if (commercial >= TIER_THRESHOLDS.tier2Min) return "Tier 2";
  if (commercial >= TIER_THRESHOLDS.tier3Min) return "Tier 3";
  return "Watchlist";
}

function tier1EvidenceGate(input: ServiceFirstInput, dimensions: DimensionResult[], confidenceBand: DataConfidenceBand): string | null {
  const industry = dimensions.find((row) => row.key === "industryFit");
  const subsector = dimensions.find((row) => row.key === "subsectorFit");
  const customer = dimensions.find((row) => row.key === "customerTypeFit");
  if (industry?.status !== "KNOWN") return "Tier 1 requires known industry.";
  if (subsector?.status !== "KNOWN") return "Tier 1 requires known subsector.";
  if (customer?.status !== "KNOWN") return "Tier 1 requires known customer type.";
  if (confidenceBand === "LOW") return "Tier 1 requires data confidence above LOW.";
  const needKnown = dimensions.find((row) => row.key === "serviceNeedFit")?.status === "KNOWN";
  const geoKnown = dimensions.find((row) => row.key === "geographicFit")?.status === "KNOWN";
  const applicationStrong = (dimensions.find((row) => row.key === "subsectorFit")?.rawScore ?? 0) >= 90;
  const existing = text(input.isExistingGeochemCustomer) === "Yes";
  if (!needKnown && !geoKnown && !existing && !applicationStrong) {
    return "Tier 1 requires at least one of: company_services need, verified location, strong application subsector, or existing GEOCHEM customer.";
  }
  return null;
}

export function scoreServiceAccount(input: ServiceFirstInput): ServiceFirstScore {
  const eligibility = decideEligibility(input);
  const playbook = SERVICE_PLAYBOOK[input.serviceCode];
  const dimensions = [
    scoreIndustry(input),
    scoreSubsector(input),
    scoreServiceNeed(input),
    scoreCommercial(input),
    scoreCustomerType(input),
    scoreGeography(input),
    scoreStrategic(input),
  ];
  const { score: commercialScore, knownWeightTotal } = commercialFromDimensions(dimensions);
  const confidence = dataConfidence(input, dimensions);

  let tier: CommercialTier | null = null;
  let tierGateFailed: string | null = null;
  let rankingEligible = false;
  if (eligibility.decision !== "ELIGIBLE" || commercialScore == null) {
    tier = null;
  } else {
    let rawTier = classifyTier(commercialScore);
    if (rawTier === "Tier 1") {
      const evidenceGate = tier1EvidenceGate(input, dimensions, confidence.band);
      if (evidenceGate) {
        tierGateFailed = evidenceGate;
        rawTier = "Tier 2";
      }
    }
    const floored = applyKnownWeightFloor(rawTier, knownWeightTotal);
    if (floored.reason) {
      tierGateFailed = [tierGateFailed, floored.reason].filter(Boolean).join(" ");
    }
    const pchFloored = applyPchApplicationFloor(input.serviceCode, floored.tier, dimensions);
    if (pchFloored.reason) {
      tierGateFailed = [tierGateFailed, pchFloored.reason].filter(Boolean).join(" ");
    }
    tier = pchFloored.tier;
    rankingEligible = knownWeightTotal >= KNOWN_WEIGHT_FLOOR.ranking;
  }

  const targetingReason =
    eligibility.decision !== "ELIGIBLE"
      ? eligibility.reason
      : dimensions
          .map((row) =>
            row.status === "UNKNOWN" ? `${row.label}: UNKNOWN` : `${row.label}: ${row.rawScore}/100`,
          )
          .concat([
            `Commercial (renormalized on ${knownWeightTotal}% known weights): ${commercialScore}`,
            `Known weight: ${knownWeightTotal}% (ranking floor ${KNOWN_WEIGHT_FLOOR.ranking}%)`,
            `Data confidence (separate): ${confidence.band} ${confidence.score}`,
            `Tier: ${tier ?? "none"}${tierGateFailed ? ` (${tierGateFailed})` : ""}`,
          ])
          .join(" · ");

  return {
    modelVersion: SERVICE_FIRST_MODEL_VERSION,
    serviceId: input.serviceId,
    serviceCode: input.serviceCode,
    companyId: input.companyId,
    eligibility: eligibility.decision,
    eligibilityReason: eligibility.reason,
    dimensions,
    commercialScore,
    knownWeightTotal,
    dataConfidenceScore: confidence.score,
    dataConfidenceBand: confidence.band,
    dataConfidenceExplanation: confidence.explanation,
    tier,
    tierGateFailed,
    targetingReason,
    positioningStatement: positioningFor(input.serviceCode, input.companyName),
    recommendedContactRoles: playbook.contactRoles,
    recommendedDepartments: playbook.departments,
    rankingEligible,
  };
}
