/**
 * STEP 7.6 worksheet self-test. Does not insert contacts or invent real people.
 */
import { PETRO_RABIGH_GROUP } from "./petro-rabigh-vp-candidate";
import { EMPTY_WORKSHEET_DRAFT, evaluateWorksheet, type WorksheetAccountContext } from "./worksheet";

const RANK_ONE: WorksheetAccountContext = {
  companyId: "bcb70c34-0c5e-4316-8f64-d4e3fb1d45fe",
  companyName: "Petro Rabigh Polymer Operations",
  serviceCode: "PCH",
  serviceName: "Petrochemical Services",
  rank: 1,
  tier: "Tier 2",
  commercialScore: 97.2,
  rankedForService: true,
  entityType: "FACILITY",
  accountGroupKey: "er:v1:id:039f7219-431b-4467-9a89-9cdc89b1e226",
  groupMembers: PETRO_RABIGH_GROUP,
  existingAtCompany: [],
};

export function runWorksheetSelfTest(): { ok: boolean; failures: string[] } {
  const failures: string[] = [];
  const empty = evaluateWorksheet(RANK_ONE, EMPTY_WORKSHEET_DRAFT);
  if (empty.decision !== "REJECT") failures.push(`empty draft expected REJECT, got ${empty.decision}`);
  if (!empty.persistBlocked) failures.push("persist must stay blocked");

  const invented = evaluateWorksheet(RANK_ONE, {
    ...EMPTY_WORKSHEET_DRAFT,
    personaKey: "Laboratory::laboratory",
    fullName: "QA Manager",
    jobTitle: "QA Manager",
    sourceUrl: "https://www.example.com/about",
    sourceName: "Example",
    evidenceType: "Official website",
    sourceConfidence: "HIGH",
    evidenceNotes: "No person named; title only.",
    sourceShowsCurrentRole: true,
    sourceConfirmsSameCompany: true,
    companyNameOnSource: "Petro Rabigh",
  });
  if (invented.decision !== "REJECT") {
    failures.push(`invented role expected REJECT, got ${invented.decision} (${invented.reasons.join("; ")})`);
  }

  const fahadDraft = {
    ...EMPTY_WORKSHEET_DRAFT,
    personaKey: "Engineering::technical_services",
    fullName: "Fahad AlTherwi",
    jobTitle: "Vice President of Engineering and Support",
    sourceUrl:
      "https://www.petrorabigh.com/en/AboutPRC/BoardAndExecutiveManagement/ExecutiveManagement/Pages/Fahad%20AlTherwi.aspx",
    sourceName: "Petro Rabigh official Executive Management — Fahad AlTherwi",
    evidenceType: "Official website" as const,
    sourceConfidence: "HIGH" as const,
    evidenceNotes: "Official Executive Management profile. Appointed January 2024 as current role.",
    claimedVerification: "Verified" as const,
    verifiedAt: "2026-08-27",
    companyNameOnSource: "Petro Rabigh",
    sourceShowsCurrentRole: true,
    sourceConfirmsSameCompany: true,
  };
  const first = evaluateWorksheet(RANK_ONE, fahadDraft);
  if (first.decision !== "ACCEPT") {
    failures.push(`validated VP expected ACCEPT before persist, got ${first.decision} (${first.reasons.join("; ")})`);
  }
  const again = evaluateWorksheet(
    {
      ...RANK_ONE,
      existingAtCompany: [{ fullName: "Fahad AlTherwi", email: null, linkedinUrl: null }],
    },
    fahadDraft,
  );
  if (again.decision !== "REJECT") {
    failures.push(`persisted VP must REJECT as duplicate, got ${again.decision}`);
  }

  return { ok: failures.length === 0, failures };
}

if (process.argv[1]?.includes("run-step-76-self-test")) {
  const result = runWorksheetSelfTest();
  console.log(JSON.stringify(result, null, 2));
  if (!result.ok) process.exit(1);
}
