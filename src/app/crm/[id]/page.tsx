import { notFound } from "next/navigation";
import Link from "next/link";
import { OpportunityEditForm } from "@/components/crm/OpportunityEditForm";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { PageHeader } from "@/components/ui/FormControls";
import { MasterDataError } from "@/components/ui/MasterDataStatus";
import { StageBadge } from "@/components/ui/Badge";
import { loadMasterDataError } from "@/lib/supabase/errors";
import { getCrmStages } from "@/lib/supabase/master-data";
import { getOpportunity } from "@/lib/supabase/opportunities";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { formatSar } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function OpportunityDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let opportunity;
  try {
    opportunity = await getOpportunity(id);
  } catch (error) {
    return (
      <div>
        <PageHeader title="Opportunity" />
        <MasterDataError message={loadMasterDataError(error)} />
      </div>
    );
  }
  if (!opportunity) notFound();

  try {
    const stages = await getCrmStages();
    const supabase = createSupabaseBrowserClient();
    const { data: contactRows } = await supabase.from("contacts").select("id, full_name").limit(200);
    const contacts = (contactRows ?? []).map((row) => ({ id: row.id as string, fullName: String(row.full_name) }));
    if (opportunity.contactId && !contacts.some((row) => row.id === opportunity.contactId)) {
      contacts.unshift({
        id: opportunity.contactId,
        fullName: opportunity.contactName ?? "Associated contact",
      });
    }

    return (
      <div>
        <PageHeader
          title={opportunity.opportunityName}
          description={`${opportunity.companyName} · ${opportunity.serviceCode ?? opportunity.serviceName}`}
        />
        <p className="mb-4 flex flex-wrap gap-4 text-sm">
          <Link className="text-teal-700 hover:underline" href={opportunity.serviceCode ? `/crm?service=${encodeURIComponent(opportunity.serviceCode)}` : "/crm"}>
            Back to pipeline
          </Link>
          {opportunity.serviceCode ? (
            <Link
              className="text-teal-700 hover:underline"
              href={`/targeting?service=${encodeURIComponent(opportunity.serviceCode)}`}
            >
              Ranked {opportunity.serviceCode} accounts
            </Link>
          ) : null}
        </p>
        <div className="grid gap-4 xl:grid-cols-2">
          <Card>
            <CardHeader title="Opportunity" />
            <CardBody className="space-y-2 text-sm">
              <p>
                <span className="text-steel-500">Stage: </span>
                <StageBadge stage={opportunity.stage} />
              </p>
              <p>
                <span className="text-steel-500">Status: </span>
                {opportunity.status}
              </p>
              <p>
                <span className="text-steel-500">Estimated value: </span>
                {formatSar(opportunity.estimatedValue)}
              </p>
              <p>
                <span className="text-steel-500">Probability: </span>
                {opportunity.probability}%
              </p>
              <p>
                <span className="text-steel-500">Weighted value: </span>
                <span className="font-semibold">{formatSar(opportunity.weightedValue)}</span>
              </p>
              <p>
                <span className="text-steel-500">Expected close: </span>
                {opportunity.expectedCloseDate ?? "—"}
              </p>
              <p>
                <span className="text-steel-500">Owner: </span>
                {opportunity.owner ?? "—"}
              </p>
              <p>
                <span className="text-steel-500">Contact: </span>
                {opportunity.contactName ?? "—"}
              </p>
            </CardBody>
          </Card>
          <Card>
            <CardHeader title="Update opportunity" description="Stage change updates default probability." />
            <CardBody>
              <OpportunityEditForm opportunity={opportunity} stages={stages} contacts={contacts} />
            </CardBody>
          </Card>
        </div>
      </div>
    );
  } catch (error) {
    return (
      <div>
        <PageHeader title="Opportunity" />
        <MasterDataError message={loadMasterDataError(error)} />
      </div>
    );
  }
}
