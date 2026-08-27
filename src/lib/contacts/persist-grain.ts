import type { EntityType } from "../entity-resolution";

export const CONTACT_PERSIST_GRAIN_VERSION = "7.8.0";

export type ContactPersistGrain = "FACILITY" | "ACCOUNT" | "ACCOUNT_GROUP_PARENT";

export type AccountGroupMember = {
  companyId: string;
  companyName: string;
  legalName: string | null;
  entityType: EntityType;
};

export type ContactGrainInput = {
  captureCompanyId: string;
  captureCompanyName: string;
  captureEntityType: EntityType | null;
  accountGroupKey: string;
  groupMembers: AccountGroupMember[];
  companyNameOnSource: string | null;
  jobTitle: string | null;
  evidenceNotes: string | null;
  sourceUrl: string | null;
  facilityRelationshipProven: boolean;
};

export type ContactGrainDecision = {
  persistAllowed: boolean;
  grain: ContactPersistGrain | null;
  persistCompanyId: string | null;
  persistCompanyName: string | null;
  displayOnCaptureAs: "OWNED" | "INHERITED_FROM_ACCOUNT" | "NONE";
  stpScoreAttach: "PERSIST_COMPANY_ONLY" | "NONE";
  reasons: string[];
};

const CORPORATE_TITLE =
  /\b(chief|ceo|cfo|coo|cto|president|vice president|\bvp\b|executive|board member|chairman|chairwoman|managing director|director of the board)\b/i;

function normalize(value: string): string {
  return value
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[^a-z0-9\u0600-\u06ff]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function accountMember(members: AccountGroupMember[]): AccountGroupMember | null {
  return members.find((row) => row.entityType === "ACCOUNT") ?? null;
}

function distinctiveTokens(name: string, subtract: string[]): string[] {
  const stop = new Set(subtract.flatMap((item) => normalize(item).split(" ").filter((token) => token.length >= 4)));
  return normalize(name)
    .split(" ")
    .filter((token) => token.length >= 4 && !stop.has(token));
}

function sourceText(input: ContactGrainInput): string {
  return [input.companyNameOnSource, input.jobTitle, input.evidenceNotes, input.sourceUrl].filter(Boolean).join(" ");
}

function sourceProvesFacility(
  input: ContactGrainInput,
  facility: AccountGroupMember,
  account: AccountGroupMember | null,
): boolean {
  const accountNames = account ? [account.companyName, account.legalName ?? ""] : [];
  const strong = distinctiveTokens(facility.companyName, accountNames).filter(
    (token) => token !== "petro" && token !== "rabigh",
  );
  const hay = normalize(sourceText(input));
  if (strong.length > 0 && strong.every((token) => hay.includes(token))) return true;
  if (!input.facilityRelationshipProven) return false;
  if (input.captureCompanyId !== facility.companyId) return false;
  return strong.some((token) => hay.includes(token));
}

function looksCorporate(input: ContactGrainInput): boolean {
  return CORPORATE_TITLE.test(input.jobTitle ?? "") || /executive management|board of directors/i.test(sourceText(input));
}

export function resolveContactPersistGrain(input: ContactGrainInput): ContactGrainDecision {
  const reasons: string[] = [];
  const capture = input.groupMembers.find((row) => row.companyId === input.captureCompanyId);
  const captureType = capture?.entityType ?? input.captureEntityType;
  const account = accountMember(input.groupMembers);
  const facilities = input.groupMembers.filter((row) => row.entityType === "FACILITY");

  if (captureType === "RELATED" || captureType === "REVIEW") {
    return {
      persistAllowed: false,
      grain: null,
      persistCompanyId: null,
      persistCompanyName: null,
      displayOnCaptureAs: "NONE",
      stpScoreAttach: "NONE",
      reasons: ["RELATED/REVIEW companies cannot own contacts."],
    };
  }

  const provenFacility = facilities.find((facility) => sourceProvesFacility(input, facility, account));

  if (provenFacility) {
    reasons.push(`Source names facility ${provenFacility.companyName}. Attach only to that facility company_id.`);
    return {
      persistAllowed: true,
      grain: "FACILITY",
      persistCompanyId: provenFacility.companyId,
      persistCompanyName: provenFacility.companyName,
      displayOnCaptureAs: provenFacility.companyId === input.captureCompanyId ? "OWNED" : "NONE",
      stpScoreAttach: "PERSIST_COMPANY_ONLY",
      reasons,
    };
  }

  if (looksCorporate(input) || (account && normalize(input.companyNameOnSource ?? "").length > 0 && !provenFacility)) {
    if (!account) {
      return {
        persistAllowed: false,
        grain: null,
        persistCompanyId: null,
        persistCompanyName: null,
        displayOnCaptureAs: "NONE",
        stpScoreAttach: "NONE",
        reasons: [
          "Corporate/group person cannot attach to a facility. No ACCOUNT member exists in this account group. Do not invent a parent company.",
        ],
      };
    }
    const grain: ContactPersistGrain =
      input.captureCompanyId === account.companyId ? "ACCOUNT" : "ACCOUNT_GROUP_PARENT";
    reasons.push(
      grain === "ACCOUNT"
        ? `Attach to ACCOUNT ${account.companyName}.`
        : `Corporate/group source. Attach to account-group PARENT ${account.companyName}, not to capture facility ${input.captureCompanyName}.`,
    );
    reasons.push("Do not clone this person onto facilities. Facilities inherit the row for display only.");
    reasons.push("stp_score_id may point only at an STP row for the persist company_id. Do not reuse the ranked facility STP id.");
    return {
      persistAllowed: true,
      grain,
      persistCompanyId: account.companyId,
      persistCompanyName: account.companyName,
      displayOnCaptureAs: input.captureCompanyId === account.companyId ? "OWNED" : "INHERITED_FROM_ACCOUNT",
      stpScoreAttach: "PERSIST_COMPANY_ONLY",
      reasons,
    };
  }

  if (captureType === "ACCOUNT") {
    return {
      persistAllowed: true,
      grain: "ACCOUNT",
      persistCompanyId: input.captureCompanyId,
      persistCompanyName: input.captureCompanyName,
      displayOnCaptureAs: "OWNED",
      stpScoreAttach: "PERSIST_COMPANY_ONLY",
      reasons: ["Capture company is ACCOUNT and source does not prove a facility. Attach to ACCOUNT."],
    };
  }

  return {
    persistAllowed: false,
    grain: null,
    persistCompanyId: null,
    persistCompanyName: null,
    displayOnCaptureAs: "NONE",
    stpScoreAttach: "NONE",
    reasons: [
      "Grain unresolved: source does not prove this facility and is not clearly corporate. Do not attach. Do not duplicate across the group.",
    ],
  };
}

export type StoredContactForDisplay = {
  id: string;
  companyId: string;
  fullName: string;
};

export type VisibleContactRow = StoredContactForDisplay & {
  displayMode: "OWNED" | "INHERITED_FROM_ACCOUNT";
  owningCompanyId: string;
  owningCompanyName: string;
};

/** Display helper: inherit ACCOUNT contacts onto facilities in the same group. Never clone rows. */
export function visibleContactsForCompany(
  viewCompanyId: string,
  members: AccountGroupMember[],
  contacts: StoredContactForDisplay[],
): VisibleContactRow[] {
  const view = members.find((row) => row.companyId === viewCompanyId);
  const account = accountMember(members);
  const byId = new Map(members.map((row) => [row.companyId, row]));
  const owned = contacts
    .filter((row) => row.companyId === viewCompanyId)
    .map((row) => ({
      ...row,
      displayMode: "OWNED" as const,
      owningCompanyId: row.companyId,
      owningCompanyName: byId.get(row.companyId)?.companyName ?? viewCompanyId,
    }));
  if (view?.entityType !== "FACILITY" && view?.entityType !== "BRANCH") return owned;
  if (!account) return owned;
  const inherited = contacts
    .filter((row) => row.companyId === account.companyId)
    .map((row) => ({
      ...row,
      displayMode: "INHERITED_FROM_ACCOUNT" as const,
      owningCompanyId: account.companyId,
      owningCompanyName: account.companyName,
    }));
  return [...owned, ...inherited];
}
