/**
 * STEP 6.6 read-only verification of company_service_stp_scores.
 * SELECT only. Does not persist scores or modify companies / company_locations.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createSupabaseBrowserClient } from "../supabase/client";
import { SERVICE_STP_CURRENT_VIEW, SERVICE_STP_TABLE } from "./persistence-readiness";

const REQUIRED_COLUMNS = [
  "id",
  "company_id",
  "service_id",
  "account_group_key",
  "entity_type",
  "is_account_group_representative",
  "is_current",
  "eligibility",
  "eligibility_reason",
  "commercial_score",
  "known_weight_total",
  "ranking_eligible",
  "tier",
  "industry_fit",
  "application_fit",
  "service_need_fit",
  "commercial_potential",
  "customer_type_fit",
  "geographic_fit",
  "strategic_fit",
  "data_confidence_score",
  "data_confidence_band",
  "data_confidence_explanation",
  "positioning_statement",
  "targeting_reason",
  "recommended_contact_roles",
  "recommended_departments",
  "dimension_snapshot",
  "scoring_model_version",
  "scored_at",
  "created_at",
  "updated_at",
] as const;

const EXPECTED_INDEXES = [
  "company_service_stp_current_company_service_uidx",
  "company_service_stp_current_group_service_uidx",
  "company_service_stp_service_id_idx",
  "company_service_stp_company_id_idx",
  "company_service_stp_account_group_idx",
  "company_service_stp_tier_idx",
  "company_service_stp_scored_at_idx",
] as const;

function loadEnvLocal() {
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

function passFail(ok: boolean): "PASS" | "FAIL" {
  return ok ? "PASS" : "FAIL";
}

async function countTable(table: string, idCol = "id") {
  const supabase = createSupabaseBrowserClient();
  const { count, error } = await supabase.from(table).select(idCol, { count: "exact", head: true });
  return {
    table,
    count: error ? null : (count ?? 0),
    error: error ? `${error.code ?? ""} ${error.message}`.trim() : null,
  };
}

async function columnProbe(table: string, column: string) {
  const supabase = createSupabaseBrowserClient();
  const { error } = await supabase.from(table).select(column).limit(1);
  return { column, ok: !error, error: error ? `${error.code ?? ""} ${error.message}`.trim() : null };
}

async function fetchOpenApi() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
  if (!url || !key) throw new Error("Supabase public env is missing.");
  const response = await fetch(`${url}/rest/v1/`, {
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      Accept: "application/openapi+json",
    },
  });
  if (!response.ok) {
    return { ok: false as const, status: response.status, definition: null, path: null, error: await response.text() };
  }
  const spec = (await response.json()) as {
    definitions?: Record<string, { properties?: Record<string, { description?: string; type?: string }>; description?: string }>;
    components?: { schemas?: Record<string, { properties?: Record<string, { description?: string; type?: string }>; description?: string }> };
    paths?: Record<string, Record<string, unknown>>;
  };
  const definition = spec.definitions?.[SERVICE_STP_TABLE] ?? spec.components?.schemas?.[SERVICE_STP_TABLE] ?? null;
  const path = spec.paths?.[`/${SERVICE_STP_TABLE}`] ?? null;
  return { ok: true as const, status: response.status, definition, path, error: null };
}

function fkToServices(description: string | undefined): boolean {
  if (!description) return false;
  return /foreign key to [`']?services\.id/i.test(description) || /public\.services/i.test(description);
}

function collectIndexHints(description: string | undefined, propertyDescriptions: string[]): string[] {
  const blob = [description, ...propertyDescriptions].filter(Boolean).join("\n");
  return EXPECTED_INDEXES.filter((name) => blob.includes(name));
}

async function main() {
  loadEnvLocal();
  const supabase = createSupabaseBrowserClient();

  const columnResults: Array<{ column: string; ok: boolean; error: string | null }> = [];
  for (const column of REQUIRED_COLUMNS) {
    columnResults.push(await columnProbe(SERVICE_STP_TABLE, column));
  }
  const missingColumns = columnResults.filter((row) => !row.ok).map((row) => row.column);
  const tableProbe = await supabase.from(SERVICE_STP_TABLE).select(REQUIRED_COLUMNS.join(", ")).limit(1);
  const embedServices = await supabase.from(SERVICE_STP_TABLE).select("service_id, services(id, service_code)").limit(1);
  const embedCompanies = await supabase.from(SERVICE_STP_TABLE).select("company_id, companies(id)").limit(1);
  const viewProbe = await supabase.from(SERVICE_STP_CURRENT_VIEW).select("id, company_id, service_id, account_group_key, commercial_score, tier").limit(1);

  const counts = {
    stp: await countTable(SERVICE_STP_TABLE),
    stpCurrent: await countTable(SERVICE_STP_CURRENT_VIEW),
    companies: await countTable("companies"),
    locations: await countTable("company_locations"),
    scores: await countTable("company_scores"),
    snapshots: await countTable("company_target_snapshots"),
    entityResolution: await countTable("company_entity_resolution", "company_id"),
  };

  const openApi = await fetchOpenApi();
  const properties = openApi.definition?.properties ?? {};
  const propertyNames = Object.keys(properties);
  const serviceIdDescription = properties.service_id?.description;
  const companyIdDescription = properties.company_id?.description;
  const tableDescription = openApi.definition?.description ?? "";
  const indexHints = collectIndexHints(
    tableDescription,
    Object.values(properties).map((item) => item.description ?? ""),
  );
  const pathMethods = openApi.path ? Object.keys(openApi.path).map((method) => method.toLowerCase()) : [];
  const insertExposed = pathMethods.includes("post") || pathMethods.includes("patch") || pathMethods.includes("delete");

  const checks = {
    tableExists: !tableProbe.error,
    requiredColumns: missingColumns.length === 0,
    serviceIdFk: fkToServices(serviceIdDescription) || fkToServices(tableDescription) || !embedServices.error,
    companyIdFk: /foreign key to [`']?companies\.id/i.test(companyIdDescription ?? "") || !embedCompanies.error,
    accountGroupKey: columnResults.some((row) => row.column === "account_group_key" && row.ok),
    commercialScore: columnResults.some((row) => row.column === "commercial_score" && row.ok),
    tier: columnResults.some((row) => row.column === "tier" && row.ok),
    eligibility: columnResults.some((row) => row.column === "eligibility" && row.ok),
    dimensions: ["industry_fit", "application_fit", "service_need_fit", "commercial_potential", "geographic_fit", "strategic_fit"].every(
      (column) => columnResults.some((row) => row.column === column && row.ok),
    ),
    dataConfidenceSeparate:
      columnResults.some((row) => row.column === "data_confidence_score" && row.ok) &&
      columnResults.some((row) => row.column === "data_confidence_band" && row.ok) &&
      columnResults.some((row) => row.column === "commercial_score" && row.ok),
    positioning: columnResults.some((row) => row.column === "positioning_statement" && row.ok),
    whyTarget: columnResults.some((row) => row.column === "targeting_reason" && row.ok),
    contactRoles: columnResults.some((row) => row.column === "recommended_contact_roles" && row.ok),
    modelVersion: columnResults.some((row) => row.column === "scoring_model_version" && row.ok),
    scoredAt: columnResults.some((row) => row.column === "scored_at" && row.ok),
    viewExists: !viewProbe.error,
    empty: counts.stp.count === 0,
    v1ScoresEmpty: counts.scores.count === 0 && counts.snapshots.count === 0,
    companiesUnchangedCount: counts.companies.count === 1769,
    locationsUnchangedCount: counts.locations.count === 8,
    insertNotAttempted: true,
    insertNotExposed: !insertExposed,
  };

  const uniquenessColumnsPresent =
    checks.accountGroupKey &&
    columnResults.some((row) => row.column === "is_current" && row.ok) &&
    columnResults.some((row) => row.column === "is_account_group_representative" && row.ok) &&
    columnResults.some((row) => row.column === "company_id" && row.ok) &&
    columnResults.some((row) => row.column === "service_id" && row.ok);

  const uniquenessLive = uniquenessColumnsPresent && checks.tableExists;

  console.log(
    JSON.stringify(
      {
        persisted: false,
        databaseWrites: 0,
        pchScoresWritten: 0,
        table: SERVICE_STP_TABLE,
        view: SERVICE_STP_CURRENT_VIEW,
        counts,
        missingColumns,
        tableProbeError: tableProbe.error ? `${tableProbe.error.code ?? ""} ${tableProbe.error.message}`.trim() : null,
        embedServicesError: embedServices.error ? `${embedServices.error.code ?? ""} ${embedServices.error.message}`.trim() : null,
        embedCompaniesError: embedCompanies.error ? `${embedCompanies.error.code ?? ""} ${embedCompanies.error.message}`.trim() : null,
        viewProbeError: viewProbe.error ? `${viewProbe.error.code ?? ""} ${viewProbe.error.message}`.trim() : null,
        openApi: {
          ok: openApi.ok,
          status: openApi.status,
          propertyCount: propertyNames.length,
          properties: propertyNames,
          serviceIdDescription: serviceIdDescription ?? null,
          companyIdDescription: companyIdDescription ?? null,
          tableDescription: tableDescription || null,
          pathMethods,
          insertExposed,
          indexHints,
          expectedIndexes: EXPECTED_INDEXES,
        },
        checks,
        uniquenessLive,
        uniquenessNote:
          "Partial unique indexes are not enumerable via the anon Data API. Verification uses: table present, uniqueness columns present (company_id, service_id, account_group_key, is_current, is_account_group_representative), and 007 was applied as one script that creates those indexes.",
        report: {
          SERVICE_SPECIFIC_STP_TABLE: passFail(checks.tableExists && checks.requiredColumns),
          SERVICE_ID_FK: passFail(checks.serviceIdFk),
          ACCOUNT_GROUP_SUPPORT: passFail(checks.accountGroupKey && checks.viewExists),
          UNIQUENESS: passFail(uniquenessLive),
          SCORING_DIMENSIONS_STORAGE: passFail(checks.dimensions && checks.eligibility && checks.commercialScore && checks.tier),
          POSITIONING_STORAGE: passFail(checks.positioning && checks.whyTarget),
          CONTACT_ROLE_STORAGE: passFail(checks.contactRoles),
          TABLE_ROW_COUNT: counts.stp.count,
        },
      },
      null,
      2,
    ),
  );
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
