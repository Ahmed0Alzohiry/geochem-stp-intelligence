/**
 * Full-database targeting helpers. Reuses scoreServiceAccount / 6.4.0.
 * Does not write production STP.
 */
import { KNOWN_WEIGHT_FLOOR } from "./weights";
import type { EligibilityDecision, ServiceFirstScore } from "./types";
import type { ScoredAccount } from "./account-group";

export const DISCOVERY_SCHEMA_VERSION = "32.7.1";

export type DiscoveryProvenance = "PERSISTED_TARGET" | "DISCOVERY_RESULT";

export type DiscoverySummary = {
  totalCompanies: number;
  evaluated: number;
  eligible: number;
  ineligible: number;
  rankingEligible: number;
  insufficient: number;
  tier1: number;
  tier2: number;
  tier3: number;
  watchlist: number;
  unclassified: number;
};

export type CoverageRow = {
  serviceCode: string;
  serviceName: string;
  totalDb: number;
  evaluated: number | null;
  eligible: number | null;
  rankingEligible: number | null;
  tier1: number | null;
  tier2: number | null;
  tier3: number | null;
  persisted: number;
  evaluationStatus: "not_run" | "completed";
  scoredAt: string | null;
};

export type DiscoveryRow = {
  companyId: string;
  companyName: string;
  serviceId: string;
  serviceCode: string;
  accountGroupKey: string;
  entityType: string | null;
  industry: string | null;
  subsector: string | null;
  customerType: string | null;
  city: string | null;
  eligibility: EligibilityDecision;
  eligibilityReason: string;
  rankingEligible: boolean;
  rankingReason: string;
  tier: string | null;
  tierReason: string | null;
  commercialScore: number | null;
  knownWeightTotal: number;
  industryFit: number | null;
  applicationFit: number | null;
  serviceNeedFit: number | null;
  commercialPotential: number | null;
  customerTypeFit: number | null;
  geographicFit: number | null;
  strategicFit: number | null;
  dataConfidenceScore: number;
  dataConfidenceBand: string;
  positioningStatement: string;
  targetingReason: string;
  recommendedContactRoles: string[];
  recommendedDepartments: string[];
  missingIntelligence: string[];
  provenance: DiscoveryProvenance;
  rank: number | null;
};

function dimScore(result: ServiceFirstScore, key: ServiceFirstScore["dimensions"][number]["key"]): number | null {
  const row = result.dimensions.find((item) => item.key === key);
  if (!row || row.status !== "KNOWN" || row.rawScore == null) return null;
  return row.rawScore;
}

export function missingIntelligenceFor(account: ScoredAccount): string[] {
  const missing: string[] = [];
  for (const dim of account.result.dimensions) {
    if (dim.status === "UNKNOWN") missing.push(dim.label);
  }
  if (account.input.verifiedCities.length === 0) missing.push("Verified location");
  if (!account.input.companyServicesNeed && account.input.companyServicesFitRating == null) {
    missing.push("company_services need");
  }
  return missing;
}

export function rankingReasonFor(result: ServiceFirstScore): string {
  if (result.eligibility !== "ELIGIBLE") {
    return `Not ranking eligible: ${result.eligibilityReason}`;
  }
  if (result.commercialScore == null) {
    return "Not ranking eligible: commercial score is UNKNOWN (no known-weight dimensions).";
  }
  if (result.rankingEligible) {
    return `Ranking eligible: known weight ${result.knownWeightTotal}% ≥ ${KNOWN_WEIGHT_FLOOR.ranking}% floor.`;
  }
  return `Not ranking eligible: known weight ${result.knownWeightTotal}% < ${KNOWN_WEIGHT_FLOOR.ranking}% floor. UNKNOWN dimensions were not scored as zero.`;
}

export function summarizeDiscovery(rows: Array<{ eligibility: EligibilityDecision; rankingEligible: boolean; tier: string | null }>): DiscoverySummary {
  const totalCompanies = rows.length;
  let eligible = 0;
  let ineligible = 0;
  let rankingEligible = 0;
  let insufficient = 0;
  let tier1 = 0;
  let tier2 = 0;
  let tier3 = 0;
  let watchlist = 0;
  let unclassified = 0;
  for (const row of rows) {
    if (row.eligibility === "ELIGIBLE") eligible += 1;
    else if (row.eligibility === "INSUFFICIENT_TO_ELIGIBLE") {
      insufficient += 1;
      ineligible += 1;
    } else {
      ineligible += 1;
    }
    if (row.rankingEligible) rankingEligible += 1;
    if (row.tier === "Tier 1") tier1 += 1;
    else if (row.tier === "Tier 2") tier2 += 1;
    else if (row.tier === "Tier 3") tier3 += 1;
    else if (row.tier === "Watchlist") watchlist += 1;
    else unclassified += 1;
  }
  return {
    totalCompanies,
    evaluated: totalCompanies,
    eligible,
    ineligible,
    rankingEligible,
    insufficient,
    tier1,
    tier2,
    tier3,
    watchlist,
    unclassified,
  };
}

export function toDiscoveryRows(
  scored: ScoredAccount[],
  persistedCompanyIds: Set<string>,
  serviceCode: string,
): DiscoveryRow[] {
  const mapped = scored.map((account) => {
    const result = account.result;
    return {
      companyId: account.input.companyId,
      companyName: account.input.companyName,
      serviceId: result.serviceId,
      serviceCode,
      accountGroupKey: account.accountGroupKey,
      entityType: account.input.entityType,
      industry: account.input.industry,
      subsector: account.input.subsector,
      customerType: account.input.customerType,
      city: account.input.verifiedCities[0] ?? account.input.importedCity,
      eligibility: result.eligibility,
      eligibilityReason: result.eligibilityReason,
      rankingEligible: result.rankingEligible,
      rankingReason: rankingReasonFor(result),
      tier: result.tier,
      tierReason: result.tierGateFailed,
      commercialScore: result.commercialScore,
      knownWeightTotal: result.knownWeightTotal,
      industryFit: dimScore(result, "industryFit"),
      applicationFit: dimScore(result, "subsectorFit"),
      serviceNeedFit: dimScore(result, "serviceNeedFit"),
      commercialPotential: dimScore(result, "commercialPotential"),
      customerTypeFit: dimScore(result, "customerTypeFit"),
      geographicFit: dimScore(result, "geographicFit"),
      strategicFit: dimScore(result, "strategicAccountFit"),
      dataConfidenceScore: result.dataConfidenceScore,
      dataConfidenceBand: result.dataConfidenceBand,
      positioningStatement: result.positioningStatement,
      targetingReason: result.targetingReason,
      recommendedContactRoles: [...result.recommendedContactRoles],
      recommendedDepartments: [...result.recommendedDepartments],
      missingIntelligence: missingIntelligenceFor(account),
      provenance: persistedCompanyIds.has(account.input.companyId)
        ? ("PERSISTED_TARGET" as const)
        : ("DISCOVERY_RESULT" as const),
      rank: null as number | null,
    };
  });

  const ranked = mapped
    .filter((row) => row.rankingEligible && row.commercialScore != null)
    .sort((a, b) => (b.commercialScore as number) - (a.commercialScore as number) || a.companyName.localeCompare(b.companyName));
  ranked.forEach((row, index) => {
    row.rank = index + 1;
  });
  return mapped;
}

export function filterDiscoveryRows(
  rows: DiscoveryRow[],
  filters: {
    search?: string;
    tier?: string;
    industry?: string;
    subsector?: string;
    city?: string;
    customerType?: string;
    eligibility?: string;
    confidence?: string;
    missing?: string;
    provenance?: string;
  },
): DiscoveryRow[] {
  const search = filters.search?.trim().toLowerCase() ?? "";
  return rows.filter((row) => {
    if (search && !row.companyName.toLowerCase().includes(search)) return false;
    if (filters.tier && (row.tier ?? "") !== filters.tier) return false;
    if (filters.industry && (row.industry ?? "") !== filters.industry) return false;
    if (filters.subsector && (row.subsector ?? "") !== filters.subsector) return false;
    if (filters.city && (row.city ?? "") !== filters.city) return false;
    if (filters.customerType && (row.customerType ?? "") !== filters.customerType) return false;
    if (filters.eligibility && row.eligibility !== filters.eligibility) return false;
    if (filters.confidence && row.dataConfidenceBand !== filters.confidence) return false;
    if (filters.missing && !row.missingIntelligence.includes(filters.missing)) return false;
    if (filters.provenance && row.provenance !== filters.provenance) return false;
    return true;
  });
}
