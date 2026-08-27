/**
 * STEP 5.23 read-only catalog/row-count probe. No writes.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createSupabaseBrowserClient } from "../supabase/client";

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

async function countTable(table: string) {
  const supabase = createSupabaseBrowserClient();
  const { count, error } = await supabase.from(table).select("*", { count: "exact", head: true });
  return { table, count: error ? null : (count ?? 0), error: error ? `${error.code ?? ""} ${error.message}` : null };
}

async function sample(table: string, fields: string, limit = 20) {
  const supabase = createSupabaseBrowserClient();
  const { data, error } = await supabase.from(table).select(fields).limit(limit);
  return { table, rows: data ?? [], error: error?.message ?? null };
}

async function main() {
  loadEnvLocal();
  const tables = [
    "companies",
    "company_locations",
    "company_entity_resolution",
    "industries",
    "customer_types",
    "regions",
    "services",
    "company_services",
    "departments",
    "contacts",
    "crm_stages",
    "opportunities",
    "activities",
    "scoring_criteria",
    "scoring_settings",
    "company_scores",
    "company_target_snapshots",
  ];
  const counts = [];
  for (const table of tables) counts.push(await countTable(table));
  const services = await sample("services", "name, service_code, active");
  const criteria = await sample("scoring_criteria", "name, weight, active, model_version");
  const settings = await sample("scoring_settings", "model_name, model_version, active, tier1_min, tier2_min, tier3_min");
  const locConf = await sample("company_locations", "confidence, city");
  console.log(JSON.stringify({ counts, services, criteria, settings, locConf }, null, 2));
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
