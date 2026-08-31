/**
 * Full-database targeting run + optional promote into current STP.
 * Reuses scoreLiveServiceUniverse / scoreServiceAccount. Never deletes or updates
 * existing current production rows.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { collapseByAccountGroup } from "./account-group";
import { loadEnvLocal, scoreLiveServiceUniverse } from "./build-pch-persist-payload";
import {
  filterDiscoveryRows,
  summarizeDiscovery,
  toDiscoveryRows,
  type CoverageRow,
  type DiscoveryRow,
  type DiscoverySummary,
} from "./full-database-targeting";
import { SERVICE_STP_CURRENT_VIEW, SERVICE_STP_TABLE } from "./persistence-readiness";
import { isServiceCode } from "./service-registry";
import { mapScoredAccountToStpRow } from "./stp-persist-row";
import { SERVICE_FIRST_MODEL_VERSION, type ServiceCode } from "./types";

const DISCOVERY_TABLE = "company_service_stp_discovery";
const RUNS_TABLE = "stp_discovery_runs";

function timedClient(): SupabaseClient {
  loadEnvLocal();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
  if (!url || !anonKey) throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY");
  return createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      fetch: (input: RequestInfo | URL, init?: RequestInit) =>
        fetch(input, { ...init, cache: "no-store", signal: AbortSignal.timeout(180_000) }),
    },
  });
}

async function fetchCurrentCompanyIds(supabase: SupabaseClient, serviceId: string): Promise<Set<string>> {
  const ids = new Set<string>();
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase
      .from(SERVICE_STP_CURRENT_VIEW)
      .select("company_id")
      .eq("service_id", serviceId)
      .range(from, from + 999);
    if (error) throw new Error(error.message);
    const batch = data ?? [];
    for (const row of batch) ids.add(String(row.company_id));
    if (batch.length < 1000) break;
  }
  return ids;
}

async function fetchCurrentGroupKeys(supabase: SupabaseClient, serviceId: string): Promise<Set<string>> {
  const keys = new Set<string>();
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase
      .from(SERVICE_STP_CURRENT_VIEW)
      .select("account_group_key")
      .eq("service_id", serviceId)
      .range(from, from + 999);
    if (error) throw new Error(error.message);
    const batch = data ?? [];
    for (const row of batch) keys.add(String(row.account_group_key));
    if (batch.length < 1000) break;
  }
  return keys;
}

function discoveryInsert(runId: string, row: DiscoveryRow, scoredAt: string, dimensionSnapshot: unknown) {
  return {
    run_id: runId,
    company_id: row.companyId,
    service_id: row.serviceId,
    account_group_key: row.accountGroupKey,
    entity_type: row.entityType,
    company_name: row.companyName,
    industry: row.industry,
    subsector: row.subsector,
    customer_type: row.customerType,
    city: row.city,
    eligibility: row.eligibility,
    eligibility_reason: row.eligibilityReason,
    commercial_score: row.commercialScore,
    known_weight_total: row.knownWeightTotal,
    ranking_eligible: row.rankingEligible,
    ranking_reason: row.rankingReason,
    tier: row.tier,
    tier_reason: row.tierReason,
    industry_fit: row.industryFit,
    application_fit: row.applicationFit,
    service_need_fit: row.serviceNeedFit,
    commercial_potential: row.commercialPotential,
    customer_type_fit: row.customerTypeFit,
    geographic_fit: row.geographicFit,
    strategic_fit: row.strategicFit,
    data_confidence_score: row.dataConfidenceScore,
    data_confidence_band: row.dataConfidenceBand,
    positioning_statement: row.positioningStatement,
    targeting_reason: row.targetingReason,
    recommended_contact_roles: row.recommendedContactRoles,
    recommended_departments: row.recommendedDepartments,
    missing_intelligence: row.missingIntelligence,
    dimension_snapshot: dimensionSnapshot,
    scoring_model_version: SERVICE_FIRST_MODEL_VERSION,
    scored_at: scoredAt,
  };
}

export type FullDatabaseRunResult = {
  serviceCode: ServiceCode;
  serviceId: string;
  serviceName: string;
  scoredAt: string;
  modelVersion: string;
  summary: DiscoverySummary;
  persistedCurrentCount: number;
  evaluationStatus: "completed";
  stored: boolean;
  storeWarning: string | null;
  runId: string | null;
  rows: DiscoveryRow[];
};

export async function runFullDatabaseTargeting(serviceCodeRaw: string): Promise<FullDatabaseRunResult> {
  const serviceCode = serviceCodeRaw.toUpperCase();
  if (!isServiceCode(serviceCode)) throw new Error(`Unknown service ${serviceCodeRaw}`);
  const supabase = timedClient();
  const scoredAt = new Date().toISOString();
  const { service, scored } = await scoreLiveServiceUniverse(serviceCode, supabase);
  const persistedIds = await fetchCurrentCompanyIds(supabase, service.id);
  const rows = toDiscoveryRows(scored, persistedIds, serviceCode);
  const summary = summarizeDiscovery(rows);

  let stored = false;
  let storeWarning: string | null = null;
  let runId: string | null = null;
  const runInsert = {
    service_id: service.id,
    scoring_model_version: SERVICE_FIRST_MODEL_VERSION,
    scored_at: scoredAt,
    total_companies: summary.totalCompanies,
    evaluated: summary.evaluated,
    eligible: summary.eligible,
    ineligible: summary.ineligible,
    ranking_eligible: summary.rankingEligible,
    insufficient: summary.insufficient,
    tier1: summary.tier1,
    tier2: summary.tier2,
    tier3: summary.tier3,
    watchlist: summary.watchlist,
    persisted_current_count: persistedIds.size,
  };
  const runRes = await supabase.from(RUNS_TABLE).insert(runInsert).select("id").single();
  if (runRes.error) {
    storeWarning = runRes.error.message;
  } else {
    runId = String(runRes.data.id);
    const payload = rows.map((row, index) =>
      discoveryInsert(runId as string, row, scoredAt, scored[index]?.result.dimensions ?? []),
    );
    const chunkSize = 80;
    for (let i = 0; i < payload.length; i += chunkSize) {
      const { error } = await supabase.from(DISCOVERY_TABLE).insert(payload.slice(i, i + chunkSize));
      if (error) {
        storeWarning = error.message;
        break;
      }
    }
    stored = !storeWarning;
  }

  return {
    serviceCode,
    serviceId: service.id,
    serviceName: service.name,
    scoredAt,
    modelVersion: SERVICE_FIRST_MODEL_VERSION,
    summary,
    persistedCurrentCount: persistedIds.size,
    evaluationStatus: "completed",
    stored,
    storeWarning,
    runId,
    rows,
  };
}

function mapStoredDiscovery(row: Record<string, unknown>, serviceCode: string, persisted: Set<string>): DiscoveryRow {
  return {
    companyId: String(row.company_id),
    companyName: String(row.company_name),
    serviceId: String(row.service_id),
    serviceCode,
    accountGroupKey: String(row.account_group_key),
    entityType: row.entity_type ? String(row.entity_type) : null,
    industry: row.industry ? String(row.industry) : null,
    subsector: row.subsector ? String(row.subsector) : null,
    customerType: row.customer_type ? String(row.customer_type) : null,
    city: row.city ? String(row.city) : null,
    eligibility: row.eligibility as DiscoveryRow["eligibility"],
    eligibilityReason: String(row.eligibility_reason ?? ""),
    rankingEligible: Boolean(row.ranking_eligible),
    rankingReason: String(row.ranking_reason ?? ""),
    tier: row.tier ? String(row.tier) : null,
    tierReason: row.tier_reason ? String(row.tier_reason) : null,
    commercialScore: row.commercial_score == null ? null : Number(row.commercial_score),
    knownWeightTotal: Number(row.known_weight_total ?? 0),
    industryFit: row.industry_fit == null ? null : Number(row.industry_fit),
    applicationFit: row.application_fit == null ? null : Number(row.application_fit),
    serviceNeedFit: row.service_need_fit == null ? null : Number(row.service_need_fit),
    commercialPotential: row.commercial_potential == null ? null : Number(row.commercial_potential),
    customerTypeFit: row.customer_type_fit == null ? null : Number(row.customer_type_fit),
    geographicFit: row.geographic_fit == null ? null : Number(row.geographic_fit),
    strategicFit: row.strategic_fit == null ? null : Number(row.strategic_fit),
    dataConfidenceScore: Number(row.data_confidence_score),
    dataConfidenceBand: String(row.data_confidence_band),
    positioningStatement: String(row.positioning_statement ?? ""),
    targetingReason: String(row.targeting_reason ?? ""),
    recommendedContactRoles: Array.isArray(row.recommended_contact_roles)
      ? (row.recommended_contact_roles as string[])
      : [],
    recommendedDepartments: Array.isArray(row.recommended_departments)
      ? (row.recommended_departments as string[])
      : [],
    missingIntelligence: Array.isArray(row.missing_intelligence) ? (row.missing_intelligence as string[]) : [],
    provenance: persisted.has(String(row.company_id)) ? "PERSISTED_TARGET" : "DISCOVERY_RESULT",
    rank: null,
  };
}

export async function loadLatestDiscovery(
  serviceCodeRaw: string,
  filters: Parameters<typeof filterDiscoveryRows>[1] = {},
): Promise<{
  serviceCode: ServiceCode;
  run: Record<string, unknown> | null;
  summary: DiscoverySummary | null;
  persistedCurrentCount: number;
  evaluationStatus: "not_run" | "completed";
  rows: DiscoveryRow[];
  storeWarning: string | null;
}> {
  const serviceCode = serviceCodeRaw.toUpperCase();
  if (!isServiceCode(serviceCode)) throw new Error(`Unknown service ${serviceCodeRaw}`);
  const supabase = timedClient();
  const { data: services, error: svcErr } = await supabase
    .from("services")
    .select("id, name, service_code, active")
    .eq("service_code", serviceCode)
    .eq("active", true)
    .maybeSingle();
  if (svcErr) throw new Error(svcErr.message);
  if (!services) throw new Error(`Active ${serviceCode} not found`);
  const persistedIds = await fetchCurrentCompanyIds(supabase, services.id);
  const runRes = await supabase
    .from(RUNS_TABLE)
    .select("*")
    .eq("service_id", services.id)
    .order("scored_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (runRes.error) {
    return {
      serviceCode,
      run: null,
      summary: null,
      persistedCurrentCount: persistedIds.size,
      evaluationStatus: "not_run",
      rows: [],
      storeWarning: runRes.error.message,
    };
  }
  if (!runRes.data) {
    return {
      serviceCode,
      run: null,
      summary: null,
      persistedCurrentCount: persistedIds.size,
      evaluationStatus: "not_run",
      rows: [],
      storeWarning: null,
    };
  }
  const all: DiscoveryRow[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase
      .from(DISCOVERY_TABLE)
      .select("*")
      .eq("run_id", runRes.data.id)
      .range(from, from + 999);
    if (error) throw new Error(error.message);
    const batch = data ?? [];
    for (const row of batch) all.push(mapStoredDiscovery(row as Record<string, unknown>, serviceCode, persistedIds));
    if (batch.length < 1000) break;
  }
  const ranked = all
    .filter((row) => row.rankingEligible && row.commercialScore != null)
    .sort((a, b) => (b.commercialScore as number) - (a.commercialScore as number) || a.companyName.localeCompare(b.companyName));
  ranked.forEach((row, index) => {
    row.rank = index + 1;
  });
  const filtered = filterDiscoveryRows(all, filters);
  return {
    serviceCode,
    run: runRes.data as Record<string, unknown>,
    summary: summarizeDiscovery(all),
    persistedCurrentCount: persistedIds.size,
    evaluationStatus: "completed",
    rows: filtered,
    storeWarning: null,
  };
}

export async function loadServiceCoverage(): Promise<{ totalCompanies: number; rows: CoverageRow[] }> {
  const supabase = timedClient();
  const { count: totalCompanies, error: cErr } = await supabase.from("companies").select("id", { count: "exact", head: true });
  if (cErr) throw new Error(cErr.message);
  const { data: services, error: sErr } = await supabase.from("services").select("id, name, service_code, active").eq("active", true);
  if (sErr) throw new Error(sErr.message);
  const configured = (services ?? []).filter((row) =>
    ["PCH", "ENV", "INS", "PET", "OCM", "LAB", "MCT"].includes(String(row.service_code ?? "")),
  );
  const rows: CoverageRow[] = [];
  for (const service of configured.sort((a, b) => String(a.service_code).localeCompare(String(b.service_code)))) {
    const persisted = await fetchCurrentCompanyIds(supabase, service.id);
    const runRes = await supabase
      .from(RUNS_TABLE)
      .select("evaluated, eligible, ranking_eligible, tier1, tier2, tier3, scored_at")
      .eq("service_id", service.id)
      .order("scored_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    const run = runRes.error ? null : runRes.data;
    rows.push({
      serviceCode: String(service.service_code),
      serviceName: service.name,
      totalDb: totalCompanies ?? 0,
      evaluated: run ? Number(run.evaluated) : null,
      eligible: run ? Number(run.eligible) : null,
      rankingEligible: run ? Number(run.ranking_eligible) : null,
      tier1: run ? Number(run.tier1) : null,
      tier2: run ? Number(run.tier2) : null,
      tier3: run ? Number(run.tier3) : null,
      persisted: persisted.size,
      evaluationStatus: run ? "completed" : "not_run",
      scoredAt: run ? String(run.scored_at) : null,
    });
  }
  return { totalCompanies: totalCompanies ?? 0, rows };
}

export type PromoteResult = {
  requested: number;
  inserted: number;
  skippedPersistedCompany: number;
  skippedPersistedGroup: number;
  skippedNotEligible: number;
  skippedNotFound: number;
  errors: string[];
};

export async function promoteDiscoveryToCurrent(opts: {
  serviceCode: string;
  companyIds: string[];
  allEligible?: boolean;
}): Promise<PromoteResult> {
  const serviceCode = opts.serviceCode.toUpperCase();
  if (!isServiceCode(serviceCode)) throw new Error(`Unknown service ${opts.serviceCode}`);
  const supabase = timedClient();
  const scoredAt = new Date().toISOString();
  const { service, scored } = await scoreLiveServiceUniverse(serviceCode, supabase);
  const persistedCompanies = await fetchCurrentCompanyIds(supabase, service.id);
  const persistedGroups = await fetchCurrentGroupKeys(supabase, service.id);

  let selectedIds = new Set(opts.companyIds);
  if (opts.allEligible) {
    selectedIds = new Set(
      scored.filter((row) => row.result.eligibility === "ELIGIBLE" && row.result.commercialScore != null).map((row) => row.input.companyId),
    );
  }

  const selected = scored.filter((row) => selectedIds.has(row.input.companyId));
  const result: PromoteResult = {
    requested: selectedIds.size,
    inserted: 0,
    skippedPersistedCompany: 0,
    skippedPersistedGroup: 0,
    skippedNotEligible: 0,
    skippedNotFound: Math.max(0, selectedIds.size - selected.length),
    errors: [],
  };

  const eligible = selected.filter((row) => {
    if (row.result.eligibility !== "ELIGIBLE" || row.result.commercialScore == null) {
      result.skippedNotEligible += 1;
      return false;
    }
    if (persistedCompanies.has(row.input.companyId)) {
      result.skippedPersistedCompany += 1;
      return false;
    }
    return true;
  });

  const collapsed = collapseByAccountGroup(eligible);
  const toInsert = [];
  for (const row of collapsed) {
    if (persistedGroups.has(row.accountGroupKey)) {
      result.skippedPersistedGroup += 1;
      continue;
    }
    toInsert.push(mapScoredAccountToStpRow(row, { scoredAt, isRepresentative: true }));
  }

  const chunkSize = 5;
  for (let i = 0; i < toInsert.length; i += chunkSize) {
    const chunk = toInsert.slice(i, i + chunkSize);
    const { error } = await supabase.from(SERVICE_STP_TABLE).insert(chunk);
    if (error) {
      result.errors.push(error.message);
      break;
    }
    result.inserted += chunk.length;
    for (const row of chunk) {
      persistedCompanies.add(row.company_id);
      persistedGroups.add(row.account_group_key);
    }
  }
  return result;
}
