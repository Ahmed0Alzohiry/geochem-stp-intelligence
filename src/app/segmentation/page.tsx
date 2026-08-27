import { SegmentationFlow } from "@/components/segmentation/SegmentationFlow";
import { PageHeader } from "@/components/ui/FormControls";
import { MasterDataError } from "@/components/ui/MasterDataStatus";
import { loadMasterDataError } from "@/lib/supabase/errors";
import { getCustomerTypes, getIndustries, getRegions, getServices } from "@/lib/supabase/master-data";

export const dynamic = "force-dynamic";

export default async function SegmentationPage() {
  try {
    const [industries, customerTypes, services, regions] = await Promise.all([
      getIndustries(),
      getCustomerTypes(),
      getServices(),
      getRegions(),
    ]);

    return (
      <div>
        <PageHeader
          title="Market segmentation"
          description="STP cascade used to classify the Saudi prospect universe: Industry → Customer Type → Service Need → Geography → Account Potential."
        />
        <SegmentationFlow
          industries={industries.map((item) => item.name)}
          customerTypes={customerTypes.map((item) => item.name)}
          services={services.map((item) => item.name)}
          regions={regions.map((item) => item.name)}
        />
      </div>
    );
  } catch (error) {
    return (
      <div>
        <PageHeader title="Market segmentation" />
        <MasterDataError message={loadMasterDataError(error)} />
      </div>
    );
  }
}
