/**
 * STEP 32.2.3 INS Wave-1 live validation. SELECT + in-memory score only.
 * Does not INSERT. Fetches only frozen Wave-1 company_ids.
 */
import { createClient } from "@supabase/supabase-js";
import { loadEnvLocal } from "./build-pch-persist-payload";
import { scoreServiceAccount } from "./score";
import { mapScoredAccountToStpRow } from "./stp-persist-row";
import { planInsWave1Persist, validateInsWave1Payload } from "./ins-wave1-gates";
import { ENV_SERVICE_ID, PCH_SERVICE_ID } from "./env-wave1-manifest";
import {
  INS_SERVICE_ID,
  INS_WAVE1_ACCOUNTS,
  INS_WAVE1_COMPANY_IDS,
  INS_WAVE1_EXPECTED_COUNT,
  assertInsWave1ManifestIntegrity,
} from "./ins-wave1-manifest";
import { serviceReadiness } from "./service-registry";
import type { ServiceFirstInput } from "./types";

function timedClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
  if (!url || !anonKey) throw new Error("Missing Supabase env");
  return createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      fetch: (input: RequestInfo | URL, init?: RequestInit) =>
        fetch(input, { ...init, cache: "no-store", signal: AbortSignal.timeout(25_000) }),
    },
  });
}

function text(v: string | null | undefined): string | null {
  if (!v) return null;
  const t = v.trim();
  return t.length ? t : null;
}

async function main() {
  loadEnvLocal();
  const supabase = timedClient();
  const manifest = assertInsWave1ManifestIntegrity();
  const pch = await supabase.from("company_service_stp_current").select("id", { count: "exact", head: true }).eq("service_id", PCH_SERVICE_ID);
  const env = await supabase.from("company_service_stp_current").select("id", { count: "exact", head: true }).eq("service_id", ENV_SERVICE_ID);
  const ins = await supabase.from("company_service_stp_current").select("id", { count: "exact", head: true }).eq("service_id", INS_SERVICE_ID);

  const { data: companies, error: companyError } = await supabase
    .from("companies")
    .select("id, company_name, industry, subsector, customer_type, parent_company_name, account_status, city")
    .in("id", [...INS_WAVE1_COMPANY_IDS]);
  if (companyError) throw new Error(companyError.message);
  const { data: entities, error: entityError } = await supabase
    .from("company_entity_resolution")
    .select("company_id, entity_type, account_group_key")
    .in("company_id", [...INS_WAVE1_COMPANY_IDS]);
  if (entityError) throw new Error(entityError.message);
  const { data: locations, error: locError } = await supabase
    .from("company_locations")
    .select("company_id, city, confidence")
    .in("company_id", [...INS_WAVE1_COMPANY_IDS]);
  if (locError) throw new Error(locError.message);

  const companyById = new Map((companies ?? []).map((row) => [row.id, row]));
  const er = new Map((entities ?? []).map((row) => [row.company_id, row]));
  const locByCompany = new Map<string, string[]>();
  for (const row of locations ?? []) {
    if (row.confidence !== "HIGH") continue;
    locByCompany.set(row.company_id, [...(locByCompany.get(row.company_id) ?? []), row.city]);
  }

  const scoredAt = new Date().toISOString();
  const payload = INS_WAVE1_ACCOUNTS.map((entry) => {
    const company = companyById.get(entry.companyId);
    if (!company) throw new Error(`Missing company ${entry.companyId}`);
    const meta = er.get(entry.companyId);
    const input: ServiceFirstInput = {
      serviceId: INS_SERVICE_ID,
      serviceCode: "INS",
      serviceName: "Industrial Inspection",
      companyId: company.id,
      companyName: text(company.company_name) ?? "(unnamed)",
      industry: text(company.industry),
      subsector: text(company.subsector),
      customerType: text(company.customer_type),
      entityType: (meta?.entity_type as ServiceFirstInput["entityType"]) ?? null,
      parentCompanyName: text(company.parent_company_name),
      isExistingGeochemCustomer: null,
      accountStatus: text(company.account_status),
      verifiedCities: locByCompany.get(company.id) ?? [],
      importedCity: text(company.city),
      companyServicesNeed: null,
      companyServicesFitRating: null,
    };
    const result = scoreServiceAccount(input);
    return {
      entry,
      liveName: input.companyName,
      accountStatus: input.accountStatus,
      group: meta?.account_group_key ?? company.id,
      row: mapScoredAccountToStpRow(
        { input, result, accountGroupKey: meta?.account_group_key ?? company.id },
        { scoredAt, isRepresentative: true },
      ),
    };
  });

  const rows = payload.map((item) => item.row);
  const payloadCheck = validateInsWave1Payload(rows);
  const plan = planInsWave1Persist({
    pchCurrentCount: pch.count,
    envCurrentCount: env.count,
    insCurrentCount: ins.count,
    insCurrentCompanyIds: [],
    payload: rows,
  });
  const groups = payload.map((item) => item.group);
  const nameDrift = payload.filter((item) => item.liveName !== item.entry.companyName);
  const low = payload.filter((item) => item.row.data_confidence_band === "LOW");
  const notEligible = payload.filter((item) => item.row.eligibility !== "ELIGIBLE");
  const notT2 = payload.filter((item) => item.row.tier !== "Tier 2");

  const out = {
    wrote: false,
    expectedRows: INS_WAVE1_EXPECTED_COUNT,
    manifestOk: manifest.ok,
    manifestErrors: manifest.errors,
    idsFound: companies?.length ?? 0,
    nameDrift,
    duplicateGroups: groups.length !== new Set(groups).size,
    payloadCheck,
    plan: { ok: plan.ok, action: plan.action, errors: plan.errors },
    pchCurrent: pch.count,
    envCurrent: env.count,
    insCurrent: ins.count,
    insReadinessNow: serviceReadiness("INS", ins.count ?? 0),
    insReadinessIf22: serviceReadiness("INS", 22),
    pchReadiness: serviceReadiness("PCH"),
    envReadinessIf24: serviceReadiness("ENV", 24),
    low,
    notEligible,
    notT2,
    snapshot: payload.map((item) => ({
      rank: item.entry.rank,
      companyId: item.entry.companyId,
      company: item.liveName,
      entity: item.row.entity_type,
      status: item.accountStatus,
      eligibility: item.row.eligibility,
      tier: item.row.tier,
      score: item.row.commercial_score,
      app: item.row.application_fit,
      conf: `${item.row.data_confidence_band} ${item.row.data_confidence_score}`,
      rankingEligible: item.row.ranking_eligible,
      group: item.group,
    })),
  };
  console.log(JSON.stringify(out, null, 2));
  if (
    !manifest.ok ||
    (companies?.length ?? 0) !== INS_WAVE1_EXPECTED_COUNT ||
    nameDrift.length > 0 ||
    groups.length !== new Set(groups).size ||
    !payloadCheck.ok ||
    !plan.ok ||
    plan.action !== "insert" ||
    pch.count !== 350 ||
    env.count !== 24 ||
    ins.count !== 0 ||
    low.length > 0 ||
    notEligible.length > 0
  ) {
    process.exitCode = 1;
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
