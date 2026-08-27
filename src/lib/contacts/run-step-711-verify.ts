/**
 * STEP 7.11 verification. SELECT only. Does not insert contacts or change STP.
 */
import { loadEnvLocal } from "../stp/build-pch-persist-payload";
import { getVisiblePersistedContacts } from "../supabase/persisted-contacts";
import { createSupabaseBrowserClient } from "../supabase/client";
import { DEFAULT_STP_SERVICE_CODE, getRankOneStpAccountDetail } from "../supabase/stp-current";
import { PETRO_RABIGH_ACCOUNT_ID, PETRO_RABIGH_POLYMER_ID } from "./petro-rabigh-vp-candidate";

const PCH_SERVICE_ID = "a5c12354-6cfb-4455-a50a-78bebbc51867";
const EXPECTED_CONTACT_ID = "7cd21465-0f51-4f35-b5fe-af79b55499bd";

async function countTable(table: string, idCol = "id") {
  const supabase = createSupabaseBrowserClient();
  const { count, error } = await supabase.from(table).select(idCol, { count: "exact", head: true });
  return { count: error ? null : (count ?? 0), error: error?.message ?? null };
}

async function main() {
  loadEnvLocal();
  const supabase = createSupabaseBrowserClient();
  const [companies, contacts, relevance, locations, pchCurrent, pchScores] = await Promise.all([
    countTable("companies"),
    countTable("contacts"),
    countTable("contact_service_relevance"),
    countTable("company_locations"),
    supabase.from("company_service_stp_current").select("id", { count: "exact", head: true }).eq("service_id", PCH_SERVICE_ID),
    supabase.from("company_service_stp_scores").select("id", { count: "exact", head: true }).eq("service_id", PCH_SERVICE_ID),
  ]);

  const rankOne = await getRankOneStpAccountDetail(DEFAULT_STP_SERVICE_CODE);
  const visible = rankOne
    ? await getVisiblePersistedContacts({
        viewCompanyId: rankOne.detail.companyId,
        accountGroupKey: rankOne.detail.accountGroupKey,
        serviceId: rankOne.detail.serviceId,
        serviceCode: rankOne.detail.serviceCode,
      })
    : [];

  const person = visible.find((row) => row.id === EXPECTED_CONTACT_ID);
  const nameDupes = visible.filter((row) => row.fullName.toLowerCase() === "fahad altherwi");
  const checks = {
    companies1769: companies.count === 1769,
    pchCurrent350: (pchCurrent.count ?? 0) === 350,
    pchScores350: (pchScores.count ?? 0) === 350,
    contacts1: contacts.count === 1,
    relevance1: relevance.count === 1,
    locationsUnchanged: locations.count === 8,
    rankOneIsPolymer: rankOne?.detail.companyId === PETRO_RABIGH_POLYMER_ID,
    contactVisible: Boolean(person),
    inherited: person?.displayMode === "INHERITED_FROM_ACCOUNT",
    owningAccount: person?.owningCompanyId === PETRO_RABIGH_ACCOUNT_ID,
    noNameDuplicate: nameDupes.length === 1,
    verified: person?.verificationStatus === "Verified",
    sourceUrl: Boolean(person?.sourceUrl),
  };

  const pass = Object.values(checks).every(Boolean);
  console.log(
    JSON.stringify(
      {
        "STEP 7.11 VERIFY": pass ? "PASS" : "FAIL",
        checks,
        counts: {
          companies: companies.count,
          pchCurrent: pchCurrent.count,
          pchScores: pchScores.count,
          contacts: contacts.count,
          relevance: relevance.count,
          locations: locations.count,
        },
        rankOne: rankOne
          ? { stpId: rankOne.detail.id, companyId: rankOne.detail.companyId, companyName: rankOne.detail.companyName, rank: rankOne.detail.rank }
          : null,
        visibleContacts: visible,
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
