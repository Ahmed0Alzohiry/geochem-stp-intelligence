import { createSupabaseBrowserClient } from "./client";

export const COMPANIES_PAGE_SIZE = 50;

export type CompanyDirectoryRow = {
  id: string;
  companyName: string;
  legalName: string | null;
  industry: string | null;
  subsector: string | null;
  customerType: string | null;
  region: string | null;
  city: string | null;
  industrialCity: string | null;
  verificationStatus: string | null;
  datasetStatus: string | null;
};

export type CompanyDirectoryFilters = {
  q: string;
  industry: string;
  subsector: string;
  customerType: string;
  location: string;
  verificationStatus: string;
  datasetStatus: string;
  page: number;
};

export type CompanyFacets = {
  industries: string[];
  subsectors: string[];
  customerTypes: string[];
  locations: string[];
  verificationStatuses: string[];
  datasetStatuses: string[];
};

export type CompanyDirectoryResult = {
  rows: CompanyDirectoryRow[];
  total: number;
  page: number;
  pageSize: number;
  pageCount: number;
  filters: CompanyDirectoryFilters;
  facets: CompanyFacets;
};

type CompanyQueryRow = {
  id: string;
  company_name: string;
  legal_name: string | null;
  industry: string | null;
  subsector: string | null;
  customer_type: string | null;
  city: string | null;
  industrial_city: string | null;
  verification_status: string | null;
  dataset_status: string | null;
  regions: { name: string } | { name: string }[] | null;
};

class CompaniesReadError extends Error {
  constructor(message: string) {
    super(`Unable to load companies from Supabase: ${message}`);
    this.name = "CompaniesReadError";
  }
}

function firstParam(value: string | string[] | undefined): string {
  if (Array.isArray(value)) {
    return value[0]?.trim() ?? "";
  }
  return value?.trim() ?? "";
}

function parsePage(value: string | string[] | undefined): number {
  const raw = Number.parseInt(firstParam(value), 10);
  return Number.isInteger(raw) && raw > 0 ? raw : 1;
}

export function parseCompanyDirectoryFilters(
  searchParams: Record<string, string | string[] | undefined>,
): CompanyDirectoryFilters {
  return {
    q: firstParam(searchParams.q),
    industry: firstParam(searchParams.industry),
    subsector: firstParam(searchParams.subsector),
    customerType: firstParam(searchParams.customer_type),
    location: firstParam(searchParams.location),
    verificationStatus: firstParam(searchParams.verification_status),
    datasetStatus: firstParam(searchParams.dataset_status),
    page: parsePage(searchParams.page),
  };
}

function uniqueSorted(values: Array<string | null | undefined>): string[] {
  return [...new Set(values.map((value) => value?.trim()).filter((value): value is string => Boolean(value)))].sort(
    (a, b) => a.localeCompare(b),
  );
}

function sanitizeIlike(term: string): string {
  return term.replace(/[%_*(),"']/g, " ").replace(/\s+/g, " ").trim();
}

function regionName(regions: CompanyQueryRow["regions"]): string | null {
  if (!regions) {
    return null;
  }
  if (Array.isArray(regions)) {
    return regions[0]?.name?.trim() || null;
  }
  return regions.name?.trim() || null;
}

function searchOrFilter(filters: CompanyDirectoryFilters): string | null {
  const search = sanitizeIlike(filters.q);
  if (!search) {
    return null;
  }
  return `company_name.ilike."%${search}%",legal_name.ilike."%${search}%",alias_name.ilike."%${search}%"`;
}

function quoteFilterValue(value: string): string {
  return `"${value.replace(/"/g, "")}"`;
}

function locationOrFilter(location: string): string | null {
  if (!location) {
    return null;
  }
  const quoted = quoteFilterValue(location);
  return `city.eq.${quoted},industrial_city.eq.${quoted}`;
}

function equalityFilters(filters: CompanyDirectoryFilters): Array<[string, string]> {
  const entries: Array<[string, string]> = [];
  if (filters.industry) {
    entries.push(["industry", filters.industry]);
  }
  if (filters.subsector) {
    entries.push(["subsector", filters.subsector]);
  }
  if (filters.customerType) {
    entries.push(["customer_type", filters.customerType]);
  }
  if (filters.verificationStatus) {
    entries.push(["verification_status", filters.verificationStatus]);
  }
  if (filters.datasetStatus) {
    entries.push(["dataset_status", filters.datasetStatus]);
  }
  return entries;
}

async function loadFacets(): Promise<CompanyFacets> {
  const supabase = createSupabaseBrowserClient();
  const { data, error } = await supabase
    .from("companies")
    .select("industry, subsector, customer_type, city, industrial_city, verification_status, dataset_status")
    .abortSignal(AbortSignal.timeout(20000));

  if (error) {
    throw new CompaniesReadError(error.message);
  }

  const rows = data ?? [];
  return {
    industries: uniqueSorted(rows.map((row) => row.industry as string | null)),
    subsectors: uniqueSorted(rows.map((row) => row.subsector as string | null)),
    customerTypes: uniqueSorted(rows.map((row) => row.customer_type as string | null)),
    locations: uniqueSorted([
      ...rows.map((row) => row.city as string | null),
      ...rows.map((row) => row.industrial_city as string | null),
    ]),
    verificationStatuses: uniqueSorted(rows.map((row) => row.verification_status as string | null)),
    datasetStatuses: uniqueSorted(rows.map((row) => row.dataset_status as string | null)),
  };
}

export async function listCompaniesForDirectory(
  searchParams: Record<string, string | string[] | undefined>,
): Promise<CompanyDirectoryResult> {
  const requested = parseCompanyDirectoryFilters(searchParams);
  const supabase = createSupabaseBrowserClient();
  const orFilter = searchOrFilter(requested);
  const locationFilter = locationOrFilter(requested.location);
  const equals = equalityFilters(requested);

  let countQuery = supabase.from("companies").select("id", { count: "exact", head: true });
  if (orFilter) {
    countQuery = countQuery.or(orFilter);
  }
  if (locationFilter) {
    countQuery = countQuery.or(locationFilter);
  }
  for (const [column, value] of equals) {
    countQuery = countQuery.eq(column, value);
  }

  const { count, error: countError } = await countQuery.abortSignal(AbortSignal.timeout(20000));
  if (countError) {
    throw new CompaniesReadError(countError.message);
  }

  const total = count ?? 0;
  const pageCount = Math.max(1, Math.ceil(total / COMPANIES_PAGE_SIZE) || 1);
  const page = total === 0 ? 1 : Math.min(requested.page, pageCount);
  const from = (page - 1) * COMPANIES_PAGE_SIZE;
  const to = from + COMPANIES_PAGE_SIZE - 1;

  let listQuery = supabase
    .from("companies")
    .select(
      "id, company_name, legal_name, industry, subsector, customer_type, city, industrial_city, verification_status, dataset_status, regions ( name )",
    )
    .order("company_name", { ascending: true });
  if (orFilter) {
    listQuery = listQuery.or(orFilter);
  }
  if (locationFilter) {
    listQuery = listQuery.or(locationFilter);
  }
  for (const [column, value] of equals) {
    listQuery = listQuery.eq(column, value);
  }

  const [{ data, error }, facets] = await Promise.all([
    listQuery.range(from, to).abortSignal(AbortSignal.timeout(20000)),
    loadFacets(),
  ]);

  if (error) {
    throw new CompaniesReadError(error.message);
  }

  const rows: CompanyDirectoryRow[] = ((data ?? []) as unknown as CompanyQueryRow[]).map((row) => ({
    id: row.id,
    companyName: row.company_name,
    legalName: row.legal_name,
    industry: row.industry,
    subsector: row.subsector,
    customerType: row.customer_type,
    region: regionName(row.regions),
    city: row.city,
    industrialCity: row.industrial_city,
    verificationStatus: row.verification_status,
    datasetStatus: row.dataset_status,
  }));

  return {
    rows,
    total,
    page,
    pageSize: COMPANIES_PAGE_SIZE,
    pageCount: total === 0 ? 1 : pageCount,
    filters: { ...requested, page },
    facets,
  };
}
