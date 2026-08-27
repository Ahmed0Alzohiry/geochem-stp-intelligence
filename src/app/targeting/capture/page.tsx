import Link from "next/link";
import { ContactCaptureWorksheet } from "@/components/targeting/ContactCaptureWorksheet";
import { PageHeader } from "@/components/ui/FormControls";
import { MasterDataError } from "@/components/ui/MasterDataStatus";
import { loadMasterDataError } from "@/lib/supabase/errors";
import { DEFAULT_STP_SERVICE_CODE, getRankOneStpAccountDetail } from "@/lib/supabase/stp-current";

export const dynamic = "force-dynamic";

export default async function RankOneContactCapturePage() {
  try {
    const loaded = await getRankOneStpAccountDetail(DEFAULT_STP_SERVICE_CODE);
    if (!loaded) {
      return (
        <div>
          <PageHeader title="Contact capture worksheet" />
          <p className="text-sm text-steel-600">No PCH STP ranked account is available.</p>
        </div>
      );
    }
    const { detail, existingContacts, groupMembers } = loaded;
    return (
      <div>
        <PageHeader
          title="Contact capture worksheet"
          description="Rank-1 PCH account only. Human research from a live public source. Candidates are evaluated with STEP 7.5 rules and are not inserted."
        />
        <p className="mb-4 text-sm">
          <Link className="text-teal-700 hover:underline" href={`/targeting/${detail.id}?service=PCH`}>
            Back to target account
          </Link>
        </p>
        <ContactCaptureWorksheet
          account={{
            companyId: detail.companyId,
            companyName: detail.companyName,
            serviceCode: detail.serviceCode,
            serviceName: detail.serviceName,
            rank: detail.rank,
            tier: detail.tier,
            commercialScore: detail.commercialScore,
            rankedForService: true,
            entityType: (detail.entityType as "ACCOUNT" | "FACILITY" | "BRANCH" | "RELATED" | "REVIEW" | null) ?? null,
            accountGroupKey: detail.accountGroupKey,
            groupMembers,
            existingAtCompany: existingContacts,
          }}
        />
      </div>
    );
  } catch (error) {
    return (
      <div>
        <PageHeader title="Contact capture worksheet" />
        <MasterDataError message={loadMasterDataError(error)} />
      </div>
    );
  }
}
