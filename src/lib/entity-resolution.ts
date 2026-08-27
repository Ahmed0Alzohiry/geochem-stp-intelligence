/**
 * STEP 5.17 deterministic entity resolution.
 * Does not mutate company source fields. Grouping is metadata only.
 */
import { normalizeCompanyName, normalizeWebsiteDomain } from "./import/normalize";

export const ENTITY_CLASSIFIER_VERSION = "5.17.1";

export type EntityType = "ACCOUNT" | "FACILITY" | "BRANCH" | "RELATED" | "REVIEW";
export type EntityConfidence = "HIGH" | "MEDIUM" | "LOW" | "UNRESOLVED";

export type CompanyEntityInput = {
  id: string;
  company_name: string | null;
  legal_name: string | null;
  alias_name: string | null;
  record_type: string | null;
  parent_company_name: string | null;
  website: string | null;
  website_domain: string | null;
  commercial_registration_number: string | null;
  city: string | null;
  industrial_city: string | null;
  location_city: string | null;
  business_description: string | null;
  main_activities: string | null;
};

export type EntityResolutionResult = {
  company_id: string;
  entity_type: EntityType;
  account_group_key: string;
  entity_resolution_confidence: EntityConfidence;
  entity_resolution_reason: string;
  classifier_version: string;
};

const FACILITY_NAME =
  /\b(plant|terminal|facility|facilities|operations|operating site|industrial complex|manufacturing site|bulk plant|refinery operations|industrial operations)\b/i;
const BRANCH_NAME = /\b(regional office|head office|sales office|branch office|\bbranch\b)\b/i;
const LEGAL_LOCK = /company|corporation|incorporated|limited|holding|investment|llc|ltd/;

const REMAINDER_TOKENS = [
  "industrialoperations",
  "refineryoperations",
  "refiningoperations",
  "manufacturingsite",
  "operatingsite",
  "industrialcomplex",
  "regionaloffice",
  "headoffice",
  "salesoffice",
  "baseoil",
  "operations",
  "operation",
  "operating",
  "facility",
  "facilities",
  "plant",
  "terminal",
  "refinery",
  "industrial",
  "complex",
  "manufacturing",
  "site",
  "sites",
  "branch",
  "office",
  "yanbu",
  "jeddah",
  "rabigh",
  "jubail",
  "dammam",
  "riyadh",
  "alkhobar",
  "khobar",
  "dhahran",
  "jazan",
  "tabuk",
  "najran",
  "abha",
  "madinah",
  "medina",
  "juaymah",
  "tanajib",
  "rasalkhair",
  "rasalqair",
  "commercial",
  "polymer",
  "refining",
  "aviation",
  "marine",
  "department",
  "port",
  "city",
  "bulk",
  "fuel",
];

function text(value: string | null | undefined): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function combinedLocation(row: CompanyEntityInput): string | null {
  const parts = [text(row.city), text(row.industrial_city), text(row.location_city)].filter(
    (part): part is string => Boolean(part),
  );
  return parts.length > 0 ? parts.join(" / ") : null;
}

export function hasFacilityEvidence(row: CompanyEntityInput): boolean {
  const hay = `${text(row.company_name) ?? ""} ${text(row.alias_name) ?? ""} ${text(row.business_description) ?? ""} ${text(row.main_activities) ?? ""}`;
  return text(row.record_type) === "Facility/Operations" || FACILITY_NAME.test(hay);
}

export function hasBranchEvidence(row: CompanyEntityInput): boolean {
  const hay = `${text(row.company_name) ?? ""} ${text(row.alias_name) ?? ""}`;
  return BRANCH_NAME.test(hay);
}

function norms(row: CompanyEntityInput) {
  return {
    name: normalizeCompanyName(row.company_name),
    legal: normalizeCompanyName(row.legal_name),
    alias: normalizeCompanyName(row.alias_name),
    parent: normalizeCompanyName(row.parent_company_name),
    domain: normalizeWebsiteDomain(row.website, row.website_domain),
    cr: text(row.commercial_registration_number)?.replace(/\D/g, "") || null,
  };
}

export function remainderIsSiteSuffix(remainder: string): boolean {
  if (!remainder) return true;
  if (LEGAL_LOCK.test(remainder)) return false;
  let rest = remainder;
  const tokens = [...REMAINDER_TOKENS].sort((a, b) => b.length - a.length);
  let guard = 0;
  while (rest.length > 0 && guard < 24) {
    guard += 1;
    const hit = tokens.find((token) => rest.startsWith(token) || rest.endsWith(token));
    if (!hit) break;
    if (rest.startsWith(hit)) rest = rest.slice(hit.length);
    else rest = rest.slice(0, -hit.length);
  }
  return rest.length === 0 || (rest.length <= 10 && !LEGAL_LOCK.test(rest) && !isLegalFormFragment(rest));
}

function isLegalFormFragment(rest: string): boolean {
  return ["company", "corporation", "incorporated", "limited", "holding"].some(
    (word) => word.endsWith(rest) || rest.endsWith(word),
  );
}

function legalFormKey(normalized: string | null): string | null {
  if (!normalized) return null;
  return normalized.replace(/company$/, "co").replace(/corporation$/, "corp").replace(/limited$/, "ltd");
}

function ownGroupKey(id: string): string {
  return `er:v1:id:${id}`;
}

type Draft = {
  type: EntityType;
  group: string;
  confidence: EntityConfidence;
  reason: string;
};

function pickAccountId(members: CompanyEntityInput[]): string {
  const ranked = [...members].sort((a, b) => {
    const aSite = hasFacilityEvidence(a) || hasBranchEvidence(a) ? 1 : 0;
    const bSite = hasFacilityEvidence(b) || hasBranchEvidence(b) ? 1 : 0;
    if (aSite !== bSite) return aSite - bSite;
    const aCo = text(a.record_type) === "Company" ? 0 : 1;
    const bCo = text(b.record_type) === "Company" ? 0 : 1;
    if (aCo !== bCo) return aCo - bCo;
    const aLen = (text(a.company_name) ?? "").length;
    const bLen = (text(b.company_name) ?? "").length;
    if (aLen !== bLen) return aLen - bLen;
    return a.id.localeCompare(b.id);
  });
  return ranked[0]?.id ?? members[0]!.id;
}

function memberType(member: CompanyEntityInput, accountId: string, corporates: CompanyEntityInput[]): EntityType {
  if (hasBranchEvidence(member) && !hasFacilityEvidence(member)) return "BRANCH";
  if (corporates.some((row) => row.id === member.id) && member.id === accountId) return "ACCOUNT";
  if (hasFacilityEvidence(member)) return member.id === accountId && corporates.length === 0 ? "FACILITY" : "FACILITY";
  if (member.id === accountId) return "ACCOUNT";
  return "REVIEW";
}

export function resolveCompanies(rows: CompanyEntityInput[]): EntityResolutionResult[] {
  const draft = new Map<string, Draft>();
  const locked = new Set<string>();

  function setDraft(id: string, next: Draft, lock = false) {
    if (locked.has(id)) return;
    draft.set(id, next);
    if (lock) locked.add(id);
  }

  function prefixParent(child: CompanyEntityInput): CompanyEntityInput | null {
    const childName = norms(child).name;
    if (!childName) return null;
    let best: CompanyEntityInput | null = null;
    let bestLen = 0;
    for (const parent of rows) {
      if (parent.id === child.id) continue;
      if (hasFacilityEvidence(parent) || hasBranchEvidence(parent)) continue;
      const parentName = norms(parent).name;
      if (!parentName || parentName.length < 10) continue;
      if (!childName.startsWith(parentName) || childName === parentName) continue;
      if (parentName.endsWith("co") && childName.startsWith(`${parentName}mpany`)) continue;
      if (!remainderIsSiteSuffix(childName.slice(parentName.length))) continue;
      if (parentName.length > bestLen) {
        best = parent;
        bestLen = parentName.length;
      }
    }
    return best;
  }

  function assignCluster(
    members: CompanyEntityInput[],
    groupKey: string,
    reason: string,
    confidence: EntityConfidence,
    forceReview = false,
  ) {
    const unique = [...new Map(members.map((row) => [row.id, row])).values()];
    const corporates = unique.filter((row) => !hasFacilityEvidence(row) && !hasBranchEvidence(row));
    const accountId = pickAccountId(corporates.length > 0 ? corporates : unique);
    for (const member of unique) {
      const type = forceReview ? "REVIEW" : memberType(member, accountId, corporates);
      setDraft(member.id, { type, group: groupKey, confidence, reason }, true);
    }
  }

  const byCr = new Map<string, CompanyEntityInput[]>();
  const byDomain = new Map<string, CompanyEntityInput[]>();
  const byName = new Map<string, CompanyEntityInput[]>();
  const byLegal = new Map<string, CompanyEntityInput[]>();
  const byParent = new Map<string, CompanyEntityInput[]>();
  const nameIndex = new Map<string, CompanyEntityInput[]>();

  for (const row of rows) {
    const keys = norms(row);
    if (keys.cr) byCr.set(keys.cr, [...(byCr.get(keys.cr) ?? []), row]);
    if (keys.domain) byDomain.set(keys.domain, [...(byDomain.get(keys.domain) ?? []), row]);
    if (keys.name) byName.set(keys.name, [...(byName.get(keys.name) ?? []), row]);
    if (keys.legal) byLegal.set(keys.legal, [...(byLegal.get(keys.legal) ?? []), row]);
    if (keys.parent) byParent.set(keys.parent, [...(byParent.get(keys.parent) ?? []), row]);
    for (const key of [keys.name, keys.legal, keys.alias]) {
      if (!key) continue;
      nameIndex.set(key, [...(nameIndex.get(key) ?? []), row]);
    }
  }

  for (const [cr, members] of byCr) {
    if (members.length < 2) continue;
    assignCluster(members, `er:v1:cr:${cr}`, `Exact commercial_registration_number ${cr}`, "HIGH");
  }

  for (const [domain, members] of byDomain) {
    if (members.length < 2) continue;
    const corporates = members.filter((row) => !hasFacilityEvidence(row) && !hasBranchEvidence(row));
    if (corporates.length >= 2) {
      for (const member of members) {
        setDraft(
          member.id,
          {
            type: "REVIEW",
            group: ownGroupKey(member.id),
            confidence: "LOW",
            reason: `Shared website_domain ${domain} with distinct company names; not grouped`,
          },
          true,
        );
      }
      continue;
    }
    const accountId = pickAccountId(corporates.length > 0 ? corporates : members);
    const cluster = members.filter((member) => {
      const better = prefixParent(member);
      if (!better) return true;
      return members.some((row) => row.id === better.id);
    });
    if (cluster.length < 2) continue;
    assignCluster(cluster, `er:v1:id:${accountId}`, `Shared website_domain ${domain}`, "HIGH");
  }

  for (const [parentKey, children] of byParent) {
    const parents = (nameIndex.get(parentKey) ?? []).filter((row) => !children.some((child) => child.id === row.id));
    if (parents.length !== 1) {
      for (const child of children) {
        if (locked.has(child.id)) continue;
        const site = hasFacilityEvidence(child);
        setDraft(child.id, {
          type: site ? "FACILITY" : "RELATED",
          group: ownGroupKey(child.id),
          confidence: parents.length === 0 ? "MEDIUM" : "LOW",
          reason:
            parents.length === 0
              ? `parent_company_name present (${text(child.parent_company_name)}) but no matching company row`
              : `parent_company_name matches ${parents.length} rows; ambiguous`,
        });
      }
      continue;
    }
    const parent = parents[0]!;
    const group = draft.get(parent.id)?.group ?? ownGroupKey(parent.id);
    if (!draft.has(parent.id)) {
      setDraft(parent.id, {
        type: "ACCOUNT",
        group,
        confidence: "HIGH",
        reason: "Parent account matched from child parent_company_name",
      });
    }
    for (const child of children) {
      if (locked.has(child.id)) continue;
      if (hasFacilityEvidence(child) || hasBranchEvidence(child)) {
        setDraft(
          child.id,
          {
            type: hasBranchEvidence(child) && !hasFacilityEvidence(child) ? "BRANCH" : "FACILITY",
            group,
            confidence: "HIGH",
            reason: `Explicit parent_company_name matches ${text(parent.company_name)}`,
          },
          true,
        );
      } else {
        setDraft(
          child.id,
          {
            type: "RELATED",
            group: ownGroupKey(child.id),
            confidence: "HIGH",
            reason: `Related legal/commercial entity of ${text(parent.company_name)}; kept as its own account group`,
          },
          true,
        );
      }
    }
  }

  function addExact(map: Map<string, CompanyEntityInput[]>, key: string | null, row: CompanyEntityInput) {
    if (!key) return;
    map.set(key, [...(map.get(key) ?? []), row]);
  }
  const exactKeys = new Map<string, CompanyEntityInput[]>();
  for (const row of rows) {
    const keys = norms(row);
    addExact(exactKeys, keys.name, row);
    addExact(exactKeys, keys.legal, row);
  }
  for (const [key, members] of exactKeys) {
    const unique = [...new Map(members.map((row) => [row.id, row])).values()];
    if (unique.length < 2) continue;
    if (unique.every((row) => locked.has(row.id))) continue;
    assignCluster(
      unique,
      `er:v1:name:${key}`,
      `Exact normalized name/legal_name match (${key})`,
      "LOW",
      true,
    );
  }

  const sortedByNameLen = [...rows].sort(
    (a, b) => (norms(a).name?.length ?? 99) - (norms(b).name?.length ?? 99),
  );
  for (const parent of sortedByNameLen) {
    const parentName = norms(parent).name;
    if (!parentName || parentName.length < 10) continue;
    if (hasFacilityEvidence(parent) || hasBranchEvidence(parent)) continue;
    const children = rows.filter((child) => {
      if (child.id === parent.id) return false;
      const childName = norms(child).name;
      if (!childName?.startsWith(parentName) || childName === parentName) return false;
      if (parentName.endsWith("co") && childName.startsWith(`${parentName}mpany`)) return false;
      return remainderIsSiteSuffix(childName.slice(parentName.length));
    });
    if (children.length === 0) continue;
    const parentGroup = draft.get(parent.id)?.group ?? ownGroupKey(parent.id);
    if (!draft.has(parent.id)) {
      setDraft(parent.id, {
        type: "ACCOUNT",
        group: parentGroup,
        confidence: "HIGH",
        reason: "Corporate name is an exact prefix of site records",
      });
    }
    for (const child of children) {
      const existing = draft.get(child.id);
      if (locked.has(child.id) && existing && existing.group !== parentGroup && existing.confidence === "HIGH") {
        continue;
      }
      if (locked.has(child.id) && existing?.confidence === "HIGH") continue;
      locked.delete(child.id);
      const type: EntityType = hasBranchEvidence(child) && !hasFacilityEvidence(child) ? "BRANCH" : "FACILITY";
      setDraft(
        child.id,
        {
          type,
          group: parentGroup,
          confidence: "HIGH",
          reason: `Name is ${text(parent.company_name)} plus a site/location suffix`,
        },
        true,
      );
    }
  }

  const legalFormGroups = new Map<string, CompanyEntityInput[]>();
  for (const row of rows) {
    if (hasFacilityEvidence(row) || hasBranchEvidence(row)) continue;
    const key = legalFormKey(norms(row).name);
    if (!key || key.length < 12) continue;
    legalFormGroups.set(key, [...(legalFormGroups.get(key) ?? []), row]);
  }
  for (const [key, members] of legalFormGroups) {
    const unique = [...new Map(members.map((row) => [row.id, row])).values()];
    if (unique.length < 2) continue;
    if (unique.every((row) => locked.has(row.id))) continue;
    assignCluster(
      unique,
      `er:v1:form:${key}`,
      `Same identity after Co/Company legal-form normalization (${key})`,
      "LOW",
      true,
    );
  }

  for (const row of rows) {
    if (draft.has(row.id)) continue;
    if (hasBranchEvidence(row) && !hasFacilityEvidence(row)) {
      setDraft(row.id, {
        type: "BRANCH",
        group: ownGroupKey(row.id),
        confidence: "MEDIUM",
        reason: "Branch/office wording in name; no linked parent account",
      });
      continue;
    }
    if (hasFacilityEvidence(row)) {
      setDraft(row.id, {
        type: "FACILITY",
        group: ownGroupKey(row.id),
        confidence: text(row.parent_company_name) ? "MEDIUM" : "LOW",
        reason:
          text(row.record_type) === "Facility/Operations"
            ? "record_type is Facility/Operations; parent account not deterministically linked"
            : "Facility/site wording in name; parent account not deterministically linked",
      });
      continue;
    }
    if (!text(row.company_name)) {
      setDraft(row.id, {
        type: "REVIEW",
        group: ownGroupKey(row.id),
        confidence: "UNRESOLVED",
        reason: "Missing company_name",
      });
      continue;
    }
    setDraft(row.id, {
      type: "ACCOUNT",
      group: ownGroupKey(row.id),
      confidence: "HIGH",
      reason: "Standalone company record; no deterministic parent/site evidence",
    });
  }

  return rows.map((row) => {
    const item = draft.get(row.id)!;
    return {
      company_id: row.id,
      entity_type: item.type,
      account_group_key: item.group,
      entity_resolution_confidence: item.confidence,
      entity_resolution_reason: item.reason,
      classifier_version: ENTITY_CLASSIFIER_VERSION,
    };
  });
}

export function summarizeEntityResolution(rows: CompanyEntityInput[], resolved: EntityResolutionResult[]) {
  const byId = new Map(rows.map((row) => [row.id, row]));
  const types: Record<EntityType, number> = { ACCOUNT: 0, FACILITY: 0, BRANCH: 0, RELATED: 0, REVIEW: 0 };
  const confidence: Record<EntityConfidence, number> = { HIGH: 0, MEDIUM: 0, LOW: 0, UNRESOLVED: 0 };
  const groups = new Map<string, EntityResolutionResult[]>();
  for (const item of resolved) {
    types[item.entity_type] += 1;
    confidence[item.entity_resolution_confidence] += 1;
    groups.set(item.account_group_key, [...(groups.get(item.account_group_key) ?? []), item]);
  }
  const multi = [...groups.entries()].filter(([, members]) => members.length > 1);
  const facilityBranch = types.FACILITY + types.BRANCH;
  const extraRowsVersusGroups = rows.length - groups.size;

  const largest = [...multi]
    .sort((a, b) => b[1].length - a[1].length)
    .slice(0, 20)
    .map(([key, members]) => ({
      accountGroup: key,
      size: members.length,
      records: members.map((member) => {
        const row = byId.get(member.company_id);
        return {
          company: text(row?.company_name),
          entityType: member.entity_type,
          location: row ? combinedLocation(row) : null,
          confidence: member.entity_resolution_confidence,
          reason: member.entity_resolution_reason,
        };
      }),
    }));

  return {
    types,
    confidence,
    totalGroups: groups.size,
    standaloneAccounts: [...groups.values()].filter((members) => members.length === 1).length,
    multiRecordGroups: multi.length,
    largest,
    rawCompanyRecords: rows.length,
    distinctCommercialAccountGroups: groups.size,
    facilityBranchRecords: facilityBranch,
    potentialDoubleCountedRecords: extraRowsVersusGroups,
    reviewRemaining: types.REVIEW,
  };
}
