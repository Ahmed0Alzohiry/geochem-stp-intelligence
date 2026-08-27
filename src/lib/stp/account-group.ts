import type { ServiceFirstInput, ServiceFirstScore } from "./types";

export type ScoredAccount = {
  input: ServiceFirstInput;
  result: ServiceFirstScore;
  accountGroupKey: string;
};

function entityRank(entity: ServiceFirstInput["entityType"]): number {
  if (entity === "FACILITY") return 4;
  if (entity === "ACCOUNT") return 3;
  if (entity === "BRANCH") return 2;
  return 0;
}

function applicationScore(result: ServiceFirstScore): number {
  const row = result.dimensions.find((item) => item.key === "subsectorFit");
  return row?.status === "KNOWN" && row.rawScore != null ? row.rawScore : -1;
}

export function pickAccountGroupRepresentative(members: ScoredAccount[]): ScoredAccount | null {
  const candidates = members.filter(
    (member) => member.input.entityType !== "RELATED" && member.input.entityType !== "REVIEW",
  );
  if (candidates.length === 0) return null;
  return [...candidates].sort((left, right) => {
    const leftGeo = left.input.verifiedCities.length > 0 ? 1 : 0;
    const rightGeo = right.input.verifiedCities.length > 0 ? 1 : 0;
    if (rightGeo !== leftGeo) return rightGeo - leftGeo;
    const entityDiff = entityRank(right.input.entityType) - entityRank(left.input.entityType);
    if (entityDiff !== 0) return entityDiff;
    const appDiff = applicationScore(right.result) - applicationScore(left.result);
    if (appDiff !== 0) return appDiff;
    const scoreDiff = (right.result.commercialScore ?? 0) - (left.result.commercialScore ?? 0);
    if (scoreDiff !== 0) return scoreDiff;
    return left.input.companyName.localeCompare(right.input.companyName);
  })[0];
}

export function collapseByAccountGroup(rows: ScoredAccount[]): Array<ScoredAccount & { groupSize: number }> {
  const groups = new Map<string, ScoredAccount[]>();
  for (const row of rows) {
    groups.set(row.accountGroupKey, [...(groups.get(row.accountGroupKey) ?? []), row]);
  }
  const collapsed: Array<ScoredAccount & { groupSize: number }> = [];
  for (const members of groups.values()) {
    const representative = pickAccountGroupRepresentative(members);
    if (!representative) continue;
    collapsed.push({ ...representative, groupSize: members.length });
  }
  return collapsed;
}
