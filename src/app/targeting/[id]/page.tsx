import { notFound } from "next/navigation";
import { TargetAccountDetail } from "@/components/targeting/TargetAccountDetail";
import { PageHeader } from "@/components/ui/FormControls";
import { MasterDataError } from "@/components/ui/MasterDataStatus";
import { loadMasterDataError } from "@/lib/supabase/errors";
import { getVisiblePersistedContacts } from "@/lib/supabase/persisted-contacts";
import { getCompanyOpportunities } from "@/lib/supabase/opportunities";
import { getCrmStages } from "@/lib/supabase/master-data";
import { DEFAULT_STP_SERVICE_CODE, getStpAccountDetail } from "@/lib/supabase/stp-current";

export const dynamic = "force-dynamic";

export default async function TargetAccountDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id } = await params;
  const query = await searchParams;
  let detail;
  try {
    detail = await getStpAccountDetail(id, query);
  } catch (error) {
    return (
      <div>
        <PageHeader title="Target account" />
        <MasterDataError message={loadMasterDataError(error)} />
      </div>
    );
  }
  if (!detail) notFound();

  try {
    const service = detail.serviceCode || DEFAULT_STP_SERVICE_CODE;
    const persistedContacts = await getVisiblePersistedContacts({
      viewCompanyId: detail.companyId,
      accountGroupKey: detail.accountGroupKey,
      serviceId: detail.serviceId,
      serviceCode: detail.serviceCode,
    });
    let stages: Awaited<ReturnType<typeof getCrmStages>> = [];
    let opportunities: Awaited<ReturnType<typeof getCompanyOpportunities>> = [];
    let crmError: string | null = null;
    try {
      [stages, opportunities] = await Promise.all([
        getCrmStages(),
        getCompanyOpportunities(detail.companyId),
      ]);
    } catch (crmLoadError) {
      crmError = loadMasterDataError(crmLoadError);
    }
    return (
      <div>
        <PageHeader
          title="Target account"
          description={`${detail.serviceCode} persisted current STP. Rankings are per service_id. This page does not rescore.`}
        />
        <TargetAccountDetail
          detail={detail}
          persistedContacts={persistedContacts}
          backHref={`/targeting?service=${encodeURIComponent(service)}`}
          opportunities={opportunities}
          stages={stages}
          crmError={crmError}
        />
      </div>
    );
  } catch (error) {
    return (
      <div>
        <PageHeader title="Target account" />
        <MasterDataError message={loadMasterDataError(error)} />
      </div>
    );
  }
}
