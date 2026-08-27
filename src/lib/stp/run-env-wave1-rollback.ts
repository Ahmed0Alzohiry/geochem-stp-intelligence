/**
 * ENV Wave-1 rollback. Deletes ENV STP rows for Wave-1 company_ids only.
 * Requires --write. Aborts if PCH current count is not 350 before or after.
 * Does not touch PCH service_id rows.
 */
import { createSupabaseBrowserClient } from "../supabase/client";
import { planEnvWave1Rollback } from "./env-wave1-gates";
import {
  ENV_SERVICE_ID,
  ENV_WAVE1_COMPANY_IDS,
  PCH_EXPECTED_CURRENT_COUNT,
  PCH_SERVICE_ID,
} from "./env-wave1-manifest";
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

async function envCurrentCompanyIds(): Promise<string[]> {
  const supabase = createSupabaseBrowserClient();
  const ids: string[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase
      .from(SERVICE_STP_CURRENT_VIEW)
      .select("company_id")
      .eq("service_id", ENV_SERVICE_ID)
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
  const envIds = await envCurrentCompanyIds();
  const plan = planEnvWave1Rollback({
    pchCurrentCount: pchBefore.count,
    envCurrentCount: envBefore.count,
    envCurrentCompanyIds: envIds,
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
        .eq("service_id", ENV_SERVICE_ID)
        .in("company_id", [...ENV_WAVE1_COMPANY_IDS]);
      if (error) {
        writeError = [error.message, error.code, error.details, error.hint].filter(Boolean).join(" | ");
      } else {
        deleted = count ?? 0;
      }
    }
  }

  const pchAfter = await countEq(SERVICE_STP_CURRENT_VIEW, "service_id", PCH_SERVICE_ID);
  const envAfter = await countEq(SERVICE_STP_CURRENT_VIEW, "service_id", ENV_SERVICE_ID);
  const pchSafe = pchAfter.count === PCH_EXPECTED_CURRENT_COUNT;
  if (write && !writeError && !pchSafe) {
    writeError = `PCH protection abort after rollback: count ${pchAfter.count} !== ${PCH_EXPECTED_CURRENT_COUNT}`;
  }

  console.log(
    JSON.stringify(
      {
        step: "32.1.5-rollback",
        writeFlag: write,
        rolledBack: write && !writeError && plan.ok,
        plan,
        deleted,
        writeError,
        pchBefore: pchBefore.count,
        envBefore: envBefore.count,
        pchAfter: pchAfter.count,
        envAfter: envAfter.count,
        pchProtected: pchSafe,
        note: write
          ? "DELETE is scoped to ENV service_id + Wave-1 company_ids only."
          : "Dry-run. Pass --write to delete ENV Wave-1 STP rows. Apply migration 015 if DELETE is denied.",
      },
      null,
      2,
    ),
  );

  if (!plan.ok || (write && writeError) || !pchSafe) process.exitCode = 1;
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
