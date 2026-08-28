/**
 * OCM Wave-1 post-write verification. SELECT only. Does not persist.
 */
import { createClient } from "@supabase/supabase-js";
import { loadEnvLocal } from "./build-pch-persist-payload";
import { ENV_SERVICE_ID, ENV_WAVE1_COMPANY_IDS, PCH_SERVICE_ID } from "./env-wave1-manifest";
import { INS_SERVICE_ID, INS_WAVE1_COMPANY_IDS } from "./ins-wave1-manifest";
import { PET_SERVICE_ID, PET_WAVE1_COMPANY_IDS } from "./pet-wave1-manifest";
import {
  OCM_PETRO_RABIGH_POLYMER_ID,
  OCM_PETRO_RABIGH_REFINING_ID,
  OCM_SERVICE_ID,
  OCM_WAVE1_ACCOUNTS,
  OCM_WAVE1_COMPANY_IDS,
  OCM_WAVE1_EXPECTED_COUNT,
} from "./ocm-wave1-manifest";
import { serviceReadiness } from "./service-registry";
import { personasForService } from "../contacts/service-persona-map";
import { buildOcmWave1PersistPayload } from "./build-ocm-wave1-payload";
import { getStpAccountDetail, getStpCurrentForService } from "../supabase/stp-current";

const PCH_RANK1 = "bcb70c34-0c5e-4316-8f64-d4e3fb1d45fe";
const TOTAL_AFTER_OCM = 350 + 24 + 22 + 18 + 25;

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
  const pet = await countEq("company_service_stp_current", "service_id", PET_SERVICE_ID);
  const ocm = await countEq("company_service_stp_current", "service_id", OCM_SERVICE_ID);
  const total = await supabase.from("company_service_stp_current").select("id", { count: "exact", head: true });
  const pchIds = await currentCompanyIds(PCH_SERVICE_ID);
  const envIds = await currentCompanyIds(ENV_SERVICE_ID);
  const insIds = await currentCompanyIds(INS_SERVICE_ID);
  const petIds = await currentCompanyIds(PET_SERVICE_ID);
  const ocmIds = await currentCompanyIds(OCM_SERVICE_ID);

  const { data: ocmRows, error } = await supabase
    .from("company_service_stp_current")
    .select(
      "id, company_id, service_id, account_group_key, commercial_score, tier, application_fit, data_confidence_score, data_confidence_band, positioning_statement, ranking_eligible, eligibility, recommended_contact_roles, recommended_departments, scoring_model_version, scored_at",
    )
    .eq("service_id", OCM_SERVICE_ID);
  if (error) throw new Error(error.message);
  const rows = ocmRows ?? [];
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
    .order("scored_at", { ascending: false })
    .limit(1);
  const { data: petTimes } = await supabase
    .from("company_service_stp_current")
    .select("scored_at")
    .eq("service_id", PET_SERVICE_ID)
    .order("scored_at", { ascending: false })
    .limit(1);
  const { data: ocmTimes } = await supabase
    .from("company_service_stp_current")
    .select("scored_at")
    .eq("service_id", OCM_SERVICE_ID)
    .order("scored_at", { ascending: true })
    .limit(1);

  const expected = await buildOcmWave1PersistPayload(new Date().toISOString());
  const expectedById = new Map(expected.payload.map((row) => [row.company_id, row]));

  const unexpected = ocmIds.filter((id) => !OCM_WAVE1_COMPANY_IDS.includes(id));
  const missing = OCM_WAVE1_COMPANY_IDS.filter((id) => !ocmIds.includes(id));
  const envUnexpected = envIds.filter((id) => !ENV_WAVE1_COMPANY_IDS.includes(id));
  const envMissing = ENV_WAVE1_COMPANY_IDS.filter((id) => !envIds.includes(id));
  const insUnexpected = insIds.filter((id) => !INS_WAVE1_COMPANY_IDS.includes(id));
  const insMissing = INS_WAVE1_COMPANY_IDS.filter((id) => !insIds.includes(id));
  const petUnexpected = petIds.filter((id) => !PET_WAVE1_COMPANY_IDS.includes(id));
  const petMissing = PET_WAVE1_COMPANY_IDS.filter((id) => !petIds.includes(id));
  const dup = ocmIds.length !== new Set(ocmIds).size;
  const groups = rows.map((row) => row.account_group_key);
  const uniqueGroups = new Set(groups).size;

  const scoreMismatches = OCM_WAVE1_ACCOUNTS.filter((entry) => {
    const live = byId.get(entry.companyId);
    const exp = expectedById.get(entry.companyId);
    return (
      !live ||
      !exp ||
      live.commercial_score !== exp.commercial_score ||
      live.tier !== exp.tier ||
      live.positioning_statement !== exp.positioning_statement
    );
  });
  const fieldGaps = rows.filter(
    (row) =>
      row.service_id !== OCM_SERVICE_ID ||
      row.eligibility !== "ELIGIBLE" ||
      row.commercial_score == null ||
      (row.tier !== "Tier 2" && row.tier !== "Tier 3") ||
      row.application_fit == null ||
      row.data_confidence_score == null ||
      !row.data_confidence_band ||
      row.data_confidence_band === "LOW" ||
      !row.positioning_statement ||
      row.scoring_model_version !== "6.4.0" ||
      !Array.isArray(row.recommended_contact_roles) ||
      row.recommended_contact_roles.length === 0 ||
      !Array.isArray(row.recommended_departments) ||
      row.recommended_departments.length === 0,
  );

  const targeting = await getStpCurrentForService({ service: "OCM", page: "1" });
  const pchTargeting = await getStpCurrentForService({ service: "PCH", page: "1" });
  const petTargeting = await getStpCurrentForService({ service: "PET", page: "1" });
  const firstOcm = targeting.rows[0];
  const detail = firstOcm ? await getStpAccountDetail(firstOcm.id, { service: "OCM" }) : null;

  const pchMax = pchTimes?.[0]?.scored_at ?? null;
  const envMax = envTimes?.[0]?.scored_at ?? null;
  const insMax = insTimes?.[0]?.scored_at ?? null;
  const petMax = petTimes?.[0]?.scored_at ?? null;
  const ocmMin = ocmTimes?.[0]?.scored_at ?? null;
  const pchNotRewritten = Boolean(pchMax && ocmMin && pchMax < ocmMin);
  const envNotRewritten = Boolean(envMax && ocmMin && envMax < ocmMin);
  const insNotRewritten = Boolean(insMax && ocmMin && insMax < ocmMin);
  const petNotRewritten = Boolean(petMax && ocmMin && petMax < ocmMin);

  const checks = {
    pch350: pch === 350 && pchIds.length === 350 && new Set(pchIds).size === 350,
    env24: env === 24 && envIds.length === 24,
    ins22: ins === 22 && insIds.length === 22,
    pet18: pet === 18 && petIds.length === 18,
    ocm25: ocm === OCM_WAVE1_EXPECTED_COUNT && rows.length === 25,
    total439: total.count === TOTAL_AFTER_OCM,
    noUnexpected: unexpected.length === 0,
    noMissing: missing.length === 0,
    noDup: !dup,
    uniqueGroups25: uniqueGroups === 25,
    allOcmServiceId: rows.every((row) => row.service_id === OCM_SERVICE_ID),
    scoresMatchApproved: scoreMismatches.length === 0,
    fieldsOk: fieldGaps.length === 0,
    polymerPresent: ocmIds.includes(OCM_PETRO_RABIGH_POLYMER_ID),
    refiningAbsent: !ocmIds.includes(OCM_PETRO_RABIGH_REFINING_ID),
    pchRank1: pchMeta?.company_id === PCH_RANK1,
    envIdsUnchanged: envUnexpected.length === 0 && envMissing.length === 0,
    insIdsUnchanged: insUnexpected.length === 0 && insMissing.length === 0,
    petIdsUnchanged: petUnexpected.length === 0 && petMissing.length === 0,
    pchNotRewritten,
    envNotRewritten,
    insNotRewritten,
    petNotRewritten,
    pchConfigured: serviceReadiness("PCH", pch) === "CONFIGURED",
    envConfigured: serviceReadiness("ENV", env) === "CONFIGURED",
    insConfigured: serviceReadiness("INS", ins) === "CONFIGURED",
    petConfigured: serviceReadiness("PET", pet) === "CONFIGURED",
    ocmConfigured: serviceReadiness("OCM", ocm) === "CONFIGURED",
    ocmPersonas8: personasForService("OCM").length === 8,
    targetingOcm25: targeting.total === 25 && targeting.readiness === "CONFIGURED",
    targetingOcmOnly: targeting.rows.every((row) => row.serviceCode === "OCM" && row.serviceId === OCM_SERVICE_ID),
    targetingNoPchLeak: targeting.rows.every((row) => row.serviceId !== PCH_SERVICE_ID),
    pchTargetingUnchanged: pchTargeting.total === 350 && pchTargeting.rows[0]?.companyId === PCH_RANK1,
    petTargetingUnchanged: petTargeting.total === 18,
    accountDetail: Boolean(detail && detail.serviceCode === "OCM" && detail.companyId === firstOcm?.companyId),
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
        pet,
        ocm,
        totalCurrent: total.count,
        uniqueOcmAccounts: new Set(ocmIds).size,
        uniqueGroups,
        duplicates: dup,
        unexpected,
        missing,
        scoreMismatches: scoreMismatches.map((row) => row.companyId),
        fieldGaps: fieldGaps.length,
        targetingTotal: targeting.total,
        targetingReadiness: targeting.readiness,
        detailCompanyId: detail?.companyId ?? null,
        pchMaxScoredAt: pchMax,
        envMaxScoredAt: envMax,
        insMaxScoredAt: insMax,
        petMaxScoredAt: petMax,
        ocmMinScoredAt: ocmMin,
        ocmReadiness: serviceReadiness("OCM", ocm),
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
