import Link from "next/link";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { formatSar } from "@/lib/utils";
import { OpportunityStageSelect } from "@/components/crm/OpportunityStageSelect";
import type { PipelineSummary, StageGroup } from "@/lib/crm/opportunity";
import type { CrmStageRecord, ServiceRecord } from "@/lib/supabase/master-data";

export function CrmPipelineView({
  groups,
  summary,
  stages,
  services,
  filters,
}: {
  groups: StageGroup[];
  summary: PipelineSummary;
  stages: CrmStageRecord[];
  services: ServiceRecord[];
  filters: { service: string; stage: string; company: string; owner: string };
}) {
  const visibleGroups = filters.stage ? groups.filter((group) => group.stage === filters.stage) : groups;

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardBody>
            <p className="text-xs uppercase tracking-wide text-steel-500">Active opportunities</p>
            <p className="mt-1 text-2xl font-semibold text-navy-900">{summary.activeCount}</p>
          </CardBody>
        </Card>
        <Card>
          <CardBody>
            <p className="text-xs uppercase tracking-wide text-steel-500">Weighted pipeline</p>
            <p className="mt-1 text-2xl font-semibold text-navy-900">{formatSar(summary.pipelineValue)}</p>
            <p className="mt-1 text-xs text-steel-500">Excludes Won and Lost</p>
          </CardBody>
        </Card>
        <Card>
          <CardBody>
            <p className="text-xs uppercase tracking-wide text-steel-500">Estimated active value</p>
            <p className="mt-1 text-2xl font-semibold text-navy-900">{formatSar(summary.estimatedActiveValue)}</p>
          </CardBody>
        </Card>
      </div>

      <Card>
        <CardHeader title="Filters" />
        <CardBody>
          <form method="get" className="grid gap-3 md:grid-cols-4">
            <label className="text-sm">
              <span className="text-steel-600">Service</span>
              <select
                name="service"
                defaultValue={filters.service}
                className="mt-1 h-10 w-full rounded-md border border-steel-200 bg-white px-3 text-sm"
              >
                <option value="">All</option>
                {services.map((service) => (
                  <option key={service.id} value={service.service_code ?? service.id}>
                    {service.service_code ?? service.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-sm">
              <span className="text-steel-600">Stage</span>
              <select
                name="stage"
                defaultValue={filters.stage}
                className="mt-1 h-10 w-full rounded-md border border-steel-200 bg-white px-3 text-sm"
              >
                <option value="">All</option>
                {stages.map((stage) => (
                  <option key={stage.id} value={stage.name}>
                    {stage.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-sm">
              <span className="text-steel-600">Company</span>
              <input
                name="company"
                defaultValue={filters.company}
                className="mt-1 h-10 w-full rounded-md border border-steel-200 bg-white px-3 text-sm"
              />
            </label>
            <label className="text-sm">
              <span className="text-steel-600">Owner</span>
              <input
                name="owner"
                defaultValue={filters.owner}
                className="mt-1 h-10 w-full rounded-md border border-steel-200 bg-white px-3 text-sm"
              />
            </label>
            <div className="md:col-span-4">
              <button type="submit" className="rounded-md bg-navy-900 px-3 py-2 text-sm font-medium text-white">
                Apply filters
              </button>
            </div>
          </form>
        </CardBody>
      </Card>

      {visibleGroups.every((group) => group.items.length === 0) ? (
        <p className="text-sm text-steel-600">No opportunities match these filters. Create one from a target account.</p>
      ) : null}

      <div className="space-y-4">
        {visibleGroups.map((group) => (
          <Card key={group.stage}>
            <CardHeader
              title={group.stage}
              description={`${group.count} · estimated ${formatSar(group.estimatedValue)} · weighted ${formatSar(group.weightedValue)}`}
            />
            <CardBody>
              {group.items.length === 0 ? (
                <p className="text-sm text-steel-500">No opportunities in this stage.</p>
              ) : (
                <ul className="space-y-3">
                  {group.items.map((row) => (
                    <li
                      key={row.id}
                      className="flex flex-col gap-3 rounded-md border border-steel-100 p-3 sm:flex-row sm:items-center sm:justify-between"
                    >
                      <div>
                        <Link className="font-medium text-teal-800 hover:underline" href={`/crm/${row.id}`}>
                          {row.opportunityName}
                        </Link>
                        <p className="text-sm text-steel-600">
                          {row.companyName} · {row.serviceCode ?? row.serviceName}
                        </p>
                        <p className="text-xs text-steel-500">
                          {formatSar(row.estimatedValue)} · {row.probability}% · weighted {formatSar(row.weightedValue)}
                          {row.expectedCloseDate ? ` · close ${row.expectedCloseDate}` : ""}
                          {row.owner ? ` · ${row.owner}` : ""}
                        </p>
                      </div>
                      <OpportunityStageSelect opportunityId={row.id} stageId={row.stageId} stages={stages} />
                    </li>
                  ))}
                </ul>
              )}
            </CardBody>
          </Card>
        ))}
      </div>

      <p className="text-sm text-steel-600">
        Create opportunities from a{" "}
        <Link className="font-medium text-teal-700 hover:underline" href={`/targeting?service=${encodeURIComponent(filters.service || "PCH")}`}>
          target account
        </Link>
        .
      </p>
    </div>
  );
}
