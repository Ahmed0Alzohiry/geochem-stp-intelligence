import { createSupabaseBrowserClient } from "./client";
import {
  computeWeightedValue,
  deriveStatus,
  isSystemTestOpportunity,
  summarizePipeline,
  type OpportunityRecord,
  type PipelineSummary,
} from "../crm/opportunity";
import { defaultProbabilityForStage } from "../crm/pipeline-stages";
import { getCrmStages } from "./master-data";

const PAGE_SIZE = 1000;

export type OpportunityFilters = {
  serviceId?: string;
  serviceCode?: string;
  stage?: string;
  company?: string;
  owner?: string;
};

export type CreateOpportunityInput = {
  companyId: string;
  serviceId: string;
  opportunityName: string;
  stageId: string;
  estimatedValue: number;
  expectedCloseDate: string;
  contactId?: string | null;
  notes?: string | null;
  owner?: string | null;
  source?: string | null;
  probability?: number | null;
};

export type UpdateOpportunityInput = {
  opportunityName?: string;
  stageId?: string;
  estimatedValue?: number;
  expectedCloseDate?: string | null;
  contactId?: string | null;
  notes?: string | null;
  owner?: string | null;
  probability?: number | null;
};

type OpportunityRow = {
  id: string;
  company_id: string;
  service_id: string;
  contact_id: string | null;
  opportunity_name: string;
  stage_id: string;
  status: string | null;
  estimated_value: number | string | null;
  probability: number | string | null;
  weighted_value: number | string | null;
  expected_close_date: string | null;
  owner: string | null;
  source: string | null;
  notes: string | null;
  description?: string | null;
  created_at: string;
  updated_at: string;
  companies: { company_name: string } | { company_name: string }[] | null;
  services: { name: string; service_code: string | null } | { name: string; service_code: string | null }[] | null;
  crm_stages: { name: string } | { name: string }[] | null;
  contacts: { full_name: string } | { full_name: string }[] | null;
};

function one<T>(value: T | T[] | null | undefined): T | null {
  if (!value) return null;
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

function num(value: number | string | null | undefined): number {
  if (value == null || value === "") return 0;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function mapRow(row: OpportunityRow): OpportunityRecord {
  const stage = one(row.crm_stages)?.name ?? "Lead";
  const estimatedValue = num(row.estimated_value);
  const probability = num(row.probability);
  const weighted =
    row.weighted_value == null ? computeWeightedValue(estimatedValue, probability) : num(row.weighted_value);
  const statusRaw = row.status === "Won" || row.status === "Lost" || row.status === "Open" ? row.status : deriveStatus(stage);
  return {
    id: row.id,
    companyId: row.company_id,
    companyName: one(row.companies)?.company_name ?? "Unknown company",
    serviceId: row.service_id,
    serviceName: one(row.services)?.name ?? "Unknown service",
    serviceCode: one(row.services)?.service_code ?? null,
    contactId: row.contact_id,
    contactName: one(row.contacts)?.full_name ?? null,
    opportunityName: row.opportunity_name,
    stageId: row.stage_id,
    stage,
    status: statusRaw,
    estimatedValue,
    probability,
    weightedValue: weighted,
    expectedCloseDate: row.expected_close_date,
    owner: row.owner,
    source: row.source,
    notes: row.notes ?? row.description ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

const SELECT = `
  id, company_id, service_id, contact_id, opportunity_name, stage_id, status,
  estimated_value, probability, weighted_value, expected_close_date, owner, source, notes,
  created_at, updated_at,
  companies ( company_name ),
  services ( name, service_code ),
  crm_stages ( name ),
  contacts ( full_name )
`;

const SELECT_BASE = `
  id, company_id, service_id, contact_id, opportunity_name, stage_id,
  estimated_value, probability, expected_close_date, source, description,
  created_at, updated_at,
  companies ( company_name ),
  services ( name, service_code ),
  crm_stages ( name ),
  contacts ( full_name )
`;

async function queryOpportunitySelect(select: string) {
  const supabase = createSupabaseBrowserClient();
  const rows: OpportunityRow[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const to = from + PAGE_SIZE - 1;
    const { data, error } = await supabase
      .from("opportunities")
      .select(select)
      .eq("is_demo", false)
      .order("expected_close_date", { ascending: true, nullsFirst: false })
      .range(from, to);
    if (error) return { rows: [] as OpportunityRow[], error: error.message };
    const batch = (data ?? []) as unknown as OpportunityRow[];
    rows.push(...batch);
    if (batch.length < PAGE_SIZE) break;
  }
  return { rows, error: null as string | null };
}

async function fetchOpportunityPages(): Promise<OpportunityRow[]> {
  const full = await queryOpportunitySelect(SELECT);
  if (!full.error) return full.rows;
  const base = await queryOpportunitySelect(SELECT_BASE);
  if (base.error) throw new Error(`Unable to load opportunities: ${base.error}`);
  return base.rows;
}

function matchesFilters(row: OpportunityRecord, filters: OpportunityFilters = {}): boolean {
  if (filters.serviceId && row.serviceId !== filters.serviceId) return false;
  if (filters.serviceCode && (row.serviceCode ?? "").toUpperCase() !== filters.serviceCode.toUpperCase()) return false;
  if (filters.stage && row.stage !== filters.stage) return false;
  if (filters.company) {
    const q = filters.company.trim().toLowerCase();
    if (!row.companyName.toLowerCase().includes(q)) return false;
  }
  if (filters.owner) {
    const q = filters.owner.trim().toLowerCase();
    if (!(row.owner ?? "").toLowerCase().includes(q)) return false;
  }
  return true;
}

export async function listOpportunities(filters: OpportunityFilters = {}): Promise<OpportunityRecord[]> {
  const rows = (await fetchOpportunityPages()).map(mapRow);
  return rows.filter((row) => matchesFilters(row, filters));
}

export async function getOpportunity(id: string): Promise<OpportunityRecord | null> {
  const supabase = createSupabaseBrowserClient();
  const full = await supabase.from("opportunities").select(SELECT).eq("id", id).maybeSingle();
  if (!full.error) return full.data ? mapRow(full.data as unknown as OpportunityRow) : null;
  const base = await supabase.from("opportunities").select(SELECT_BASE).eq("id", id).maybeSingle();
  if (base.error) throw new Error(`Unable to load opportunity: ${base.error.message}`);
  return base.data ? mapRow(base.data as unknown as OpportunityRow) : null;
}

export async function getCompanyOpportunities(companyId: string): Promise<OpportunityRecord[]> {
  const supabase = createSupabaseBrowserClient();
  const full = await supabase
    .from("opportunities")
    .select(SELECT)
    .eq("is_demo", false)
    .eq("company_id", companyId)
    .order("expected_close_date", { ascending: true, nullsFirst: false });
  if (!full.error) return ((full.data ?? []) as unknown as OpportunityRow[]).map(mapRow);
  const base = await supabase
    .from("opportunities")
    .select(SELECT_BASE)
    .eq("is_demo", false)
    .eq("company_id", companyId)
    .order("expected_close_date", { ascending: true, nullsFirst: false });
  if (base.error) throw new Error(`Unable to load opportunities: ${base.error.message}`);
  return ((base.data ?? []) as unknown as OpportunityRow[]).map(mapRow);
}

export async function getServiceOpportunities(serviceId: string): Promise<OpportunityRecord[]> {
  return listOpportunities({ serviceId });
}

export async function readOpportunityPipelineMetrics(): Promise<{
  readable: boolean;
  error: string | null;
  activeCount: number;
  pipelineValue: number;
  estimatedActiveValue: number;
}> {
  return readPaginatedOpportunityMetrics();
}

type PipelineMetricRow = {
  status?: string | null;
  estimated_value?: number | string | null;
  probability?: number | string | null;
  weighted_value?: number | string | null;
};

async function readPaginatedOpportunityMetrics(): Promise<{
  readable: boolean;
  error: string | null;
  activeCount: number;
  pipelineValue: number;
  estimatedActiveValue: number;
}> {
  const selects = [
    "id, status, estimated_value, probability, weighted_value",
    "id, status, estimated_value, probability",
    "id, estimated_value, probability",
    "id",
  ];
  let lastError: string | null = null;

  for (const select of selects) {
    for (const filterDemo of [true, false]) {
      const result = await queryOpportunityMetricPages(select, filterDemo);
      if (!result.error) {
        return { readable: true, error: null, ...metricsFromRows(result.rows) };
      }
      lastError = result.error;
    }
  }

  return {
    readable: false,
    error: lastError,
    activeCount: 0,
    pipelineValue: 0,
    estimatedActiveValue: 0,
  };
}

async function queryOpportunityMetricPages(select: string, filterDemo: boolean): Promise<{
  rows: PipelineMetricRow[];
  error: string | null;
}> {
  const supabase = createSupabaseBrowserClient();
  const rows: PipelineMetricRow[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const to = from + PAGE_SIZE - 1;
    let query = supabase.from("opportunities").select(select).range(from, to);
    if (filterDemo) query = query.eq("is_demo", false);
    const { data, error } = await query;
    if (error) return { rows: [], error: error.message };
    const batch = (data ?? []) as PipelineMetricRow[];
    rows.push(...batch);
    if (batch.length < PAGE_SIZE) break;
  }
  return { rows, error: null };
}

function metricsFromRows(rows: PipelineMetricRow[]): {
  activeCount: number;
  pipelineValue: number;
  estimatedActiveValue: number;
} {
  let activeCount = 0;
  let pipelineValue = 0;
  let estimatedActiveValue = 0;
  for (const row of rows) {
    const status = row.status === "Won" || row.status === "Lost" ? row.status : "Open";
    if (status === "Won" || status === "Lost") continue;
    const estimated = num(row.estimated_value);
    const probability = num(row.probability);
    const weighted =
      row.weighted_value == null ? computeWeightedValue(estimated, probability) : num(row.weighted_value);
    activeCount += 1;
    pipelineValue += weighted;
    estimatedActiveValue += estimated;
  }
  return { activeCount, pipelineValue, estimatedActiveValue };
}

export async function getPipelineSummary(filters: OpportunityFilters = {}): Promise<PipelineSummary> {
  const hasFilter = Boolean(filters.serviceId || filters.serviceCode || filters.stage || filters.company || filters.owner);
  if (!hasFilter) {
    const supabase = createSupabaseBrowserClient();
    const { count, error } = await supabase
      .from("opportunities")
      .select("id", { count: "exact", head: true })
      .eq("is_demo", false);
    if (error) throw new Error(`Unable to load opportunities: ${error.message}`);
    if ((count ?? 0) === 0) return summarizePipeline([]);
  }
  return summarizePipeline(await listOpportunities(filters));
}

function supabaseWriteError(
  action: string,
  error: { message: string; details?: string | null; hint?: string | null; code?: string | null },
) {
  return [`Unable to ${action} opportunity`, error.message, error.details, error.hint, error.code ? `code ${error.code}` : null]
    .filter((part): part is string => Boolean(part && String(part).trim()))
    .join(" — ");
}

const WRITE_RETURNING =
  "id, company_id, service_id, contact_id, opportunity_name, stage_id, estimated_value, probability, expected_close_date, source, created_at, updated_at";

export async function createOpportunity(input: CreateOpportunityInput): Promise<OpportunityRecord> {
  const name = input.opportunityName.trim();
  if (!name) throw new Error("Opportunity Name is required.");
  if (!input.companyId) throw new Error("Company is required.");
  if (!input.serviceId) throw new Error("Service is required.");
  if (!input.stageId) throw new Error("Stage is required.");
  if (!Number.isFinite(input.estimatedValue) || input.estimatedValue < 0) {
    throw new Error("Estimated Value is required.");
  }
  if (!input.expectedCloseDate) throw new Error("Expected Close Date is required.");

  let probability = input.probability;
  let status: "Open" | "Won" | "Lost" = "Open";
  if (probability == null || !Number.isFinite(probability)) {
    const stages = await getCrmStages();
    const stage = stages.find((item) => item.id === input.stageId);
    if (!stage) throw new Error("Unknown pipeline stage.");
    probability = defaultProbabilityForStage(stage.name);
    status = deriveStatus(stage.name);
  }

  const basePayload: Record<string, unknown> = {
    company_id: input.companyId,
    service_id: input.serviceId,
    opportunity_name: name,
    stage_id: input.stageId,
    estimated_value: input.estimatedValue,
    probability,
    expected_close_date: input.expectedCloseDate,
    source: input.source?.trim() || "Target Account",
    is_demo: false,
  };
  if (input.contactId) basePayload.contact_id = input.contactId;
  if (input.owner?.trim()) basePayload.owner = input.owner.trim();
  if (input.notes?.trim()) basePayload.notes = input.notes.trim();

  const payloads: Record<string, unknown>[] = [
    { ...basePayload, status },
    basePayload,
    {
      company_id: input.companyId,
      service_id: input.serviceId,
      opportunity_name: name,
      stage_id: input.stageId,
      estimated_value: input.estimatedValue,
      probability,
      expected_close_date: input.expectedCloseDate,
      is_demo: false,
    },
  ];

  const supabase = createSupabaseBrowserClient();
  let lastError = "Insert failed.";
  for (const payload of payloads) {
    const inserted = await supabase.from("opportunities").insert(payload).select(WRITE_RETURNING).single();
    if (!inserted.error && inserted.data) {
      const id = String((inserted.data as { id: string }).id);
      try {
        const full = await getOpportunity(id);
        if (full) return full;
      } catch {
        // Row was inserted; returning select embeds must not hide success.
      }
      return mapRow({
        ...(inserted.data as OpportunityRow),
        companies: null,
        services: null,
        crm_stages: null,
        contacts: null,
        status: (inserted.data as { status?: string }).status ?? status,
        notes: (inserted.data as { notes?: string | null }).notes ?? null,
        owner: (inserted.data as { owner?: string | null }).owner ?? null,
        weighted_value: null,
      });
    }
    lastError = inserted.error ? supabaseWriteError("create", inserted.error) : "Insert returned no row.";
    const retryable = /schema cache|Could not find the|PGRST204|column .* does not exist/i.test(lastError);
    if (!retryable) throw new Error(lastError);
  }
  throw new Error(lastError);
}

export async function updateOpportunity(id: string, input: UpdateOpportunityInput): Promise<OpportunityRecord> {
  if (!id) throw new Error("Opportunity is required.");
  const patch: Record<string, unknown> = {};
  if (input.opportunityName != null) {
    if (!input.opportunityName.trim()) throw new Error("Opportunity Name is required.");
    patch.opportunity_name = input.opportunityName.trim();
  }
  if (input.stageId != null) patch.stage_id = input.stageId;
  if (input.estimatedValue != null) {
    if (!Number.isFinite(input.estimatedValue) || input.estimatedValue < 0) {
      throw new Error("Estimated Value is required.");
    }
    patch.estimated_value = input.estimatedValue;
  }
  if (input.expectedCloseDate !== undefined) {
    if (input.expectedCloseDate !== null && !input.expectedCloseDate) {
      throw new Error("Expected Close Date is required.");
    }
    patch.expected_close_date = input.expectedCloseDate;
  }
  if (input.contactId !== undefined) patch.contact_id = input.contactId || null;
  if (input.notes !== undefined) patch.notes = input.notes?.trim() || null;
  if (input.owner !== undefined) patch.owner = input.owner?.trim() || null;
  if (input.probability != null) {
    if (!Number.isFinite(input.probability) || input.probability < 0 || input.probability > 100) {
      throw new Error("Probability must be between 0 and 100.");
    }
    patch.probability = input.probability;
  }

  if (input.stageId) {
    const stages = await getCrmStages();
    const stage = stages.find((item) => item.id === input.stageId);
    if (!stage) throw new Error("Unknown pipeline stage.");
    patch.status = deriveStatus(stage.name);
    if (input.probability == null) patch.probability = defaultProbabilityForStage(stage.name);
  }

  if (Object.keys(patch).length === 0) throw new Error("No opportunity changes to save.");

  const supabase = createSupabaseBrowserClient();
  const updated = await supabase.from("opportunities").update(patch).eq("id", id).select(WRITE_RETURNING).single();
  if (updated.error) {
    const nested = await supabase.from("opportunities").update(patch).eq("id", id).select(SELECT).single();
    if (nested.error) throw new Error(supabaseWriteError("update", nested.error));
    return mapRow(nested.data as unknown as OpportunityRow);
  }
  if (!updated.data) throw new Error("Unable to update opportunity: no row returned.");
  try {
    const full = await getOpportunity(id);
    if (full) return full;
  } catch {
    // Update succeeded; embed reload must not hide it.
  }
  return mapRow({
    ...(updated.data as OpportunityRow),
    companies: null,
    services: null,
    crm_stages: null,
    contacts: null,
    status: (updated.data as { status?: string }).status ?? "Open",
    notes: (updated.data as { notes?: string | null }).notes ?? null,
    owner: (updated.data as { owner?: string | null }).owner ?? null,
    weighted_value: null,
  });
}

export async function deleteSystemTestOpportunity(id: string): Promise<void> {
  if (!id) throw new Error("Opportunity is required.");
  const current = await getOpportunity(id);
  if (!current) throw new Error("Opportunity was not found.");
  if (!isSystemTestOpportunity(current)) {
    throw new Error("Only a system-test opportunity can be deleted from this app.");
  }
  const supabase = createSupabaseBrowserClient();
  const { error, count } = await supabase.from("opportunities").delete({ count: "exact" }).eq("id", id);
  if (error) throw new Error(supabaseWriteError("delete", error));
  if ((count ?? 0) < 1) {
    throw new Error("Delete was not applied. APPLY 014 IN SUPABASE SQL EDITOR, then retry.");
  }
}
