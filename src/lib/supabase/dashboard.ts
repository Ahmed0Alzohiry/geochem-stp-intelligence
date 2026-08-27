import http from "node:http";
import https from "node:https";
import { unstable_noStore as noStore } from "next/cache";
import type { NamedCount } from "../../types";
import { computeWeightedValue } from "../crm/opportunity";
import { createSupabaseBrowserClient } from "./client";
import { getServices } from "./master-data";
import {
  normalizeServiceCode,
  rankingAvailable,
  registerLiveServices,
  serviceReadiness,
  type RegisteredService,
} from "../stp/service-registry";
import { DEFAULT_STP_SERVICE_CODE, getStpCurrentForService, type StpCurrentRow } from "./stp-current";

const TOP_CHART_BARS = 10;
const DASHBOARD_QUERY_PAGE_SIZE = 1000;

export type DashboardSnapshot = {
  totalCompanies: number;
  companiesBySector: NamedCount[];
  companiesByLocation: NamedCount[];
  companiesByCustomerType: NamedCount[];
  companiesByVerification: NamedCount[];
  companiesByDatasetStatus: NamedCount[];
  targetingAvailable: boolean;
  opportunitiesAvailable: boolean;
  pipelineAvailable: boolean;
  activeOpportunities: number;
  pipelineValue: number;
  estimatedPipelineValue: number;
  tier1Accounts: number;
  stpAccountCount: number;
  stpServiceName: string | null;
  stpServiceCode: string;
  serviceReadiness: "CONFIGURED" | "NOT_CONFIGURED" | "UNKNOWN_CATALOG";
  registeredServices: RegisteredService[];
  rankedPreview: StpCurrentRow[];
};

class DashboardReadError extends Error {
  constructor(message: string) {
    super(`Unable to load dashboard data from Supabase: ${message}`);
    this.name = "DashboardReadError";
  }
}

type DashboardCompanyRow = {
  industry: string | null;
  subsector: string | null;
  customer_type: string | null;
  city: string | null;
  industrial_city: string | null;
  verification_status: string | null;
  dataset_status: string | null;
};

function label(value: string | null | undefined, fallback = "Unspecified"): string {
  const trimmed = value?.trim();
  return trimmed ? trimmed : fallback;
}

function countBy(values: string[]): NamedCount[] {
  const map = new Map<string, number>();
  values.forEach((value) => map.set(value, (map.get(value) ?? 0) + 1));
  return [...map.entries()]
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value || a.name.localeCompare(b.name));
}

function topCounts(items: NamedCount[], limit: number): NamedCount[] {
  const unspecified = items.find((item) => item.name === "Unspecified");
  const specified = items.filter((item) => item.name !== "Unspecified");
  if (specified.length <= limit) {
    return unspecified ? [...specified, unspecified] : specified;
  }
  const head = specified.slice(0, limit);
  const rest = specified.slice(limit).reduce((sum, item) => sum + item.value, 0);
  const ranked = rest > 0 ? [...head, { name: "Other", value: rest }] : head;
  return unspecified ? [...ranked, unspecified] : ranked;
}

async function fetchDashboardCompanyRows(): Promise<{ rows: DashboardCompanyRow[]; total: number }> {
  const supabase = createSupabaseBrowserClient();
  const rows: DashboardCompanyRow[] = [];
  let total = 0;

  for (let from = 0; ; from += DASHBOARD_QUERY_PAGE_SIZE) {
    const to = from + DASHBOARD_QUERY_PAGE_SIZE - 1;
    const { data, error, count } = await supabase
      .from("companies")
      .select("industry, subsector, customer_type, city, industrial_city, verification_status, dataset_status", {
        count: from === 0 ? "exact" : undefined,
      })
      .range(from, to)
      .abortSignal(AbortSignal.timeout(20000));
    if (error) throw new DashboardReadError(error.message);
    if (from === 0) total = count ?? 0;
    const batch = (data ?? []) as DashboardCompanyRow[];
    rows.push(...batch);
    if (batch.length < DASHBOARD_QUERY_PAGE_SIZE) break;
  }

  return { rows, total: total || rows.length };
}

type OpportunityMetricRow = {
  status?: string | null;
  estimated_value?: number | string | null;
  probability?: number | string | null;
  weighted_value?: number | string | null;
};

function metricNumber(value: number | string | null | undefined): number {
  if (value == null || value === "") return 0;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function metricsFromOpportunityRows(rows: OpportunityMetricRow[]) {
  let activeCount = 0;
  let pipelineValue = 0;
  let estimatedActiveValue = 0;
  for (const row of rows) {
    const status = row.status === "Won" || row.status === "Lost" ? row.status : "Open";
    if (status === "Won" || status === "Lost") continue;
    const estimated = metricNumber(row.estimated_value);
    const probability = metricNumber(row.probability);
    const weighted =
      row.weighted_value == null ? computeWeightedValue(estimated, probability) : metricNumber(row.weighted_value);
    activeCount += 1;
    pipelineValue += weighted;
    estimatedActiveValue += estimated;
  }
  return { activeCount, pipelineValue, estimatedActiveValue };
}

function restGet(fullUrl: string, headers: Record<string, string>): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    const url = new URL(fullUrl);
    const lib = url.protocol === "https:" ? https : http;
    const req = lib.request(
      {
        protocol: url.protocol,
        hostname: url.hostname,
        port: url.port || undefined,
        path: `${url.pathname}${url.search}`,
        method: "GET",
        headers,
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
        res.on("end", () =>
          resolve({ status: res.statusCode ?? 0, body: Buffer.concat(chunks).toString("utf8") }),
        );
      },
    );
    req.on("error", reject);
    req.end();
  });
}

async function readDashboardOpportunityMetrics(): Promise<{
  opportunitiesAvailable: boolean;
  activeCount: number;
  pipelineValue: number;
  estimatedActiveValue: number;
  error: string | null;
}> {
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
  if (!base || !key) {
    return {
      opportunitiesAvailable: false,
      activeCount: 0,
      pipelineValue: 0,
      estimatedActiveValue: 0,
      error: "Supabase public env is missing",
    };
  }

  const headers = {
    apikey: key,
    Authorization: `Bearer ${key}`,
    Accept: "application/json",
  };
  const origin = base.replace(/\/$/, "");
  const selects = [
    "id,status,estimated_value,probability,weighted_value",
    "id,status,estimated_value,probability",
    "id",
  ];
  const filters = ["is_demo=eq.false", ""];
  let lastError: string | null = null;

  for (const select of selects) {
    for (const filter of filters) {
      const rows: OpportunityMetricRow[] = [];
      let failed = false;
      for (let from = 0; ; from += DASHBOARD_QUERY_PAGE_SIZE) {
        const to = from + DASHBOARD_QUERY_PAGE_SIZE - 1;
        const params = new URLSearchParams({ select });
        if (filter) {
          const [col, op] = filter.split("=");
          params.set(col, op);
        }
        const { status, body } = await restGet(`${origin}/rest/v1/opportunities?${params.toString()}`, {
          ...headers,
          Range: `${from}-${to}`,
        });
        if (status >= 400) {
          lastError = body.slice(0, 400);
          failed = true;
          break;
        }
        let parsed: unknown;
        try {
          parsed = body.trim() ? JSON.parse(body) : [];
        } catch {
          lastError = "opportunities response was not JSON";
          failed = true;
          break;
        }
        if (!Array.isArray(parsed)) {
          lastError = "opportunities response was not an array";
          failed = true;
          break;
        }
        const batch = parsed as OpportunityMetricRow[];
        rows.push(...batch);
        if (batch.length < DASHBOARD_QUERY_PAGE_SIZE) break;
      }
      if (!failed) {
        return {
          opportunitiesAvailable: true,
          error: null,
          ...metricsFromOpportunityRows(rows),
        };
      }
    }
  }

  return {
    opportunitiesAvailable: false,
    activeCount: 0,
    pipelineValue: 0,
    estimatedActiveValue: 0,
    error: lastError,
  };
}

export async function getDashboardSnapshot(
  serviceCode = DEFAULT_STP_SERVICE_CODE,
): Promise<DashboardSnapshot> {
  noStore();
  const requested = serviceCode.toUpperCase() || DEFAULT_STP_SERVICE_CODE;
  const [{ rows, total }, pipeline, stp] = await Promise.all([
    fetchDashboardCompanyRows(),
    readDashboardOpportunityMetrics(),
    getStpCurrentForService({ service: requested, page: "1" })
      .then((result) => ({ ok: true as const, result }))
      .catch(() => ({ ok: false as const, result: null })),
  ]);

  const services = stp.ok ? stp.result.services : await getServices();
  const registeredServices = stp.ok ? stp.result.registeredServices : registerLiveServices(services);
  const registered = registeredServices.find((row) => (row.service_code ?? "").toUpperCase() === requested);
  const readiness = stp.ok
    ? stp.result.readiness
    : (registered?.readiness ?? serviceReadiness(requested as "PCH"));
  const stpTotal = stp.ok ? stp.result.total : 0;
  const targetingAvailable = stp.ok && rankingAvailable(normalizeServiceCode(requested), stpTotal) && stpTotal > 0;
  if (!pipeline.opportunitiesAvailable) {
    console.error("[dashboard] opportunities query failed:", pipeline.error);
  }

  const sectorKeys = rows.map((row) => label(row.industry, label(row.subsector)));
  const locationKeys = rows.map((row) => label(row.city, label(row.industrial_city)));

  return {
    totalCompanies: total,
    companiesBySector: topCounts(countBy(sectorKeys), TOP_CHART_BARS),
    companiesByLocation: topCounts(countBy(locationKeys), TOP_CHART_BARS),
    companiesByCustomerType: topCounts(countBy(rows.map((row) => label(row.customer_type))), TOP_CHART_BARS),
    companiesByVerification: topCounts(countBy(rows.map((row) => label(row.verification_status))), TOP_CHART_BARS),
    companiesByDatasetStatus: topCounts(countBy(rows.map((row) => label(row.dataset_status))), TOP_CHART_BARS),
    targetingAvailable,
    opportunitiesAvailable: pipeline.opportunitiesAvailable,
    pipelineAvailable: pipeline.opportunitiesAvailable,
    activeOpportunities: pipeline.activeCount,
    pipelineValue: pipeline.pipelineValue,
    estimatedPipelineValue: pipeline.estimatedActiveValue,
    tier1Accounts: stp.ok ? stp.result.tierCounts.tier1 : 0,
    stpAccountCount: stpTotal,
    stpServiceName: stp.ok ? stp.result.service.name : registered?.name ?? null,
    stpServiceCode: requested,
    serviceReadiness: readiness,
    registeredServices,
    rankedPreview: stp.ok ? stp.result.rows.slice(0, 8) : [],
  };
}
