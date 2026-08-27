import Link from "next/link";
import { Card } from "@/components/ui/Card";
import { ProgressBar } from "@/components/ui/FormControls";
import { Table, THead, Th, Td } from "@/components/ui/Table";
import { TierBadge } from "@/components/ui/Badge";
import { MasterDataEmpty } from "@/components/ui/MasterDataStatus";
import type { StpCurrentResult } from "@/lib/supabase/stp-current";

function scoreLabel(value: number | null | undefined): string {
  return value == null ? "UNKNOWN" : String(value);
}

export function ScoringTable({ result }: { result: StpCurrentResult }) {
  if (result.total === 0) {
    return (
      <Card>
        <div className="p-4">
          <MasterDataEmpty
            label={
              result.readiness === "CONFIGURED"
                ? `No current STP scores for ${result.service.name}.`
                : `${result.service.service_code ?? result.service.name} is NOT CONFIGURED. Persisted ranking is not available. PCH is the validated reference.`
            }
          />
        </div>
      </Card>
    );
  }

  const serviceCode = result.service.service_code ?? "PCH";
  const pageHref = (page: number) => {
    const query = new URLSearchParams({ service: serviceCode });
    if (page > 1) query.set("page", String(page));
    return `/targeting?${query.toString()}`;
  };

  return (
    <Card>
      <div className="overflow-x-auto">
        <Table>
          <THead>
            <Th>Rank</Th>
            <Th>Account</Th>
            <Th>Tier</Th>
            <Th>Score</Th>
            <Th>Application Fit</Th>
            <Th>Data Confidence</Th>
            <Th>Positioning</Th>
            <Th>Contact roles</Th>
          </THead>
          <tbody>
            {result.rows.map((row) => (
              <tr key={row.id} className="border-b border-steel-100 last:border-0 hover:bg-steel-50 align-top">
                <Td className="font-semibold text-steel-500">{row.rank}</Td>
                <Td className="min-w-56 whitespace-normal">
                  <Link
                    className="font-medium text-teal-800 hover:underline"
                    href={`/targeting/${row.id}?service=${encodeURIComponent(serviceCode)}`}
                  >
                    {row.companyName}
                  </Link>
                  <p className="text-xs text-steel-500">
                    {row.entityType ?? "Unspecified"} · {row.eligibility}
                    {row.rankingEligible ? " · ranking eligible" : ""}
                  </p>
                </Td>
                <Td>{row.tier ? <TierBadge tier={row.tier} /> : "—"}</Td>
                <Td>
                  <div className="w-24">
                    <p className="mb-1 font-semibold">{scoreLabel(row.commercialScore)}</p>
                    {row.commercialScore != null ? <ProgressBar value={row.commercialScore} /> : null}
                  </div>
                </Td>
                <Td>{scoreLabel(row.applicationFit)}</Td>
                <Td>
                  {row.dataConfidenceBand ?? "—"}
                  {row.dataConfidenceScore != null ? ` ${row.dataConfidenceScore}` : ""}
                </Td>
                <Td className="min-w-72 max-w-md whitespace-normal text-xs text-steel-700" title={row.targetingReason ?? undefined}>
                  {row.positioningStatement ?? "—"}
                </Td>
                <Td className="whitespace-normal text-xs">{row.recommendedContactRoles.join(", ") || "—"}</Td>
              </tr>
            ))}
          </tbody>
        </Table>
      </div>
      {result.pageCount > 1 ? (
        <div className="flex items-center justify-between border-t border-steel-100 px-4 py-3 text-sm">
          <p className="text-steel-500">
            Page {result.page} of {result.pageCount}
          </p>
          <div className="flex gap-2">
            {result.page > 1 ? (
              <Link className="text-teal-700 hover:underline" href={pageHref(result.page - 1)}>
                Previous
              </Link>
            ) : null}
            {result.page < result.pageCount ? (
              <Link className="text-teal-700 hover:underline" href={pageHref(result.page + 1)}>
                Next
              </Link>
            ) : null}
          </div>
        </div>
      ) : null}
    </Card>
  );
}
