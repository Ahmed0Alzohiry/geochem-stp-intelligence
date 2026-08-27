import type { ContactEvidenceType, ContactSourceConfidence, ContactVerificationStatus } from "../../types/contact-intelligence";
import type { JobFunctionCode, SeededDepartmentName } from "./service-persona-map";
import { JOB_FUNCTION_CATALOG, PCH_CONTACT_PERSONAS, SEEDED_DEPARTMENT_NAMES } from "./service-persona-map";

export const CONTACT_COLLECTION_RULES_VERSION = "7.5.0";

/** Collection is human research from a live public page. Automated site scraping is out of scope. */
export const CONTACT_COLLECTION_METHOD = "Human capture from a public page URL. Do not scrape. Do not invent names.";

export type ContactSourceTier = "A" | "B" | "C" | "D" | "INTERNAL" | "DISALLOWED";

export type ContactPersistDecision = "ACCEPT" | "HOLD" | "REJECT";

export type ContactSourceRule = {
  evidenceType: ContactEvidenceType;
  tier: ContactSourceTier;
  collectionPriority: number;
  persistAllowed: boolean;
  canSupportVerifiedAlone: boolean;
  notes: string;
};

export const CONTACT_SOURCE_RULES: ContactSourceRule[] = [
  {
    evidenceType: "Regulator / government",
    tier: "A",
    collectionPriority: 1,
    persistAllowed: true,
    canSupportVerifiedAlone: true,
    notes: "Official filing or directory that names the person in role at the target organization.",
  },
  {
    evidenceType: "Official website",
    tier: "B",
    collectionPriority: 2,
    persistAllowed: true,
    canSupportVerifiedAlone: true,
    notes: "Corporate domain leadership, laboratory, quality, or organization page that names the person.",
  },
  {
    evidenceType: "Company directory",
    tier: "B",
    collectionPriority: 3,
    persistAllowed: true,
    canSupportVerifiedAlone: true,
    notes: "Official staff/directory page on the corporate domain, not a third-party scrape dump.",
  },
  {
    evidenceType: "LinkedIn",
    tier: "C",
    collectionPriority: 4,
    persistAllowed: false,
    canSupportVerifiedAlone: false,
    notes: "Personal or company LinkedIn may corroborate. Not sufficient to persist or to mark Verified.",
  },
  {
    evidenceType: "Trade directory",
    tier: "D",
    collectionPriority: 5,
    persistAllowed: false,
    canSupportVerifiedAlone: false,
    notes: "Discovery only. Cannot persist a named contact from this source alone.",
  },
  {
    evidenceType: "News",
    tier: "D",
    collectionPriority: 6,
    persistAllowed: false,
    canSupportVerifiedAlone: false,
    notes: "Discovery or corroboration. Stale articles cannot prove current employment.",
  },
  {
    evidenceType: "Internal GEOCHEM",
    tier: "INTERNAL",
    collectionPriority: 7,
    persistAllowed: false,
    canSupportVerifiedAlone: false,
    notes: "Internal notes are not a public source. A named contact still needs a reliable public URL.",
  },
  {
    evidenceType: "Other",
    tier: "DISALLOWED",
    collectionPriority: 8,
    persistAllowed: false,
    canSupportVerifiedAlone: false,
    notes: "Reclassify to a typed source. Other is not an acceptance path.",
  },
];

export const PLACEHOLDER_NAME_PATTERN =
  /^(unknown|n\/a|n\.a\.|na|tbd|test|demo|contact|person|someone|lab manager|qa manager|quality manager|procurement|laboratory|the laboratory)$/i;

export const ROLE_MAILBOX_PATTERN = /^(info|lab|labs|quality|qa|qc|procurement|purchasing|sales|admin|office|contact|enquir(?:y|ies)|webmaster)@/i;

export type ContactCandidate = {
  serviceCode: string;
  companyId: string;
  targetCompanyName: string;
  rankedForService: boolean;
  fullName: string;
  jobTitle: string | null;
  departmentName: string | null;
  jobFunctionCode: string | null;
  email: string | null;
  phone: string | null;
  linkedinUrl: string | null;
  sourceUrl: string | null;
  sourceName: string | null;
  evidenceType: ContactEvidenceType | null;
  sourceConfidence: ContactSourceConfidence | null;
  claimedVerification: ContactVerificationStatus;
  verifiedAt: string | null;
  companyNameOnSource: string | null;
  sourceShowsCurrentRole: boolean;
  sourceShowsEmail: boolean;
  sourceShowsPhone: boolean;
  sourceConfirmsSameCompany: boolean;
  existingAtCompany: Array<{ fullName: string; email: string | null; linkedinUrl: string | null }>;
};

export type ContactEvaluation = {
  decision: ContactPersistDecision;
  derivedVerification: ContactVerificationStatus;
  sourceTier: ContactSourceTier | null;
  reasons: string[];
  duplicate: boolean;
  personaMatched: boolean;
  persistReady: boolean;
};

function sourceRule(evidenceType: ContactEvidenceType | null): ContactSourceRule | null {
  if (!evidenceType) return null;
  return CONTACT_SOURCE_RULES.find((row) => row.evidenceType === evidenceType) ?? null;
}

function normalizeName(value: string): string {
  return value
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[^a-z0-9\u0600-\u06ff]+/g, " ")
    .replace(/\b(ltd|limited|llc|inc|co|company|corp|corporation|sa|pjsc)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function significantTokens(value: string): string[] {
  return normalizeName(value)
    .split(" ")
    .filter((token) => token.length >= 3);
}

function companyNamesAlign(target: string, onSource: string | null): boolean {
  if (!onSource?.trim()) return false;
  const targetTokens = new Set(significantTokens(target));
  const sourceTokens = significantTokens(onSource);
  if (targetTokens.size === 0 || sourceTokens.length === 0) return false;
  return sourceTokens.some((token) => targetTokens.has(token));
}

function isHttpUrl(value: string | null): boolean {
  if (!value?.trim()) return false;
  try {
    const parsed = new URL(value.trim());
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

function isLikelyEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

function nameLooksInvented(fullName: string): boolean {
  const trimmed = fullName.trim();
  if (trimmed.length < 3) return true;
  if (PLACEHOLDER_NAME_PATTERN.test(trimmed)) return true;
  const parts = trimmed.split(/\s+/).filter(Boolean);
  if (parts.length < 2) return true;
  if (parts.every((part) => part.length === 1)) return true;
  return false;
}

function isPchPersona(departmentName: string | null, jobFunctionCode: string | null): boolean {
  if (!departmentName || !jobFunctionCode) return false;
  const deptOk = (SEEDED_DEPARTMENT_NAMES as readonly string[]).includes(departmentName);
  const fnOk = JOB_FUNCTION_CATALOG.some((item) => item.functionCode === jobFunctionCode);
  if (!deptOk || !fnOk) return false;
  return PCH_CONTACT_PERSONAS.some(
    (row) =>
      row.departmentName === (departmentName as SeededDepartmentName) &&
      row.jobFunctionCode === (jobFunctionCode as JobFunctionCode),
  );
}

function isDuplicate(candidate: ContactCandidate): boolean {
  const name = normalizeName(candidate.fullName);
  const email = candidate.email?.trim().toLowerCase() ?? "";
  const linkedin = candidate.linkedinUrl?.trim().toLowerCase() ?? "";
  return candidate.existingAtCompany.some((row) => {
    if (email && row.email?.trim().toLowerCase() === email) return true;
    if (linkedin && row.linkedinUrl?.trim().toLowerCase() === linkedin) return true;
    return normalizeName(row.fullName) === name;
  });
}

function parseVerifiedAt(value: string | null): Date | null {
  if (!value?.trim()) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed;
}

function rankVerification(status: ContactVerificationStatus): number {
  if (status === "Verified") return 2;
  if (status === "Partially Verified") return 1;
  return 0;
}

export function evaluateContactCandidate(candidate: ContactCandidate): ContactEvaluation {
  const reasons: string[] = [];
  const reject: string[] = [];
  const rule = sourceRule(candidate.evidenceType);
  const personaMatched =
    candidate.serviceCode.toUpperCase() === "PCH"
      ? isPchPersona(candidate.departmentName, candidate.jobFunctionCode)
      : false;
  const duplicate = isDuplicate(candidate);
  const inventedName = nameLooksInvented(candidate.fullName);
  const titleAsName = Boolean(
    candidate.jobTitle && normalizeName(candidate.fullName) === normalizeName(candidate.jobTitle),
  );
  const sameCompany =
    candidate.sourceConfirmsSameCompany &&
    companyNamesAlign(candidate.targetCompanyName, candidate.companyNameOnSource);
  const evidenceComplete = Boolean(
    isHttpUrl(candidate.sourceUrl) &&
      candidate.sourceName?.trim() &&
      candidate.evidenceType &&
      candidate.sourceConfidence,
  );
  const identityOk =
    !inventedName &&
    !titleAsName &&
    Boolean(candidate.jobTitle?.trim()) &&
    candidate.sourceShowsCurrentRole &&
    sameCompany;

  if (!candidate.companyId.trim()) reject.push("company_id is required.");
  if (!candidate.rankedForService) {
    reject.push("Collect named contacts only for companies already ranked for the selected service.");
  }
  if (inventedName) {
    reject.push("full_name looks invented, generic, or incomplete. Capture the name as printed on the source.");
  }
  if (titleAsName) reject.push("full_name must be a person, not a job title.");
  if (!isHttpUrl(candidate.sourceUrl)) {
    reject.push("A public http(s) source_url is required. Do not invent a URL.");
  }
  if (!candidate.sourceName?.trim()) reject.push("source_name is required with the evidence bundle.");
  if (!candidate.evidenceType) reject.push("evidence_type is required.");
  if (!candidate.sourceConfidence) reject.push("source_confidence is required.");
  if (candidate.evidenceType && !rule) reject.push("Unknown evidence_type.");
  if (rule?.tier === "DISALLOWED") reject.push("evidence_type Other is not an acceptance path.");
  if (!sameCompany) {
    reject.push("Source must name the same company as the ranked target. Do not infer across a group.");
  }
  if (!candidate.sourceShowsCurrentRole) {
    reject.push("Source must show a current role at that company. Do not use former-job inference.");
  }
  if (duplicate) reject.push("Duplicate person at this company (name, email, or LinkedIn).");
  if (candidate.email?.trim()) {
    if (!isLikelyEmail(candidate.email)) reject.push("email is malformed.");
    if (ROLE_MAILBOX_PATTERN.test(candidate.email.trim())) {
      reject.push("A shared mailbox is not a named contact.");
    }
    if (!candidate.sourceShowsEmail) {
      reject.push("Do not invent email. Only store email if the source shows it.");
    }
  }
  if (candidate.phone?.trim() && !candidate.sourceShowsPhone) {
    reject.push("Do not invent phone. Only store phone if the source shows it.");
  }
  if (candidate.linkedinUrl?.trim() && !/linkedin\.com\//i.test(candidate.linkedinUrl)) {
    reject.push("linkedin_url must be a LinkedIn URL or left blank.");
  }

  const verifiedAt = parseVerifiedAt(candidate.verifiedAt);
  if (candidate.verifiedAt && !verifiedAt) reject.push("verified_at is not a valid date.");
  if (verifiedAt && verifiedAt.getTime() > Date.now() + 60_000) {
    reject.push("verified_at cannot be in the future.");
  }

  if (rule && !rule.persistAllowed) {
    reasons.push(`${candidate.evidenceType} is not a persist-ready public source. Hold as discovery only.`);
  }
  if (!candidate.jobTitle?.trim()) {
    reasons.push("job_title must be copied from the source.");
  }
  if (!personaMatched) {
    reasons.push("Department and job function must match an active PCH persona before persist.");
  }

  let derived: ContactVerificationStatus = "Unverified";
  if (evidenceComplete && identityOk && rule && rule.tier !== "DISALLOWED") {
    derived = "Partially Verified";
  }
  if (
    derived === "Partially Verified" &&
    rule?.canSupportVerifiedAlone &&
    rule.persistAllowed &&
    (candidate.sourceConfidence === "HIGH" || candidate.sourceConfidence === "MEDIUM") &&
    verifiedAt &&
    personaMatched &&
    candidate.rankedForService
  ) {
    derived = "Verified";
  }

  if (candidate.claimedVerification === "Verified" && !verifiedAt) {
    reject.push("verified_at is required when verification_status is Verified.");
  }
  if (rankVerification(candidate.claimedVerification) > rankVerification(derived)) {
    reject.push(`Cannot claim ${candidate.claimedVerification}; evidence supports ${derived} only.`);
  }
  if (candidate.claimedVerification === "Unverified" && verifiedAt) {
    reject.push("verified_at must be empty when verification_status is Unverified.");
  }

  const persistReady =
    reject.length === 0 &&
    rule?.persistAllowed === true &&
    evidenceComplete &&
    identityOk &&
    personaMatched &&
    candidate.rankedForService &&
    !duplicate &&
    rankVerification(candidate.claimedVerification) <= rankVerification(derived);

  let decision: ContactPersistDecision = "REJECT";
  if (persistReady) {
    decision = "ACCEPT";
    reasons.push(
      derived === "Verified"
        ? "Persist-ready: reliable public source, current role, PCH persona, verified_at set."
        : "Persist-ready as Partially Verified. Verified requires an A/B source, HIGH or MEDIUM confidence, and verified_at.",
    );
  } else if (
    reject.length === 0 &&
    evidenceComplete &&
    !inventedName &&
    !titleAsName &&
    isHttpUrl(candidate.sourceUrl)
  ) {
    decision = "HOLD";
  }

  if (decision !== "ACCEPT" && reject.length === 0 && reasons.length === 0) {
    reasons.push("Not persist-ready.");
  }

  return {
    decision,
    derivedVerification: derived,
    sourceTier: rule?.tier ?? null,
    reasons: [...new Set([...reject, ...reasons])],
    duplicate,
    personaMatched,
    persistReady,
  };
}

export function validateCollectionRulesModel(): { ok: boolean; errors: string[] } {
  const errors: string[] = [];
  const types = CONTACT_SOURCE_RULES.map((row) => row.evidenceType);
  if (new Set(types).size !== types.length) errors.push("Duplicate evidence_type in source rules.");
  if (!CONTACT_SOURCE_RULES.some((row) => row.canSupportVerifiedAlone && row.persistAllowed)) {
    errors.push("No persist-ready Verified path.");
  }
  if (CONTACT_SOURCE_RULES.some((row) => row.evidenceType === "LinkedIn" && row.persistAllowed)) {
    errors.push("LinkedIn must not be persist-ready.");
  }
  const persistTiers = new Set(CONTACT_SOURCE_RULES.filter((row) => row.persistAllowed).map((row) => row.tier));
  if (![...persistTiers].every((tier) => tier === "A" || tier === "B")) {
    errors.push("Only tiers A and B may persist named contacts.");
  }
  return { ok: errors.length === 0, errors };
}
