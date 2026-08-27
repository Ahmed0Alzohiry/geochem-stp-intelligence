/**
 * STEP 32.1.6 post-write verification. SELECT only.
 */
import { loadEnvLocal } from "./build-pch-persist-payload";
import { createSupabaseBrowserClient } from "../supabase/client";
import { ENV_SERVICE_ID, ENV_WAVE1_COMPANY_IDS, PCH_SERVICE_ID } from "./env-wave1-manifest";
import { serviceReadiness } from "./service-registry";
import { getStpCurrentForService } from "../supabase/stp-current";

async function countEq(table: string, column: string, value: string) {
  const supabase = createSupabaseBrowserClient();
  const { count, error } = await supabase.from(table).select("id", { count: "exact", head: true }).eq(column, value);
  return error ? null : (count ?? 0);
}

async function main() {
  loadEnvLocal();
  const supabase = createSupabaseBrowserClient();
  const pch = await countEq("company_service_stp_current", "service_id", PCH_SERVICE_ID);
  const env = await countEq("company_service_stp_current", "service_id", ENV_SERVICE_ID);
  const total = await supabase.from("company_service_stp_current").select("id", { count: "exact", head: true });

  const { data: envRows, error } = await supabase
    .from("company_service_stp_current")
    .select(
      "company_id, service_id, commercial_score, tier, application_fit, data_confidence_score, data_confidence_band, positioning_statement, ranking_eligible",
    )
    .eq("service_id", ENV_SERVICE_ID);
  if (error) throw new Error(error.message);
  const rows = envRows ?? [];
  const ids = rows.map((row) => row.company_id);
  const unexpected = ids.filter((id) => !ENV_WAVE1_COMPANY_IDS.includes(id));
  const missing = ENV_WAVE1_COMPANY_IDS.filter((id) => !ids.includes(id));
  const dup = ids.length !== new Set(ids).size;
  const fieldGaps = rows.filter(
    (row) =>
      row.service_id !== ENV_SERVICE_ID ||
      row.commercial_score == null ||
      !row.tier ||
      row.application_fit == null ||
      row.data_confidence_score == null ||
      !row.data_confidence_band ||
      !row.positioning_statement ||
      row.ranking_eligible !== true,
  );

  const pchList = await getStpCurrentForService({ service: "PCH", page: "1" });
  const envList = await getStpCurrentForService({ service: "ENV", page: "1" });
  const petList = await getStpCurrentForService({ service: "PET", page: "1" });

  const checks = {
    pch350: pch === 350,
    env24: env === 24,
    total374: total.count === 374,
    noUnexpected: unexpected.length === 0,
    noMissing: missing.length === 0,
    noDup: !dup,
    fieldsOk: fieldGaps.length === 0,
    pchRank1: pchList.rows[0]?.companyId === "bcb70c34-0c5e-4316-8f64-d4e3fb1d45fe",
    pchConfigured: pchList.readiness === "CONFIGURED",
    envConfigured: envList.readiness === "CONFIGURED" && serviceReadiness("ENV", env ?? 0) === "CONFIGURED",
    envAccounts24: envList.total === 24,
    envOnlyManifest: envList.rows.every((row) => ENV_WAVE1_COMPANY_IDS.includes(row.companyId) && row.serviceId === ENV_SERVICE_ID),
    petNotConfigured: petList.readiness === "NOT_CONFIGURED" && petList.total === 0,
  };

  const pass = Object.values(checks).every(Boolean);
  console.log(
    JSON.stringify(
      {
        pass,
        checks,
        pch,
        env,
        totalCurrent: total.count,
        unexpected,
        missing,
        fieldGaps: fieldGaps.length,
        envReadiness: envList.readiness,
        pchReadiness: pchList.readiness,
        envTotal: envList.total,
        pchTotal: pchList.total,
      },
      null,
      2,
    ),
  );
  if (!pass) process.exit(1);
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
