/**
 * STEP 7.5 self-test for contact collection rules.
 * Does not insert contacts, scrape, or modify companies / STP rows.
 */
import {
  evaluateContactCandidate,
  validateCollectionRulesModel,
  type ContactCandidate,
} from "./collection-rules";

function base(overrides: Partial<ContactCandidate> = {}): ContactCandidate {
  return {
    serviceCode: "PCH",
    companyId: "company-1",
    targetCompanyName: "Petro Rabigh Polymer Operations",
    rankedForService: true,
    fullName: "Example Person",
    jobTitle: "Laboratory Manager",
    departmentName: "Laboratory",
    jobFunctionCode: "laboratory",
    email: null,
    phone: null,
    linkedinUrl: null,
    sourceUrl: "https://www.petrorabigh.com/en/about/leadership",
    sourceName: "Petro Rabigh leadership page",
    evidenceType: "Official website",
    sourceConfidence: "HIGH",
    claimedVerification: "Partially Verified",
    verifiedAt: null,
    companyNameOnSource: "Petro Rabigh",
    sourceShowsCurrentRole: true,
    sourceShowsEmail: false,
    sourceShowsPhone: false,
    sourceConfirmsSameCompany: true,
    existingAtCompany: [],
    ...overrides,
  };
}

export function runContactCollectionSelfTest(): { ok: boolean; failures: string[] } {
  const model = validateCollectionRulesModel();
  const failures: string[] = [];
  if (!model.ok) failures.push(...model.errors);

  const cases: Array<{ name: string; candidate: ContactCandidate; decision: string; verified?: string }> = [
    { name: "official-partial", candidate: base(), decision: "ACCEPT", verified: "Partially Verified" },
    {
      name: "official-verified",
      candidate: base({ claimedVerification: "Verified", verifiedAt: "2026-08-27" }),
      decision: "ACCEPT",
      verified: "Verified",
    },
    {
      name: "invented-role",
      candidate: base({ fullName: "QA Manager", jobTitle: "QA Manager" }),
      decision: "REJECT",
    },
    {
      name: "linkedin-only",
      candidate: base({
        evidenceType: "LinkedIn",
        sourceUrl: "https://www.linkedin.com/in/example-person/",
        sourceName: "LinkedIn profile",
        claimedVerification: "Unverified",
      }),
      decision: "HOLD",
    },
    {
      name: "linkedin-claimed-verified",
      candidate: base({
        evidenceType: "LinkedIn",
        sourceUrl: "https://www.linkedin.com/in/example-person/",
        sourceName: "LinkedIn profile",
        claimedVerification: "Verified",
        verifiedAt: "2026-08-27",
      }),
      decision: "REJECT",
    },
    {
      name: "duplicate-name",
      candidate: base({
        existingAtCompany: [{ fullName: "Example Person", email: null, linkedinUrl: null }],
      }),
      decision: "REJECT",
    },
    {
      name: "duplicate-email",
      candidate: base({
        email: "person@petrorabigh.com",
        sourceShowsEmail: true,
        existingAtCompany: [{ fullName: "Other Person", email: "person@petrorabigh.com", linkedinUrl: null }],
      }),
      decision: "REJECT",
    },
    {
      name: "wrong-company",
      candidate: base({
        companyNameOnSource: "Unrelated Chemicals Co",
        sourceConfirmsSameCompany: true,
      }),
      decision: "REJECT",
    },
    {
      name: "invented-email",
      candidate: base({ email: "example.person@petrorabigh.com", sourceShowsEmail: false }),
      decision: "REJECT",
    },
  ];

  for (const item of cases) {
    const result = evaluateContactCandidate(item.candidate);
    if (result.decision !== item.decision) {
      failures.push(`${item.name}: expected ${item.decision}, got ${result.decision} (${result.reasons.join("; ")})`);
    }
    if (item.verified && result.derivedVerification !== item.verified) {
      failures.push(`${item.name}: expected ${item.verified}, got ${result.derivedVerification}`);
    }
  }

  return { ok: failures.length === 0, failures };
}

if (process.argv[1]?.includes("run-step-75-self-test")) {
  const result = runContactCollectionSelfTest();
  console.log(JSON.stringify(result, null, 2));
  if (!result.ok) process.exit(1);
}
