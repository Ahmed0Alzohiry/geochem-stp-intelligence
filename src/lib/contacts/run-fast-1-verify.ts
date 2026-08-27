/**
 * FAST-1 foundation verification. Read-only live checks plus unit self-tests.
 * Does not INSERT contacts or change STP scores.
 */
import { runContactCollectionSelfTest } from "./run-step-75-self-test";
import { runWorksheetSelfTest } from "./run-step-76-self-test";
import { runPersistGrainSelfTest } from "./run-step-78-self-test";
import { runContactPersistWriterSelfTest } from "./run-step-79-self-test";
import { validateServicePersonaMap } from "./service-persona-map";
import { writeFlagsAllowInsert } from "./persist-write";
import { PETRO_RABIGH_ACCOUNT_ID, PETRO_RABIGH_POLYMER_ID, PETRO_RABIGH_REFINING_ID } from "./petro-rabigh-vp-candidate";
import { loadEnvLocal } from "../stp/build-pch-persist-payload";
import { getVisiblePersistedContacts } from "../supabase/persisted-contacts";
import { createSupabaseBrowserClient } from "../supabase/client";
import { DEFAULT_STP_SERVICE_CODE, getRankOneStpAccountDetail } from "../supabase/stp-current";

const PCH_SERVICE_ID = "a5c12354-6cfb-4455-a50a-78bebbc51867";
const EXPECTED_CONTACT_ID = "7cd21465-0f51-4f35-b5fe-af79b55499bd";

async function countTable(table: string, idCol = "id") {
  const supabase = createSupabaseBrowserClient();
  const { count, error } = await supabase.from(table).select(idCol, { count: "exact", head: true });
  return { count: error ? null : (count ?? 0), error: error?.message ?? null };
}

async function main() {
  loadEnvLocal();
  const units = {
    collection: runContactCollectionSelfTest(),
    worksheet: runWorksheetSelfTest(),
    grain: runPersistGrainSelfTest(),
    writer: runContactPersistWriterSelfTest(),
    personas: validateServicePersonaMap(),
    flags: {
      ok: !writeFlagsAllowInsert([]) && writeFlagsAllowInsert(["--write", "--confirm-insert"]),
      errors: [] as string[],
    },
  };
  if (!units.flags.ok) units.flags.errors.push("write flag helper failed");

  const supabase = createSupabaseBrowserClient();
  const [companies, contacts, relevance, pchCurrent, pchScores] = await Promise.all([
    countTable("companies"),
    countTable("contacts"),
    countTable("contact_service_relevance"),
    supabase.from("company_service_stp_current").select("id", { count: "exact", head: true }).eq("service_id", PCH_SERVICE_ID),
    supabase.from("company_service_stp_scores").select("id", { count: "exact", head: true }).eq("service_id", PCH_SERVICE_ID),
  ]);

  const { data: contactRows, error: contactError } = await supabase
    .from("contacts")
    .select(
      "id, company_id, full_name, job_title, source_url, source_name, evidence_type, source_confidence, verification_status, verified_at, department_id, job_function_id",
    );
  const { data: relevanceRows, error: relError } = await supabase
    .from("contact_service_relevance")
    .select("id, contact_id, service_id, buying_role, relevance_score, stp_score_id");

  const names = (contactRows ?? []).map((row) => `${row.company_id}::${String(row.full_name).trim().toLowerCase()}`);
  const uniqueNames = new Set(names);
  const contact = (contactRows ?? []).find((row) => row.id === EXPECTED_CONTACT_ID);
  const rel = (relevanceRows ?? []).find((row) => row.contact_id === EXPECTED_CONTACT_ID);

  const rankOne = await getRankOneStpAccountDetail(DEFAULT_STP_SERVICE_CODE);
  const visible = rankOne
    ? await getVisiblePersistedContacts({
        viewCompanyId: rankOne.detail.companyId,
        accountGroupKey: rankOne.detail.accountGroupKey,
        serviceId: rankOne.detail.serviceId,
        serviceCode: rankOne.detail.serviceCode,
      })
    : [];
  const clones = (contactRows ?? []).filter(
    (row) => row.company_id === PETRO_RABIGH_POLYMER_ID || row.company_id === PETRO_RABIGH_REFINING_ID,
  );

  const live = {
    companies1769: companies.count === 1769,
    pchCurrent350: (pchCurrent.count ?? 0) === 350,
    pchScores350: (pchScores.count ?? 0) === 350,
    contactsAtLeastOne: (contacts.count ?? 0) >= 1,
    relevanceMatchesContacts: (relevance.count ?? 0) === (contacts.count ?? 0),
    noContactError: !contactError,
    noRelError: !relError,
    noNameDupes: names.length === uniqueNames.size,
    fahadOnAccount: contact?.company_id === PETRO_RABIGH_ACCOUNT_ID,
    noFacilityClone: clones.length === 0,
    verified: contact?.verification_status === "Verified" && Boolean(contact.verified_at) && Boolean(contact.source_url),
    evidence:
      contact?.evidence_type === "Official website" &&
      contact.source_confidence === "HIGH" &&
      Boolean(contact.source_name),
    pchRelevance: rel?.service_id === PCH_SERVICE_ID && rel?.buying_role === "TECHNICAL" && Number(rel?.relevance_score) === 85,
    noFacilityStpReuse: rel?.stp_score_id == null,
    rankOneVisible: visible.some((row) => row.id === EXPECTED_CONTACT_ID && row.displayMode === "INHERITED_FROM_ACCOUNT"),
    groupDedupStubs: (rankOne?.existingContacts.length ?? 0) >= 1,
    captureWouldSeeParent: Boolean(
      rankOne?.existingContacts.some((row) => row.fullName === "Fahad AlTherwi"),
    ),
  };

  const unitOk = Object.values(units).every((item) => item.ok);
  const liveOk = Object.values(live).every(Boolean);
  const pass = unitOk && liveOk;

  console.log(
    JSON.stringify(
      {
        "FAST-1 VERIFY": pass ? "PASS" : "FAIL",
        units: {
          collection: units.collection.ok,
          worksheet: units.worksheet.ok,
          grain: units.grain.ok,
          writer: units.writer.ok,
          personas: units.personas.ok,
          flags: units.flags.ok,
        },
        unitFailures: {
          collection: units.collection.failures,
          worksheet: units.worksheet.failures,
          grain: units.grain.failures,
          writer: units.writer.failures,
          personas: units.personas.errors,
          flags: units.flags.errors,
        },
        live,
        counts: {
          companies: companies.count,
          pchCurrent: pchCurrent.count,
          pchScores: pchScores.count,
          contacts: contacts.count,
          relevance: relevance.count,
        },
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
