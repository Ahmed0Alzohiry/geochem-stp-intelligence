import { evaluateContactCandidate, type ContactCandidate } from "./collection-rules";
import { resolveContactPersistGrain, type AccountGroupMember, type ContactGrainDecision } from "./persist-grain";
import { personasForService } from "./service-persona-map";
import type { ServiceBuyingRole } from "../../types/contact-intelligence";

export const CONTACT_PERSIST_WRITER_VERSION = "7.12.1";

const BUYING_TO_CONTACT_ROLE: Record<ServiceBuyingRole, string> = {
  DECISION_MAKER: "Decision Maker",
  INFLUENCER: "Influencer",
  TECHNICAL: "Technical",
  PROCUREMENT: "Procurement",
  GATEKEEPER: "Gatekeeper",
  USER: "Other",
};

function normalizeName(value: string): string {
  return value
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[^a-z0-9\u0600-\u06ff]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export type ContactRowInsert = {
  company_id: string;
  full_name: string;
  job_title: string;
  department_id: string;
  job_function_id: string;
  company_location_id: null;
  email: string | null;
  phone: string | null;
  linkedin_url: string | null;
  contact_role: string;
  relationship_strength: "None";
  is_primary: false;
  notes: string;
  data_confidence: "Verified" | "Probable" | "Unknown";
  source_url: string;
  source_name: string;
  evidence_type: string;
  source_confidence: "HIGH" | "MEDIUM" | "LOW";
  verification_status: "Unverified" | "Partially Verified" | "Verified";
  verified_at: string | null;
};

export type ContactRelevanceInsert = {
  service_id: string;
  stp_score_id: string | null;
  relevance_score: number;
  buying_role: ServiceBuyingRole;
  relevance_reason: string;
};

export type ContactPersistPlan = {
  writerVersion: string;
  contactDecision: "ACCEPT" | "REVIEW" | "REJECT";
  resolvedGrain: ContactGrainDecision["grain"];
  resolvedCompanyId: string | null;
  resolvedCompanyName: string | null;
  wouldCloneFacility: boolean;
  duplicate: { hit: boolean; reasons: string[] };
  contact: ContactRowInsert | null;
  relevance: ContactRelevanceInsert | null;
  gates: Record<string, boolean>;
  reasons: string[];
  safeToPersist: boolean;
};

export type CatalogIds = {
  departmentId: string;
  jobFunctionId: string;
  serviceId: string;
  stpScoreId: string | null;
  stpScoreCompanyId: string | null;
};

export type ExistingContactStub = {
  companyId: string;
  fullName: string;
  email: string | null;
  linkedinUrl: string | null;
  sourceUrl?: string | null;
};

export function writeFlagsAllowInsert(argv: string[]): boolean {
  return argv.includes("--write") && argv.includes("--confirm-insert");
}

export function findGroupDuplicates(
  persistCompanyId: string,
  groupMembers: AccountGroupMember[],
  candidate: ContactCandidate,
  existing: ExistingContactStub[],
): string[] {
  const groupIds = new Set(groupMembers.map((row) => row.companyId));
  groupIds.add(persistCompanyId);
  const name = normalizeName(candidate.fullName);
  const email = candidate.email?.trim().toLowerCase() ?? "";
  const linkedin = candidate.linkedinUrl?.trim().toLowerCase() ?? "";
  const source = candidate.sourceUrl?.trim().toLowerCase() ?? "";
  const reasons: string[] = [];
  for (const row of existing) {
    if (!groupIds.has(row.companyId)) continue;
    if (normalizeName(row.fullName) === name) {
      reasons.push(`Duplicate full_name in account group on company ${row.companyId}`);
    }
    if (email && row.email?.trim().toLowerCase() === email) {
      reasons.push(`Duplicate email in account group on company ${row.companyId}`);
    }
    if (linkedin && row.linkedinUrl?.trim().toLowerCase() === linkedin) {
      reasons.push(`Duplicate LinkedIn in account group on company ${row.companyId}`);
    }
    if (source && row.sourceUrl?.trim().toLowerCase() === source) {
      reasons.push(`Duplicate source_url in account group on company ${row.companyId}`);
    }
  }
  return reasons;
}

function parentAttachedToAccount(
  grain: ContactGrainDecision,
  groupMembers: AccountGroupMember[],
): boolean {
  if (grain.grain !== "ACCOUNT" && grain.grain !== "ACCOUNT_GROUP_PARENT") return true;
  const persist = groupMembers.find((row) => row.companyId === grain.persistCompanyId);
  return persist?.entityType === "ACCOUNT";
}

export function buildContactPersistPlan(input: {
  candidate: ContactCandidate;
  captureCompanyId: string;
  captureCompanyName: string;
  captureEntityType: AccountGroupMember["entityType"] | null;
  accountGroupKey: string;
  groupMembers: AccountGroupMember[];
  evidenceNotes: string;
  catalog: CatalogIds;
  existing: ExistingContactStub[];
  personaKey: string;
}): ContactPersistPlan {
  const evaluation = evaluateContactCandidate({
    ...input.candidate,
    existingAtCompany: input.existing.map((row) => ({
      fullName: row.fullName,
      email: row.email,
      linkedinUrl: row.linkedinUrl,
    })),
  });
  const grain = resolveContactPersistGrain({
    captureCompanyId: input.captureCompanyId,
    captureCompanyName: input.captureCompanyName,
    captureEntityType: input.captureEntityType,
    accountGroupKey: input.accountGroupKey,
    groupMembers: input.groupMembers,
    companyNameOnSource: input.candidate.companyNameOnSource,
    jobTitle: input.candidate.jobTitle,
    evidenceNotes: input.evidenceNotes,
    sourceUrl: input.candidate.sourceUrl,
    facilityRelationshipProven: false,
  });
  const persona = personasForService(input.candidate.serviceCode).find(
    (row) => `${row.departmentName}::${row.jobFunctionCode}` === input.personaKey,
  );
  const duplicateReasons = grain.persistCompanyId
    ? findGroupDuplicates(grain.persistCompanyId, input.groupMembers, input.candidate, input.existing)
    : [];
  const wouldCloneFacility =
    (grain.grain === "ACCOUNT_GROUP_PARENT" || grain.grain === "ACCOUNT") &&
    Boolean(grain.persistCompanyId) &&
    grain.persistCompanyId === input.captureCompanyId &&
    input.captureEntityType !== "ACCOUNT";

  const evidenceOk = Boolean(
    input.candidate.sourceUrl &&
      input.candidate.sourceName &&
      input.candidate.evidenceType &&
      input.candidate.sourceConfidence &&
      input.evidenceNotes.trim() &&
      input.candidate.jobTitle &&
      input.candidate.fullName,
  );
  const verifiedOk =
    input.candidate.claimedVerification !== "Verified" || Boolean(input.candidate.verifiedAt);
  const attachedToAccount = parentAttachedToAccount(grain, input.groupMembers);
  const stpMatchesPersist =
    !input.catalog.stpScoreId ||
    (Boolean(grain.persistCompanyId) && input.catalog.stpScoreCompanyId === grain.persistCompanyId);

  const gates = {
    rulesAccept: evaluation.decision === "ACCEPT" && evaluation.persistReady,
    grainResolved: Boolean(grain.persistAllowed && grain.persistCompanyId && grain.grain),
    notFacilityClone: !wouldCloneFacility && attachedToAccount,
    noDuplicate: duplicateReasons.length === 0,
    evidenceComplete: evidenceOk && verifiedOk,
    personaKnown: Boolean(persona),
    catalogsPresent: Boolean(input.catalog.departmentId && input.catalog.jobFunctionId && input.catalog.serviceId),
    stpMatchesPersistCompany: stpMatchesPersist,
  };

  const reasons = [...evaluation.reasons, ...grain.reasons, ...duplicateReasons];
  if (wouldCloneFacility) reasons.push("Refusing facility clone of a parent/account-level contact.");
  if (!attachedToAccount) reasons.push("Parent/account-level contact must attach to the ACCOUNT company_id.");

  const contactDecision: ContactPersistPlan["contactDecision"] =
    evaluation.decision === "REJECT"
      ? "REJECT"
      : evaluation.decision === "ACCEPT" && grain.persistAllowed && duplicateReasons.length === 0 && !wouldCloneFacility && attachedToAccount
        ? "ACCEPT"
        : "REVIEW";

  const safeToPersist = contactDecision === "ACCEPT" && Object.values(gates).every(Boolean);

  let contact: ContactRowInsert | null = null;
  let relevance: ContactRelevanceInsert | null = null;
  if (
    grain.persistCompanyId &&
    persona &&
    input.candidate.jobTitle &&
    input.candidate.sourceUrl &&
    input.candidate.sourceName &&
    input.candidate.evidenceType &&
    input.candidate.sourceConfidence
  ) {
    contact = {
      company_id: grain.persistCompanyId,
      full_name: input.candidate.fullName.trim(),
      job_title: input.candidate.jobTitle,
      department_id: input.catalog.departmentId,
      job_function_id: input.catalog.jobFunctionId,
      company_location_id: null,
      email: input.candidate.email,
      phone: input.candidate.phone,
      linkedin_url: input.candidate.linkedinUrl,
      contact_role: BUYING_TO_CONTACT_ROLE[persona.buyingRole],
      relationship_strength: "None",
      is_primary: false,
      notes: `${input.evidenceNotes.trim()}\n\nPersist grain: ${grain.grain}. Display on facilities as inherited. Do not clone.`,
      data_confidence: input.candidate.claimedVerification === "Verified" ? "Verified" : "Unknown",
      source_url: input.candidate.sourceUrl,
      source_name: input.candidate.sourceName,
      evidence_type: input.candidate.evidenceType,
      source_confidence: input.candidate.sourceConfidence,
      verification_status: input.candidate.claimedVerification,
      verified_at: input.candidate.verifiedAt,
    };
    relevance = {
      service_id: input.catalog.serviceId,
      stp_score_id: input.catalog.stpScoreId,
      relevance_score: persona.relevanceScore,
      buying_role: persona.buyingRole,
      relevance_reason: persona.relevanceReason,
    };
  }

  return {
    writerVersion: CONTACT_PERSIST_WRITER_VERSION,
    contactDecision,
    resolvedGrain: grain.grain,
    resolvedCompanyId: grain.persistCompanyId,
    resolvedCompanyName: grain.persistCompanyName,
    wouldCloneFacility,
    duplicate: { hit: duplicateReasons.length > 0, reasons: duplicateReasons },
    contact: safeToPersist ? contact : null,
    relevance: safeToPersist ? relevance : null,
    gates,
    reasons: [...new Set(reasons)],
    safeToPersist,
  };
}
