import Link from "next/link";
import { CompanyDirectory } from "@/components/companies/CompanyDirectory";
import { PageHeader } from "@/components/ui/FormControls";
import { MasterDataError } from "@/components/ui/MasterDataStatus";
import { loadMasterDataError } from "@/lib/supabase/errors";
import { listCompaniesForDirectory } from "@/lib/supabase/companies";

export const dynamic = "force-dynamic";

export default async function CompaniesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  try {
    const params = await searchParams;
    const result = await listCompaniesForDirectory(params);

    return (
      <div>
        <PageHeader
          title="Company database"
          description="Live Saudi company universe. Search and filter imported records. Targeting and CRM use this same company set."
        />
        <p className="mb-4 flex flex-wrap gap-4 text-sm">
          <Link className="font-medium text-teal-700 hover:underline" href="/targeting?service=PCH">
            Open PCH targeting
          </Link>
          <Link className="font-medium text-teal-700 hover:underline" href="/crm?service=PCH">
            Open CRM pipeline
          </Link>
        </p>
        <CompanyDirectory result={result} />
      </div>
    );
  } catch (error) {
    return (
      <div>
        <PageHeader title="Company database" />
        <MasterDataError message={loadMasterDataError(error)} />
      </div>
    );
  }
}
