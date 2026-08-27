/**
 * STEP 7.9 persist-writer self-test. Does not insert contacts.
 */
import { buildContactPersistPlan, writeFlagsAllowInsert } from "./persist-write";
import {
  FAHAD_ALTHERWI_EVIDENCE_NOTES,
  FAHAD_ALTHERWI_PERSONA_KEY,
  FAHAD_ALTHERWI_SOURCE_URL,
  PETRO_RABIGH_ACCOUNT_ID,
  PETRO_RABIGH_GROUP,
  PETRO_RABIGH_POLYMER_ID,
  PETRO_RABIGH_POLYMER_STP_ID,
  fahadAlTherwiCandidate,
} from "./petro-rabigh-vp-candidate";

const CATALOG = {
  departmentId: "dept-engineering",
  jobFunctionId: "fn-technical-services",
  serviceId: "svc-pch",
  stpScoreId: null,
  stpScoreCompanyId: null,
};

function planFor(overrides: Partial<Parameters<typeof buildContactPersistPlan>[0]> = {}) {
  return buildContactPersistPlan({
    candidate: fahadAlTherwiCandidate(),
    captureCompanyId: PETRO_RABIGH_POLYMER_ID,
    captureCompanyName: "Petro Rabigh Polymer Operations",
    captureEntityType: "FACILITY",
    accountGroupKey: "er:v1:id:039f7219-431b-4467-9a89-9cdc89b1e226",
    groupMembers: PETRO_RABIGH_GROUP,
    evidenceNotes: FAHAD_ALTHERWI_EVIDENCE_NOTES,
    catalog: CATALOG,
    existing: [],
    personaKey: FAHAD_ALTHERWI_PERSONA_KEY,
    ...overrides,
  });
}

export function runContactPersistWriterSelfTest(): { ok: boolean; failures: string[] } {
  const failures: string[] = [];
  const plan = planFor();
  if (plan.contactDecision !== "ACCEPT") failures.push(`expected ACCEPT, got ${plan.contactDecision}`);
  if (plan.resolvedGrain !== "ACCOUNT_GROUP_PARENT") failures.push(`expected ACCOUNT_GROUP_PARENT, got ${plan.resolvedGrain}`);
  if (plan.resolvedCompanyId !== PETRO_RABIGH_ACCOUNT_ID) {
    failures.push(`must attach to ACCOUNT ${PETRO_RABIGH_ACCOUNT_ID}, got ${plan.resolvedCompanyId}`);
  }
  if (plan.contact?.company_id !== PETRO_RABIGH_ACCOUNT_ID) {
    failures.push("payload company_id must be the ACCOUNT parent");
  }
  if (plan.contact?.company_id === PETRO_RABIGH_POLYMER_ID) {
    failures.push("must not clone the VP onto the polymer facility");
  }
  if (plan.relevance?.stp_score_id === PETRO_RABIGH_POLYMER_STP_ID) {
    failures.push("must not reuse the ranked facility STP id");
  }
  if (plan.duplicate.hit) failures.push("expected no duplicate");
  if (!plan.safeToPersist) failures.push(`expected safeToPersist, gates=${JSON.stringify(plan.gates)}`);
  if (plan.contact?.verification_status !== "Verified" || !plan.contact?.source_url) {
    failures.push("ACCEPT payload must keep verification and source_url");
  }

  const dup = planFor({
    existing: [{ companyId: PETRO_RABIGH_ACCOUNT_ID, fullName: "Fahad AlTherwi", email: null, linkedinUrl: null }],
  });
  if (!dup.duplicate.hit || dup.safeToPersist) failures.push("group-name duplicate must block persist");

  const sourceDup = planFor({
    existing: [
      {
        companyId: PETRO_RABIGH_ACCOUNT_ID,
        fullName: "Different Person",
        email: null,
        linkedinUrl: null,
        sourceUrl: FAHAD_ALTHERWI_SOURCE_URL,
      },
    ],
  });
  if (!sourceDup.duplicate.hit || sourceDup.safeToPersist) {
    failures.push("same official source_url in the group must block persist");
  }

  const badName = planFor({
    candidate: { ...fahadAlTherwiCandidate(), fullName: "QA Manager", jobTitle: "QA Manager" },
  });
  if (badName.contactDecision !== "REJECT" || badName.safeToPersist) {
    failures.push("invented title-as-name must not persist");
  }

  const incomplete = planFor({
    candidate: { ...fahadAlTherwiCandidate(), sourceUrl: null, claimedVerification: "Unverified", verifiedAt: null },
  });
  if (incomplete.safeToPersist || incomplete.contactDecision === "ACCEPT") {
    failures.push("missing source_url must not persist");
  }

  if (writeFlagsAllowInsert([])) failures.push("insert must be blocked without flags");
  if (writeFlagsAllowInsert(["--write"])) failures.push("insert must be blocked without --confirm-insert");
  if (!writeFlagsAllowInsert(["--write", "--confirm-insert"])) failures.push("both safety flags must allow insert");

  return { ok: failures.length === 0, failures };
}

if (process.argv[1]?.includes("run-step-79-self-test")) {
  const result = runContactPersistWriterSelfTest();
  console.log(JSON.stringify(result, null, 2));
  if (!result.ok) process.exit(1);
}
