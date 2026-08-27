import Link from "next/link";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Table, THead, Th, Td } from "@/components/ui/Table";
import { OpportunityForm } from "@/components/crm/OpportunityForm";
import { OpportunityStageSelect } from "@/components/crm/OpportunityStageSelect";
import { formatSar } from "@/lib/utils";
import type { OpportunityRecord } from "@/lib/crm/opportunity";
import type { CrmStageRecord } from "@/lib/supabase/master-data";

export function CompanyOpportunitiesCard({
  companyId,
  companyName,
  serviceId,
  serviceCode,
  stages,
  contacts,
  opportunities,
  errorMessage,
}: {
  companyId: string;
  companyName: string;
  serviceId: string;
  serviceCode: string;
  stages: CrmStageRecord[];
  contacts: { id: string; fullName: string }[];
  opportunities: OpportunityRecord[];
  errorMessage?: string | null;
}) {
  const serviceRows = opportunities.filter((row) => row.serviceId === serviceId);

  return (
    <Card>
      <CardHeader
        title="CRM / Opportunities"
        description="Live opportunity records for this company and selected service. Empty until a real opportunity is created."
        action={
          <div className="flex flex-wrap items-center gap-2">
            <Link
              className="rounded-md border border-steel-200 bg-white px-3 py-2 text-sm text-navy-900 hover:bg-steel-50"
              href={`/crm?service=${encodeURIComponent(serviceCode)}`}
            >
              Open pipeline
            </Link>
            <OpportunityForm
              companyId={companyId}
              companyName={companyName}
              serviceId={serviceId}
              serviceCode={serviceCode}
              stages={stages}
              contacts={contacts}
              defaultOpen={serviceRows.length === 0 && !errorMessage}
            />
          </div>
        }
      />
      <CardBody>
        {errorMessage ? (
          <p className="text-sm text-danger-700">{errorMessage}</p>
        ) : serviceRows.length === 0 ? (
          <p className="text-sm text-steel-500">No opportunity records for this account and service.</p>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <THead>
                <Th>Opportunity</Th>
                <Th>Stage</Th>
                <Th>Estimated value</Th>
                <Th>Probability</Th>
                <Th>Weighted value</Th>
                <Th>Expected close</Th>
                <Th>Owner</Th>
                <Th>Contact</Th>
              </THead>
              <tbody>
                {serviceRows.map((row) => (
                  <tr key={row.id} className="border-b border-steel-100 last:border-0">
                    <Td className="font-medium">
                      <Link className="text-teal-800 hover:underline" href={`/crm/${row.id}`}>
                        {row.opportunityName}
                      </Link>
                    </Td>
                    <Td>
                      <OpportunityStageSelect opportunityId={row.id} stageId={row.stageId} stages={stages} />
                    </Td>
                    <Td>{formatSar(row.estimatedValue)}</Td>
                    <Td>{row.probability}%</Td>
                    <Td className="font-semibold">{formatSar(row.weightedValue)}</Td>
                    <Td>{row.expectedCloseDate ?? "—"}</Td>
                    <Td>{row.owner ?? "—"}</Td>
                    <Td>{row.contactName ?? "—"}</Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </div>
        )}
      </CardBody>
    </Card>
  );
}
