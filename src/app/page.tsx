import { Building2, CircleDollarSign, Gem, Workflow } from "lucide-react";
import { connection } from "next/server";
import Link from "next/link";
import { HorizontalBarChart, VerticalBarChart } from "@/components/charts/AnalyticsCharts";
import { ServiceSelector } from "@/components/services/ServiceSelector";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { PageHeader } from "@/components/ui/FormControls";
import { MasterDataEmpty, MasterDataError } from "@/components/ui/MasterDataStatus";
import { StatCard } from "@/components/ui/StatCard";
import { Table, THead, Th, Td } from "@/components/ui/Table";
import { loadMasterDataError } from "@/lib/supabase/errors";
import { getDashboardSnapshot } from "@/lib/supabase/dashboard";
import { DEFAULT_STP_SERVICE_CODE } from "@/lib/supabase/stp-current";
import { formatNumber, formatSar } from "@/lib/utils";
import type { NamedCount } from "@/types";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";
export const revalidate = 0;

function firstParam(value: string | string[] | undefined): string {
  if (Array.isArray(value)) return value[0] ?? "";
  return value ?? "";
}

function DistributionTable({ rows }: { rows: NamedCount[] }) {
  if (rows.length === 0) {
    return <MasterDataEmpty label="No values recorded for this field." />;
  }

  return (
    <Table>
      <THead>
        <Th>Segment</Th>
        <Th>Companies</Th>
      </THead>
      <tbody>
        {rows.slice(0, 12).map((row) => (
          <tr key={row.name} className="border-b border-steel-100 last:border-0">
            <Td className="font-medium">{row.name}</Td>
            <Td className="font-semibold">{formatNumber(row.value)}</Td>
          </tr>
        ))}
      </tbody>
    </Table>
  );
}

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  try {
    await connection();
    const params = await searchParams;
    const serviceCode = firstParam(params.service).toUpperCase() || DEFAULT_STP_SERVICE_CODE;
    const snapshot = await getDashboardSnapshot(serviceCode);
    const configured = snapshot.serviceReadiness === "CONFIGURED";
    const opportunitiesAvailable = snapshot.opportunitiesAvailable;

    return (
      <div>
        <PageHeader
          title="Market intelligence overview"
          description="Live Saudi company universe for GEOCHEM ARABIA LIMITED. Targeting counts use persisted company_service_stp_current rows for the selected service_id. PCH is the default reference."
        />

        <Card className="mb-4">
          <CardBody className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
            <ServiceSelector services={snapshot.registeredServices} selectedCode={snapshot.stpServiceCode} />
            <p className="text-sm text-steel-600">
              Selected: <span className="font-semibold text-navy-900">{snapshot.stpServiceName ?? snapshot.stpServiceCode}</span>
              {" · "}
              {configured ? "CONFIGURED" : "NOT CONFIGURED"}
            </p>
          </CardBody>
        </Card>

        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard
            label="Total Companies"
            value={formatNumber(snapshot.totalCompanies)}
            hint="Live company records (universe, not service-filtered)"
            icon={Building2}
            accent="navy"
          />
          <StatCard
            label="Tier 1 Accounts"
            value={snapshot.targetingAvailable ? formatNumber(snapshot.tier1Accounts) : "Not available"}
            hint={
              snapshot.targetingAvailable
                ? `${snapshot.stpAccountCount} ${snapshot.stpServiceCode} accounts in current STP`
                : configured
                  ? `No current STP scores for ${snapshot.stpServiceCode} yet`
                  : `${snapshot.stpServiceCode} ranking is NOT CONFIGURED`
            }
            icon={Gem}
            accent="brass"
          />
          <StatCard
            label="Active Opportunities"
            value={opportunitiesAvailable ? formatNumber(snapshot.activeOpportunities) : "Not available"}
            hint={
              opportunitiesAvailable
                ? snapshot.activeOpportunities === 0
                  ? "No active opportunities"
                  : "Open opportunities excluding Won and Lost"
                : "Opportunity table is not readable yet"
            }
            icon={Workflow}
            accent="teal"
          />
          <StatCard
            label="Pipeline Value"
            value={opportunitiesAvailable ? formatSar(snapshot.pipelineValue) : "Not available"}
            hint={
              opportunitiesAvailable
                ? snapshot.activeOpportunities === 0
                  ? "No pipeline value yet"
                  : `Weighted active value. Estimated ${formatSar(snapshot.estimatedPipelineValue)}`
                : "Opportunity values are not readable yet"
            }
            icon={CircleDollarSign}
            accent="success"
          />
        </div>

        <p className="mt-3 text-sm text-steel-600 flex flex-wrap gap-4">
          <Link
            className="font-medium text-teal-700 hover:underline"
            href={`/targeting?service=${encodeURIComponent(snapshot.stpServiceCode)}`}
          >
            Open ranked {snapshot.stpServiceCode} target accounts
          </Link>
          <Link className="font-medium text-teal-700 hover:underline" href={`/crm?service=${encodeURIComponent(snapshot.stpServiceCode)}`}>
            Open CRM pipeline
          </Link>
        </p>

        <Card className="mt-6">
          <CardHeader
            title={`${snapshot.stpServiceCode} ranked accounts`}
            description={
              configured
                ? "Top persisted current STP rows for this service_id. Rankings are not mixed with other services."
                : "No persisted ranking. Scores are not invented for unconfigured services."
            }
          />
          <CardBody>
            {snapshot.rankedPreview.length === 0 ? (
              <MasterDataEmpty
                label={
                  configured
                    ? "No current STP rows for this service."
                    : `${snapshot.stpServiceCode} is NOT CONFIGURED. PCH remains the validated reference.`
                }
              />
            ) : (
              <Table>
                <THead>
                  <Th>Rank</Th>
                  <Th>Account</Th>
                  <Th>Tier</Th>
                  <Th>Score</Th>
                </THead>
                <tbody>
                  {snapshot.rankedPreview.map((row) => (
                    <tr key={row.id} className="border-b border-steel-100 last:border-0">
                      <Td>{row.rank}</Td>
                      <Td>
                        <Link
                          className="font-medium text-teal-800 hover:underline"
                          href={`/targeting/${row.id}?service=${encodeURIComponent(snapshot.stpServiceCode)}`}
                        >
                          {row.companyName}
                        </Link>
                      </Td>
                      <Td>{row.tier ?? "—"}</Td>
                      <Td className="font-semibold">{row.commercialScore ?? "UNKNOWN"}</Td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            )}
          </CardBody>
        </Card>

        <div className="mt-6 grid gap-4 xl:grid-cols-2">
          <Card>
            <CardHeader
              title="Companies by Sector"
              description="Industry mix in the live company universe (not a service STP metric)"
            />
            <CardBody>
              {snapshot.companiesBySector.length === 0 ? (
                <MasterDataEmpty label="No industry values to chart." />
              ) : (
                <HorizontalBarChart data={snapshot.companiesBySector} />
              )}
            </CardBody>
          </Card>
          <Card>
            <CardHeader
              title="Companies by Location"
              description="Imported city mix in the live company universe. Verified geo is on account detail."
            />
            <CardBody>
              {snapshot.companiesByLocation.length === 0 ? (
                <MasterDataEmpty label="No location values to chart." />
              ) : (
                <VerticalBarChart data={snapshot.companiesByLocation} />
              )}
            </CardBody>
          </Card>
        </div>

        <div className="mt-6 grid gap-4 xl:grid-cols-2">
          <Card>
            <CardHeader title="Companies by Customer Type" description="Account types in the live dataset" />
            <DistributionTable rows={snapshot.companiesByCustomerType} />
          </Card>
          <Card>
            <CardHeader title="Verification status" description="Identity verification on live company records" />
            <DistributionTable rows={snapshot.companiesByVerification} />
          </Card>
        </div>

        <Card className="mt-6">
          <CardHeader title="Dataset status" description="Research versus verified dataset flags on live company records" />
          <DistributionTable rows={snapshot.companiesByDatasetStatus} />
        </Card>
      </div>
    );
  } catch (error) {
    return (
      <div>
        <PageHeader title="Market intelligence overview" />
        <MasterDataError message={loadMasterDataError(error)} />
      </div>
    );
  }
}
