/**
 * LAB Wave-1 post-write verification. SELECT only. Does not persist.
 */
import { createClient } from "@supabase/supabase-js";
import { loadEnvLocal } from "./build-pch-persist-payload";
import { ENV_SERVICE_ID, ENV_WAVE1_COMPANY_IDS, PCH_SERVICE_ID } from "./env-wave1-manifest";
import { INS_SERVICE_ID, INS_WAVE1_COMPANY_IDS } from "./ins-wave1-manifest";
import { OCM_SERVICE_ID, OCM_WAVE1_COMPANY_IDS } from "./ocm-wave1-manifest";
import { PET_SERVICE_ID, PET_WAVE1_COMPANY_IDS } from "./pet-wave1-manifest";
import {
  LAB_PETRO_RABIGH_POLYMER_ID,
  LAB_PETRO_RABIGH_REFINING_ID,
  LAB_SERVICE_ID,
  LAB_WAVE1_ACCOUNTS,
  LAB_WAVE1_COMPANY_IDS,
  LAB_WAVE1_EXPECTED_COUNT,
} from "./lab-wave1-manifest";
import { serviceReadiness } from "./service-registry";
import { personasForService } from "../contacts/service-persona-map";
import { buildLabWave1PersistPayload } from "./build-lab-wave1-payload";
import { getStpAccountDetail, getStpCurrentForService } from "../supabase/stp-current";
import { isLabCompetitorName } from "./eligibility";

const PCH_RANK1 = "bcb70c34-0c5e-4316-8f64-d4e3fb1d45fe";
const TOTAL_AFTER_LAB = 350 + 24 + 22 + 18 + 25 + 21 + 26;

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
  const lab = await countEq("company_service_stp_current", "service_id", LAB_SERVICE_ID);
  const total = await supabase.from("company_service_stp_current").select("id", { count: "exact", head: true });
  const pchIds = await currentCompanyIds(PCH_SERVICE_ID);
  const envIds = await currentCompanyIds(ENV_SERVICE_ID);
  const insIds = await currentCompanyIds(INS_SERVICE_ID);
  const petIds = await currentCompanyIds(PET_SERVICE_ID);
  const ocmIds = await currentCompanyIds(OCM_SERVICE_ID);
  const labIds = await currentCompanyIds(LAB_SERVICE_ID);

  const { data: labRows, error } = await supabase
    .from("company_service_stp_current")
    .select(
      "id, company_id, service_id, account_group_key, commercial_score, tier, application_fit, data_confidence_score, data_confidence_band, positioning_statement, targeting_reason, ranking_eligible, eligibility, recommended_contact_roles, recommended_departments, scoring_model_version, scored_at, companies(company_name)",
    )
    .eq("service_id", LAB_SERVICE_ID);
  if (error) throw new Error(error.message);
  const rows = labRows ?? [];
  const byId = new Map(rows.map((row) => [row.company_id, row]));

  const { data: pchMeta } = await supabase
    .from("company_service_stp_current")
    .select("company_id, scored_at")
    .eq("service_id", PCH_SERVICE_ID)
    .eq("company_id", PCH_RANK1)
    .maybeSingle();

  const latest = async (serviceId: string, ascending: boolean) => {
    const { data } = await supabase
      .from("company_service_stp_current")
      .select("scored_at")
      .eq("service_id", serviceId)
      .order("scored_at", { ascending })
      .limit(1);
    return data?.[0]?.scored_at ?? null;
  };
  const pchMax = await latest(PCH_SERVICE_ID, false);
  const envMax = await latest(ENV_SERVICE_ID, false);
  const insMax = await latest(INS_SERVICE_ID, false);
  const petMax = await latest(PET_SERVICE_ID, false);
  const ocmMax = await latest(OCM_SERVICE_ID, false);
  const labMin = await latest(LAB_SERVICE_ID, true);

  const expected = await buildLabWave1PersistPayload(new Date().toISOString());
  const expectedById = new Map(expected.payload.map((row) => [row.company_id, row]));

  const unexpected = labIds.filter((id) => !LAB_WAVE1_COMPANY_IDS.includes(id));
  const missing = LAB_WAVE1_COMPANY_IDS.filter((id) => !labIds.includes(id));
  const envUnexpected = envIds.filter((id) => !ENV_WAVE1_COMPANY_IDS.includes(id));
  const envMissing = ENV_WAVE1_COMPANY_IDS.filter((id) => !envIds.includes(id));
  const insUnexpected = insIds.filter((id) => !INS_WAVE1_COMPANY_IDS.includes(id));
  const insMissing = INS_WAVE1_COMPANY_IDS.filter((id) => !insIds.includes(id));
  const petUnexpected = petIds.filter((id) => !PET_WAVE1_COMPANY_IDS.includes(id));
  const petMissing = PET_WAVE1_COMPANY_IDS.filter((id) => !petIds.includes(id));
  const ocmUnexpected = ocmIds.filter((id) => !OCM_WAVE1_COMPANY_IDS.includes(id));
  const ocmMissing = OCM_WAVE1_COMPANY_IDS.filter((id) => !ocmIds.includes(id));
  const dup = labIds.length !== new Set(labIds).size;
  const groups = rows.map((row) => row.account_group_key);
  const uniqueGroups = new Set(groups).size;
  const tier2 = rows.filter((row) => row.tier === "Tier 2").length;
  const tier3 = rows.filter((row) => row.tier === "Tier 3").length;

  const scoreMismatches = LAB_WAVE1_ACCOUNTS.filter((entry) => {
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
      row.service_id !== LAB_SERVICE_ID ||
      row.eligibility !== "ELIGIBLE" ||
      row.commercial_score == null ||
      (row.tier !== "Tier 2" && row.tier !== "Tier 3") ||
      row.application_fit == null ||
      row.data_confidence_score == null ||
      !row.data_confidence_band ||
      row.data_confidence_band === "LOW" ||
      !row.positioning_statement ||
      !row.targeting_reason ||
      row.scoring_model_version !== "6.4.0" ||
      !Array.isArray(row.recommended_contact_roles) ||
      row.recommended_contact_roles.length === 0 ||
      !Array.isArray(row.recommended_departments) ||
      row.recommended_departments.length === 0,
  );
  const competitorRows = rows.filter((row) => {
    const name = (row as { companies?: { company_name?: string } | { company_name?: string }[] }).companies;
    const companyName = Array.isArray(name) ? name[0]?.company_name : name?.company_name;
    return isLabCompetitorName(companyName ?? null);
  });

  const targeting = await getStpCurrentForService({ service: "LAB", page: "1" });
  const pchTargeting = await getStpCurrentForService({ service: "PCH", page: "1" });
  const ocmTargeting = await getStpCurrentForService({ service: "OCM", page: "1" });
  const firstLab = targeting.rows[0];
  const detail = firstLab ? await getStpAccountDetail(firstLab.id, { service: "LAB" }) : null;

  const notRewritten = (max: string | null) => Boolean(max && labMin && max < labMin);

  const checks = {
    pch350: pch === 350 && pchIds.length === 350 && new Set(pchIds).size === 350,
    env24: env === 24 && envIds.length === 24,
    ins22: ins === 22 && insIds.length === 22,
    pet18: pet === 18 && petIds.length === 18,
    ocm25: ocm === 25 && ocmIds.length === 25,
    lab21: lab === LAB_WAVE1_EXPECTED_COUNT && rows.length === 21,
    total486: total.count === TOTAL_AFTER_LAB,
    noUnexpected: unexpected.length === 0,
    noMissing: missing.length === 0,
    noDup: !dup,
    uniqueGroups21: uniqueGroups === 21,
    allLabServiceId: rows.every((row) => row.service_id === LAB_SERVICE_ID),
    scoresMatchApproved: scoreMismatches.length === 0,
    fieldsOk: fieldGaps.length === 0,
    noCompetitors: competitorRows.length === 0,
    bothRabighPlants: labIds.includes(LAB_PETRO_RABIGH_REFINING_ID) && labIds.includes(LAB_PETRO_RABIGH_POLYMER_ID),
    tier2is9: tier2 === 9,
    tier3is12: tier3 === 12,
    pchRank1: pchMeta?.company_id === PCH_RANK1,
    envIdsUnchanged: envUnexpected.length === 0 && envMissing.length === 0,
    insIdsUnchanged: insUnexpected.length === 0 && insMissing.length === 0,
    petIdsUnchanged: petUnexpected.length === 0 && petMissing.length === 0,
    ocmIdsUnchanged: ocmUnexpected.length === 0 && ocmMissing.length === 0,
    pchNotRewritten: notRewritten(pchMax),
    envNotRewritten: notRewritten(envMax),
    insNotRewritten: notRewritten(insMax),
    petNotRewritten: notRewritten(petMax),
    ocmNotRewritten: notRewritten(ocmMax),
    pchConfigured: serviceReadiness("PCH", pch) === "CONFIGURED",
    envConfigured: serviceReadiness("ENV", env) === "CONFIGURED",
    insConfigured: serviceReadiness("INS", ins) === "CONFIGURED",
    petConfigured: serviceReadiness("PET", pet) === "CONFIGURED",
    ocmConfigured: serviceReadiness("OCM", ocm) === "CONFIGURED",
    labConfigured: serviceReadiness("LAB", lab) === "CONFIGURED",
    labPersonas8: personasForService("LAB").length === 8,
    targetingLab21: targeting.total === 21 && targeting.readiness === "CONFIGURED",
    targetingLabOnly: targeting.rows.every((row) => row.serviceCode === "LAB" && row.serviceId === LAB_SERVICE_ID),
    targetingNoPchLeak: targeting.rows.every((row) => row.serviceId !== PCH_SERVICE_ID),
    pchTargetingUnchanged: pchTargeting.total === 350 && pchTargeting.rows[0]?.companyId === PCH_RANK1,
    ocmTargetingUnchanged: ocmTargeting.total === 25,
    accountDetail: Boolean(detail && detail.serviceCode === "LAB" && detail.companyId === firstLab?.companyId),
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
        lab,
        totalCurrent: total.count,
        uniqueLabAccounts: new Set(labIds).size,
        uniqueGroups,
        duplicates: dup,
        unexpected,
        missing,
        competitors: competitorRows.map((row) => row.company_id),
        tier2,
        tier3,
        scoreMismatches: scoreMismatches.map((row) => row.companyId),
        fieldGaps: fieldGaps.length,
        targetingTotal: targeting.total,
        targetingReadiness: targeting.readiness,
        detailCompanyId: detail?.companyId ?? null,
        labReadiness: serviceReadiness("LAB", lab),
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
