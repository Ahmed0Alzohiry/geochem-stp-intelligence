import type { DryRunMatch, StagingUpsertRow } from "./types";

export function toStagingRow(match: DryRunMatch): StagingUpsertRow {
  const { row } = match;
  const reviewerNotes = [
    `dry_run_class=${match.classification}`,
    `reason=${match.reason}`,
    match.matchedBatchRow != null ? `matched_batch_row=${match.matchedBatchRow}` : null,
    match.matchedCompanyId ? `matched_company_id=${match.matchedCompanyId}` : null,
  ]
    .filter(Boolean)
    .join("; ");

  return {
    batch_id: row.batchId,
    source_row: row.sourceRow,
    raw_name: row.companyName,
    legal_name: row.legalName,
    name_ar: row.nameAr,
    alias_name: row.aliasName,
    normalized_name: row.normalizedName,
    website: row.website,
    website_domain: row.websiteDomain,
    commercial_registration_number: row.commercialRegistrationNumber,
    industry_name: row.industryName,
    subsector: row.subsector,
    customer_type_name: row.customerTypeName,
    region_name: row.regionName,
    city: row.city,
    industrial_city: row.industrialCity,
    parent_company_name: row.parentCompanyName,
    business_description: row.businessDescription,
    main_activities: row.mainActivities,
    location_type: row.locationType,
    location_city: row.locationCity,
    source_url: row.sourceUrl,
    source_type: row.sourceType,
    source_reliability: row.sourceReliability,
    source_tier: row.sourceTier,
    verification_status: row.verificationStatus,
    last_verified_at: row.lastVerifiedAt,
    data_completeness_status: row.dataCompletenessStatus,
    is_demo: row.isDemo,
    researcher_notes: row.researcherNotes,
    dedup_status: match.dedupStatus,
    matched_company_id: match.matchedCompanyId,
    import_decision: match.importDecision,
    reviewer_notes: reviewerNotes,
  };
}
