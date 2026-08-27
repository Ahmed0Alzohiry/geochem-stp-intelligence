import operatorSources from "./operator-sources.json";
import facilitySourceOverrides from "./facility-source-overrides.json";

export type WesternCity = "Yanbu" | "Jeddah" | "Rabigh";
export type LocationConfidence = "HIGH" | "MEDIUM" | "LOW";
export type EntityType = "ACCOUNT" | "FACILITY" | "BRANCH" | "RELATED" | "REVIEW";

export type NamedFacilityScan = {
  company_id: string;
  company_name: string;
  entity_type: string;
  detected_city: WesternCity;
  proposed_region: "Western Region";
  stored_city: string | null;
  stored_industrial_city: string | null;
  parent_company_name: string | null;
  website: string | null;
  website_domain: string | null;
  account_group_key: string;
  group_size: number;
};

export type VerifiedLocationCandidate = NamedFacilityScan & {
  confidence: LocationConfidence;
  evidence_type: string;
  source_url: string;
  source_name: string;
  evidence: string;
  country: "Saudi Arabia";
  location_type: "Operating site";
};

export type RejectedNamedFacility = NamedFacilityScan & {
  reject_reason: string;
};

type OperatorEntry = {
  source_url: string;
  source_name: string;
  evidence_type: string;
};

type FacilityOverride = OperatorEntry & {
  confidence: LocationConfidence;
  evidence?: string;
  corroborating_url?: string;
};

const HIGH_OPERATORS = operatorSources.high as Record<string, OperatorEntry>;
const MEDIUM_OPERATORS = operatorSources.medium as Record<string, OperatorEntry>;
const FACILITY_OVERRIDES = facilitySourceOverrides as Record<string, FacilityOverride>;

export function detectWesternCity(name: string): WesternCity | null {
  const n = name.toLowerCase().replace(/[’']/g, "");
  if (/\byanbu\b|\byanbo\b|yanbu al.?bahr|yanbu industrial/.test(n)) return "Yanbu";
  if (/\bjiddah\b|\bjeddah\b|\bjedda\b/.test(n)) return "Jeddah";
  if (/\brabigh\b|\brabig\b/.test(n)) return "Rabigh";
  return null;
}

export function isFacilityOrBranch(entityType: string | null | undefined): boolean {
  return entityType === "FACILITY" || entityType === "BRANCH";
}

function normalizeDomain(domain: string | null): string | null {
  if (!domain) return null;
  return domain.trim().toLowerCase().replace(/^www\./, "");
}

function storedCityMatches(stored: string | null, detected: WesternCity): boolean {
  if (!stored) return false;
  return detectWesternCity(stored) === detected || stored.trim().toLowerCase() === detected.toLowerCase();
}

export function assessNamedFacility(row: NamedFacilityScan): VerifiedLocationCandidate | RejectedNamedFacility {
  if (!isFacilityOrBranch(row.entity_type)) {
    return { ...row, reject_reason: "not_facility_or_branch" };
  }
  if (!storedCityMatches(row.stored_city, row.detected_city)) {
    return {
      ...row,
      reject_reason: "name_place_without_matching_imported_city_or_official_source",
    };
  }

  const override = FACILITY_OVERRIDES[row.company_id];
  if (override) {
    return {
      ...row,
      confidence: override.confidence,
      evidence_type: override.evidence_type,
      source_url: override.source_url,
      source_name: override.source_name,
      country: "Saudi Arabia",
      location_type: "Operating site",
      evidence:
        override.evidence ??
        `Facility name contains ${row.detected_city}; imported companies.city is ${row.stored_city}; ${override.source_name} (${override.source_url}).`,
    };
  }

  const domain = normalizeDomain(row.website_domain);
  const high = domain ? HIGH_OPERATORS[domain] : undefined;
  const medium = domain ? MEDIUM_OPERATORS[domain] : undefined;
  const operator = high ?? medium;
  if (!operator) {
    return {
      ...row,
      reject_reason: "imported_city_matches_name_but_no_authoritative_source_url",
    };
  }

  const confidence: LocationConfidence = high ? "HIGH" : "MEDIUM";
  return {
    ...row,
    confidence,
    evidence_type: operator.evidence_type,
    source_url: operator.source_url,
    source_name: operator.source_name,
    country: "Saudi Arabia",
    location_type: "Operating site",
    evidence:
      `Facility name contains ${row.detected_city}; imported companies.city is ${row.stored_city} (same site, not copied from a parent HQ); ` +
      `operator source ${operator.source_name} (${operator.source_url}). Parent HQ was not used.`,
  };
}

export function toCompanyLocationInsert(row: VerifiedLocationCandidate) {
  return {
    company_id: row.company_id,
    city: row.detected_city,
    region: row.proposed_region,
    country: row.country,
    location_type: row.location_type,
    is_headquarters: false,
    confidence: row.confidence,
    evidence_type: row.evidence_type,
    source_url: row.source_url,
    source_name: row.source_name,
    verified_at: new Date().toISOString(),
    notes: row.evidence,
  };
}
