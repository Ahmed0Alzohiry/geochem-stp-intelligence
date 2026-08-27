/**
 * STEP 6.1 service-first STP types.
 * In-memory design only. Do not persist scores.
 */

export const SERVICE_FIRST_MODEL_VERSION = "6.4.0";

export type ServiceCode = "PET" | "PCH" | "MIN" | "ENV" | "OCM" | "MCT" | "INS" | "LAB";

export type DimensionKey =
  | "industryFit"
  | "subsectorFit"
  | "serviceNeedFit"
  | "commercialPotential"
  | "customerTypeFit"
  | "geographicFit"
  | "strategicAccountFit";

export type DimensionStatus = "KNOWN" | "UNKNOWN";

export type CommercialTier = "Tier 1" | "Tier 2" | "Tier 3" | "Watchlist";

export type DataConfidenceBand = "HIGH" | "MEDIUM" | "LOW";

export type EligibilityDecision = "ELIGIBLE" | "OUT_OF_SCOPE" | "INSUFFICIENT_TO_ELIGIBLE";

export type DimensionResult = {
  key: DimensionKey;
  label: string;
  weight: number;
  status: DimensionStatus;
  rawScore: number | null;
  explanation: string;
};

export type ServiceFirstInput = {
  serviceId: string;
  serviceCode: ServiceCode;
  serviceName: string;
  companyId: string;
  companyName: string;
  industry: string | null;
  subsector: string | null;
  customerType: string | null;
  entityType: "ACCOUNT" | "FACILITY" | "BRANCH" | "RELATED" | "REVIEW" | null;
  parentCompanyName: string | null;
  isExistingGeochemCustomer: string | null;
  accountStatus: string | null;
  verifiedCities: string[];
  importedCity: string | null;
  companyServicesNeed: "High" | "Medium" | "Low" | "Unknown" | null;
  companyServicesFitRating: number | null;
};

export type ServiceFirstScore = {
  modelVersion: string;
  serviceId: string;
  serviceCode: ServiceCode;
  companyId: string;
  eligibility: EligibilityDecision;
  eligibilityReason: string;
  dimensions: DimensionResult[];
  commercialScore: number | null;
  knownWeightTotal: number;
  dataConfidenceScore: number;
  dataConfidenceBand: DataConfidenceBand;
  dataConfidenceExplanation: string;
  tier: CommercialTier | null;
  tierGateFailed: string | null;
  targetingReason: string;
  positioningStatement: string;
  recommendedContactRoles: string[];
  recommendedDepartments: string[];
  rankingEligible: boolean;
};
