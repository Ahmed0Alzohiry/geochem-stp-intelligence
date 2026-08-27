/**
 * FAST-2 live verification. SELECT only. Does not persist STP or contacts.
 */
import { loadEnvLocal } from "./build-pch-persist-payload";
import { runFast2EngineSelfTest } from "./run-fast-2-self-test";
import { CANONICAL_SERVICE_CODES, isServiceCode, registerLiveServices, serviceReadiness, validateServiceRegistry } from "./service-registry";
import type { ServiceCode } from "./types";
import { createSupabaseBrowserClient } from "../supabase/client";
import { getServices } from "../supabase/master-data";
import { getStpCurrentForService } from "../supabase/stp-current";

const PCH_SERVICE_ID = "a5c12354-6cfb-4455-a50a-78bebbc51867";
const PCH_RANK1_COMPANY = "bcb70c34-0c5e-4316-8f64-d4e3fb1d45fe";
const PCH_CONTACT_ID = "7cd21465-0f51-4f35-b5fe-af79b55499bd";

async function countEq(table: string, column: string, value: string) {
  const supabase = createSupabaseBrowserClient();
  const { count, error } = await supabase.from(table).select("id", { count: "exact", head: true }).eq(column, value);
  return { count: error ? null : (count ?? 0), error: error?.message ?? null };
}

async function main() {
  loadEnvLocal();
  const unit = runFast2EngineSelfTest();
  const supabase = createSupabaseBrowserClient();
  const services = await getServices();
  const persistedCurrentByCode: Partial<Record<ServiceCode, number>> = {};
  for (const row of services.filter((item) => item.active)) {
    const code = (row.service_code ?? "").toUpperCase();
    const current = await countEq("company_service_stp_current", "service_id", row.id);
    if (isServiceCode(code)) {
      persistedCurrentByCode[code] = current.count ?? 0;
    }
  }
  const registered = registerLiveServices(services, persistedCurrentByCode);
  const catalogCheck = validateServiceRegistry(services);

  const companies = await supabase.from("companies").select("id", { count: "exact", head: true });
  const contacts = await supabase.from("contacts").select("id, company_id, full_name");
  const relevance = await supabase.from("contact_service_relevance").select("id, contact_id, service_id");
  const pchCurrent = await countEq("company_service_stp_current", "service_id", PCH_SERVICE_ID);
  const pchScores = await countEq("company_service_stp_scores", "service_id", PCH_SERVICE_ID);

  const perService: Array<Record<string, unknown>> = [];
  for (const row of registered) {
    const code = row.service_code ?? "";
    const current = await countEq("company_service_stp_current", "service_id", row.id);
    const scores = await countEq("company_service_stp_scores", "service_id", row.id);
    perService.push({
      service: code,
      serviceId: row.id,
      configuration: row.readiness,
      currentStp: current.count,
      scoreRows: scores.count,
      ranking: row.readiness === "CONFIGURED" && (current.count ?? 0) > 0 ? "AVAILABLE" : "NOT AVAILABLE",
      personas: row.personaCount,
      persistenceOccurred: (scores.count ?? 0) > 0,
    });
  }

  const pchList = await getStpCurrentForService({ service: "PCH", page: "1" });
  const petList = await getStpCurrentForService({ service: "PET", page: "1" });
  const contactRows = contacts.data ?? [];
  const relRows = relevance.data ?? [];

  const pchKeys: string[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase
      .from("company_service_stp_current")
      .select("company_id")
      .eq("service_id", PCH_SERVICE_ID)
      .range(from, from + 999);
    if (error) throw error;
    const batch = data ?? [];
    pchKeys.push(...batch.map((row) => String(row.company_id)));
    if (batch.length < 1000) break;
  }
  const opportunities = await supabase.from("opportunities").select("id", { count: "exact", head: true });
  const demoOpps = await supabase.from("opportunities").select("id", { count: "exact", head: true }).eq("is_demo", true);

  const checks = {
    unit: unit.ok,
    catalog: catalogCheck.ok,
    companies1769: companies.count === 1769,
    pchCurrent350: pchCurrent.count === 350,
    pchScores350: pchScores.count === 350,
    pchNoDuplicateCurrent: pchKeys.length === 350 && new Set(pchKeys).size === 350,
    pchRank1: pchList.rows[0]?.companyId === PCH_RANK1_COMPANY,
    pchReadiness: pchList.readiness === "CONFIGURED",
    petEmpty: petList.total === 0 && petList.readiness === "NOT_CONFIGURED",
    noCrossPchInPet: petList.rows.every((row) => row.serviceId !== PCH_SERVICE_ID),
    contacts1: contactRows.length === 1 && contactRows[0]?.id === PCH_CONTACT_ID,
    relevancePchOnly: relRows.length === 1 && relRows[0]?.service_id === PCH_SERVICE_ID,
    opportunitiesZero: (opportunities.count ?? 0) === 0,
    noDemoOpportunities: (demoOpps.count ?? 0) === 0,
    otherServicesNoPersist: perService
      .filter((row) => row.service !== "PCH" && row.service !== "ENV")
      .every((row) => row.currentStp === 0 && row.scoreRows === 0),
    envNotPersistedOrWave1: perService
      .filter((row) => row.service === "ENV")
      .every((row) => row.currentStp === 0 || row.currentStp === 24),
  };

  const pass = Object.values(checks).every(Boolean);
  console.log(
    JSON.stringify(
      {
        "FAST-2 VERIFY": pass ? "PASS" : "FAIL",
        checks,
        unitFailures: unit.failures,
        catalogErrors: catalogCheck.errors,
        counts: {
          companies: companies.count,
          pchCurrent: pchCurrent.count,
          pchScores: pchScores.count,
          contacts: contactRows.length,
        },
        perService,
        canonicalCodes: CANONICAL_SERVICE_CODES,
        serviceReadinessPch: serviceReadiness("PCH"),
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
