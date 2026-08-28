/**
 * INS Wave-1 rollback. Deletes INS STP rows for Wave-1 company_ids only.
 * Requires --write. Aborts if PCH !== 350 or ENV !== 24 before or after.
 */
import { createSupabaseBrowserClient } from "../supabase/client";
import { planInsWave1Rollback } from "./ins-wave1-gates";
import { ENV_SERVICE_ID, PCH_EXPECTED_CURRENT_COUNT, PCH_SERVICE_ID } from "./env-wave1-manifest";
import { ENV_EXPECTED_CURRENT_COUNT, INS_SERVICE_ID, INS_WAVE1_COMPANY_IDS } from "./ins-wave1-manifest";
import { loadEnvLocal } from "./build-pch-persist-payload";
import { SERVICE_STP_CURRENT_VIEW, SERVICE_STP_TABLE } from "./persistence-readiness";

function hasFlag(name: string): boolean {
  return process.argv.includes(name);
}

async function countEq(table: string, column: string, value: string) {
  const supabase = createSupabaseBrowserClient();
  const { count, error } = await supabase.from(table).select("id", { count: "exact", head: true }).eq(column, value);
  return { count: error ? null : (count ?? 0), error: error?.message ?? null };
}

async function insCurrentCompanyIds(): Promise<string[]> {
  const supabase = createSupabaseBrowserClient();
  const ids: string[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase
      .from(SERVICE_STP_CURRENT_VIEW)
      .select("company_id")
      .eq("service_id", INS_SERVICE_ID)
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
  const insIds = await insCurrentCompanyIds();
  const plan = planInsWave1Rollback({
    pchCurrentCount: pchBefore.count,
    envCurrentCount: envBefore.count,
    insCurrentCompanyIds: insIds,
  });

  let deleted = 0;
  let writeError: string | null = null;
  if (write) {
    if (!plan.ok) {
      writeError = plan.errors.join(" | ");
    } else {
      const { error, count } = await createSupabaseBrowserClient()
        .from(SERVICE_STP_TABLE)
        .delete({ count: "exact" })
        .eq("service_id", INS_SERVICE_ID)
        .in("company_id", [...INS_WAVE1_COMPANY_IDS]);
      if (error) {
        writeError = [error.message, error.code, error.details, error.hint].filter(Boolean).join(" | ");
      } else {
        deleted = count ?? 0;
      }
    }
  }

  const pchAfter = await countEq(SERVICE_STP_CURRENT_VIEW, "service_id", PCH_SERVICE_ID);
  const envAfter = await countEq(SERVICE_STP_CURRENT_VIEW, "service_id", ENV_SERVICE_ID);
  const insAfter = await countEq(SERVICE_STP_CURRENT_VIEW, "service_id", INS_SERVICE_ID);
  const pchSafe = pchAfter.count === PCH_EXPECTED_CURRENT_COUNT;
  const envSafe = envAfter.count === ENV_EXPECTED_CURRENT_COUNT;
  if (write && !writeError && (!pchSafe || !envSafe)) {
    writeError = `Protection abort after rollback: PCH ${pchAfter.count} ENV ${envAfter.count}`;
  }

  console.log(
    JSON.stringify(
      {
        step: "INS Wave-1 rollback",
        writeFlag: write,
        plan,
        deleted,
        writeError,
        pchBefore: pchBefore.count,
        envBefore: envBefore.count,
        insBefore: insBefore.count,
        pchAfter: pchAfter.count,
        envAfter: envAfter.count,
        insAfter: insAfter.count,
        pchProtected: pchSafe,
        envProtected: envSafe,
      },
      null,
      2,
    ),
  );
  if (!plan.ok || (write && writeError) || !pchSafe || !envSafe) process.exitCode = 1;
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
