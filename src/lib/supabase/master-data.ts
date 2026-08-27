import { createSupabaseBrowserClient } from "./client";
import { defaultProbabilityForStage } from "@/lib/crm/pipeline-stages";

export type IndustryRecord = {
  id: string;
  name: string;
  description: string | null;
  active: boolean;
};

export type CustomerTypeRecord = {
  id: string;
  name: string;
  description: string | null;
  active: boolean;
};

export type RegionRecord = {
  id: string;
  name: string;
  country: string;
  industrial_cluster: string | null;
  active: boolean;
};

export type DepartmentRecord = {
  id: string;
  name: string;
  description: string | null;
  active: boolean;
};

export type ServiceRecord = {
  id: string;
  name: string;
  service_code: string | null;
  description: string | null;
  active: boolean;
};

export type CrmStageRecord = {
  id: string;
  name: string;
  display_order: number;
  active: boolean;
  default_probability: number;
};

export type ScoringCriterionRecord = {
  id: string;
  name: string;
  description: string | null;
  weight: number;
  active: boolean;
  scoring_direction: string;
  model_version: string;
};

export type ScoringSettingsRecord = {
  id: string;
  model_name: string;
  model_version: string;
  tier1_min: number;
  tier2_min: number;
  tier3_min: number;
  active: boolean;
  notes: string | null;
};

class MasterDataError extends Error {
  constructor(table: string, message: string) {
    super(`Unable to load ${table} from Supabase: ${message}`);
    this.name = "MasterDataError";
  }
}

async function readRows<T>(
  table: string,
  query: PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
): Promise<T[]> {
  const { data, error } = await query;
  if (error) {
    throw new MasterDataError(table, error.message);
  }
  return data ?? [];
}

export async function getIndustries(): Promise<IndustryRecord[]> {
  const supabase = createSupabaseBrowserClient();
  return readRows(
    "industries",
    supabase.from("industries").select("id, name, description, active").eq("active", true).order("name"),
  );
}

export async function getCustomerTypes(): Promise<CustomerTypeRecord[]> {
  const supabase = createSupabaseBrowserClient();
  return readRows(
    "customer_types",
    supabase.from("customer_types").select("id, name, description, active").eq("active", true).order("name"),
  );
}

export async function getRegions(): Promise<RegionRecord[]> {
  const supabase = createSupabaseBrowserClient();
  return readRows(
    "regions",
    supabase.from("regions").select("id, name, country, industrial_cluster, active").eq("active", true).order("name"),
  );
}

export async function getDepartments(): Promise<DepartmentRecord[]> {
  const supabase = createSupabaseBrowserClient();
  return readRows(
    "departments",
    supabase.from("departments").select("id, name, description, active").eq("active", true).order("name"),
  );
}

export async function getServices(): Promise<ServiceRecord[]> {
  const supabase = createSupabaseBrowserClient();
  return readRows(
    "services",
    supabase.from("services").select("id, name, service_code, description, active").eq("active", true).order("name"),
  );
}

export async function getCrmStages(): Promise<CrmStageRecord[]> {
  const supabase = createSupabaseBrowserClient();
  type StageRow = {
    id: string;
    name: string;
    display_order: number;
    active: boolean;
    default_probability?: number | null;
  };

  let rows: StageRow[];
  try {
    rows = await readRows<StageRow>(
      "crm_stages",
      supabase
        .from("crm_stages")
        .select("id, name, display_order, active, default_probability")
        .eq("active", true)
        .order("display_order"),
    );
  } catch {
    rows = await readRows<StageRow>(
      "crm_stages",
      supabase
        .from("crm_stages")
        .select("id, name, display_order, active")
        .eq("active", true)
        .order("display_order"),
    );
  }

  return rows.map((row) => {
    const stored = Number(row.default_probability);
    const stageName = row.name === "Prospect" ? "Lead" : row.name;
    return {
      id: row.id,
      name: row.name,
      display_order: row.display_order,
      active: row.active,
      default_probability: Number.isFinite(stored) ? stored : defaultProbabilityForStage(stageName),
    };
  });
}

export async function getScoringCriteria(): Promise<ScoringCriterionRecord[]> {
  const supabase = createSupabaseBrowserClient();
  const rows = await readRows<ScoringCriterionRecord>(
    "scoring_criteria",
    supabase
      .from("scoring_criteria")
      .select("id, name, description, weight, active, scoring_direction, model_version")
      .eq("active", true)
      .order("created_at"),
  );
  return rows.map((row) => ({ ...row, weight: Number(row.weight) }));
}

export async function getScoringSettings(): Promise<ScoringSettingsRecord> {
  const supabase = createSupabaseBrowserClient();
  const { data, error } = await supabase
    .from("scoring_settings")
    .select("id, model_name, model_version, tier1_min, tier2_min, tier3_min, active, notes")
    .eq("active", true)
    .maybeSingle();

  if (error) {
    throw new MasterDataError("scoring_settings", error.message);
  }
  if (!data) {
    throw new MasterDataError("scoring_settings", "No active scoring model is configured.");
  }
  const settings = data as ScoringSettingsRecord;
  return {
    ...settings,
    tier1_min: Number(settings.tier1_min),
    tier2_min: Number(settings.tier2_min),
    tier3_min: Number(settings.tier3_min),
  };
}

export async function getMasterCatalog() {
  const [industries, customerTypes, regions, departments, services, crmStages, scoringCriteria, scoringSettings] =
    await Promise.all([
      getIndustries(),
      getCustomerTypes(),
      getRegions(),
      getDepartments(),
      getServices(),
      getCrmStages(),
      getScoringCriteria(),
      getScoringSettings(),
    ]);

  return {
    industries,
    customerTypes,
    regions,
    departments,
    services,
    crmStages,
    scoringCriteria,
    scoringSettings,
  };
}
