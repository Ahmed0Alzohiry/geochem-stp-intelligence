/**
 * Shared live PCH persist payload (STEP 6.7 / 6.10).
 * SELECT only. Does not write scores.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createSupabaseBrowserClient } from "../supabase/client";
import { collapseByAccountGroup, type ScoredAccount } from "./account-group";
import { scoreServiceAccount } from "./score";
import { mapScoredAccountToStpRow, type CompanyServiceStpScoreInsert } from "./stp-persist-row";
import type { ServiceFirstInput, ServiceCode } from "./types";

const PAGE = 1000;

type CompanyRow = {
  id: string;
  company_name: string | null;
  industry: string | null;
  subsector: string | null;
  customer_type: string | null;
  parent_company_name: string | null;
  is_existing_geochem_customer?: string | null;
  account_status: string | null;
  city: string | null;
};

type EntityRow = {
  company_id: string;
  entity_type: string;
  account_group_key: string;
};

type LocationRow = {
  company_id: string;
  city: string;
  confidence: string | null;
};

export function loadEnvLocal() {
  const envPath = resolve(process.cwd(), ".env.local");
  const text = readFileSync(envPath, "utf8");
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim();
    if (!process.env[key]) process.env[key] = value;
  }
}

function text(value: string | null | undefined): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

async function fetchAll<T>(table: string, fields: string, idCol: string): Promise<T[]> {
  const supabase = createSupabaseBrowserClient();
  const { count, error: countError } = await supabase.from(table).select(idCol, { count: "exact", head: true });
  if (countError) throw new Error(`${table}: ${countError.message}`);
  const total = count ?? 0;
  const rows: T[] = [];
  for (let from = 0; from < total; from += PAGE) {
    const to = Math.min(from + PAGE - 1, total - 1);
    const { data, error } = await supabase.from(table).select(fields).range(from, to);
    if (error) throw new Error(`${table}: ${error.message}`);
    rows.push(...(((data ?? []) as unknown) as T[]));
  }
  return rows;
}

export async function scoreLiveServiceUniverse(serviceCode: ServiceCode): Promise<{
  service: { id: string; name: string; service_code: string };
  scored: ScoredAccount[];
  companies: CompanyRow[];
}> {
  loadEnvLocal();
  const supabase = createSupabaseBrowserClient();
  const services = await fetchAll<{ id: string; name: string; service_code: string; active: boolean }>(
    "services",
    "id, name, service_code, active",
    "id",
  );
  const service = services.find((row) => row.service_code === serviceCode && row.active);
  if (!service) throw new Error(`Active ${serviceCode} service not found in public.services`);

  const probe = await supabase.from("companies").select("is_existing_geochem_customer").limit(1);
  const companySelect = probe.error
    ? "id, company_name, industry, subsector, customer_type, parent_company_name, account_status, city"
    : "id, company_name, industry, subsector, customer_type, parent_company_name, is_existing_geochem_customer, account_status, city";
  const companies = await fetchAll<CompanyRow>("companies", companySelect, "id");
  const entities = await fetchAll<EntityRow>(
    "company_entity_resolution",
    "company_id, entity_type, account_group_key",
    "company_id",
  );
  const locations = await fetchAll<LocationRow>("company_locations", "company_id, city, confidence", "id");
  const er = new Map(entities.map((row) => [row.company_id, row]));
  const locByCompany = new Map<string, string[]>();
  for (const row of locations) {
    if (row.confidence !== "HIGH") continue;
    locByCompany.set(row.company_id, [...(locByCompany.get(row.company_id) ?? []), row.city]);
  }

  const scored = companies.map((company) => {
    const meta = er.get(company.id);
    const input: ServiceFirstInput = {
      serviceId: service.id,
      serviceCode,
      serviceName: service.name,
      companyId: company.id,
      companyName: text(company.company_name) ?? "(unnamed)",
      industry: text(company.industry),
      subsector: text(company.subsector),
      customerType: text(company.customer_type),
      entityType: (meta?.entity_type as ServiceFirstInput["entityType"]) ?? null,
      parentCompanyName: text(company.parent_company_name),
      isExistingGeochemCustomer: text(company.is_existing_geochem_customer),
      accountStatus: text(company.account_status),
      verifiedCities: locByCompany.get(company.id) ?? [],
      importedCity: text(company.city),
      companyServicesNeed: null,
      companyServicesFitRating: null,
    };
    return { input, result: scoreServiceAccount(input), accountGroupKey: meta?.account_group_key ?? company.id };
  });
  return { service: { id: service.id, name: service.name, service_code: service.service_code }, scored, companies };
}

export async function buildLiveServicePersistPayload(
  serviceCode: ServiceCode,
  scoredAt: string,
): Promise<{
  service: { id: string; name: string; service_code: string };
  payload: CompanyServiceStpScoreInsert[];
  groupedCount: number;
  relatedSkippedGroups: number;
}> {
  const { service, scored } = await scoreLiveServiceUniverse(serviceCode);
  const eligibleRows = scored.filter((row) => row.result.eligibility === "ELIGIBLE" && row.result.commercialScore != null);
  const groups = new Map<string, typeof eligibleRows>();
  for (const row of eligibleRows) {
    groups.set(row.accountGroupKey, [...(groups.get(row.accountGroupKey) ?? []), row]);
  }
  let relatedSkippedGroups = 0;
  for (const members of groups.values()) {
    const hasRep = members.some((member) => member.input.entityType !== "RELATED" && member.input.entityType !== "REVIEW");
    if (!hasRep) relatedSkippedGroups += 1;
  }

  const grouped = collapseByAccountGroup(eligibleRows);
  const payload = grouped.map((row) => mapScoredAccountToStpRow(row, { scoredAt, isRepresentative: true }));
  return {
    service: { id: service.id, name: service.name, service_code: service.service_code },
    payload,
    groupedCount: grouped.length,
    relatedSkippedGroups,
  };
}

export async function buildLivePchPersistPayload(scoredAt: string): Promise<{
  pch: { id: string; name: string; service_code: string };
  payload: CompanyServiceStpScoreInsert[];
  groupedCount: number;
  relatedSkippedGroups: number;
}> {
  const result = await buildLiveServicePersistPayload("PCH", scoredAt);
  return {
    pch: result.service,
    payload: result.payload,
    groupedCount: result.groupedCount,
    relatedSkippedGroups: result.relatedSkippedGroups,
  };
}
