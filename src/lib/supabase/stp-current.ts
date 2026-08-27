/**
 * Read-only loader for company_service_stp_current.
 * Does not rescore or write STP rows.
 */
import { createSupabaseBrowserClient } from "./client";
import { getServices, type ServiceRecord } from "./master-data";
import { isServiceCode, registerLiveServices, serviceReadiness, type RegisteredService } from "../stp/service-registry";
import type { ServiceCode } from "../stp/types";

export const DEFAULT_STP_SERVICE_CODE = "PCH";
export const STP_PAGE_SIZE = 50;

export type StpCurrentRow = {
  id: string;
  companyId: string;
  companyName: string;
  serviceId: string;
  serviceCode: string;
  serviceName: string;
  accountGroupKey: string;
  entityType: string | null;
  eligibility: string;
  commercialScore: number | null;
  knownWeightTotal: number | null;
  rankingEligible: boolean;
  tier: string | null;
  industryFit: number | null;
  applicationFit: number | null;
  serviceNeedFit: number | null;
  commercialPotential: number | null;
  customerTypeFit: number | null;
  geographicFit: number | null;
  strategicFit: number | null;
  dataConfidenceScore: number | null;
  dataConfidenceBand: string | null;
  positioningStatement: string | null;
  targetingReason: string | null;
  recommendedContactRoles: string[];
  scoringModelVersion: string | null;
  scoredAt: string | null;
  rank: number;
};

export type VerifiedLocationRow = {
  city: string;
  locationType: string | null;
  confidence: string | null;
  sourceUrl: string | null;
  sourceName: string | null;
};

export type StpAccountDetail = StpCurrentRow & {
  eligibilityReason: string | null;
  dataConfidenceExplanation: string | null;
  recommendedDepartments: string[];
  industry: string | null;
  subsector: string | null;
  customerType: string | null;
  importedCity: string | null;
  verifiedLocations: VerifiedLocationRow[];
};

function mapStpRow(
  row: StpQueryRow,
  opts: { companyName: string; service: ServiceRecord; requested: string; rank: number },
): StpCurrentRow {
  return {
    id: row.id,
    companyId: row.company_id,
    companyName: opts.companyName,
    serviceId: row.service_id,
    serviceCode: opts.service.service_code ?? opts.requested,
    serviceName: opts.service.name,
    accountGroupKey: row.account_group_key,
    entityType: row.entity_type,
    eligibility: row.eligibility,
    commercialScore: row.commercial_score,
    knownWeightTotal: row.known_weight_total,
    rankingEligible: Boolean(row.ranking_eligible),
    tier: row.tier,
    industryFit: row.industry_fit,
    applicationFit: row.application_fit,
    serviceNeedFit: row.service_need_fit,
    commercialPotential: row.commercial_potential,
    customerTypeFit: row.customer_type_fit,
    geographicFit: row.geographic_fit,
    strategicFit: row.strategic_fit,
    dataConfidenceScore: row.data_confidence_score,
    dataConfidenceBand: row.data_confidence_band,
    positioningStatement: row.positioning_statement,
    targetingReason: row.targeting_reason,
    recommendedContactRoles: row.recommended_contact_roles ?? [],
    scoringModelVersion: row.scoring_model_version,
    scoredAt: row.scored_at,
    rank: opts.rank,
  };
}

export type StpCurrentResult = {
  service: ServiceRecord;
  services: ServiceRecord[];
  registeredServices: RegisteredService[];
  readiness: ReturnType<typeof serviceReadiness> | "UNKNOWN_CATALOG";
  rows: StpCurrentRow[];
  total: number;
  page: number;
  pageSize: number;
  pageCount: number;
  tierCounts: { tier1: number; tier2: number; tier3: number; watchlist: number; untagged: number };
};

class StpReadError extends Error {
  constructor(message: string) {
    super(`Unable to load service STP results from Supabase: ${message}`);
    this.name = "StpReadError";
  }
}

type StpQueryRow = {
  id: string;
  company_id: string;
  service_id: string;
  account_group_key: string;
  entity_type: string | null;
  eligibility: string;
  commercial_score: number | null;
  known_weight_total: number | null;
  ranking_eligible: boolean | null;
  tier: string | null;
  industry_fit: number | null;
  application_fit: number | null;
  service_need_fit: number | null;
  commercial_potential: number | null;
  customer_type_fit: number | null;
  geographic_fit: number | null;
  strategic_fit: number | null;
  data_confidence_score: number | null;
  data_confidence_band: string | null;
  positioning_statement: string | null;
  targeting_reason: string | null;
  recommended_contact_roles: string[] | null;
  recommended_departments: string[] | null;
  data_confidence_explanation: string | null;
  eligibility_reason: string | null;
  scoring_model_version: string | null;
  scored_at: string | null;
};

function firstParam(value: string | string[] | undefined): string {
  if (Array.isArray(value)) return value[0]?.trim() ?? "";
  return value?.trim() ?? "";
}

function pageParam(value: string | string[] | undefined): string {
  if (Array.isArray(value)) return value.at(-1)?.trim() ?? "";
  return value?.trim() ?? "";
}

async function countTier(serviceId: string, tier: string): Promise<number> {
  const supabase = createSupabaseBrowserClient();
  const { count, error } = await supabase
    .from("company_service_stp_current")
    .select("id", { count: "exact", head: true })
    .eq("service_id", serviceId)
    .eq("tier", tier);
  if (error) throw new StpReadError(error.message);
  return count ?? 0;
}

async function countCurrentForServiceId(serviceId: string): Promise<number> {
  const supabase = createSupabaseBrowserClient();
  const { count, error } = await supabase
    .from("company_service_stp_current")
    .select("id", { count: "exact", head: true })
    .eq("service_id", serviceId);
  if (error) throw new StpReadError(error.message);
  return count ?? 0;
}

export async function getStpCurrentForService(
  searchParams: Record<string, string | string[] | undefined>,
): Promise<StpCurrentResult> {
  const services = await getServices();
  const requested = firstParam(searchParams.service).toUpperCase() || DEFAULT_STP_SERVICE_CODE;
  const service = services.find((item) => (item.service_code ?? "").toUpperCase() === requested) ?? services.find((item) => (item.service_code ?? "").toUpperCase() === DEFAULT_STP_SERVICE_CODE);
  if (!service) throw new StpReadError("No active services were found.");

  const pageRaw = Number.parseInt(pageParam(searchParams.page), 10);
  const page = Number.isInteger(pageRaw) && pageRaw > 0 ? pageRaw : 1;
  const supabase = createSupabaseBrowserClient();

  const from = (page - 1) * STP_PAGE_SIZE;
  const to = from + STP_PAGE_SIZE - 1;
  const { data, error, count } = await supabase
    .from("company_service_stp_current")
    .select(
      "id, company_id, service_id, account_group_key, entity_type, eligibility, commercial_score, known_weight_total, ranking_eligible, tier, industry_fit, application_fit, service_need_fit, commercial_potential, customer_type_fit, geographic_fit, strategic_fit, data_confidence_score, data_confidence_band, positioning_statement, targeting_reason, recommended_contact_roles, scoring_model_version, scored_at",
      { count: "exact" },
    )
    .eq("service_id", service.id)
    .order("commercial_score", { ascending: false, nullsFirst: false })
    .order("account_group_key", { ascending: true })
    .range(from, to);

  if (error) throw new StpReadError(error.message);

  const stpRows = (data ?? []) as StpQueryRow[];
  const companyIds = [...new Set(stpRows.map((row) => row.company_id))];
  const names = new Map<string, string>();
  if (companyIds.length > 0) {
    const { data: companies, error: companyError } = await supabase
      .from("companies")
      .select("id, company_name")
      .in("id", companyIds);
    if (companyError) throw new StpReadError(companyError.message);
    for (const company of companies ?? []) {
      names.set(company.id, company.company_name);
    }
  }

  const persistedCurrentByCode: Partial<Record<ServiceCode, number>> = {};
  await Promise.all(
    services.map(async (item) => {
      const code = (item.service_code ?? "").toUpperCase();
      if (!isServiceCode(code)) return;
      persistedCurrentByCode[code] = await countCurrentForServiceId(item.id);
    }),
  );

  const registeredServices = registerLiveServices(services, persistedCurrentByCode);
  const registered = registeredServices.find((row) => row.id === service.id);
  const total = count ?? stpRows.length;
  const pageCount = Math.max(1, Math.ceil(total / STP_PAGE_SIZE));
  const [tier1, tier2, tier3, watchlist] = await Promise.all([
    countTier(service.id, "Tier 1"),
    countTier(service.id, "Tier 2"),
    countTier(service.id, "Tier 3"),
    countTier(service.id, "Watchlist"),
  ]);

  return {
    service,
    services,
    registeredServices,
    readiness: registered?.readiness ?? "UNKNOWN_CATALOG",
    total,
    page,
    pageSize: STP_PAGE_SIZE,
    pageCount,
    tierCounts: {
      tier1,
      tier2,
      tier3,
      watchlist,
      untagged: Math.max(0, total - tier1 - tier2 - tier3 - watchlist),
    },
    rows: stpRows.map((row, index) =>
      mapStpRow(row, {
        companyName: names.get(row.company_id) ?? "(unnamed)",
        service,
        requested,
        rank: from + index + 1,
      }),
    ),
  };
}

export async function getStpTierSummary(serviceCode = DEFAULT_STP_SERVICE_CODE): Promise<{
  available: boolean;
  total: number;
  tier1: number;
  serviceName: string | null;
}> {
  const services = await getServices();
  const service = services.find((item) => (item.service_code ?? "").toUpperCase() === serviceCode.toUpperCase());
  if (!service) return { available: false, total: 0, tier1: 0, serviceName: null };
  const supabase = createSupabaseBrowserClient();
  const { count, error } = await supabase
    .from("company_service_stp_current")
    .select("id", { count: "exact", head: true })
    .eq("service_id", service.id);
  if (error) throw new StpReadError(error.message);
  const total = count ?? 0;
  const tier1 = total === 0 ? 0 : await countTier(service.id, "Tier 1");
  return { available: total > 0, total, tier1, serviceName: service.name };
}

async function rankForRow(serviceId: string, row: StpQueryRow): Promise<number> {
  const supabase = createSupabaseBrowserClient();
  const score = row.commercial_score;
  const higher = await supabase
    .from("company_service_stp_current")
    .select("id", { count: "exact", head: true })
    .eq("service_id", serviceId)
    .gt("commercial_score", score ?? -1);
  if (higher.error) throw new StpReadError(higher.error.message);
  let tied = 0;
  if (score != null) {
    const same = await supabase
      .from("company_service_stp_current")
      .select("id", { count: "exact", head: true })
      .eq("service_id", serviceId)
      .eq("commercial_score", score)
      .lt("account_group_key", row.account_group_key);
    if (same.error) throw new StpReadError(same.error.message);
    tied = same.count ?? 0;
  }
  return (higher.count ?? 0) + tied + 1;
}

export async function getStpAccountDetail(
  stpId: string,
  searchParams: Record<string, string | string[] | undefined>,
): Promise<StpAccountDetail | null> {
  const services = await getServices();
  const requested = firstParam(searchParams.service).toUpperCase() || DEFAULT_STP_SERVICE_CODE;
  const service =
    services.find((item) => (item.service_code ?? "").toUpperCase() === requested) ??
    services.find((item) => (item.service_code ?? "").toUpperCase() === DEFAULT_STP_SERVICE_CODE);
  if (!service) throw new StpReadError("No active services were found.");

  const supabase = createSupabaseBrowserClient();
  const { data, error } = await supabase
    .from("company_service_stp_current")
    .select(
      "id, company_id, service_id, account_group_key, entity_type, eligibility, eligibility_reason, commercial_score, known_weight_total, ranking_eligible, tier, industry_fit, application_fit, service_need_fit, commercial_potential, customer_type_fit, geographic_fit, strategic_fit, data_confidence_score, data_confidence_band, data_confidence_explanation, positioning_statement, targeting_reason, recommended_contact_roles, recommended_departments, scoring_model_version, scored_at",
    )
    .eq("id", stpId)
    .eq("service_id", service.id)
    .maybeSingle();
  if (error) throw new StpReadError(error.message);
  if (!data) return null;
  const row = data as StpQueryRow;

  const [{ data: company, error: companyError }, { data: locations, error: locationError }, rank] = await Promise.all([
    supabase
      .from("companies")
      .select("id, company_name, industry, subsector, customer_type, city")
      .eq("id", row.company_id)
      .maybeSingle(),
    supabase
      .from("company_locations")
      .select("city, location_type, confidence, source_url, source_name")
      .eq("company_id", row.company_id)
      .eq("confidence", "HIGH"),
    rankForRow(service.id, row),
  ]);
  if (companyError) throw new StpReadError(companyError.message);
  if (locationError) throw new StpReadError(locationError.message);

  return {
    ...mapStpRow(row, {
      companyName: company?.company_name ?? "(unnamed)",
      service,
      requested,
      rank,
    }),
    eligibilityReason: row.eligibility_reason ?? null,
    dataConfidenceExplanation: row.data_confidence_explanation ?? null,
    recommendedDepartments: row.recommended_departments ?? [],
    industry: company?.industry ?? null,
    subsector: company?.subsector ?? null,
    customerType: company?.customer_type ?? null,
    importedCity: company?.city ?? null,
    verifiedLocations: (locations ?? []).map((item) => ({
      city: item.city,
      locationType: item.location_type,
      confidence: item.confidence,
      sourceUrl: item.source_url,
      sourceName: item.source_name,
    })),
  };
}

export type ContactDuplicateStub = {
  fullName: string;
  email: string | null;
  linkedinUrl: string | null;
  sourceUrl?: string | null;
};

export type AccountGroupMemberRow = {
  companyId: string;
  companyName: string;
  legalName: string | null;
  entityType: "ACCOUNT" | "FACILITY" | "BRANCH" | "RELATED" | "REVIEW";
};

export async function getContactStubsForCompany(companyId: string): Promise<ContactDuplicateStub[]> {
  return getContactStubsForCompanies([companyId]);
}

export async function getContactStubsForCompanies(companyIds: string[]): Promise<ContactDuplicateStub[]> {
  const ids = [...new Set(companyIds.filter(Boolean))];
  if (ids.length === 0) return [];
  const supabase = createSupabaseBrowserClient();
  const { data, error } = await supabase
    .from("contacts")
    .select("full_name, email, linkedin_url, source_url")
    .in("company_id", ids);
  if (error) throw new StpReadError(error.message);
  return (data ?? []).map((row) => ({
    fullName: row.full_name,
    email: row.email,
    linkedinUrl: row.linkedin_url,
    sourceUrl: row.source_url,
  }));
}

export async function getAccountGroupMembers(accountGroupKey: string): Promise<AccountGroupMemberRow[]> {
  const supabase = createSupabaseBrowserClient();
  const { data: resolved, error } = await supabase
    .from("company_entity_resolution")
    .select("company_id, entity_type")
    .eq("account_group_key", accountGroupKey);
  if (error) throw new StpReadError(error.message);
  const rows = resolved ?? [];
  if (rows.length === 0) return [];
  const ids = rows.map((row) => row.company_id);
  const { data: companies, error: companyError } = await supabase
    .from("companies")
    .select("id, company_name, legal_name")
    .in("id", ids);
  if (companyError) throw new StpReadError(companyError.message);
  const names = new Map((companies ?? []).map((row) => [row.id, row]));
  return rows.map((row) => ({
    companyId: row.company_id,
    companyName: names.get(row.company_id)?.company_name ?? row.company_id,
    legalName: names.get(row.company_id)?.legal_name ?? null,
    entityType: row.entity_type as AccountGroupMemberRow["entityType"],
  }));
}

/** Rank 1 for a service using the same sort as the targeting table. Read-only. */
export async function getRankOneStpAccountDetail(
  serviceCode = DEFAULT_STP_SERVICE_CODE,
): Promise<{
  detail: StpAccountDetail;
  existingContacts: ContactDuplicateStub[];
  groupMembers: AccountGroupMemberRow[];
} | null> {
  const list = await getStpCurrentForService({ service: serviceCode, page: "1" });
  const first = list.rows[0];
  if (!first) return null;
  const detail = await getStpAccountDetail(first.id, { service: serviceCode });
  if (!detail) return null;
  const groupMembers = await getAccountGroupMembers(detail.accountGroupKey);
  const existingContacts = await getContactStubsForCompanies(
    groupMembers.length > 0 ? groupMembers.map((row) => row.companyId) : [detail.companyId],
  );
  return { detail, existingContacts, groupMembers };
}
