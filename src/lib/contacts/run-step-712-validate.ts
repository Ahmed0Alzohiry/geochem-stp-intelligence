/**
 * STEP 7.12 — read-only Contact Intelligence sample validation.
 * Does not insert, scrape, or invent people.
 */
import { evaluateContactCandidate } from "./collection-rules";
import { resolveContactPersistGrain, visibleContactsForCompany } from "./persist-grain";
import { buildContactPersistPlan } from "./persist-write";
import {
  FAHAD_ALTHERWI_EVIDENCE_NOTES,
  FAHAD_ALTHERWI_PERSONA_KEY,
  PETRO_RABIGH_ACCOUNT_ID,
  PETRO_RABIGH_GROUP_KEY,
  PETRO_RABIGH_POLYMER_ID,
  PETRO_RABIGH_POLYMER_STP_ID,
  PETRO_RABIGH_REFINING_ID,
  fahadAlTherwiCandidate,
} from "./petro-rabigh-vp-candidate";
import { runPersistGrainSelfTest } from "./run-step-78-self-test";
import { runContactPersistWriterSelfTest } from "./run-step-79-self-test";
import { PCH_CONTACT_PERSONAS, validateServicePersonaMap } from "./service-persona-map";
import { loadEnvLocal } from "../stp/build-pch-persist-payload";
import { getVisiblePersistedContacts } from "../supabase/persisted-contacts";
import { createSupabaseBrowserClient } from "../supabase/client";
import {
  DEFAULT_STP_SERVICE_CODE,
  getAccountGroupMembers,
  getStpAccountDetail,
  getStpCurrentForService,
} from "../supabase/stp-current";

const PCH_SERVICE_ID = "a5c12354-6cfb-4455-a50a-78bebbc51867";
const EXPECTED_CONTACT_ID = "7cd21465-0f51-4f35-b5fe-af79b55499bd";
const FAHAD_NAME = "Fahad AlTherwi";

async function countTable(table: string, idCol = "id") {
  const supabase = createSupabaseBrowserClient();
  const { count, error } = await supabase.from(table).select(idCol, { count: "exact", head: true });
  return { count: error ? null : (count ?? 0), error: error?.message ?? null };
}

async function main() {
  loadEnvLocal();
  const supabase = createSupabaseBrowserClient();
  const grainUnit = runPersistGrainSelfTest();
  const writerUnit = runContactPersistWriterSelfTest();
  const personas = validateServicePersonaMap();

  const before = {
    companies: await countTable("companies"),
    contacts: await countTable("contacts"),
    relevance: await countTable("contact_service_relevance"),
    locations: await countTable("company_locations"),
    pchCurrent: await supabase
      .from("company_service_stp_current")
      .select("id", { count: "exact", head: true })
      .eq("service_id", PCH_SERVICE_ID),
    pchScores: await supabase
      .from("company_service_stp_scores")
      .select("id", { count: "exact", head: true })
      .eq("service_id", PCH_SERVICE_ID),
  };

  const ranking = await getStpCurrentForService({ service: DEFAULT_STP_SERVICE_CODE, page: "1" });
  const rank1 = ranking.rows[0];
  const rank2 = ranking.rows[1];
  const firstAccount = ranking.rows.find((row) => row.entityType === "ACCOUNT");
  const refiningStp = ranking.rows.find((row) => row.companyId === PETRO_RABIGH_REFINING_ID);

  const { data: refiningLookup } = await supabase
    .from("company_service_stp_current")
    .select("id, company_id, entity_type, account_group_key")
    .eq("service_id", PCH_SERVICE_ID)
    .eq("company_id", PETRO_RABIGH_REFINING_ID)
    .maybeSingle();

  type Sample = {
    label: string;
    stpId: string;
    expectedCompanyId?: string;
    expectFahad: boolean;
    expectFahadMode?: "OWNED" | "INHERITED_FROM_ACCOUNT";
  };

  const samples: Sample[] = [];
  if (rank1) {
    samples.push({
      label: `Rank ${rank1.rank} ${rank1.companyName}`,
      stpId: rank1.id,
      expectedCompanyId: PETRO_RABIGH_POLYMER_ID,
      expectFahad: true,
      expectFahadMode: "INHERITED_FROM_ACCOUNT",
    });
  }
  if (rank2) {
    samples.push({
      label: `Rank ${rank2.rank} ${rank2.companyName}`,
      stpId: rank2.id,
      expectFahad: false,
    });
  }
  if (firstAccount && firstAccount.id !== rank1?.id && firstAccount.id !== rank2?.id) {
    samples.push({
      label: `Rank ${firstAccount.rank} ${firstAccount.companyName} (ACCOUNT)`,
      stpId: firstAccount.id,
      expectFahad: firstAccount.accountGroupKey === PETRO_RABIGH_GROUP_KEY,
      expectFahadMode: firstAccount.accountGroupKey === PETRO_RABIGH_GROUP_KEY ? "OWNED" : undefined,
    });
  }
  if (refiningLookup?.id && !samples.some((row) => row.stpId === refiningLookup.id)) {
    samples.push({
      label: "Petro Rabigh Refining Operations (sibling facility)",
      stpId: refiningLookup.id,
      expectedCompanyId: PETRO_RABIGH_REFINING_ID,
      expectFahad: true,
      expectFahadMode: "INHERITED_FROM_ACCOUNT",
    });
  }

  const accountResults: Array<Record<string, unknown>> = [];
  const grainFails: string[] = [];
  const personaFails: string[] = [...personas.errors];
  const inheritFails: string[] = [];
  const dedupFails: string[] = [];
  const relevanceFails: string[] = [];
  const detailFails: string[] = [];

  const { personasForService } = await import("./service-persona-map");
  const personaChecks = {
    eightPchPersonas: PCH_CONTACT_PERSONAS.length === 8,
    mapValid: personas.ok,
    otherServicesEmpty: ["PET", "MIN", "OCM", "MCT", "INS", "LAB"].every(
      (code) => personasForService(code).length === 0,
    ),
    envPersonas: personasForService("ENV").length === 8,
  };
  if (!personaChecks.eightPchPersonas) personaFails.push("expected 8 PCH personas");
  if (!personaChecks.envPersonas) personaFails.push("expected 8 ENV Wave-1 personas");
  if (!personaChecks.otherServicesEmpty) personaFails.push("non-PCH/ENV persona maps must be empty");

  const liveContacts = await supabase.from("contacts").select("id, company_id, full_name");
  const liveRelevance = await supabase
    .from("contact_service_relevance")
    .select("id, contact_id, service_id, buying_role, relevance_score, stp_score_id");
  const contactRows = liveContacts.data ?? [];
  const relevanceRows = liveRelevance.data ?? [];
  if (contactRows.length !== 1) detailFails.push(`expected 1 contact row, got ${contactRows.length}`);
  if (relevanceRows.length !== 1) relevanceFails.push(`expected 1 relevance row, got ${relevanceRows.length}`);
  if (contactRows[0]?.id !== EXPECTED_CONTACT_ID) detailFails.push("unexpected contact id");
  if (contactRows[0]?.company_id !== PETRO_RABIGH_ACCOUNT_ID) {
    inheritFails.push("persisted contact must stay on ACCOUNT parent");
  }
  if (contactRows.filter((row) => row.company_id === PETRO_RABIGH_POLYMER_ID).length > 0) {
    inheritFails.push("contact incorrectly copied onto polymer facility");
  }
  if (contactRows.filter((row) => row.company_id === PETRO_RABIGH_REFINING_ID).length > 0) {
    inheritFails.push("contact incorrectly copied onto refining facility");
  }
  const rel = relevanceRows[0];
  if (rel?.service_id !== PCH_SERVICE_ID) relevanceFails.push("relevance must be PCH");
  if (rel?.contact_id !== EXPECTED_CONTACT_ID) relevanceFails.push("relevance must point at the one contact");
  if (rel?.buying_role !== "TECHNICAL") relevanceFails.push("buying_role must be TECHNICAL");
  if (Number(rel?.relevance_score) !== 85) relevanceFails.push("relevance_score must be 85");
  if (rel?.stp_score_id === PETRO_RABIGH_POLYMER_STP_ID) {
    relevanceFails.push("must not reuse facility STP id");
  }
  if (rel?.stp_score_id != null) relevanceFails.push("parent has no PCH STP row; stp_score_id must be null");

  for (const sample of samples) {
    const failures: string[] = [];
    const detail = await getStpAccountDetail(sample.stpId, { service: DEFAULT_STP_SERVICE_CODE });
    if (!detail) {
      failures.push("Target Account Detail did not load");
      detailFails.push(`${sample.label}: detail missing`);
      accountResults.push({ sample: sample.label, stpId: sample.stpId, ok: false, failures });
      continue;
    }
    if (sample.expectedCompanyId && detail.companyId !== sample.expectedCompanyId) {
      failures.push(`company_id ${detail.companyId} !== ${sample.expectedCompanyId}`);
      grainFails.push(`${sample.label}: unexpected company`);
    }

    const members = await getAccountGroupMembers(detail.accountGroupKey);
    const account = members.find((row) => row.entityType === "ACCOUNT");
    const captureType = members.find((row) => row.companyId === detail.companyId)?.entityType ?? detail.entityType;
    const grainCorporate = resolveContactPersistGrain({
      captureCompanyId: detail.companyId,
      captureCompanyName: detail.companyName,
      captureEntityType: (captureType as "ACCOUNT" | "FACILITY" | "BRANCH" | "RELATED" | "REVIEW" | null) ?? null,
      accountGroupKey: detail.accountGroupKey,
      groupMembers: members,
      companyNameOnSource: captureType === "ACCOUNT" ? detail.companyName : "Corporate group",
      jobTitle: "Vice President of Engineering and Support",
      evidenceNotes: "Executive Management profile (grain dry-run only).",
      sourceUrl: "https://example.invalid/official-executive",
      facilityRelationshipProven: false,
    });
    if (captureType === "RELATED" || captureType === "REVIEW") {
      if (grainCorporate.persistAllowed) {
        grainFails.push(`${sample.label}: RELATED/REVIEW must not own contacts`);
        failures.push("RELATED/REVIEW persist allowed");
      }
    } else if (captureType === "FACILITY" || captureType === "BRANCH") {
      if (account) {
        if (grainCorporate.persistCompanyId !== account.companyId) {
          grainFails.push(`${sample.label}: corporate exec must attach to ACCOUNT, not facility`);
          failures.push(`grain persist ${grainCorporate.persistCompanyId}`);
        }
        if (grainCorporate.grain !== "ACCOUNT_GROUP_PARENT") {
          grainFails.push(`${sample.label}: expected ACCOUNT_GROUP_PARENT, got ${grainCorporate.grain}`);
          failures.push(`grain ${grainCorporate.grain}`);
        }
      }
    } else if (captureType === "ACCOUNT") {
      if (grainCorporate.persistCompanyId !== detail.companyId || grainCorporate.grain !== "ACCOUNT") {
        grainFails.push(`${sample.label}: ACCOUNT capture should persist to self`);
        failures.push(`grain ${grainCorporate.grain} ${grainCorporate.persistCompanyId}`);
      }
    }

    const visible = await getVisiblePersistedContacts({
      viewCompanyId: detail.companyId,
      accountGroupKey: detail.accountGroupKey,
      serviceId: detail.serviceId,
      serviceCode: detail.serviceCode,
    });
    const fahad = visible.filter((row) => row.fullName === FAHAD_NAME);
    if (sample.expectFahad) {
      if (fahad.length !== 1) {
        inheritFails.push(`${sample.label}: expected inherited/owned Fahad, got ${fahad.length}`);
        failures.push("Fahad missing or duplicated in UI set");
      } else {
        if (fahad[0].owningCompanyId !== PETRO_RABIGH_ACCOUNT_ID) {
          inheritFails.push(`${sample.label}: Fahad owning company is not ACCOUNT`);
          failures.push("wrong owning company");
        }
        if (sample.expectFahadMode && fahad[0].displayMode !== sample.expectFahadMode) {
          inheritFails.push(`${sample.label}: expected ${sample.expectFahadMode}, got ${fahad[0].displayMode}`);
          failures.push(`display ${fahad[0].displayMode}`);
        }
        if (fahad[0].buyingRole !== "TECHNICAL" || fahad[0].relevanceScore !== 85) {
          relevanceFails.push(`${sample.label}: PCH relevance not shown`);
          failures.push("relevance display");
        }
      }
    } else if (fahad.length > 0) {
      inheritFails.push(`${sample.label}: Fahad leaked onto an unrelated account`);
      failures.push("incorrect cross-account copy");
    }

    const helperVisible = visibleContactsForCompany(
      detail.companyId,
      members,
      contactRows.map((row) => ({
        id: row.id as string,
        companyId: row.company_id as string,
        fullName: row.full_name as string,
      })),
    );
    const helperFahad = helperVisible.filter((row) => row.fullName === FAHAD_NAME);
    if (helperFahad.length !== fahad.length) {
      inheritFails.push(`${sample.label}: UI loader disagrees with grain inherit helper`);
      failures.push("loader/helper mismatch");
    }

    accountResults.push({
      sample: sample.label,
      stpId: sample.stpId,
      companyId: detail.companyId,
      companyName: detail.companyName,
      entityType: captureType,
      accountGroupKey: detail.accountGroupKey,
      rank: detail.rank,
      grain: { grain: grainCorporate.grain, persistCompanyId: grainCorporate.persistCompanyId },
      visibleContactIds: visible.map((row) => row.id),
      visibleFahad: fahad.map((row) => ({ mode: row.displayMode, owner: row.owningCompanyId })),
      ok: failures.length === 0,
      failures,
    });
  }

  const petroMembers = await getAccountGroupMembers(PETRO_RABIGH_GROUP_KEY);
  const existingStubs = contactRows.map((row) => ({
    companyId: row.company_id as string,
    fullName: row.full_name as string,
    email: null as string | null,
    linkedinUrl: null as string | null,
  }));
  const dupPlan = buildContactPersistPlan({
    candidate: fahadAlTherwiCandidate(
      existingStubs.map((row) => ({ fullName: row.fullName, email: row.email, linkedinUrl: row.linkedinUrl })),
    ),
    captureCompanyId: PETRO_RABIGH_POLYMER_ID,
    captureCompanyName: "Petro Rabigh Polymer Operations",
    captureEntityType: "FACILITY",
    accountGroupKey: PETRO_RABIGH_GROUP_KEY,
    groupMembers: petroMembers,
    evidenceNotes: FAHAD_ALTHERWI_EVIDENCE_NOTES,
    catalog: {
      departmentId: "dept-engineering",
      jobFunctionId: "fn-technical-services",
      serviceId: PCH_SERVICE_ID,
      stpScoreId: null,
      stpScoreCompanyId: null,
    },
    existing: existingStubs,
    personaKey: FAHAD_ALTHERWI_PERSONA_KEY,
  });
  if (!dupPlan.duplicate.hit || dupPlan.safeToPersist || dupPlan.contactDecision === "ACCEPT") {
    dedupFails.push("live Fahad must block a second persist of the same person");
  }
  const evalDup = evaluateContactCandidate(
    fahadAlTherwiCandidate(
      existingStubs.map((row) => ({ fullName: row.fullName, email: row.email, linkedinUrl: row.linkedinUrl })),
    ),
  );
  if (!evalDup.duplicate || evalDup.decision === "ACCEPT") {
    dedupFails.push("collection rules must reject duplicate name at company/group stubs");
  }

  if (!grainUnit.ok) grainFails.push(...grainUnit.failures);
  if (!writerUnit.ok) dedupFails.push(...writerUnit.failures);

  const after = {
    companies: await countTable("companies"),
    contacts: await countTable("contacts"),
    relevance: await countTable("contact_service_relevance"),
    locations: await countTable("company_locations"),
    pchCurrent: await supabase
      .from("company_service_stp_current")
      .select("id", { count: "exact", head: true })
      .eq("service_id", PCH_SERVICE_ID),
    pchScores: await supabase
      .from("company_service_stp_scores")
      .select("id", { count: "exact", head: true })
      .eq("service_id", PCH_SERVICE_ID),
  };

  const frozen = {
    companies: before.companies.count === 1769 && after.companies.count === 1769,
    pchCurrent: before.pchCurrent.count === 350 && after.pchCurrent.count === 350,
    pchScores: before.pchScores.count === 350 && after.pchScores.count === 350,
    contacts: before.contacts.count === 1 && after.contacts.count === 1,
    relevance: before.relevance.count === 1 && after.relevance.count === 1,
    locations: before.locations.count === after.locations.count,
  };
  if (!Object.values(frozen).every(Boolean)) {
    detailFails.push(`frozen counts failed: ${JSON.stringify({ before, after, frozen })}`);
  }

  const dimensions = {
    "account grain": grainFails.length === 0 ? "PASS" : "FAIL",
    "persona mapping": personaFails.length === 0 ? "PASS" : "FAIL",
    inheritance: inheritFails.length === 0 ? "PASS" : "FAIL",
    deduplication: dedupFails.length === 0 ? "PASS" : "FAIL",
    "service relevance": relevanceFails.length === 0 ? "PASS" : "FAIL",
    "Target Account Detail":
      detailFails.length === 0 && accountResults.every((row) => row.ok) ? "PASS" : "FAIL",
  };
  const pass = Object.values(dimensions).every((value) => value === "PASS");

  console.log(
    JSON.stringify(
      {
        "STEP 7.12 STATUS": pass ? "PASS" : "FAIL",
        dimensions,
        testedAccounts: accountResults,
        refiningInRanking: Boolean(refiningStp),
        refiningHasCurrentStp: Boolean(refiningLookup?.id),
        failures: { grainFails, personaFails, inheritFails, dedupFails, relevanceFails, detailFails },
        frozen,
        counts: {
          companies: after.companies.count,
          pchCurrent: after.pchCurrent.count,
          contacts: after.contacts.count,
          relevance: after.relevance.count,
        },
        next: "STOP. Do not start STEP 7.13 until requested.",
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
