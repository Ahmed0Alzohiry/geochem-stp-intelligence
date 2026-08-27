import { createSupabaseBrowserClient } from "../supabase/client";
import { matchBatch, emptyUniverse } from "./matcher";
import { parseCsv } from "./csv";
import { toStagingRow } from "./staging-map";
import { validateCsvRecords } from "./validate";
import type { DryRunMatch, LoadResult, MatchUniverse, StagingUpsertRow } from "./types";

export type StagingPipelineResult = {
  load: LoadResult;
  matches: DryRunMatch[];
  stagingRows: StagingUpsertRow[];
  wroteStaging: boolean;
  writeError: string | null;
};

export async function loadProductionUniverse(): Promise<MatchUniverse> {
  const supabase = createSupabaseBrowserClient();

  const [companiesResult, aliasesResult, locationsResult] = await Promise.all([
    supabase
      .from("companies")
      .select(
        "id, company_name, legal_name, normalized_name, website_domain, commercial_registration_number, parent_company_name, city",
      )
      .abortSignal(AbortSignal.timeout(20000)),
    supabase
      .from("company_aliases")
      .select("company_id, normalized_alias")
      .abortSignal(AbortSignal.timeout(20000)),
    supabase
      .from("company_locations")
      .select("company_id, city, industrial_city, location_type")
      .abortSignal(AbortSignal.timeout(20000)),
  ]);

  if (companiesResult.error) {
    throw new Error(`Read companies failed: ${companiesResult.error.message}`);
  }
  if (aliasesResult.error) {
    throw new Error(`Read company_aliases failed: ${aliasesResult.error.message}`);
  }
  if (locationsResult.error) {
    throw new Error(`Read company_locations failed: ${locationsResult.error.message}`);
  }

  return {
    companies: (companiesResult.data ?? []).map((company) => ({
      id: company.id as string,
      origin: "production" as const,
      companyName: company.company_name as string,
      legalName: (company.legal_name as string | null) ?? null,
      normalizedName: (company.normalized_name as string | null) ?? null,
      websiteDomain: (company.website_domain as string | null) ?? null,
      commercialRegistrationNumber:
        (company.commercial_registration_number as string | null) ?? null,
      parentCompanyName: (company.parent_company_name as string | null) ?? null,
      city: (company.city as string | null) ?? null,
    })),
    aliases: (aliasesResult.data ?? []).map((alias) => ({
      companyId: alias.company_id as string,
      normalizedAlias: alias.normalized_alias as string,
    })),
    locations: (locationsResult.data ?? []).map((location) => ({
      companyId: location.company_id as string,
      city: location.city as string,
      industrialCity: (location.industrial_city as string | null) ?? null,
      locationType: location.location_type as string,
    })),
  };
}

export async function writeStagingRows(rows: StagingUpsertRow[]): Promise<void> {
  if (rows.length === 0) {
    return;
  }
  const supabase = createSupabaseBrowserClient();
  const { error } = await supabase.from("company_import_staging").upsert(rows, {
    onConflict: "batch_id,source_row",
  });
  if (error) {
    throw new Error(`Staging upsert failed: ${error.message}`);
  }
}

export async function runStagingPipeline(options: {
  csvText: string;
  production?: MatchUniverse;
  writeStaging?: boolean;
}): Promise<StagingPipelineResult> {
  const { records } = parseCsv(options.csvText);
  const load = validateCsvRecords(records);
  const production = options.production ?? emptyUniverse();
  const matches = matchBatch(load.accepted, production);
  const stagingRows = matches.map(toStagingRow);

  let wroteStaging = false;
  let writeError: string | null = null;

  if (options.writeStaging) {
    try {
      await writeStagingRows(stagingRows);
      wroteStaging = true;
    } catch (error) {
      writeError = error instanceof Error ? error.message : "Unknown staging write error";
    }
  }

  return { load, matches, stagingRows, wroteStaging, writeError };
}
