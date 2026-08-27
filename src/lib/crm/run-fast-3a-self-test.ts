/**
 * FAST-3A CRM foundation self-test. No database writes.
 */
import { withServiceQuery } from "../navigation";
import { computeWeightedValue, groupOpportunitiesByStage, summarizePipeline, isSystemTestOpportunity, type OpportunityRecord } from "./opportunity";
import {
  CLOSED_PIPELINE_STAGES,
  PIPELINE_STAGE_NAMES,
  PIPELINE_STAGES,
  defaultProbabilityForStage,
  isActivePipelineStage,
  opportunityStatusForStage,
} from "./pipeline-stages";

function sample(overrides: Partial<OpportunityRecord> = {}): OpportunityRecord {
  return {
    id: "opp-1",
    companyId: "co-1",
    companyName: "Example",
    serviceId: "svc-pch",
    serviceName: "Process Chemistry",
    serviceCode: "PCH",
    contactId: null,
    contactName: null,
    opportunityName: "Example PCH",
    stageId: "st-lead",
    stage: "Lead",
    status: "Open",
    estimatedValue: 1000,
    probability: 10,
    weightedValue: 100,
    expectedCloseDate: "2026-12-31",
    owner: "Ahmed",
    source: "test",
    notes: null,
    createdAt: "2026-08-27T00:00:00Z",
    updatedAt: "2026-08-27T00:00:00Z",
    ...overrides,
  };
}

export function runFast3aSelfTest(): { ok: boolean; failures: string[] } {
  const failures: string[] = [];
  if (PIPELINE_STAGE_NAMES.join(",") !== "Lead,Qualified,Contacted,Meeting,Proposal,Negotiation,Won,Lost") {
    failures.push("pipeline stage order must match FAST-3A");
  }
  if (PIPELINE_STAGES.length !== 8) failures.push("expected 8 stages");
  if (defaultProbabilityForStage("Proposal") !== 60) failures.push("Proposal default probability");
  if (defaultProbabilityForStage("Won") !== 100) failures.push("Won default probability");
  if (defaultProbabilityForStage("Lost") !== 0) failures.push("Lost default probability");
  if (opportunityStatusForStage("Meeting") !== "Open") failures.push("Meeting status");
  if (opportunityStatusForStage("Won") !== "Won") failures.push("Won status");
  if (isActivePipelineStage("Won") || isActivePipelineStage("Lost")) failures.push("Won/Lost must not be active");
  if (CLOSED_PIPELINE_STAGES.length !== 2) failures.push("closed stages");
  if (computeWeightedValue(100000, 40) !== 40000) failures.push("weighted_value formula");
  if (computeWeightedValue(1500, 33) !== 495) failures.push("weighted_value rounding");

  const summary = summarizePipeline([
    sample(),
    sample({ id: "opp-2", stage: "Won", status: "Won", probability: 100, weightedValue: 1000, estimatedValue: 1000 }),
    sample({ id: "opp-3", stage: "Lost", status: "Lost", probability: 0, weightedValue: 0, estimatedValue: 500 }),
  ]);
  if (summary.activeCount !== 1) failures.push(`activeCount ${summary.activeCount}`);
  if (summary.pipelineValue !== 100) failures.push(`pipelineValue ${summary.pipelineValue}`);
  if (summary.wonCount !== 1 || summary.lostCount !== 1) failures.push("closed counts");

  const empty = summarizePipeline([]);
  if (empty.activeCount !== 0 || empty.pipelineValue !== 0) failures.push("empty pipeline must be zero");

  const grouped = groupOpportunitiesByStage(
    [sample(), sample({ id: "opp-q", stage: "Qualified", stageId: "st-q", estimatedValue: 2000, weightedValue: 400 })],
    [...PIPELINE_STAGE_NAMES],
  );
  if (grouped.length !== 8) failures.push("board must keep all stages");
  if (grouped[0]?.count !== 1 || grouped[1]?.count !== 1) failures.push("stage grouping counts");
  if (grouped[1]?.estimatedValue !== 2000) failures.push("stage estimated value");
  if (!isSystemTestOpportunity({ notes: "SYSTEM-TEST cleanup" })) failures.push("system-test marker");
  if (isSystemTestOpportunity({ opportunityName: "Live Petro Rabigh PCH" })) failures.push("live name must not match test marker");
  if (
    !isSystemTestOpportunity({
      opportunityName: "Petro Rabigh Polymer Operations PCH",
      source: "Target Account",
      owner: "Ahmed",
      estimatedValue: 100000,
    })
  ) {
    failures.push("FAST-4 system-test fingerprint");
  }
  if (withServiceQuery("/targeting?page=2", "ENV") !== "/targeting?page=2&service=ENV" && withServiceQuery("/targeting?page=2", "ENV") !== "/targeting?service=ENV&page=2") {
    failures.push("service query preserves params");
  }

  return { ok: failures.length === 0, failures };
}

if (process.argv[1]?.includes("run-fast-3a-self-test")) {
  const result = runFast3aSelfTest();
  console.log(JSON.stringify(result, null, 2));
  if (!result.ok) process.exit(1);
}
