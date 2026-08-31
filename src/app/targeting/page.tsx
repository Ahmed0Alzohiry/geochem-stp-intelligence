import Link from "next/link";
import { ScoringTable } from "@/components/targeting/ScoringTable";
import { FullDatabaseTargetingPanel } from "@/components/targeting/FullDatabaseTargetingPanel";
import { ServiceSelector } from "@/components/services/ServiceSelector";
import { PageHeader } from "@/components/ui/FormControls";
import { Card, CardBody } from "@/components/ui/Card";
import { MasterDataError } from "@/components/ui/MasterDataStatus";
import { loadMasterDataError } from "@/lib/supabase/errors";
import { getStpCurrentForService } from "@/lib/supabase/stp-current";
import { loadServiceCoverage } from "@/lib/stp/run-full-database-targeting";

export const dynamic = "force-dynamic";

export default async function TargetingPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  try {
    const params = await searchParams;
    const result = await getStpCurrentForService(params);
    const selectedCode = result.service.service_code ?? "PCH";
    const notConfigured = result.readiness !== "CONFIGURED";
    let coverage: Awaited<ReturnType<typeof loadServiceCoverage>> | null = null;
    try {
      coverage = await loadServiceCoverage();
    } catch {
      coverage = null;
    }

    return (
      <div>
        <PageHeader
          title="Account targeting"
          description="Persisted service-first STP results from company_service_stp_current. Rankings are independent per service_id. PCH is the validated reference."
        />
        <Card className="mb-4">
          <CardBody className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <ServiceSelector services={result.registeredServices} selectedCode={selectedCode} />
            <p className="text-sm">
              <Link className="font-medium text-teal-700 hover:underline" href={`/crm?service=${encodeURIComponent(selectedCode)}`}>
                Open CRM pipeline
              </Link>
            </p>
            <div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
              <div>
                <p className="text-xs text-steel-500">Accounts</p>
                <p className="font-semibold text-navy-900">{result.total}</p>
              </div>
              <div>
                <p className="text-xs text-steel-500">Tier 1</p>
                <p className="font-semibold text-navy-900">{result.tierCounts.tier1}</p>
              </div>
              <div>
                <p className="text-xs text-steel-500">Tier 2</p>
                <p className="font-semibold text-navy-900">{result.tierCounts.tier2}</p>
              </div>
              <div>
                <p className="text-xs text-steel-500">Status</p>
                <p className="font-semibold text-navy-900">{result.readiness === "CONFIGURED" ? "Configured" : "Not configured"}</p>
              </div>
            </div>
          </CardBody>
        </Card>
        {notConfigured ? (
          <Card className="mb-4">
            <CardBody className="text-sm text-steel-700">
              {result.service.service_code} is <span className="font-semibold">NOT CONFIGURED</span> for persisted ranking.
              The 6.4.0 engine can score it, but weights and rankings are not independently validated. PCH remains the
              reference. No rows were invented or persisted for this service.
            </CardBody>
          </Card>
        ) : null}
        <ScoringTable result={result} />
        <div className="mt-6">
          <FullDatabaseTargetingPanel
            serviceCode={selectedCode}
            persistedCount={result.total}
            coverage={coverage}
          />
        </div>
      </div>
    );
  } catch (error) {
    return (
      <div>
        <PageHeader title="Account targeting" />
        <MasterDataError message={loadMasterDataError(error)} />
      </div>
    );
  }
}
