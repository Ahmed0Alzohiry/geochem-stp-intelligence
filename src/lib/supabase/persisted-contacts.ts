/**
 * Read-only persisted contacts for Target Account Detail.
 * Uses contacts + contact_service_relevance only. Does not insert or clone.
 */
import { visibleContactsForCompany, type AccountGroupMember } from "../contacts/persist-grain";
import { createSupabaseBrowserClient } from "./client";
import { getAccountGroupMembers, type AccountGroupMemberRow } from "./stp-current";

export type PersistedContactDisplay = {
  id: string;
  fullName: string;
  jobTitle: string | null;
  contactRole: string | null;
  departmentName: string | null;
  jobFunctionName: string | null;
  owningCompanyId: string;
  owningCompanyName: string;
  displayMode: "OWNED" | "INHERITED_FROM_ACCOUNT";
  serviceCode: string;
  buyingRole: string | null;
  relevanceScore: number | null;
  relevanceReason: string | null;
  sourceName: string | null;
  evidenceType: string | null;
  sourceConfidence: string | null;
  verificationStatus: string | null;
  verifiedAt: string | null;
  sourceUrl: string | null;
};

function formatVerifiedAt(value: string | null): string | null {
  if (!value) return null;
  const day = value.slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(day) ? day : value;
}

export async function getVisiblePersistedContacts(input: {
  viewCompanyId: string;
  accountGroupKey: string;
  serviceId: string;
  serviceCode: string;
}): Promise<PersistedContactDisplay[]> {
  const members = await getAccountGroupMembers(input.accountGroupKey);
  const grainMembers: AccountGroupMember[] = members.map((row: AccountGroupMemberRow) => ({
    companyId: row.companyId,
    companyName: row.companyName,
    legalName: row.legalName,
    entityType: row.entityType,
  }));
  const account = members.find((row) => row.entityType === "ACCOUNT");
  const companyIds = [...new Set([input.viewCompanyId, account?.companyId].filter(Boolean))] as string[];
  if (companyIds.length === 0) return [];

  const supabase = createSupabaseBrowserClient();
  const { data: contacts, error } = await supabase
    .from("contacts")
    .select(
      "id, company_id, full_name, job_title, contact_role, department_id, job_function_id, source_url, source_name, evidence_type, source_confidence, verification_status, verified_at",
    )
    .in("company_id", companyIds);
  if (error) throw new Error(`Unable to load persisted contacts: ${error.message}`);
  const rows = contacts ?? [];
  if (rows.length === 0) return [];

  const departmentIds = [...new Set(rows.map((row) => row.department_id).filter(Boolean))] as string[];
  const functionIds = [...new Set(rows.map((row) => row.job_function_id).filter(Boolean))] as string[];
  const contactIds = rows.map((row) => row.id as string);

  const [departments, functions, relevance] = await Promise.all([
    departmentIds.length
      ? supabase.from("departments").select("id, name").in("id", departmentIds)
      : Promise.resolve({ data: [] as { id: string; name: string }[], error: null }),
    functionIds.length
      ? supabase.from("job_functions").select("id, name").in("id", functionIds)
      : Promise.resolve({ data: [] as { id: string; name: string }[], error: null }),
    supabase
      .from("contact_service_relevance")
      .select("contact_id, service_id, relevance_score, buying_role, relevance_reason")
      .in("contact_id", contactIds)
      .eq("service_id", input.serviceId),
  ]);
  if (departments.error) throw new Error(`Unable to load departments: ${departments.error.message}`);
  if (functions.error) throw new Error(`Unable to load job functions: ${functions.error.message}`);
  if (relevance.error) throw new Error(`Unable to load contact relevance: ${relevance.error.message}`);

  const deptById = new Map((departments.data ?? []).map((row) => [row.id, row.name]));
  const fnById = new Map((functions.data ?? []).map((row) => [row.id, row.name]));
  const relByContact = new Map((relevance.data ?? []).map((row) => [row.contact_id as string, row]));

  const visible = visibleContactsForCompany(
    input.viewCompanyId,
    grainMembers,
    rows.map((row) => ({
      id: row.id as string,
      companyId: row.company_id as string,
      fullName: row.full_name as string,
    })),
  );

  return visible.map((item) => {
    const row = rows.find((candidate) => candidate.id === item.id);
    const rel = relByContact.get(item.id);
    return {
      id: item.id,
      fullName: item.fullName,
      jobTitle: (row?.job_title as string | null) ?? null,
      contactRole: (row?.contact_role as string | null) ?? null,
      departmentName: row?.department_id ? (deptById.get(row.department_id as string) ?? null) : null,
      jobFunctionName: row?.job_function_id ? (fnById.get(row.job_function_id as string) ?? null) : null,
      owningCompanyId: item.owningCompanyId,
      owningCompanyName: item.owningCompanyName,
      displayMode: item.displayMode,
      serviceCode: input.serviceCode,
      buyingRole: (rel?.buying_role as string | null) ?? null,
      relevanceScore: rel?.relevance_score == null ? null : Number(rel.relevance_score),
      relevanceReason: (rel?.relevance_reason as string | null) ?? null,
      sourceName: (row?.source_name as string | null) ?? null,
      evidenceType: (row?.evidence_type as string | null) ?? null,
      sourceConfidence: (row?.source_confidence as string | null) ?? null,
      verificationStatus: (row?.verification_status as string | null) ?? null,
      verifiedAt: formatVerifiedAt((row?.verified_at as string | null) ?? null),
      sourceUrl: (row?.source_url as string | null) ?? null,
    };
  });
}
