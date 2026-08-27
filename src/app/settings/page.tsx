import { SettingsPanels } from "@/components/settings/SettingsPanels";
import { PageHeader } from "@/components/ui/FormControls";
import { MasterDataError } from "@/components/ui/MasterDataStatus";
import { loadMasterDataError } from "@/lib/supabase/errors";
import { getMasterCatalog } from "@/lib/supabase/master-data";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  try {
    const catalog = await getMasterCatalog();

    return (
      <div>
        <PageHeader
          title="Platform settings"
          description="Reference catalogs and scoring configuration loaded from Supabase."
        />
        <SettingsPanels
          industries={catalog.industries}
          customerTypes={catalog.customerTypes}
          services={catalog.services}
          regions={catalog.regions}
          departments={catalog.departments}
          scoringCriteria={catalog.scoringCriteria}
          scoringSettings={catalog.scoringSettings}
          crmStages={catalog.crmStages}
        />
      </div>
    );
  } catch (error) {
    return (
      <div>
        <PageHeader title="Platform settings" />
        <MasterDataError message={loadMasterDataError(error)} />
      </div>
    );
  }
}
