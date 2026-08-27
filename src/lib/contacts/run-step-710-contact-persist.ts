/**
 * STEP 7.10 — single validated contact INSERT.
 * Requires --write AND --confirm-insert.
 * Attaches only to the Petro Rabigh ACCOUNT company_id.
 * Does not modify companies, locations, STP scores, personas, or account groups.
 */
import { createSupabaseBrowserClient } from "../supabase/client";
import { loadEnvLocal } from "../stp/build-pch-persist-payload";
import { buildContactPersistPlan, writeFlagsAllowInsert } from "./persist-write";
import { runContactPersistWriterSelfTest } from "./run-step-79-self-test";
import {
  FAHAD_ALTHERWI_EVIDENCE_NOTES,
  FAHAD_ALTHERWI_PERSONA_KEY,
  FAHAD_ALTHERWI_SOURCE_URL,
  PETRO_RABIGH_ACCOUNT_ID,
  PETRO_RABIGH_GROUP_KEY,
  PETRO_RABIGH_POLYMER_ID,
  PETRO_RABIGH_POLYMER_STP_ID,
  PETRO_RABIGH_REFINING_ID,
  fahadAlTherwiCandidate,
} from "./petro-rabigh-vp-candidate";
import type { AccountGroupMember } from "./persist-grain";
import type { ExistingContactStub } from "./persist-write";

const PCH_SERVICE_ID = "a5c12354-6cfb-4455-a50a-78bebbc51867";
const EXPECTED_COMPANIES = 1769;
const EXPECTED_PCH_STP = 350;

function hasFlag(name: string): boolean {
  return process.argv.includes(name);
}

async function countTable(table: string, idCol = "id") {
  const supabase = createSupabaseBrowserClient();
  const { count, error } = await supabase.from(table).select(idCol, { count: "exact", head: true });
  return { count: error ? null : (count ?? 0), error: error?.message ?? null };
}

async function countPchStp() {
  const supabase = createSupabaseBrowserClient();
  const { count, error } = await supabase
    .from("company_service_stp_scores")
    .select("id", { count: "exact", head: true })
    .eq("service_id", PCH_SERVICE_ID);
  return { count: error ? null : (count ?? 0), error: error?.message ?? null };
}

async function loadCatalog() {
  const supabase = createSupabaseBrowserClient();
  const [departments, functions, services, parentStp] = await Promise.all([
    supabase.from("departments").select("id, name").eq("name", "Engineering").maybeSingle(),
    supabase.from("job_functions").select("id, function_code").eq("function_code", "technical_services").maybeSingle(),
    supabase.from("services").select("id, service_code").eq("service_code", "PCH").maybeSingle(),
    supabase
      .from("company_service_stp_scores")
      .select("id, company_id")
      .eq("service_id", PCH_SERVICE_ID)
      .eq("company_id", PETRO_RABIGH_ACCOUNT_ID)
      .maybeSingle(),
  ]);
  const errors = [departments.error, functions.error, services.error, parentStp.error]
    .filter(Boolean)
    .map((err) => err!.message);
  return {
    errors,
    departmentId: departments.data?.id ?? "",
    jobFunctionId: functions.data?.id ?? "",
    serviceId: services.data?.id ?? "",
    stpScoreId: parentStp.data?.id ?? null,
    stpScoreCompanyId: parentStp.data?.company_id ?? null,
  };
}

async function loadGroupMembers(): Promise<AccountGroupMember[]> {
  const supabase = createSupabaseBrowserClient();
  const { data, error } = await supabase
    .from("company_entity_resolution")
    .select("company_id, entity_type, account_group_key")
    .eq("account_group_key", PETRO_RABIGH_GROUP_KEY);
  if (error) throw new Error(error.message);
  const ids = (data ?? []).map((row) => row.company_id as string);
  const { data: companies, error: companyError } = await supabase
    .from("companies")
    .select("id, company_name, legal_name")
    .in("id", ids);
  if (companyError) throw new Error(companyError.message);
  const byId = new Map((companies ?? []).map((row) => [row.id as string, row]));
  return (data ?? []).map((row) => {
    const company = byId.get(row.company_id as string);
    return {
      companyId: row.company_id as string,
      companyName: (company?.company_name as string) ?? row.company_id,
      legalName: (company?.legal_name as string | null) ?? null,
      entityType: row.entity_type as AccountGroupMember["entityType"],
    };
  });
}

async function loadExisting(groupIds: string[]): Promise<ExistingContactStub[]> {
  const supabase = createSupabaseBrowserClient();
  if (groupIds.length === 0) return [];
  const { data, error } = await supabase
    .from("contacts")
    .select("company_id, full_name, email, linkedin_url, source_url")
    .in("company_id", groupIds);
  if (error) throw new Error(error.message);
  return (data ?? []).map((row) => ({
    companyId: row.company_id as string,
    fullName: row.full_name as string,
    email: (row.email as string | null) ?? null,
    linkedinUrl: (row.linkedin_url as string | null) ?? null,
    sourceUrl: (row.source_url as string | null) ?? null,
  }));
}

async function main() {
  loadEnvLocal();
  const write = hasFlag("--write");
  const confirmInsert = hasFlag("--confirm-insert");
  const unit = runContactPersistWriterSelfTest();
  const supabase = createSupabaseBrowserClient();

  const before = {
    companies: await countTable("companies"),
    pchStp: await countPchStp(),
    contacts: await countTable("contacts"),
    relevance: await countTable("contact_service_relevance"),
    locations: await countTable("company_locations"),
  };

  const catalog = await loadCatalog();
  const groupMembers = await loadGroupMembers();
  const existing = await loadExisting(groupMembers.map((row) => row.companyId));
  const capture = groupMembers.find((row) => row.companyId === PETRO_RABIGH_POLYMER_ID);

  const plan = buildContactPersistPlan({
    candidate: fahadAlTherwiCandidate(
      existing.map((row) => ({ fullName: row.fullName, email: row.email, linkedinUrl: row.linkedinUrl })),
    ),
    captureCompanyId: PETRO_RABIGH_POLYMER_ID,
    captureCompanyName: capture?.companyName ?? "Petro Rabigh Polymer Operations",
    captureEntityType: capture?.entityType ?? "FACILITY",
    accountGroupKey: PETRO_RABIGH_GROUP_KEY,
    groupMembers,
    evidenceNotes: FAHAD_ALTHERWI_EVIDENCE_NOTES,
    catalog: {
      departmentId: catalog.departmentId,
      jobFunctionId: catalog.jobFunctionId,
      serviceId: catalog.serviceId,
      stpScoreId: catalog.stpScoreId,
      stpScoreCompanyId: catalog.stpScoreCompanyId,
    },
    existing,
    personaKey: FAHAD_ALTHERWI_PERSONA_KEY,
  });

  const insertGates = {
    bothSafetyFlags: writeFlagsAllowInsert(process.argv),
    unitSelfTest: unit.ok,
    payloadSafe: plan.safeToPersist,
    decisionAccept: plan.contactDecision === "ACCEPT",
    grainParent: plan.resolvedGrain === "ACCOUNT_GROUP_PARENT",
    accountCompanyOnly: plan.contact?.company_id === PETRO_RABIGH_ACCOUNT_ID,
    notPolymer: plan.contact?.company_id !== PETRO_RABIGH_POLYMER_ID,
    notRefining: plan.contact?.company_id !== PETRO_RABIGH_REFINING_ID,
    noDuplicate: !plan.duplicate.hit,
    contactsWereEmpty: before.contacts.count === 0,
    companiesFrozen: before.companies.count === EXPECTED_COMPANIES,
    pchStpFrozen: before.pchStp.count === EXPECTED_PCH_STP,
    catalogOk: catalog.errors.length === 0,
    noFacilityStpReuse: plan.relevance?.stp_score_id !== PETRO_RABIGH_POLYMER_STP_ID,
  };
  const canInsert = Object.values(insertGates).every(Boolean);

  let insertAttempted = false;
  let writeError: string | null = null;
  let insertedContactId: string | null = null;
  let insertedRelevanceId: string | null = null;

  if (!canInsert) {
    writeError = `Insert gates failed: ${JSON.stringify(insertGates)}`;
  } else if (!plan.contact || !plan.relevance) {
    writeError = "Persist plan missing contact or relevance payload.";
  } else {
    insertAttempted = true;
    const contactInsert = await supabase.from("contacts").insert(plan.contact).select("id").single();
    if (contactInsert.error || !contactInsert.data?.id) {
      writeError = [contactInsert.error?.message, contactInsert.error?.code, contactInsert.error?.details, contactInsert.error?.hint]
        .filter(Boolean)
        .join(" | ");
    } else {
      insertedContactId = contactInsert.data.id as string;
      const relevanceInsert = await supabase
        .from("contact_service_relevance")
        .insert({
          contact_id: insertedContactId,
          service_id: plan.relevance.service_id,
          stp_score_id: plan.relevance.stp_score_id,
          relevance_score: plan.relevance.relevance_score,
          buying_role: plan.relevance.buying_role,
          relevance_reason: plan.relevance.relevance_reason,
        })
        .select("id")
        .single();
      if (relevanceInsert.error || !relevanceInsert.data?.id) {
        writeError = [
          "Contact inserted but relevance failed:",
          relevanceInsert.error?.message,
          relevanceInsert.error?.code,
          relevanceInsert.error?.details,
        ]
          .filter(Boolean)
          .join(" | ");
      } else {
        insertedRelevanceId = relevanceInsert.data.id as string;
      }
    }
  }

  const storedContact = insertedContactId
    ? await supabase
        .from("contacts")
        .select(
          "id, company_id, full_name, job_title, department_id, job_function_id, company_location_id, email, phone, linkedin_url, contact_role, relationship_strength, is_primary, source_url, source_name, evidence_type, source_confidence, verification_status, verified_at, data_confidence",
        )
        .eq("id", insertedContactId)
        .maybeSingle()
    : { data: null, error: null };

  const storedRelevance = insertedContactId
    ? await supabase
        .from("contact_service_relevance")
        .select("id, contact_id, service_id, stp_score_id, relevance_score, buying_role, relevance_reason")
        .eq("contact_id", insertedContactId)
        .maybeSingle()
    : { data: null, error: null };

  const groupContacts = await supabase
    .from("contacts")
    .select("id, company_id, full_name")
    .in("company_id", [PETRO_RABIGH_ACCOUNT_ID, PETRO_RABIGH_POLYMER_ID, PETRO_RABIGH_REFINING_ID]);

  const after = {
    companies: await countTable("companies"),
    pchStp: await countPchStp(),
    contacts: await countTable("contacts"),
    relevance: await countTable("contact_service_relevance"),
    locations: await countTable("company_locations"),
  };

  const row = storedContact.data;
  const rel = storedRelevance.data;
  const groupRows = groupContacts.data ?? [];
  const facilityClones = groupRows.filter(
    (item) => item.company_id === PETRO_RABIGH_POLYMER_ID || item.company_id === PETRO_RABIGH_REFINING_ID,
  );

  const verification = {
    contactFound: Boolean(row),
    name: row?.full_name === "Fahad AlTherwi",
    title: row?.job_title === "Vice President of Engineering and Support",
    companyIdIsAccount: row?.company_id === PETRO_RABIGH_ACCOUNT_ID,
    sourceUrl: row?.source_url === FAHAD_ALTHERWI_SOURCE_URL,
    evidenceType: row?.evidence_type === "Official website",
    sourceNamePresent: Boolean(row?.source_name?.trim()),
    verificationStatus: row?.verification_status === "Verified",
    sourceConfidence: row?.source_confidence === "HIGH",
    noFacilityClone: facilityClones.length === 0,
    oneContactInGroup: groupRows.length === 1 && groupRows[0]?.company_id === PETRO_RABIGH_ACCOUNT_ID,
    relevancePch: rel?.service_id === PCH_SERVICE_ID,
    relevanceNoFacilityStp: rel?.stp_score_id == null,
    companiesUnchanged: after.companies.count === EXPECTED_COMPANIES && before.companies.count === EXPECTED_COMPANIES,
    pchStpUnchanged: after.pchStp.count === EXPECTED_PCH_STP && before.pchStp.count === EXPECTED_PCH_STP,
    locationsUnchanged: after.locations.count === before.locations.count,
    contactsPlusOne: before.contacts.count === 0 && after.contacts.count === 1,
    relevancePlusOne: before.relevance.count === 0 && after.relevance.count === 1,
    noWriteError: writeError === null,
  };

  const pass = insertAttempted && Object.values(verification).every(Boolean);

  const report = {
    "STEP 7.10 STATUS": pass ? "PASS" : "FAIL",
    "CONTACT INSERTED": insertAttempted && insertedContactId ? "YES" : "NO",
    "CONTACT ID": insertedContactId,
    "RELEVANCE ID": insertedRelevanceId,
    "CONTACT DECISION": plan.contactDecision,
    "RESOLVED GRAIN": plan.resolvedGrain,
    "RESOLVED COMPANY_ID": plan.resolvedCompanyId,
    "DUPLICATE CHECK": plan.duplicate.hit ? `HIT: ${plan.duplicate.reasons.join("; ")}` : "CLEAR",
    "FACILITY CLONE CHECK": facilityClones.length === 0 ? "PASS — no polymer/refining contact rows" : "FAIL",
    COMPANIES: after.companies.count,
    "PCH STP": after.pchStp.count,
    CONTACTS: after.contacts.count,
    "CONTACT SERVICE RELEVANCE": after.relevance.count,
    "NEXT SMALLEST SAFE STEP": pass
      ? "STOP. Do not start STEP 7.11 until requested."
      : "Fix insert/verification failures. Do not start STEP 7.11.",
    insertGates,
    verification,
    writeError,
    flags: { write, confirmInsert },
    storedContact: storedContact.data,
    storedRelevance: storedRelevance.data,
    groupContacts: groupRows,
    counts: { before, after },
    catalogErrors: catalog.errors,
    unitSelfTest: unit,
    storedContactError: storedContact.error?.message ?? null,
    storedRelevanceError: storedRelevance.error?.message ?? null,
    groupContactsError: groupContacts.error?.message ?? null,
  };

  console.log(JSON.stringify(report, null, 2));
  if (!pass) process.exit(1);
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
