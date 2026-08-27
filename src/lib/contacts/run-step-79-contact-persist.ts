/**
 * STEP 7.9 controlled contact persist writer.
 * Default: dry-run only. Prints the payload that would be inserted.
 * INSERT is refused in this step even if --write is passed.
 * Does not modify companies, locations, STP scores, personas, or account groups.
 */
import { createSupabaseBrowserClient } from "../supabase/client";
import { loadEnvLocal } from "../stp/build-pch-persist-payload";
import { buildContactPersistPlan } from "./persist-write";
import { runContactPersistWriterSelfTest } from "./run-step-79-self-test";
import {
  FAHAD_ALTHERWI_EVIDENCE_NOTES,
  FAHAD_ALTHERWI_PERSONA_KEY,
  PETRO_RABIGH_ACCOUNT_ID,
  PETRO_RABIGH_GROUP_KEY,
  PETRO_RABIGH_POLYMER_ID,
  PETRO_RABIGH_POLYMER_STP_ID,
  fahadAlTherwiCandidate,
} from "./petro-rabigh-vp-candidate";
import type { AccountGroupMember } from "./persist-grain";
import type { ExistingContactStub } from "./persist-write";

const PCH_SERVICE_ID = "a5c12354-6cfb-4455-a50a-78bebbc51867";
const EXPECTED_COMPANIES = 1769;
const EXPECTED_PCH_STP = 350;
const WRITE_POLICY_FILE = "supabase/migrations/011_contact_persist_write_policies.sql";

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

async function probeInsertPolicy(): Promise<{ ready: boolean; detail: string }> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/, "");
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return { ready: false, detail: "Missing Supabase env" };
  const res = await fetch(`${url}/rest/v1/`, {
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      Accept: "application/openapi+json",
    },
  });
  if (!res.ok) return { ready: false, detail: `OpenAPI ${res.status}` };
  const spec = (await res.json()) as {
    paths?: Record<string, { post?: unknown; get?: unknown }>;
  };
  const contacts = spec.paths?.["/contacts"];
  const relevance = spec.paths?.["/contact_service_relevance"];
  const contactsPost = Boolean(contacts?.post);
  const relevancePost = Boolean(relevance?.post);
  if (contactsPost && relevancePost) {
    return { ready: true, detail: "PostgREST exposes POST on contacts and contact_service_relevance" };
  }
  return {
    ready: false,
    detail: `${WRITE_POLICY_FILE} written; live POST contacts=${contactsPost} relevance=${relevancePost}. APPLY 011 IN SUPABASE SQL EDITOR before any INSERT.`,
  };
}

async function loadCatalog() {
  const supabase = createSupabaseBrowserClient();
  const [departments, functions, services, parentStp, polymerStp] = await Promise.all([
    supabase.from("departments").select("id, name").eq("name", "Engineering").maybeSingle(),
    supabase.from("job_functions").select("id, function_code").eq("function_code", "technical_services").maybeSingle(),
    supabase.from("services").select("id, service_code").eq("service_code", "PCH").maybeSingle(),
    supabase
      .from("company_service_stp_scores")
      .select("id, company_id")
      .eq("service_id", PCH_SERVICE_ID)
      .eq("company_id", PETRO_RABIGH_ACCOUNT_ID)
      .maybeSingle(),
    supabase
      .from("company_service_stp_scores")
      .select("id, company_id")
      .eq("id", PETRO_RABIGH_POLYMER_STP_ID)
      .maybeSingle(),
  ]);
  const errors = [departments.error, functions.error, services.error, parentStp.error, polymerStp.error]
    .filter(Boolean)
    .map((err) => err!.message);
  return {
    errors,
    departmentId: departments.data?.id ?? "",
    jobFunctionId: functions.data?.id ?? "",
    serviceId: services.data?.id ?? "",
    stpScoreId: parentStp.data?.id ?? null,
    stpScoreCompanyId: parentStp.data?.company_id ?? null,
    polymerStpCompanyId: polymerStp.data?.company_id ?? null,
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
    .select("company_id, full_name, email, linkedin_url")
    .in("company_id", groupIds);
  if (error) throw new Error(error.message);
  return (data ?? []).map((row) => ({
    companyId: row.company_id as string,
    fullName: row.full_name as string,
    email: (row.email as string | null) ?? null,
    linkedinUrl: (row.linkedin_url as string | null) ?? null,
  }));
}

async function main() {
  loadEnvLocal();
  const write = hasFlag("--write");
  const confirmInsert = hasFlag("--confirm-insert");
  const unit = runContactPersistWriterSelfTest();

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

  const writePolicy = await probeInsertPolicy();
  const insertAttempted = false;
  const insertBlockedReason =
    write || confirmInsert
      ? "STEP 7.9 dry-run only. INSERT is refused even with --write / --confirm-insert."
      : "No --write flag. Dry-run only; no INSERT.";

  const after = {
    companies: await countTable("companies"),
    pchStp: await countPchStp(),
    contacts: await countTable("contacts"),
    relevance: await countTable("contact_service_relevance"),
    locations: await countTable("company_locations"),
  };

  const countsUnchanged =
    before.companies.count === EXPECTED_COMPANIES &&
    after.companies.count === EXPECTED_COMPANIES &&
    before.pchStp.count === EXPECTED_PCH_STP &&
    after.pchStp.count === EXPECTED_PCH_STP &&
    before.contacts.count === after.contacts.count &&
    before.relevance.count === after.relevance.count &&
    before.locations.count === after.locations.count;

  const dryRunPass =
    unit.ok &&
    plan.safeToPersist &&
    plan.contactDecision === "ACCEPT" &&
    plan.resolvedGrain === "ACCOUNT_GROUP_PARENT" &&
    plan.resolvedCompanyId === PETRO_RABIGH_ACCOUNT_ID &&
    plan.contact?.company_id === PETRO_RABIGH_ACCOUNT_ID &&
    plan.relevance?.stp_score_id !== PETRO_RABIGH_POLYMER_STP_ID &&
    !plan.duplicate.hit &&
    !insertAttempted &&
    countsUnchanged &&
    catalog.errors.length === 0 &&
    Boolean(plan.contact) &&
    Boolean(plan.relevance);

  const report = {
    "DRY RUN": dryRunPass ? "PASS" : "FAIL",
    "CONTACT DECISION": plan.contactDecision,
    "RESOLVED GRAIN": plan.resolvedGrain,
    "RESOLVED COMPANY_ID": plan.resolvedCompanyId,
    "RESOLVED COMPANY_NAME": plan.resolvedCompanyName,
    "DUPLICATE CHECK": plan.duplicate.hit ? `HIT: ${plan.duplicate.reasons.join("; ")}` : "CLEAR",
    "WRITE POLICY READY": writePolicy.ready
      ? "YES — live INSERT grants present (still do not INSERT in 7.9)"
      : `NO — ${writePolicy.detail}`,
    "SAFE TO PERSIST FIRST CONTACT":
      plan.safeToPersist && writePolicy.ready
        ? "PAYLOAD YES; INSERT NO this step (apply 011 if needed, then STEP 7.10 --write --confirm-insert)"
        : plan.safeToPersist
          ? "PAYLOAD YES; POLICY NOT LIVE; INSERT NO"
          : "NO",
    "STEP 7.9 STATUS": dryRunPass
      ? "COMPLETE — writer + 011 SQL ready; Petro Rabigh VP dry-run only; no INSERT"
      : "INCOMPLETE — see failures",
    "NEXT SMALLEST SAFE STEP": writePolicy.ready
      ? "STEP 7.10: INSERT Fahad AlTherwi with --write --confirm-insert only (one contact, parent ACCOUNT company_id)"
      : "APPLY 011 IN SUPABASE SQL EDITOR, then STEP 7.10 --write --confirm-insert for this one contact",
    writerVersion: plan.writerVersion,
    unitSelfTest: unit,
    gates: plan.gates,
    reasons: plan.reasons,
    catalogErrors: catalog.errors,
    insertAttempted,
    insertBlockedReason,
    flags: { write, confirmInsert },
    counts: { before, after, expectedCompanies: EXPECTED_COMPANIES, expectedPchStp: EXPECTED_PCH_STP },
    wouldHavePersisted: plan.safeToPersist
      ? {
          contacts: plan.contact,
          contact_service_relevance: plan.relevance,
        }
      : null,
  };

  console.log(JSON.stringify(report, null, 2));
  if (!dryRunPass) process.exit(1);
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
