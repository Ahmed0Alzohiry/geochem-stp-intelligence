import {
  emptyToNull,
  normalizeCommercialRegistration,
  normalizeCompanyName,
  normalizeWebsiteDomain,
} from "./normalize";
import type {
  CompletenessStatus,
  CsvImportRow,
  LoadResult,
  LocationType,
  RegionName,
  RejectedImportRow,
  SourceReliability,
  SourceTier,
  SourceType,
  ValidatedImportRow,
  VerificationStatus,
} from "./types";
import {
  COMPLETENESS_STATUSES,
  LOCATION_TYPES,
  REGION_NAMES,
  SOURCE_RELIABILITIES,
  SOURCE_TIERS,
  SOURCE_TYPES,
  VERIFICATION_STATUSES,
} from "./types";

const REGION_ALIASES: Record<string, RegionName> = {
  western: "Western Region",
  "western region": "Western Region",
  "western saudi arabia": "Western Region",
  eastern: "Eastern Region",
  "eastern region": "Eastern Region",
  "eastern province": "Eastern Region",
  central: "Central Region",
  "central region": "Central Region",
};

function isOneOf<T extends string>(value: string, allowed: readonly T[]): value is T {
  return (allowed as readonly string[]).includes(value);
}

function parseBoolean(value: string, errors: string[]): boolean | null {
  const normalized = value.trim().toLowerCase();
  if (normalized === "true" || normalized === "1" || normalized === "yes") {
    return true;
  }
  if (normalized === "false" || normalized === "0" || normalized === "no") {
    return false;
  }
  errors.push("is_demo must be true or false");
  return null;
}

function parseIsoDate(value: string, errors: string[]): string | null {
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    errors.push("last_verified_at must be YYYY-MM-DD");
    return null;
  }
  const date = new Date(`${trimmed}T00:00:00Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== trimmed) {
    errors.push("last_verified_at is not a valid date");
    return null;
  }
  return trimmed;
}

function resolveRegion(value: string, errors: string[]): RegionName | null {
  const trimmed = value.trim();
  if (!trimmed) {
    errors.push("region is required");
    return null;
  }
  if (isOneOf(trimmed, REGION_NAMES)) {
    return trimmed;
  }
  const mapped = REGION_ALIASES[trimmed.toLowerCase()];
  if (mapped) {
    return mapped;
  }
  errors.push(`region must be one of: ${REGION_NAMES.join(", ")}`);
  return null;
}

export function validateCsvRecords(records: Record<string, string>[]): LoadResult {
  const accepted: ValidatedImportRow[] = [];
  const rejected: RejectedImportRow[] = [];

  for (const raw of records) {
    const csv = raw as CsvImportRow & Record<string, string>;
    const errors: string[] = [];
    const sourceRowRaw = csv.source_row?.trim() ?? "";
    const sourceRow = Number.parseInt(sourceRowRaw, 10);
    if (!sourceRowRaw || !Number.isInteger(sourceRow) || sourceRow < 1) {
      errors.push("source_row must be a positive integer");
    }

    const batchId = csv.batch_id?.trim() ?? "";
    if (!batchId) {
      errors.push("batch_id is required");
    }

    const companyName = csv.company_name?.trim() ?? "";
    if (!companyName) {
      errors.push("company_name is required");
    }

    const city = csv.city?.trim() ?? "";
    if (!city) {
      errors.push("city is required");
    }

    const sourceUrl = csv.source_url?.trim() ?? "";
    if (!sourceUrl) {
      errors.push("source_url is required");
    } else if (!/^https?:\/\/\S+/i.test(sourceUrl)) {
      errors.push("source_url must be an http(s) URL");
    }

    const sourceType = csv.source_type?.trim() ?? "";
    if (!isOneOf(sourceType, SOURCE_TYPES)) {
      errors.push(`source_type must be one of: ${SOURCE_TYPES.join(", ")}`);
    }

    const sourceReliability = csv.source_reliability?.trim() ?? "";
    if (!isOneOf(sourceReliability, SOURCE_RELIABILITIES)) {
      errors.push(`source_reliability must be one of: ${SOURCE_RELIABILITIES.join(", ")}`);
    }

    const sourceTier = csv.source_tier?.trim() ?? "";
    if (!isOneOf(sourceTier, SOURCE_TIERS)) {
      errors.push("source_tier must be A, B, C, or D");
    }

    const verificationStatus = csv.verification_status?.trim() ?? "";
    if (!isOneOf(verificationStatus, VERIFICATION_STATUSES)) {
      errors.push(`verification_status must be one of: ${VERIFICATION_STATUSES.join(", ")}`);
    }

    const lastVerifiedAt = parseIsoDate(csv.last_verified_at ?? "", errors);
    if (verificationStatus === "Verified" && !lastVerifiedAt) {
      errors.push("last_verified_at is required when verification_status is Verified");
    }

    const locationTypeRaw = csv.location_type?.trim() ?? "";
    if (locationTypeRaw && !isOneOf(locationTypeRaw, LOCATION_TYPES)) {
      errors.push(`location_type must be one of: ${LOCATION_TYPES.join(", ")}`);
    }

    const completenessRaw = csv.data_completeness_status?.trim() ?? "";
    if (completenessRaw && !isOneOf(completenessRaw, COMPLETENESS_STATUSES)) {
      errors.push(`data_completeness_status must be one of: ${COMPLETENESS_STATUSES.join(", ")}`);
    }

    const regionName = resolveRegion(csv.region ?? "", errors);
    const isDemo = parseBoolean(csv.is_demo ?? "", errors);
    const normalizedName = normalizeCompanyName(companyName);
    if (companyName && !normalizedName) {
      errors.push("company_name could not be normalized");
    }

    const website = emptyToNull(csv.website);
    const websiteDomain = normalizeWebsiteDomain(website, emptyToNull(csv.website_domain));
    const explicitDomain = emptyToNull(csv.website_domain);
    if (explicitDomain && website) {
      const fromWebsite = normalizeWebsiteDomain(website, null);
      const fromExplicit = normalizeWebsiteDomain(null, explicitDomain);
      if (fromWebsite && fromExplicit && fromWebsite !== fromExplicit) {
        errors.push("website and website_domain do not resolve to the same host");
      }
    }

    if (errors.length > 0) {
      rejected.push({
        sourceRow: Number.isInteger(sourceRow) ? sourceRow : null,
        errors,
        raw,
      });
      continue;
    }

    accepted.push({
      batchId,
      sourceRow,
      companyName,
      legalName: emptyToNull(csv.legal_name),
      nameAr: emptyToNull(csv.name_ar),
      aliasName: emptyToNull(csv.alias_name),
      website,
      websiteDomain,
      commercialRegistrationNumber: normalizeCommercialRegistration(
        csv.commercial_registration_number,
      ),
      industryName: emptyToNull(csv.industry),
      subsector: emptyToNull(csv.subsector),
      customerTypeName: emptyToNull(csv.customer_type),
      regionName: regionName as RegionName,
      city,
      industrialCity: emptyToNull(csv.industrial_city),
      parentCompanyName: emptyToNull(csv.parent_company_name),
      businessDescription: emptyToNull(csv.business_description),
      mainActivities: emptyToNull(csv.main_activities),
      locationType: locationTypeRaw ? (locationTypeRaw as LocationType) : null,
      locationCity: emptyToNull(csv.location_city),
      sourceUrl,
      sourceType: sourceType as SourceType,
      sourceReliability: sourceReliability as SourceReliability,
      sourceTier: sourceTier as SourceTier,
      verificationStatus: verificationStatus as VerificationStatus,
      lastVerifiedAt,
      dataCompletenessStatus: completenessRaw
        ? (completenessRaw as CompletenessStatus)
        : null,
      isDemo: isDemo as boolean,
      researcherNotes: emptyToNull(csv.researcher_notes),
      normalizedName: normalizedName as string,
      normalizedLegalName: normalizeCompanyName(csv.legal_name),
      normalizedAlias: normalizeCompanyName(csv.alias_name),
      normalizedParentName: normalizeCompanyName(csv.parent_company_name),
    });
  }

  return { accepted, rejected };
}
