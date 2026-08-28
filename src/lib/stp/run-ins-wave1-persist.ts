/**
 * STEP 32.2.3 INS Wave-1 persist writer.
 * INSERT into company_service_stp_scores for INS only when --write is passed.
 * Does not UPDATE/DELETE PCH or ENV rows. Default (no --write) is dry-run only.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { loadEnvLocal } from "./build-pch-persist-payload";
import { buildInsWave1PersistPayload } from "./build-ins-wave1-payload";
import { planInsWave1Persist } from "./ins-wave1-gates";
import { ENV_SERVICE_ID, PCH_EXPECTED_CURRENT_COUNT, PCH_SERVICE_ID } from "./env-wave1-manifest";
import { ENV_EXPECTED_CURRENT_COUNT, INS_SERVICE_ID, INS_WAVE1_COMPANY_IDS, INS_WAVE1_EXPECTED_COUNT } from "./ins-wave1-manifest";
import { SERVICE_STP_CURRENT_VIEW, SERVICE_STP_TABLE } from "./persistence-readiness";
import { SERVICE_FIRST_MODEL_VERSION } from "./types";

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
        fetch(input, { ...init, cache: "no-store", signal: AbortSignal.timeout(180_000) }),
    },
  });
}

async function countEq(table: string, column: string, value: string) {
  const supabase = timedClient();
  const { count, error } = await supabase.from(table).select("id", { count: "exact", head: true }).eq(column, value);
  return { count: error ? null : (count ?? 0), error: error?.message ?? null };
}

async function insCurrentCompanyIds(): Promise<string[]> {
  const supabase = timedClient();
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
  const scoredAt = new Date().toISOString();
  const { service, payload, insUniverseEligible } = await buildInsWave1PersistPayload(scoredAt);
  const pchBefore = await countEq(SERVICE_STP_CURRENT_VIEW, "service_id", PCH_SERVICE_ID);
  const envBefore = await countEq(SERVICE_STP_CURRENT_VIEW, "service_id", ENV_SERVICE_ID);
  const insBefore = await countEq(SERVICE_STP_CURRENT_VIEW, "service_id", INS_SERVICE_ID);
  const insIds = await insCurrentCompanyIds();
  const plan = planInsWave1Persist({
    pchCurrentCount: pchBefore.count,
    envCurrentCount: envBefore.count,
    insCurrentCount: insBefore.count,
    insCurrentCompanyIds: insIds,
    payload,
  });

  let written = 0;
  let writeError: string | null = null;
  let rolledBack = false;
  if (write) {
    if (!plan.ok || plan.action === "abort") {
      writeError = plan.errors.join(" | ");
    } else if (plan.action === "insert") {
      const chunkSize = 6;
      for (let i = 0; i < payload.length; i += chunkSize) {
        const chunk = payload.slice(i, i + chunkSize);
        const { error } = await timedClient().from(SERVICE_STP_TABLE).insert(chunk);
        if (error) {
          writeError = [error.message, error.code, error.details, error.hint].filter(Boolean).join(" | ");
          break;
        }
        written += chunk.length;
      }
    }
  }

  let pchAfter = await countEq(SERVICE_STP_CURRENT_VIEW, "service_id", PCH_SERVICE_ID);
  let envAfter = await countEq(SERVICE_STP_CURRENT_VIEW, "service_id", ENV_SERVICE_ID);
  let insAfter = await countEq(SERVICE_STP_CURRENT_VIEW, "service_id", INS_SERVICE_ID);
  const insIdsAfter = write ? await insCurrentCompanyIds() : insIds;
  const unexpectedIns = insIdsAfter.filter((id) => !INS_WAVE1_COMPANY_IDS.includes(id));
  const missingIns = INS_WAVE1_COMPANY_IDS.filter((id) => !insIdsAfter.includes(id));
  let pchSafe = pchAfter.count === PCH_EXPECTED_CURRENT_COUNT;
  let envSafe = envAfter.count === ENV_EXPECTED_CURRENT_COUNT;
  const insOk =
    insAfter.count === (write && plan.action === "insert" && !writeError ? INS_WAVE1_EXPECTED_COUNT : insBefore.count) &&
    unexpectedIns.length === 0 &&
    (write && plan.action === "insert" && !writeError ? missingIns.length === 0 : true);

  if (write && plan.action === "insert" && written > 0 && (!pchSafe || !envSafe || !insOk)) {
    const { error: rollbackError } = await timedClient()
      .from(SERVICE_STP_TABLE)
      .delete()
      .eq("service_id", INS_SERVICE_ID)
      .in("company_id", [...INS_WAVE1_COMPANY_IDS]);
    rolledBack = !rollbackError;
    writeError = [
      writeError,
      `INS persist verification failed (PCH ${pchAfter.count} ENV ${envAfter.count} INS ${insAfter.count}); rollback ${rolledBack ? "ok" : rollbackError?.message}`,
    ]
      .filter(Boolean)
      .join(" | ");
    pchAfter = await countEq(SERVICE_STP_CURRENT_VIEW, "service_id", PCH_SERVICE_ID);
    envAfter = await countEq(SERVICE_STP_CURRENT_VIEW, "service_id", ENV_SERVICE_ID);
    insAfter = await countEq(SERVICE_STP_CURRENT_VIEW, "service_id", INS_SERVICE_ID);
    pchSafe = pchAfter.count === PCH_EXPECTED_CURRENT_COUNT;
    envSafe = envAfter.count === ENV_EXPECTED_CURRENT_COUNT;
  }

  if (write && plan.action === "insert" && !writeError && (!pchSafe || !envSafe)) {
    writeError = `Protection abort after write: PCH ${pchAfter.count} ENV ${envAfter.count}`;
  }

  console.log(
    JSON.stringify(
      {
        step: "32.2.4",
        writeFlag: write,
        persisted: write && !writeError && (plan.action === "noop" || written === INS_WAVE1_EXPECTED_COUNT),
        idempotentNoop: plan.action === "noop",
        modelVersion: SERVICE_FIRST_MODEL_VERSION,
        insService: service,
        insUniverseEligible,
        payloadRows: payload.length,
        expectedInsRows: INS_WAVE1_EXPECTED_COUNT,
        plan,
        written,
        rolledBack,
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
  if (write && !writeError && plan.action === "insert" && written !== INS_WAVE1_EXPECTED_COUNT) process.exitCode = 1;
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
