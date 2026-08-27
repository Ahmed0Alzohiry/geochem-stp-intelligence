import { createSupabaseBrowserClient } from "./client";

const TABLE = "company_import_staging";

const EXPECTED_COLUMNS = [
  "id",
  "batch_id",
  "source_row",
  "raw_name",
  "legal_name",
  "name_ar",
  "alias_name",
  "normalized_name",
  "website",
  "website_domain",
  "commercial_registration_number",
  "industry_name",
  "subsector",
  "customer_type_name",
  "region_name",
  "city",
  "industrial_city",
  "parent_company_name",
  "business_description",
  "main_activities",
  "location_type",
  "location_city",
  "source_url",
  "source_type",
  "source_reliability",
  "source_tier",
  "verification_status",
  "last_verified_at",
  "data_completeness_status",
  "is_demo",
  "researcher_notes",
  "dedup_status",
  "matched_company_id",
  "import_decision",
  "reviewer_notes",
  "reviewed_at",
  "promoted_at",
  "created_at",
  "updated_at",
] as const;

function isRlsBlocked(code: string | undefined, message: string) {
  return (
    code === "42501" ||
    /row-level security|permission denied|rls/i.test(message)
  );
}

function tableMissing(code: string | undefined, message: string) {
  return (
    code === "PGRST205" ||
    code === "42P01" ||
    /could not find the table|relation .* does not exist|schema cache/i.test(message)
  );
}

async function fetchOpenApiColumns(): Promise<string[] | null> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
  if (!url || !anonKey) {
    return null;
  }

  const response = await fetch(`${url}/rest/v1/`, {
    headers: {
      apikey: anonKey,
      Authorization: `Bearer ${anonKey}`,
      Accept: "application/openapi+json",
    },
    signal: AbortSignal.timeout(20000),
  });

  if (!response.ok) {
    return null;
  }

  const spec = (await response.json()) as {
    definitions?: Record<string, { properties?: Record<string, unknown> }>;
    components?: { schemas?: Record<string, { properties?: Record<string, unknown> }> };
  };

  const properties =
    spec.definitions?.[TABLE]?.properties ??
    spec.components?.schemas?.[TABLE]?.properties ??
    spec.definitions?.[TABLE]?.properties;

  if (!properties) {
    return null;
  }

  return Object.keys(properties).sort();
}

async function main() {
  const supabase = createSupabaseBrowserClient();
  const selectList = EXPECTED_COLUMNS.join(", ");

  const { data, error, count } = await supabase
    .from(TABLE)
    .select(selectList, { count: "exact", head: false })
    .limit(1)
    .abortSignal(AbortSignal.timeout(20000));

  const openApiColumns = await fetchOpenApiColumns();

  if (error) {
    const message = error.message;
    const rlsBlocked = isRlsBlocked(error.code, message);
    const exists = !tableMissing(error.code, message);

    console.log(
      JSON.stringify(
        {
          tableExists: exists,
          tableName: TABLE,
          rowCount: null,
          rlsBlocked,
          readOk: false,
          error: message,
          errorCode: error.code,
          expectedColumns: EXPECTED_COLUMNS,
          observedColumns: openApiColumns,
          missingColumns: openApiColumns
            ? EXPECTED_COLUMNS.filter((column) => !openApiColumns.includes(column))
            : exists
              ? []
              : EXPECTED_COLUMNS,
        },
        null,
        2,
      ),
    );
    process.exitCode = exists && rlsBlocked ? 0 : 2;
    return;
  }

  const observed = openApiColumns ?? [...EXPECTED_COLUMNS];
  const missing = EXPECTED_COLUMNS.filter((column) => !observed.includes(column));

  console.log(
    JSON.stringify(
      {
        tableExists: true,
        tableName: TABLE,
        rowCount: count ?? (data ?? []).length,
        rlsBlocked: false,
        readOk: true,
        error: null,
        expectedColumns: EXPECTED_COLUMNS,
        observedColumns: observed,
        missingColumns: missing,
        sampleRowKeys: data?.[0] ? Object.keys(data[0]) : [],
      },
      null,
      2,
    ),
  );
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : "Unknown staging check error";
  console.log(JSON.stringify({ tableExists: false, tableName: TABLE, error: message }));
  process.exitCode = 1;
});
