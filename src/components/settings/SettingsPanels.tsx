import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { ProgressBar } from "@/components/ui/FormControls";
import { MasterDataEmpty } from "@/components/ui/MasterDataStatus";
import type {
  CrmStageRecord,
  CustomerTypeRecord,
  DepartmentRecord,
  IndustryRecord,
  RegionRecord,
  ScoringCriterionRecord,
  ScoringSettingsRecord,
  ServiceRecord,
} from "@/lib/supabase/master-data";

export function SettingsPanels({
  industries,
  customerTypes,
  services,
  regions,
  departments,
  scoringCriteria,
  scoringSettings,
  crmStages,
}: {
  industries: IndustryRecord[];
  customerTypes: CustomerTypeRecord[];
  services: ServiceRecord[];
  regions: RegionRecord[];
  departments: DepartmentRecord[];
  scoringCriteria: ScoringCriterionRecord[];
  scoringSettings: ScoringSettingsRecord;
  crmStages: CrmStageRecord[];
}) {
  return (
    <div className="grid gap-4 xl:grid-cols-2">
      <CatalogCard title="Industries" items={industries.map((item) => item.name)} />
      <CatalogCard title="Customer Types" items={customerTypes.map((item) => item.name)} />
      <CatalogCard title="GEOCHEM Services" items={services.map((item) => item.name)} />
      <CatalogCard title="Regions" items={regions.map((item) => item.name)} />
      <CatalogCard title="Departments" items={departments.map((item) => item.name)} />

      <Card>
        <CardHeader
          title="Scoring Weights"
          description={`${scoringSettings.model_name} (${scoringSettings.model_version}) — canonical weights from Supabase.`}
        />
        <CardBody className="space-y-4">
          {scoringCriteria.length === 0 ? (
            <MasterDataEmpty label="No active scoring criteria were returned." />
          ) : (
            scoringCriteria.map((criterion) => (
              <div key={criterion.id}>
                <div className="mb-1 flex items-center justify-between text-sm">
                  <span className="font-medium text-navy-900">{criterion.name}</span>
                  <span className="text-steel-500">{Number(criterion.weight)}%</span>
                </div>
                <ProgressBar value={Number(criterion.weight) * 4} />
                {criterion.description ? (
                  <p className="mt-1 text-xs text-steel-500">{criterion.description}</p>
                ) : null}
              </div>
            ))
          )}
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Tier Thresholds" description="Score cut-offs on the 0–5 targeting scale." />
        <CardBody className="space-y-3">
          <ThresholdRow label="Tier 1" value={`≥ ${Number(scoringSettings.tier1_min).toFixed(2)}`} />
          <ThresholdRow label="Tier 2" value={`≥ ${Number(scoringSettings.tier2_min).toFixed(2)}`} />
          <ThresholdRow label="Tier 3" value={`≥ ${Number(scoringSettings.tier3_min).toFixed(2)}`} />
          <ThresholdRow label="Low Priority" value={`< ${Number(scoringSettings.tier3_min).toFixed(2)}`} />
        </CardBody>
      </Card>

      <Card className="xl:col-span-2">
        <CardHeader title="CRM Stages" description="Pipeline stages for opportunity tracking." />
        <CardBody>
          {crmStages.length === 0 ? (
            <MasterDataEmpty label="No CRM stages were returned." />
          ) : (
            <div className="flex flex-wrap gap-2">
              {crmStages.map((stage) => (
                <span
                  key={stage.id}
                  className="rounded-full border border-steel-200 bg-steel-50 px-3 py-1 text-sm text-navy-900"
                >
                  {stage.name}
                  {Number.isFinite(stage.default_probability) ? ` · ${stage.default_probability}%` : ""}
                </span>
              ))}
            </div>
          )}
        </CardBody>
      </Card>
    </div>
  );
}

function CatalogCard({ title, items }: { title: string; items: string[] }) {
  return (
    <Card>
      <CardHeader title={title} description="Loaded from Supabase reference tables." />
      <CardBody>
        {items.length === 0 ? (
          <MasterDataEmpty label={`No ${title.toLowerCase()} were returned.`} />
        ) : (
          <ul className="grid gap-2 sm:grid-cols-2">
            {items.map((item) => (
              <li key={item} className="rounded-md border border-steel-100 bg-steel-50 px-3 py-2 text-sm">
                {item}
              </li>
            ))}
          </ul>
        )}
      </CardBody>
    </Card>
  );
}

function ThresholdRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between rounded-md border border-steel-100 bg-steel-50 px-3 py-2">
      <span className="text-sm font-medium text-navy-900">{label}</span>
      <span className="text-sm text-steel-500">{value}</span>
    </div>
  );
}
