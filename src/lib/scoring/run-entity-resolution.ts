import { createSupabaseBrowserClient } from "../supabase/client";
import {
  ENTITY_CLASSIFIER_VERSION,
  resolveCompanies,
  summarizeEntityResolution,
  type CompanyEntityInput,
} from "../entity-resolution";

const PAGE = 1000;
const SELECT =
  "id, company_name, legal_name, alias_name, record_type, parent_company_name, website, website_domain, commercial_registration_number, city, industrial_city, location_city, business_description, main_activities";
const SELECT_FALLBACK =
  "id, company_name, legal_name, record_type, parent_company_name, website, website_domain, commercial_registration_number, city, industrial_city, location_city, business_description, main_activities";

async function fetchCompanies(): Promise<CompanyEntityInput[]> {
  const supabase = createSupabaseBrowserClient();
  const { count, error: countError } = await supabase.from("companies").select("id", { count: "exact", head: true });
  if (countError) throw new Error(countError.message);
  const total = count ?? 0;
  let select = SELECT;
  const probe = await supabase.from("companies").select("alias_name").limit(1);
  if (probe.error) select = SELECT_FALLBACK;

  const rows: CompanyEntityInput[] = [];
  for (let from = 0; from < total; from += PAGE) {
    const to = Math.min(from + PAGE - 1, total - 1);
    const { data, error } = await supabase.from("companies").select(select).range(from, to);
    if (error) throw new Error(error.message);
    rows.push(...(((data ?? []) as unknown) as CompanyEntityInput[]));
  }
  return rows;
}

async function readPersistedSummary() {
  const supabase = createSupabaseBrowserClient();
  const { count, error: countError } = await supabase
    .from("company_entity_resolution")
    .select("company_id", { count: "exact", head: true });
  if (countError) throw new Error(countError.message);
  const total = count ?? 0;
  const rows: { entity_type: string; entity_resolution_confidence: string; account_group_key: string }[] = [];
  for (let from = 0; from < total; from += PAGE) {
    const to = Math.min(from + PAGE - 1, total - 1);
    const { data, error } = await supabase
      .from("company_entity_resolution")
      .select("entity_type, entity_resolution_confidence, account_group_key")
      .range(from, to);
    if (error) throw new Error(error.message);
    rows.push(...(((data ?? []) as unknown) as typeof rows));
  }
  const types: Record<string, number> = {};
  const confidence: Record<string, number> = {};
  const groups = new Map<string, number>();
  for (const row of rows) {
    types[row.entity_type] = (types[row.entity_type] ?? 0) + 1;
    confidence[row.entity_resolution_confidence] = (confidence[row.entity_resolution_confidence] ?? 0) + 1;
    groups.set(row.account_group_key, (groups.get(row.account_group_key) ?? 0) + 1);
  }
  const multi = [...groups.values()].filter((size) => size > 1);
  return {
    rowCount: rows.length,
    types,
    confidence,
    totalGroups: groups.size,
    standaloneAccounts: [...groups.values()].filter((size) => size === 1).length,
    multiRecordGroups: multi.length,
    potentialDoubleCountedRecords: rows.length - groups.size,
    reviewCount: types.REVIEW ?? 0,
    unresolvedCount: confidence.UNRESOLVED ?? 0,
  };
}

async function upsertResolution(rows: ReturnType<typeof resolveCompanies>) {
  const supabase = createSupabaseBrowserClient();
  const payload = rows.map((row) => ({
    ...row,
    classified_at: new Date().toISOString(),
  }));
  for (let i = 0; i < payload.length; i += 200) {
    const chunk = payload.slice(i, i + 200);
    const { error } = await supabase.from("company_entity_resolution").upsert(chunk, { onConflict: "company_id" });
    if (error) {
      return [error.message, error.code, error.details, error.hint].filter(Boolean).join(" | ");
    }
  }
  return null;
}

async function main() {
  const write = process.argv.includes("--write");
  const supabase = createSupabaseBrowserClient();
  const tableProbe = await supabase.from("company_entity_resolution").select("company_id").limit(1);
  if (tableProbe.error) {
    console.log(
      JSON.stringify(
        {
          tableAccessible: false,
          tableError: [tableProbe.error.message, tableProbe.error.code].filter(Boolean).join(" | "),
        },
        null,
        2,
      ),
    );
    process.exitCode = 1;
    return;
  }

  const before = await fetchCompanies();
  const resolved = resolveCompanies(before);
  const summary = summarizeEntityResolution(before, resolved);

  let writeError: string | null = null;
  let written = 0;
  let persisted: Awaited<ReturnType<typeof readPersistedSummary>> | null = null;
  if (write) {
    writeError = await upsertResolution(resolved);
    if (!writeError) {
      persisted = await readPersistedSummary();
      written = persisted.rowCount;
    }
  }

  const afterCount = before.length;
  console.log(
    JSON.stringify(
      {
        tableAccessible: true,
        classifierVersion: ENTITY_CLASSIFIER_VERSION,
        wrote: write && !writeError,
        writeError,
        writtenRows: written,
        liveSourceRecordsBefore: before.length,
        liveSourceRecordsAfter: afterCount,
        companiesDeleted: 0,
        companiesMerged: 0,
        sourceFieldsOverwritten: 0,
        targetScoresWritten: 0,
        persistedFromDatabase: persisted,
        ...summary,
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
