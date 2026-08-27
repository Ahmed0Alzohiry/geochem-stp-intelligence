import {
  evaluateContactCandidate,
  type ContactCandidate,
  type ContactEvaluation,
  type ContactPersistDecision,
} from "./collection-rules";
import type { ContactEvidenceType, ContactSourceConfidence, ContactVerificationStatus } from "../../types/contact-intelligence";
import { resolveContactPersistGrain, type AccountGroupMember } from "./persist-grain";
import { personasForService } from "./service-persona-map";
import type { EntityType } from "../entity-resolution";

export const CONTACT_WORKSHEET_VERSION = "7.6.0";

export type WorksheetDecision = "ACCEPT" | "REVIEW" | "REJECT";

export type WorksheetAccountContext = {
  companyId: string;
  companyName: string;
  serviceCode: string;
  serviceName: string;
  rank: number;
  tier: string | null;
  commercialScore: number | null;
  rankedForService: boolean;
  entityType: EntityType | null;
  accountGroupKey: string;
  groupMembers: AccountGroupMember[];
  existingAtCompany: ContactCandidate["existingAtCompany"];
};

export type WorksheetDraft = {
  personaKey: string;
  fullName: string;
  jobTitle: string;
  linkedinUrl: string;
  email: string;
  phone: string;
  sourceUrl: string;
  sourceName: string;
  evidenceType: ContactEvidenceType | "";
  sourceConfidence: ContactSourceConfidence | "";
  evidenceNotes: string;
  claimedVerification: ContactVerificationStatus;
  verifiedAt: string;
  companyNameOnSource: string;
  sourceShowsCurrentRole: boolean;
  sourceConfirmsSameCompany: boolean;
  sourceShowsEmail: boolean;
  sourceShowsPhone: boolean;
};

export const EMPTY_WORKSHEET_DRAFT: WorksheetDraft = {
  personaKey: "",
  fullName: "",
  jobTitle: "",
  linkedinUrl: "",
  email: "",
  phone: "",
  sourceUrl: "",
  sourceName: "",
  evidenceType: "",
  sourceConfidence: "",
  evidenceNotes: "",
  claimedVerification: "Unverified",
  verifiedAt: "",
  companyNameOnSource: "",
  sourceShowsCurrentRole: false,
  sourceConfirmsSameCompany: false,
  sourceShowsEmail: false,
  sourceShowsPhone: false,
};

export function personaOptionsForService(serviceCode: string) {
  return personasForService(serviceCode).map((row) => ({
    key: `${row.departmentName}::${row.jobFunctionCode}`,
    departmentName: row.departmentName,
    jobFunctionCode: row.jobFunctionCode,
    jobFunctionName: row.jobFunctionName,
    buyingRole: row.buyingRole,
    priority: row.priority,
    label: `P${row.priority} · ${row.departmentName} · ${row.jobFunctionName}`,
  }));
}

export function toWorksheetDecision(decision: ContactPersistDecision): WorksheetDecision {
  if (decision === "HOLD") return "REVIEW";
  return decision;
}

function blankToNull(value: string): string | null {
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

export function draftToCandidate(account: WorksheetAccountContext, draft: WorksheetDraft): ContactCandidate {
  const persona = personaOptionsForService(account.serviceCode).find((row) => row.key === draft.personaKey);
  return {
    serviceCode: account.serviceCode,
    companyId: account.companyId,
    targetCompanyName: account.companyName,
    rankedForService: account.rankedForService,
    fullName: draft.fullName.trim(),
    jobTitle: blankToNull(draft.jobTitle),
    departmentName: persona?.departmentName ?? null,
    jobFunctionCode: persona?.jobFunctionCode ?? null,
    email: blankToNull(draft.email),
    phone: blankToNull(draft.phone),
    linkedinUrl: blankToNull(draft.linkedinUrl),
    sourceUrl: blankToNull(draft.sourceUrl),
    sourceName: blankToNull(draft.sourceName),
    evidenceType: draft.evidenceType || null,
    sourceConfidence: draft.sourceConfidence || null,
    claimedVerification: draft.claimedVerification,
    verifiedAt: blankToNull(draft.verifiedAt),
    companyNameOnSource: blankToNull(draft.companyNameOnSource),
    sourceShowsCurrentRole: draft.sourceShowsCurrentRole,
    sourceShowsEmail: draft.sourceShowsEmail,
    sourceShowsPhone: draft.sourceShowsPhone,
    sourceConfirmsSameCompany: draft.sourceConfirmsSameCompany,
    existingAtCompany: account.existingAtCompany,
  };
}

export type WorksheetEvaluation = {
  decision: WorksheetDecision;
  rulesDecision: ContactPersistDecision;
  evaluation: ContactEvaluation;
  reasons: string[];
  persistBlocked: true;
  evidenceNotesPresent: boolean;
  grain: ReturnType<typeof resolveContactPersistGrain> | null;
};

export function evaluateWorksheet(account: WorksheetAccountContext, draft: WorksheetDraft): WorksheetEvaluation {
  const evaluation = evaluateContactCandidate(draftToCandidate(account, draft));
  const extra: string[] = [];
  let decision = toWorksheetDecision(evaluation.decision);
  const evidenceNotesPresent = Boolean(draft.evidenceNotes.trim());
  if (!evidenceNotesPresent) {
    extra.push("Worksheet evidence notes are required: quote or paraphrase what the public page showed.");
    if (decision === "ACCEPT") decision = "REVIEW";
  }

  const grain =
    decision === "ACCEPT" || evaluation.decision === "ACCEPT"
      ? resolveContactPersistGrain({
          captureCompanyId: account.companyId,
          captureCompanyName: account.companyName,
          captureEntityType: account.entityType,
          accountGroupKey: account.accountGroupKey,
          groupMembers: account.groupMembers,
          companyNameOnSource: blankToNull(draft.companyNameOnSource),
          jobTitle: blankToNull(draft.jobTitle),
          evidenceNotes: blankToNull(draft.evidenceNotes),
          sourceUrl: blankToNull(draft.sourceUrl),
          facilityRelationshipProven: false,
        })
      : null;

  if (grain && !grain.persistAllowed && decision === "ACCEPT") {
    decision = "REVIEW";
    extra.push(...grain.reasons);
  } else if (grain?.persistAllowed) {
    extra.push(
      `Persist grain ${grain.grain}: attach company_id to ${grain.persistCompanyName}. Display on this page as ${grain.displayOnCaptureAs}.`,
    );
    extra.push(...grain.reasons);
  }

  extra.push("This worksheet does not insert contacts.");
  return {
    decision,
    rulesDecision: evaluation.decision,
    evaluation,
    reasons: [...evaluation.reasons, ...extra],
    persistBlocked: true,
    evidenceNotesPresent,
    grain,
  };
}
