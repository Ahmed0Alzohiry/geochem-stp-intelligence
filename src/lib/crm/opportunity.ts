import { isActivePipelineStage, opportunityStatusForStage } from "./pipeline-stages";

export function computeWeightedValue(estimatedValue: number, probability: number): number {
  return Math.round(((estimatedValue * probability) / 100) * 100) / 100;
}

export type OpportunityRecord = {
  id: string;
  companyId: string;
  companyName: string;
  serviceId: string;
  serviceName: string;
  serviceCode: string | null;
  contactId: string | null;
  contactName: string | null;
  opportunityName: string;
  stageId: string;
  stage: string;
  status: "Open" | "Won" | "Lost";
  estimatedValue: number;
  probability: number;
  weightedValue: number;
  expectedCloseDate: string | null;
  owner: string | null;
  source: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
};

export type PipelineSummary = {
  activeCount: number;
  pipelineValue: number;
  estimatedActiveValue: number;
  wonCount: number;
  lostCount: number;
  byStage: { stage: string; count: number; estimatedValue: number; weightedValue: number }[];
};

export function summarizePipeline(rows: OpportunityRecord[]): PipelineSummary {
  const active = rows.filter((row) => isActivePipelineStage(row.stage));
  const byStageMap = new Map<string, { count: number; estimatedValue: number; weightedValue: number }>();
  for (const row of rows) {
    const current = byStageMap.get(row.stage) ?? { count: 0, estimatedValue: 0, weightedValue: 0 };
    current.count += 1;
    current.estimatedValue += row.estimatedValue;
    current.weightedValue += row.weightedValue;
    byStageMap.set(row.stage, current);
  }
  return {
    activeCount: active.length,
    pipelineValue: active.reduce((sum, row) => sum + row.weightedValue, 0),
    estimatedActiveValue: active.reduce((sum, row) => sum + row.estimatedValue, 0),
    wonCount: rows.filter((row) => row.stage === "Won").length,
    lostCount: rows.filter((row) => row.stage === "Lost").length,
    byStage: [...byStageMap.entries()].map(([stage, stats]) => ({ stage, ...stats })),
  };
}

export function deriveStatus(stage: string): "Open" | "Won" | "Lost" {
  return opportunityStatusForStage(stage);
}

export function isSystemTestOpportunity(row: {
  opportunityName?: string | null;
  notes?: string | null;
  source?: string | null;
  owner?: string | null;
  estimatedValue?: number;
}): boolean {
  const blob = `${row.opportunityName ?? ""}\n${row.notes ?? ""}\n${row.source ?? ""}`.toLowerCase();
  if (blob.includes("system-test") || blob.includes("system test")) return true;
  return (
    (row.opportunityName ?? "") === "Petro Rabigh Polymer Operations PCH" &&
    (row.source ?? "") === "Target Account" &&
    (row.owner ?? "") === "Ahmed" &&
    Number(row.estimatedValue) === 100000
  );
}

export type StageGroup = {
  stage: string;
  count: number;
  estimatedValue: number;
  weightedValue: number;
  items: OpportunityRecord[];
};

export function groupOpportunitiesByStage(rows: OpportunityRecord[], stageNames: string[]): StageGroup[] {
  return stageNames.map((stage) => {
    const items = rows.filter((row) => row.stage === stage);
    return {
      stage,
      count: items.length,
      estimatedValue: items.reduce((sum, row) => sum + row.estimatedValue, 0),
      weightedValue: items.reduce((sum, row) => sum + row.weightedValue, 0),
      items,
    };
  });
}

