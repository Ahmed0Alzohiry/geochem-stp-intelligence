import { CrmPipelineView } from "@/components/crm/CrmPipelineView";
import { PageHeader } from "@/components/ui/FormControls";
import { MasterDataError } from "@/components/ui/MasterDataStatus";
import { groupOpportunitiesByStage, summarizePipeline } from "@/lib/crm/opportunity";
import { loadMasterDataError } from "@/lib/supabase/errors";
import { getCrmStages, getServices } from "@/lib/supabase/master-data";
import { listOpportunities } from "@/lib/supabase/opportunities";

export const dynamic = "force-dynamic";

function firstParam(value: string | string[] | undefined): string {
  if (Array.isArray(value)) return value[0] ?? "";
  return value ?? "";
}

export default async function CrmPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  try {
    const params = await searchParams;
    const filters = {
      service: firstParam(params.service),
      stage: firstParam(params.stage),
      company: firstParam(params.company),
      owner: firstParam(params.owner),
    };
    const [stages, services, rows] = await Promise.all([
      getCrmStages(),
      getServices(),
      listOpportunities({
        serviceCode: filters.service || undefined,
        stage: filters.stage || undefined,
        company: filters.company || undefined,
        owner: filters.owner || undefined,
      }),
    ]);
    const summary = summarizePipeline(rows);
    const groups = groupOpportunitiesByStage(
      rows,
      stages.map((stage) => stage.name),
    );

    return (
      <div>
        <PageHeader
          title="CRM pipeline"
          description="Live opportunities grouped by CRM stage. Weighted value is estimated value × probability / 100. Won and Lost are excluded from pipeline value."
        />
        <CrmPipelineView
          groups={groups}
          summary={summary}
          stages={stages}
          services={services}
          filters={filters}
        />
      </div>
    );
  } catch (error) {
    return (
      <div>
        <PageHeader title="CRM pipeline" />
        <MasterDataError message={loadMasterDataError(error)} />
      </div>
    );
  }
}
