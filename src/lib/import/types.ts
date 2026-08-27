export const SOURCE_TYPES = [
  "Official website",
  "Regulator / government",
  "Annual report",
  "Trade directory",
  "News",
  "Internal GEOCHEM",
  "Analyst research",
  "Other",
] as const;

export const SOURCE_RELIABILITIES = ["High", "Medium", "Low", "Unknown"] as const;
export const SOURCE_TIERS = ["A", "B", "C", "D"] as const;
export const VERIFICATION_STATUSES = ["Unverified", "Partially Verified", "Verified"] as const;
export const COMPLETENESS_STATUSES = ["Draft", "Incomplete", "Complete"] as const;
export const LOCATION_TYPES = [
  "Headquarters",
  "Operating site",
  "Industrial city",
  "Project site",
  "Other",
] as const;
export const REGION_NAMES = ["Western Region", "Eastern Region", "Central Region"] as const;

export type SourceType = (typeof SOURCE_TYPES)[number];
export type SourceReliability = (typeof SOURCE_RELIABILITIES)[number];
export type SourceTier = (typeof SOURCE_TIERS)[number];
export type VerificationStatus = (typeof VERIFICATION_STATUSES)[number];
export type CompletenessStatus = (typeof COMPLETENESS_STATUSES)[number];
export type LocationType = (typeof LOCATION_TYPES)[number];
export type RegionName = (typeof REGION_NAMES)[number];

/** Step 5.6 dry-run classification (stored in reviewer_notes; mapped onto import_decision). */
export type DryRunClass =
  | "NEW"
  | "POSSIBLE_MATCH"
  | "DUPLICATE"
  | "FACILITY_OF_EXISTING"
  | "NEEDS_REVIEW"
  | "INVALID";

export type StagingImportDecision =
  | "NEW_COMPANY"
  | "UPDATE_EXISTING"
  | "MANUAL_REVIEW"
  | "FACILITY_OF_EXISTING"
  | "REJECT";

export type StagingDedupStatus =
  | "UNMATCHED"
  | "CR_MATCH"
  | "DOMAIN_MATCH"
  | "NAME_MATCH"
  | "ALIAS_MATCH"
  | "FACILITY_MATCH"
  | "AMBIGUOUS";

export type CsvImportRow = {
  batch_id: string;
  source_row: string;
  company_name: string;
  legal_name: string;
  name_ar: string;
  alias_name: string;
  website: string;
  website_domain: string;
  commercial_registration_number: string;
  industry: string;
  subsector: string;
  customer_type: string;
  region: string;
  city: string;
  industrial_city: string;
  parent_company_name: string;
  business_description: string;
  main_activities: string;
  location_type: string;
  location_city: string;
  source_url: string;
  source_type: string;
  source_reliability: string;
  source_tier: string;
  verification_status: string;
  last_verified_at: string;
  data_completeness_status: string;
  is_demo: string;
  researcher_notes: string;
};

export type ValidatedImportRow = {
  batchId: string;
  sourceRow: number;
  companyName: string;
  legalName: string | null;
  nameAr: string | null;
  aliasName: string | null;
  website: string | null;
  websiteDomain: string | null;
  commercialRegistrationNumber: string | null;
  industryName: string | null;
  subsector: string | null;
  customerTypeName: string | null;
  regionName: RegionName;
  city: string;
  industrialCity: string | null;
  parentCompanyName: string | null;
  businessDescription: string | null;
  mainActivities: string | null;
  locationType: LocationType | null;
  locationCity: string | null;
  sourceUrl: string;
  sourceType: SourceType;
  sourceReliability: SourceReliability;
  sourceTier: SourceTier;
  verificationStatus: VerificationStatus;
  lastVerifiedAt: string | null;
  dataCompletenessStatus: CompletenessStatus | null;
  isDemo: boolean;
  researcherNotes: string | null;
  normalizedName: string;
  normalizedLegalName: string | null;
  normalizedAlias: string | null;
  normalizedParentName: string | null;
};

export type RejectedImportRow = {
  sourceRow: number | null;
  errors: string[];
  raw: Record<string, string>;
};

export type LoadResult = {
  accepted: ValidatedImportRow[];
  rejected: RejectedImportRow[];
};

export type MatchUniverseCompany = {
  id: string;
  origin: "production" | "batch";
  batchId?: string;
  sourceRow?: number;
  companyName: string;
  legalName: string | null;
  normalizedName: string | null;
  websiteDomain: string | null;
  commercialRegistrationNumber: string | null;
  parentCompanyName: string | null;
  city: string | null;
};

export type MatchUniverseAlias = {
  companyId: string;
  normalizedAlias: string;
};

export type MatchUniverseLocation = {
  companyId: string;
  city: string;
  industrialCity: string | null;
  locationType: string;
};

export type MatchUniverse = {
  companies: MatchUniverseCompany[];
  aliases: MatchUniverseAlias[];
  locations: MatchUniverseLocation[];
};

export type DryRunMatch = {
  row: ValidatedImportRow;
  classification: DryRunClass;
  importDecision: StagingImportDecision;
  dedupStatus: StagingDedupStatus;
  matchedCompanyId: string | null;
  matchedBatchRow: number | null;
  reason: string;
};

export type StagingUpsertRow = {
  batch_id: string;
  source_row: number;
  raw_name: string;
  legal_name: string | null;
  name_ar: string | null;
  alias_name: string | null;
  normalized_name: string;
  website: string | null;
  website_domain: string | null;
  commercial_registration_number: string | null;
  industry_name: string | null;
  subsector: string | null;
  customer_type_name: string | null;
  region_name: string;
  city: string;
  industrial_city: string | null;
  parent_company_name: string | null;
  business_description: string | null;
  main_activities: string | null;
  location_type: string | null;
  location_city: string | null;
  source_url: string;
  source_type: string;
  source_reliability: string;
  source_tier: string;
  verification_status: string;
  last_verified_at: string | null;
  data_completeness_status: string | null;
  is_demo: boolean;
  researcher_notes: string | null;
  dedup_status: StagingDedupStatus;
  matched_company_id: string | null;
  import_decision: StagingImportDecision;
  reviewer_notes: string;
};
