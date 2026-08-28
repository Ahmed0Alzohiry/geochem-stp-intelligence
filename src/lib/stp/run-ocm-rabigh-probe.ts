/**
 * SELECT-only Petro Rabigh grouping probe for OCM 32.4.3. No writes.
 */
import { createClient } from "@supabase/supabase-js";
import { loadEnvLocal } from "./build-pch-persist-payload";

const POLYMER = "bcb70c34-0c5e-4316-8f64-d4e3fb1d45fe";
const REFINING = "5f42dbe1-4a16-4657-8627-1c49d4ddca84";

async function main() {
  loadEnvLocal();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
  if (!url || !anonKey) throw new Error("missing env");
  const supabase = createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      fetch: (input: RequestInfo | URL, init?: RequestInit) =>
        fetch(input, { ...init, cache: "no-store", signal: AbortSignal.timeout(25_000) }),
    },
  });
  const ids = [POLYMER, REFINING];
  const { data: companies, error: cErr } = await supabase
    .from("companies")
    .select("id, company_name, industry, subsector, customer_type, parent_company_name, account_status, city")
    .in("id", ids);
  if (cErr) throw new Error(cErr.message);
  const { data: entities, error: eErr } = await supabase
    .from("company_entity_resolution")
    .select("company_id, entity_type, account_group_key")
    .in("company_id", ids);
  if (eErr) throw new Error(eErr.message);
  const { data: locations, error: lErr } = await supabase
    .from("company_locations")
    .select("company_id, city, confidence")
    .in("company_id", ids);
  if (lErr) throw new Error(lErr.message);
  console.log(
    JSON.stringify(
      {
        companies,
        entities,
        locations,
        sameGroup: entities?.[0]?.account_group_key === entities?.[1]?.account_group_key,
      },
      null,
      2,
    ),
  );
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
