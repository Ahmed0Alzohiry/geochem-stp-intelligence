/**
 * LAB Wave-1 rollback. Deletes LAB STP rows for Wave-1 company_ids only.
 * Requires --write. Aborts if PCH !== 350, ENV !== 24, INS !== 22, PET !== 18, or OCM !== 25.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { planLabWave1Rollback } from "./lab-wave1-gates";
import { ENV_SERVICE_ID, PCH_EXPECTED_CURRENT_COUNT, PCH_SERVICE_ID } from "./env-wave1-manifest";
import { ENV_EXPECTED_CURRENT_COUNT, INS_SERVICE_ID, INS_WAVE1_EXPECTED_COUNT } from "./ins-wave1-manifest";
import { OCM_SERVICE_ID, OCM_WAVE1_EXPECTED_COUNT, PET_EXPECTED_CURRENT_COUNT } from "./ocm-wave1-manifest";
import { LAB_SERVICE_ID, LAB_WAVE1_COMPANY_IDS } from "./lab-wave1-manifest";
import { PET_SERVICE_ID } from "./pet-wave1-manifest";
import { loadEnvLocal } from "./build-pch-persist-payload";
import { SERVICE_STP_CURRENT_VIEW, SERVICE_STP_TABLE } from "./persistence-readiness";

function hasFlag(name: string): boolean {
  return process.argv.includes(name);
}

function timedClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
  if (!url || !anonKey) throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY");
  return createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      fetch: (input: RequestInfo | URL, init?: RequestInit) =>
        fetch(input, { ...init, cache: "no-store", signal: AbortSignal.timeout(60_000) }),
    },
  });
}

async function countEq(table: string, column: string, value: string) {
  const supabase = timedClient();
  const { count, error } = await supabase.from(table).select("id", { count: "exact", head: true }).eq(column, value);
  return { count: error ? null : (count ?? 0), error: error?.message ?? null };
}

async function labCurrentCompanyIds(): Promise<string[]> {
  const supabase = timedClient();
  const ids: string[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase
      .from(SERVICE_STP_CURRENT_VIEW)
      .select("company_id")
      .eq("service_id", LAB_SERVICE_ID)
      .range(from, from + 999);
    if (error) throw new Error(error.message);
    const batch = data ?? [];
    ids.push(...batch.map((row) => String(row.company_id)));
    if (batch.length < 1000) break;
  }
  return ids;
}

async function main() {
  loadEnvLocal();
  const write = hasFlag("--write");
  const pchBefore = await countEq(SERVICE_STP_CURRENT_VIEW, "service_id", PCH_SERVICE_ID);
  const envBefore = await countEq(SERVICE_STP_CURRENT_VIEW, "service_id", ENV_SERVICE_ID);
  const insBefore = await countEq(SERVICE_STP_CURRENT_VIEW, "service_id", INS_SERVICE_ID);
  const petBefore = await countEq(SERVICE_STP_CURRENT_VIEW, "service_id", PET_SERVICE_ID);
  const ocmBefore = await countEq(SERVICE_STP_CURRENT_VIEW, "service_id", OCM_SERVICE_ID);
  const labIds = await labCurrentCompanyIds();
  const plan = planLabWave1Rollback({
    pchCurrentCount: pchBefore.count,
    envCurrentCount: envBefore.count,
    insCurrentCount: insBefore.count,
    petCurrentCount: petBefore.count,
    ocmCurrentCount: ocmBefore.count,
    labCurrentCompanyIds: labIds,
  });

  let deleted = 0;
  let writeError: string | null = null;
  if (write) {
    if (!plan.ok) writeError = plan.errors.join(" | ");
    else {
      const { error, count } = await timedClient()
        .from(SERVICE_STP_TABLE)
        .delete({ count: "exact" })
        .eq("service_id", LAB_SERVICE_ID)
        .in("company_id", [...LAB_WAVE1_COMPANY_IDS]);
      if (error) writeError = error.message;
      else deleted = count ?? 0;
    }
  }

  const pchAfter = await countEq(SERVICE_STP_CURRENT_VIEW, "service_id", PCH_SERVICE_ID);
  const envAfter = await countEq(SERVICE_STP_CURRENT_VIEW, "service_id", ENV_SERVICE_ID);
  const insAfter = await countEq(SERVICE_STP_CURRENT_VIEW, "service_id", INS_SERVICE_ID);
  const petAfter = await countEq(SERVICE_STP_CURRENT_VIEW, "service_id", PET_SERVICE_ID);
  const ocmAfter = await countEq(SERVICE_STP_CURRENT_VIEW, "service_id", OCM_SERVICE_ID);
  const labAfter = await countEq(SERVICE_STP_CURRENT_VIEW, "service_id", LAB_SERVICE_ID);

  console.log(
    JSON.stringify(
      {
        step: "32.5.3-rollback-design",
        writeFlag: write,
        plan,
        deleted,
        writeError,
        pchBefore: pchBefore.count,
        envBefore: envBefore.count,
        insBefore: insBefore.count,
        petBefore: petBefore.count,
        ocmBefore: ocmBefore.count,
        pchAfter: pchAfter.count,
        envAfter: envAfter.count,
        insAfter: insAfter.count,
        petAfter: petAfter.count,
        ocmAfter: ocmAfter.count,
        labAfter: labAfter.count,
        protected:
          pchAfter.count === PCH_EXPECTED_CURRENT_COUNT &&
          envAfter.count === ENV_EXPECTED_CURRENT_COUNT &&
          insAfter.count === INS_WAVE1_EXPECTED_COUNT &&
          petAfter.count === PET_EXPECTED_CURRENT_COUNT &&
          ocmAfter.count === OCM_WAVE1_EXPECTED_COUNT,
      },
      null,
      2,
    ),
  );
  if (!plan.ok || writeError) process.exitCode = 1;
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
