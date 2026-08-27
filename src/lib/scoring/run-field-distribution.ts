import { createSupabaseBrowserClient } from "../supabase/client";

const PAGE = 1000;

async function fetchAllCompanies() {
  const supabase = createSupabaseBrowserClient();
  const fields =
    "company_name, industry, subsector, customer_type, city, industrial_city, business_description, main_activities, company_size, verification_status, data_completeness_status, source_reliability, source_tier, record_type, dataset_status";

  const { count, error: countError } = await supabase
    .from("companies")
    .select("id", { count: "exact", head: true });
  if (countError) {
    throw new Error(countError.message);
  }

  const total = count ?? 0;
  const rows: Record<string, unknown>[] = [];
  for (let from = 0; from < total; from += PAGE) {
    const to = Math.min(from + PAGE - 1, total - 1);
    const { data, error } = await supabase.from("companies").select(fields).range(from, to);
    if (error) {
      throw new Error(error.message);
    }
    rows.push(...(data ?? []));
  }
  return rows;
}

function tally(rows: Record<string, unknown>[], field: string) {
  const map = new Map<string, number>();
  for (const row of rows) {
    const raw = row[field];
    const key = typeof raw === "string" && raw.trim() ? raw.trim() : "(null/blank)";
    map.set(key, (map.get(key) ?? 0) + 1);
  }
  return [...map.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([name, value]) => ({ name, value }));
}

async function main() {
  const supabase = createSupabaseBrowserClient();
  const [{ data: services, error: servicesError }, rows] = await Promise.all([
    supabase.from("services").select("name, service_code, description, active").eq("active", true).order("name"),
    fetchAllCompanies(),
  ]);
  if (servicesError) {
    throw new Error(servicesError.message);
  }

  const fields = [
    "industry",
    "subsector",
    "customer_type",
    "city",
    "industrial_city",
    "business_description",
    "main_activities",
    "company_size",
    "verification_status",
    "data_completeness_status",
    "source_reliability",
    "source_tier",
    "record_type",
    "dataset_status",
  ];

  const report: Record<string, unknown> = {
    rowCount: rows.length,
    services: services ?? [],
    distributions: Object.fromEntries(fields.map((field) => [field, tally(rows, field)])),
  };
  console.log(JSON.stringify(report, null, 2));
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
