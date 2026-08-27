export const PIPELINE_STAGE_NAMES = [
  "Lead",
  "Qualified",
  "Contacted",
  "Meeting",
  "Proposal",
  "Negotiation",
  "Won",
  "Lost",
] as const;

export type PipelineStageName = (typeof PIPELINE_STAGE_NAMES)[number];

export type PipelineStageConfig = {
  name: PipelineStageName;
  displayOrder: number;
  defaultProbability: number;
};

export const PIPELINE_STAGES: PipelineStageConfig[] = [
  { name: "Lead", displayOrder: 1, defaultProbability: 10 },
  { name: "Qualified", displayOrder: 2, defaultProbability: 20 },
  { name: "Contacted", displayOrder: 3, defaultProbability: 30 },
  { name: "Meeting", displayOrder: 4, defaultProbability: 40 },
  { name: "Proposal", displayOrder: 5, defaultProbability: 60 },
  { name: "Negotiation", displayOrder: 6, defaultProbability: 80 },
  { name: "Won", displayOrder: 7, defaultProbability: 100 },
  { name: "Lost", displayOrder: 8, defaultProbability: 0 },
];

export const CLOSED_PIPELINE_STAGES: readonly PipelineStageName[] = ["Won", "Lost"];

export function isPipelineStageName(value: string): value is PipelineStageName {
  return (PIPELINE_STAGE_NAMES as readonly string[]).includes(value);
}

export function getStageConfig(name: string): PipelineStageConfig | undefined {
  return PIPELINE_STAGES.find((stage) => stage.name === name);
}

export function defaultProbabilityForStage(name: string): number {
  return getStageConfig(name)?.defaultProbability ?? 10;
}

export function opportunityStatusForStage(name: string): "Open" | "Won" | "Lost" {
  if (name === "Won") return "Won";
  if (name === "Lost") return "Lost";
  return "Open";
}

export function isActivePipelineStage(name: string): boolean {
  return !CLOSED_PIPELINE_STAGES.includes(name as PipelineStageName);
}
