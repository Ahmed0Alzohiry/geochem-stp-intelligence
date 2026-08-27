/**
 * STEP 32.1.5 ENV Wave-1 persist writer.
 * INSERT into company_service_stp_scores for ENV only when --write is passed.
 * Does not UPDATE/DELETE PCH rows. Does not write companies or locations.
 * Default (no --write) is dry-run only.
 */
import { createSupabaseBrowserClient } from "../supabase/client";
import { loadEnvLocal } from "./build-pch-persist-payload";
import { buildEnvWave1PersistPayload } from "./build-env-wave1-payload";
import { planEnvWave1Persist } from "./env-wave1-gates";
import {
  ENV_SERVICE_ID,
  ENV_WAVE1_EXPECTED_COUNT,
  PCH_EXPECTED_CURRENT_COUNT,
  PCH_SERVICE_ID,
} from "./env-wave1-manifest";
import { SERVICE_STP_CURRENT_VIEW, SERVICE_STP_TABLE } from "./persistence-readiness";
import { SERVICE_FIRST_MODEL_VERSION } from "./types";

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
  const scoredAt = new Date().toISOString();
  const { service, payload, envUniverseCount } = await buildEnvWave1PersistPayload(scoredAt);
  const pchBefore = await countEq(SERVICE_STP_CURRENT_VIEW, "service_id", PCH_SERVICE_ID);
  const envBefore = await countEq(SERVICE_STP_CURRENT_VIEW, "service_id", ENV_SERVICE_ID);
  const envIds = await envCurrentCompanyIds();
  const plan = planEnvWave1Persist({
    pchCurrentCount: pchBefore.count,
    envCurrentCount: envBefore.count,
    envCurrentCompanyIds: envIds,
    payload,
  });

  let written = 0;
  let writeError: string | null = null;
  if (write) {
    if (!plan.ok || plan.action === "abort") {
      writeError = plan.errors.join(" | ");
    } else if (plan.action === "insert") {
      const { error } = await createSupabaseBrowserClient().from(SERVICE_STP_TABLE).insert(payload);
      if (error) {
        writeError = [error.message, error.code, error.details, error.hint].filter(Boolean).join(" | ");
      } else {
        written = payload.length;
      }
    }
  }

  const pchAfter = await countEq(SERVICE_STP_CURRENT_VIEW, "service_id", PCH_SERVICE_ID);
  const envAfter = await countEq(SERVICE_STP_CURRENT_VIEW, "service_id", ENV_SERVICE_ID);
  const pchSafe = pchAfter.count === PCH_EXPECTED_CURRENT_COUNT;
  if (write && plan.action === "insert" && !writeError && !pchSafe) {
    writeError = `PCH protection abort after write: count ${pchAfter.count} !== ${PCH_EXPECTED_CURRENT_COUNT}`;
  }

  console.log(
    JSON.stringify(
      {
        step: "32.1.5",
        writeFlag: write,
        persisted: write && !writeError && (plan.action === "noop" || written === ENV_WAVE1_EXPECTED_COUNT),
        idempotentNoop: plan.action === "noop",
        modelVersion: SERVICE_FIRST_MODEL_VERSION,
        envService: service,
        envUniverseCount,
        payloadRows: payload.length,
        plan,
        written,
        writeError,
        pchBefore: pchBefore.count,
        envBefore: envBefore.count,
        pchAfter: pchAfter.count,
        envAfter: envAfter.count,
        pchProtected: pchSafe,
      },
      null,
      2,
    ),
  );

  if (!plan.ok || (write && writeError) || !pchSafe) process.exitCode = 1;
  if (write && !writeError && plan.action === "insert" && written !== ENV_WAVE1_EXPECTED_COUNT) process.exitCode = 1;
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
