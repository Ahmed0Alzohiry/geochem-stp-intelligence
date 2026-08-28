/**
 * INS Wave-1 post-write verification. SELECT only. Does not rescore persist candidates.
 */
import { createClient } from "@supabase/supabase-js";
import { loadEnvLocal } from "./build-pch-persist-payload";
import { ENV_SERVICE_ID, ENV_WAVE1_COMPANY_IDS, PCH_SERVICE_ID } from "./env-wave1-manifest";
import { INS_SERVICE_ID, INS_WAVE1_ACCOUNTS, INS_WAVE1_COMPANY_IDS, INS_WAVE1_EXPECTED_COUNT } from "./ins-wave1-manifest";
import { serviceReadiness } from "./service-registry";
import { buildInsWave1PersistPayload } from "./build-ins-wave1-payload";

const PCH_RANK1 = "bcb70c34-0c5e-4316-8f64-d4e3fb1d45fe";

function timedClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
  if (!url || !anonKey) throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY");
  return createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      fetch: (input: RequestInfo | URL, init?: RequestInit) =>
        fetch(input, { ...init, cache: "no-store", signal: AbortSignal.timeout(45_000) }),
    },
  });
}

async function countEq(table: string, column: string, value: string) {
  const supabase = timedClient();
  const { count, error } = await supabase.from(table).select("id", { count: "exact", head: true }).eq(column, value);
  if (error) throw new Error(error.message);
  return count ?? 0;
}

async function currentCompanyIds(serviceId: string): Promise<string[]> {
  const supabase = timedClient();
  const ids: string[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase
      .from("company_service_stp_current")
      .select("company_id")
      .eq("service_id", serviceId)
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
  const supabase = timedClient();
  const pch = await countEq("company_service_stp_current", "service_id", PCH_SERVICE_ID);
  const env = await countEq("company_service_stp_current", "service_id", ENV_SERVICE_ID);
  const ins = await countEq("company_service_stp_current", "service_id", INS_SERVICE_ID);
  const total = await supabase.from("company_service_stp_current").select("id", { count: "exact", head: true });
  const pchIds = await currentCompanyIds(PCH_SERVICE_ID);
  const envIds = await currentCompanyIds(ENV_SERVICE_ID);
  const insIds = await currentCompanyIds(INS_SERVICE_ID);

  const { data: insRows, error } = await supabase
    .from("company_service_stp_current")
    .select(
      "company_id, service_id, commercial_score, tier, application_fit, data_confidence_score, data_confidence_band, positioning_statement, ranking_eligible, scoring_model_version, scored_at",
    )
    .eq("service_id", INS_SERVICE_ID);
  if (error) throw new Error(error.message);
  const rows = insRows ?? [];
  const byId = new Map(rows.map((row) => [row.company_id, row]));

  const { data: pchMeta } = await supabase
    .from("company_service_stp_current")
    .select("company_id, scored_at")
    .eq("service_id", PCH_SERVICE_ID)
    .eq("company_id", PCH_RANK1)
    .maybeSingle();

  const { data: pchTimes } = await supabase
    .from("company_service_stp_current")
    .select("scored_at")
    .eq("service_id", PCH_SERVICE_ID)
    .order("scored_at", { ascending: false })
    .limit(1);
  const { data: envTimes } = await supabase
    .from("company_service_stp_current")
    .select("scored_at")
    .eq("service_id", ENV_SERVICE_ID)
    .order("scored_at", { ascending: false })
    .limit(1);
  const { data: insTimes } = await supabase
    .from("company_service_stp_current")
    .select("scored_at")
    .eq("service_id", INS_SERVICE_ID)
    .order("scored_at", { ascending: true })
    .limit(1);

  const expected = await buildInsWave1PersistPayload(new Date().toISOString());
  const expectedById = new Map(expected.payload.map((row) => [row.company_id, row]));

  const unexpected = insIds.filter((id) => !INS_WAVE1_COMPANY_IDS.includes(id));
  const missing = INS_WAVE1_COMPANY_IDS.filter((id) => !insIds.includes(id));
  const envUnexpected = envIds.filter((id) => !ENV_WAVE1_COMPANY_IDS.includes(id));
  const envMissing = ENV_WAVE1_COMPANY_IDS.filter((id) => !envIds.includes(id));
  const dup = insIds.length !== new Set(insIds).size;
  const ranks = INS_WAVE1_ACCOUNTS.map((entry, index) => {
    const live = byId.get(entry.companyId);
    return live != null && index + 1 === entry.rank;
  });
  const scoreMismatches = INS_WAVE1_ACCOUNTS.filter((entry) => {
    const live = byId.get(entry.companyId);
    const exp = expectedById.get(entry.companyId);
    return !live || !exp || live.commercial_score !== exp.commercial_score || live.tier !== exp.tier;
  });
  const fieldGaps = rows.filter(
    (row) =>
      row.service_id !== INS_SERVICE_ID ||
      row.commercial_score == null ||
      row.tier !== "Tier 2" ||
      row.application_fit == null ||
      row.data_confidence_score == null ||
      !row.data_confidence_band ||
      row.data_confidence_band === "LOW" ||
      !row.positioning_statement ||
      row.ranking_eligible !== true ||
      row.scoring_model_version !== "6.4.0",
  );

  const pchMax = pchTimes?.[0]?.scored_at ?? null;
  const envMax = envTimes?.[0]?.scored_at ?? null;
  const insMin = insTimes?.[0]?.scored_at ?? null;
  const pchNotRewritten = Boolean(pchMax && insMin && pchMax < insMin);
  const envNotRewritten = Boolean(envMax && insMin && envMax < insMin);

  const checks = {
    pch350: pch === 350 && pchIds.length === 350 && new Set(pchIds).size === 350,
    env24: env === 24 && envIds.length === 24,
    ins22: ins === INS_WAVE1_EXPECTED_COUNT,
    total486: total.count === 486,
    noUnexpected: unexpected.length === 0,
    noMissing: missing.length === 0,
    noDup: !dup,
    ranksSequential: ranks.every(Boolean) && INS_WAVE1_ACCOUNTS.length === 22,
    tiersValid: fieldGaps.length === 0 && scoreMismatches.every((entry) => byId.get(entry.companyId)?.tier === "Tier 2"),
    scoresMatchApproved: scoreMismatches.length === 0,
    fieldsOk: fieldGaps.length === 0,
    pchRank1: pchMeta?.company_id === PCH_RANK1,
    pchIdsUnchangedCount: pch === 350,
    envIdsUnchanged: envUnexpected.length === 0 && envMissing.length === 0,
    pchNotRewritten,
    envNotRewritten,
    pchConfigured: serviceReadiness("PCH", pch) === "CONFIGURED",
    envConfigured: serviceReadiness("ENV", env) === "CONFIGURED",
    insConfigured: serviceReadiness("INS", ins) === "CONFIGURED",
    petNotConfigured: serviceReadiness("PET", 0) === "NOT_CONFIGURED",
  };

  const pass = Object.values(checks).every(Boolean);
  console.log(
    JSON.stringify(
      {
        pass,
        checks,
        pch,
        env,
        ins,
        totalCurrent: total.count,
        unexpected,
        missing,
        scoreMismatches: scoreMismatches.map((row) => row.companyId),
        fieldGaps: fieldGaps.length,
        pchMaxScoredAt: pchMax,
        envMaxScoredAt: envMax,
        insMinScoredAt: insMin,
        pchReadiness: serviceReadiness("PCH", pch),
        envReadiness: serviceReadiness("ENV", env),
        insReadiness: serviceReadiness("INS", ins),
      },
      null,
      2,
    ),
  );
  if (!pass) process.exit(1);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
