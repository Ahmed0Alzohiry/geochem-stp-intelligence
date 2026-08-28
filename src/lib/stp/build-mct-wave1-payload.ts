/**
 * Build the MCT Wave-1 STP payload from the frozen 32.6.2 APPROVE IDs only.
 * Does not score the rest of the company universe as the persist set. Does not write.
 */
import { createClient } from "@supabase/supabase-js";
import { loadEnvLocal } from "./build-pch-persist-payload";
import { decideEligibility } from "./eligibility";
import { scoreServiceAccount } from "./score";
import { mapScoredAccountToStpRow } from "./stp-persist-row";
import { validateMctWave1Payload } from "./mct-wave1-gates";
import { positioningForUseCase } from "./positioning";
import {
  MCT_SERVICE_ID,
  MCT_WAVE1_ACCOUNTS,
  MCT_WAVE1_COMPANY_IDS,
  MCT_WAVE1_EXPECTED_COUNT,
  mctPersistAccountGroupKey,
  type MctUseKind,
} from "./mct-wave1-manifest";
import type { CompanyServiceStpScoreInsert } from "./stp-persist-row";
import type { ServiceFirstInput } from "./types";

const USABLE_STATUS = new Set(["Prospect", "Current Customer", "Former Customer", "Partner", "Prospect Segment"]);

function timedClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
  if (!url || !anonKey) throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY");
  return createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      fetch: (input: RequestInfo | URL, init?: RequestInit) =>
        fetch(input, { ...init, cache: "no-store", signal: AbortSignal.timeout(25_000) }),
    },
  });
}

function text(v: string | null | undefined): string | null {
  if (!v) return null;
  const t = v.trim();
  return t.length ? t : null;
}

export function mctContactOverride(kind: MctUseKind): { roles: string[]; departments: string[] } {
  switch (kind) {
    case "refinery":
      return {
        roles: ["Technical", "Decision Maker", "Procurement"],
        departments: ["Engineering", "Inspection", "Laboratory", "Procurement"],
      };
    case "polymer":
      return {
        roles: ["Technical", "User"],
        departments: ["Engineering", "Laboratory", "QA/QC", "Maintenance"],
      };
    case "terminal":
      return {
        roles: ["Technical", "Decision Maker"],
        departments: ["Inspection", "Engineering", "Procurement"],
      };
    case "gas":
      return {
        roles: ["Technical", "Influencer"],
        departments: ["Engineering", "Inspection", "Reliability"],
      };
    case "utility":
      return {
        roles: ["Technical", "User"],
        departments: ["Maintenance", "Engineering", "Reliability"],
      };
    case "complex":
      return {
        roles: ["Technical", "Procurement", "Decision Maker"],
        departments: ["Engineering", "Laboratory", "Procurement"],
      };
  }
}

export async function countMctUniverseEligible(serviceId: string, serviceName: string): Promise<{
  universe: number;
  eligible: number;
}> {
  const supabase = timedClient();
  let universe = 0;
  let eligible = 0;
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase
      .from("companies")
      .select("id, company_name, industry, subsector, customer_type, account_status")
      .range(from, from + 999);
    if (error) throw new Error(error.message);
    const batch = data ?? [];
    for (const row of batch) {
      universe += 1;
      const decision = decideEligibility({
        serviceId,
        serviceCode: "MCT",
        serviceName,
        companyId: row.id,
        companyName: text(row.company_name) ?? "(unnamed)",
        industry: text(row.industry),
        subsector: text(row.subsector),
        customerType: text(row.customer_type),
        entityType: null,
        parentCompanyName: null,
        isExistingGeochemCustomer: null,
        accountStatus: text(row.account_status),
        verifiedCities: [],
        importedCity: null,
        companyServicesNeed: null,
        companyServicesFitRating: null,
      });
      if (decision.decision === "ELIGIBLE") eligible += 1;
    }
    if (batch.length < 1000) break;
  }
  return { universe, eligible };
}

export async function buildMctWave1PersistPayload(scoredAt: string): Promise<{
  service: { id: string; name: string; service_code: string };
  payload: CompanyServiceStpScoreInsert[];
  mctUniverseEligible: number;
  mctUniverse: number;
  integrity: { ok: boolean; errors: string[] };
}> {
  loadEnvLocal();
  const supabase = timedClient();
  const { data: services, error: serviceError } = await supabase
    .from("services")
    .select("id, name, service_code, active")
    .eq("service_code", "MCT")
    .eq("active", true)
    .maybeSingle();
  if (serviceError) throw new Error(serviceError.message);
  if (!services || services.id !== MCT_SERVICE_ID) {
    throw new Error(`Live MCT service_id ${services?.id ?? "missing"} !== frozen ${MCT_SERVICE_ID}`);
  }

  let companySelect =
    "id, company_name, industry, subsector, customer_type, parent_company_name, is_existing_geochem_customer, account_status, city";
  let companiesRes = await supabase.from("companies").select(companySelect).in("id", [...MCT_WAVE1_COMPANY_IDS]);
  if (companiesRes.error) {
    companySelect = "id, company_name, industry, subsector, customer_type, parent_company_name, account_status, city";
    companiesRes = await supabase.from("companies").select(companySelect).in("id", [...MCT_WAVE1_COMPANY_IDS]);
  }
  if (companiesRes.error) throw new Error(companiesRes.error.message);
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
  const companies = (companiesRes.data ?? []) as unknown as CompanyRow[];
  const { data: entities, error: entityError } = await supabase
    .from("company_entity_resolution")
    .select("company_id, entity_type, account_group_key")
    .in("company_id", [...MCT_WAVE1_COMPANY_IDS]);
  if (entityError) throw new Error(entityError.message);
  const { data: locations, error: locError } = await supabase
    .from("company_locations")
    .select("company_id, city, confidence")
    .in("company_id", [...MCT_WAVE1_COMPANY_IDS]);
  if (locError) throw new Error(locError.message);

  const companyById = new Map((companies ?? []).map((row) => [row.id, row]));
  const er = new Map((entities ?? []).map((row) => [row.company_id, row]));
  const locByCompany = new Map<string, string[]>();
  for (const row of locations ?? []) {
    if (row.confidence !== "HIGH") continue;
    locByCompany.set(row.company_id, [...(locByCompany.get(row.company_id) ?? []), row.city]);
  }

  const errors: string[] = [];
  const payload: CompanyServiceStpScoreInsert[] = [];
  for (const entry of MCT_WAVE1_ACCOUNTS) {
    const company = companyById.get(entry.companyId);
    if (!company) {
      errors.push(`Frozen company_id missing from companies: ${entry.companyId}`);
      continue;
    }
    if (!USABLE_STATUS.has(company.account_status ?? "")) {
      errors.push(`Unusable account_status ${company.account_status} for ${entry.companyId}`);
    }
    const liveName = text(company.company_name) ?? "(unnamed)";
    if (liveName !== entry.companyName) {
      errors.push(`Name drift for ${entry.companyId}: live "${liveName}" vs frozen "${entry.companyName}"`);
    }
    const meta = er.get(entry.companyId);
    const input: ServiceFirstInput = {
      serviceId: MCT_SERVICE_ID,
      serviceCode: "MCT",
      serviceName: services.name,
      companyId: company.id,
      companyName: liveName,
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
    const result = scoreServiceAccount(input);
    if (result.eligibility !== "ELIGIBLE") errors.push(`Not ELIGIBLE: ${entry.companyId} (${result.eligibilityReason})`);
    const contacts = mctContactOverride(entry.useKind);
    const row = mapScoredAccountToStpRow(
      {
        input,
        result,
        accountGroupKey: mctPersistAccountGroupKey(entry.companyId, meta?.account_group_key ?? company.id),
      },
      { scoredAt, isRepresentative: true },
    );
    row.positioning_statement = positioningForUseCase("MCT", liveName, entry.useCase);
    row.recommended_contact_roles = contacts.roles;
    row.recommended_departments = contacts.departments;
    row.targeting_reason = [
      result.targetingReason,
      `MCT use case: ${entry.useCase}.`,
      `Existing GEOCHEM overlap ${entry.overlap} raises priority only and does not create MCT eligibility.`,
    ].join(" · ");
    payload.push(row);
  }

  const universe = await countMctUniverseEligible(services.id, services.name);
  const check = validateMctWave1Payload(payload);
  if (!check.ok) errors.push(...check.errors);
  if (payload.length !== MCT_WAVE1_EXPECTED_COUNT || errors.length > 0) {
    throw new Error(errors.join(" | ") || `MCT Wave-1 payload length ${payload.length}`);
  }

  return {
    service: { id: services.id, name: services.name, service_code: services.service_code },
    payload,
    mctUniverseEligible: universe.eligible,
    mctUniverse: universe.universe,
    integrity: { ok: true, errors: [] },
  };
}
