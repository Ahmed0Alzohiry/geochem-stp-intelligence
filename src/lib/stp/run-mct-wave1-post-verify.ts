/**
 * MCT Wave-1 post-write verification. SELECT only. Does not persist.
 */
import { createHash } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { loadEnvLocal } from "./build-pch-persist-payload";
import { ENV_SERVICE_ID, ENV_WAVE1_COMPANY_IDS, PCH_SERVICE_ID } from "./env-wave1-manifest";
import { INS_SERVICE_ID, INS_WAVE1_COMPANY_IDS } from "./ins-wave1-manifest";
import { LAB_SERVICE_ID, LAB_WAVE1_COMPANY_IDS } from "./lab-wave1-manifest";
import { OCM_SERVICE_ID, OCM_WAVE1_COMPANY_IDS } from "./ocm-wave1-manifest";
import { PET_SERVICE_ID, PET_WAVE1_COMPANY_IDS } from "./pet-wave1-manifest";
import {
  MCT_PETRO_RABIGH_POLYMER_ID,
  MCT_PETRO_RABIGH_REFINING_ID,
  MCT_SERVICE_ID,
  MCT_WAVE1_ACCOUNTS,
  MCT_WAVE1_COMPANY_IDS,
  MCT_WAVE1_EXPECTED_COUNT,
} from "./mct-wave1-manifest";
import { serviceReadiness } from "./service-registry";
import { personasForService } from "../contacts/service-persona-map";
import { buildMctWave1PersistPayload } from "./build-mct-wave1-payload";
import { getStpAccountDetail, getStpCurrentForService } from "../supabase/stp-current";
import { isMctCompetitorName } from "./eligibility";

const PCH_RANK1 = "bcb70c34-0c5e-4316-8f64-d4e3fb1d45fe";
const TOTAL_AFTER_MCT = 350 + 24 + 22 + 18 + 25 + 21 + 26;

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

function idHash(ids: string[]): string {
  return createHash("sha256").update([...ids].sort().join(",")).digest("hex");
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
  const mct = await countEq("company_service_stp_current", "service_id", MCT_SERVICE_ID);
  const total = await supabase.from("company_service_stp_current").select("id", { count: "exact", head: true });
  const pchIds = await currentCompanyIds(PCH_SERVICE_ID);
  const envIds = await currentCompanyIds(ENV_SERVICE_ID);
  const insIds = await currentCompanyIds(INS_SERVICE_ID);
  const petIds = await currentCompanyIds(PET_SERVICE_ID);
  const ocmIds = await currentCompanyIds(OCM_SERVICE_ID);
  const labIds = await currentCompanyIds(LAB_SERVICE_ID);
  const mctIds = await currentCompanyIds(MCT_SERVICE_ID);

  const { data: mctRows, error } = await supabase
    .from("company_service_stp_current")
    .select(
      "id, company_id, service_id, account_group_key, entity_type, commercial_score, tier, application_fit, data_confidence_score, data_confidence_band, positioning_statement, targeting_reason, ranking_eligible, eligibility, recommended_contact_roles, recommended_departments, scoring_model_version, scored_at, companies(company_name)",
    )
    .eq("service_id", MCT_SERVICE_ID);
  if (error) throw new Error(error.message);
  const rows = mctRows ?? [];
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
  const labMax = await latest(LAB_SERVICE_ID, false);
  const mctMin = await latest(MCT_SERVICE_ID, true);

  const expected = await buildMctWave1PersistPayload(new Date().toISOString());
  const expectedById = new Map(expected.payload.map((row) => [row.company_id, row]));

  const unexpected = mctIds.filter((id) => !MCT_WAVE1_COMPANY_IDS.includes(id));
  const missing = MCT_WAVE1_COMPANY_IDS.filter((id) => !mctIds.includes(id));
  const envUnexpected = envIds.filter((id) => !ENV_WAVE1_COMPANY_IDS.includes(id));
  const envMissing = ENV_WAVE1_COMPANY_IDS.filter((id) => !envIds.includes(id));
  const insUnexpected = insIds.filter((id) => !INS_WAVE1_COMPANY_IDS.includes(id));
  const insMissing = INS_WAVE1_COMPANY_IDS.filter((id) => !insIds.includes(id));
  const petUnexpected = petIds.filter((id) => !PET_WAVE1_COMPANY_IDS.includes(id));
  const petMissing = PET_WAVE1_COMPANY_IDS.filter((id) => !petIds.includes(id));
  const ocmUnexpected = ocmIds.filter((id) => !OCM_WAVE1_COMPANY_IDS.includes(id));
  const ocmMissing = OCM_WAVE1_COMPANY_IDS.filter((id) => !ocmIds.includes(id));
  const labUnexpected = labIds.filter((id) => !LAB_WAVE1_COMPANY_IDS.includes(id));
  const labMissing = LAB_WAVE1_COMPANY_IDS.filter((id) => !labIds.includes(id));
  const dup = mctIds.length !== new Set(mctIds).size;
  const groups = rows.map((row) => row.account_group_key);
  const uniqueGroups = new Set(groups).size;
  const tier1 = rows.filter((row) => row.tier === "Tier 1").length;
  const tier2 = rows.filter((row) => row.tier === "Tier 2").length;
  const tier3 = rows.filter((row) => row.tier === "Tier 3").length;

  const scoreMismatches = MCT_WAVE1_ACCOUNTS.filter((entry) => {
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
      row.service_id !== MCT_SERVICE_ID ||
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
    return isMctCompetitorName(companyName ?? null);
  });

  const targeting = await getStpCurrentForService({ service: "MCT", page: "1" });
  const pchTargeting = await getStpCurrentForService({ service: "PCH", page: "1" });
  const labTargeting = await getStpCurrentForService({ service: "LAB", page: "1" });
  const firstMct = targeting.rows[0];
  const detail = firstMct ? await getStpAccountDetail(firstMct.id, { service: "MCT" }) : null;

  const notRewritten = (max: string | null) => Boolean(max && mctMin && max < mctMin);

  const checks = {
    pch350: pch === 350 && pchIds.length === 350 && new Set(pchIds).size === 350,
    env24: env === 24 && envIds.length === 24,
    ins22: ins === 22 && insIds.length === 22,
    pet18: pet === 18 && petIds.length === 18,
    ocm25: ocm === 25 && ocmIds.length === 25,
    lab21: lab === 21 && labIds.length === 21,
    mct26: mct === MCT_WAVE1_EXPECTED_COUNT && rows.length === 26,
    total486: total.count === TOTAL_AFTER_MCT,
    noUnexpected: unexpected.length === 0,
    noMissing: missing.length === 0,
    noDup: !dup,
    uniqueGroups26: uniqueGroups === 26,
    allMctServiceId: rows.every((row) => row.service_id === MCT_SERVICE_ID),
    scoresMatchApproved: scoreMismatches.length === 0,
    fieldsOk: fieldGaps.length === 0,
    noCompetitors: competitorRows.length === 0,
    bothRabighPlants: mctIds.includes(MCT_PETRO_RABIGH_REFINING_ID) && mctIds.includes(MCT_PETRO_RABIGH_POLYMER_ID),
    tier1is0: tier1 === 0,
    tier2is9: tier2 === 9,
    tier3is17: tier3 === 17,
    pchRank1: pchMeta?.company_id === PCH_RANK1,
    envIdsUnchanged: envUnexpected.length === 0 && envMissing.length === 0,
    insIdsUnchanged: insUnexpected.length === 0 && insMissing.length === 0,
    petIdsUnchanged: petUnexpected.length === 0 && petMissing.length === 0,
    ocmIdsUnchanged: ocmUnexpected.length === 0 && ocmMissing.length === 0,
    labIdsUnchanged: labUnexpected.length === 0 && labMissing.length === 0,
    pchNotRewritten: notRewritten(pchMax),
    envNotRewritten: notRewritten(envMax),
    insNotRewritten: notRewritten(insMax),
    petNotRewritten: notRewritten(petMax),
    ocmNotRewritten: notRewritten(ocmMax),
    labNotRewritten: notRewritten(labMax),
    pchConfigured: serviceReadiness("PCH", pch) === "CONFIGURED",
    envConfigured: serviceReadiness("ENV", env) === "CONFIGURED",
    insConfigured: serviceReadiness("INS", ins) === "CONFIGURED",
    petConfigured: serviceReadiness("PET", pet) === "CONFIGURED",
    ocmConfigured: serviceReadiness("OCM", ocm) === "CONFIGURED",
    labConfigured: serviceReadiness("LAB", lab) === "CONFIGURED",
    mctConfigured: serviceReadiness("MCT", mct) === "CONFIGURED",
    mctPersonas8: personasForService("MCT").length === 8,
    targetingMct26: targeting.total === 26 && targeting.readiness === "CONFIGURED",
    targetingMctOnly: targeting.rows.every((row) => row.serviceCode === "MCT" && row.serviceId === MCT_SERVICE_ID),
    targetingNoPchLeak: targeting.rows.every((row) => row.serviceId !== PCH_SERVICE_ID),
    pchTargetingUnchanged: pchTargeting.total === 350 && pchTargeting.rows[0]?.companyId === PCH_RANK1,
    labTargetingUnchanged: labTargeting.total === 21,
    accountDetail: Boolean(detail && detail.serviceCode === "MCT" && detail.companyId === firstMct?.companyId),
    idHashesPresent: Boolean(idHash(pchIds) && idHash(labIds)),
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
        mct,
        totalCurrent: total.count,
        uniqueMctAccounts: new Set(mctIds).size,
        uniqueGroups,
        duplicates: dup,
        unexpected,
        missing,
        competitors: competitorRows.map((row) => row.company_id),
        tier1,
        tier2,
        tier3,
        scoreMismatches: scoreMismatches.map((row) => row.companyId),
        fieldGaps: fieldGaps.length,
        targetingTotal: targeting.total,
        targetingReadiness: targeting.readiness,
        detailCompanyId: detail?.companyId ?? null,
        mctReadiness: serviceReadiness("MCT", mct),
        hashes: {
          pch: idHash(pchIds),
          env: idHash(envIds),
          ins: idHash(insIds),
          pet: idHash(petIds),
          ocm: idHash(ocmIds),
          lab: idHash(labIds),
          mct: idHash(mctIds),
        },
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
