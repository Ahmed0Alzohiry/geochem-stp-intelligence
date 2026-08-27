"use client";

import { ChevronLeft, ChevronRight, Plus } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { SearchInput, Select } from "@/components/ui/FormControls";
import { Table, THead, Th, Td } from "@/components/ui/Table";
import type { CompanyDirectoryResult } from "@/lib/supabase/companies";

function dash(value: string | null | undefined) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : "—";
}

function locationLabel(region: string | null, city: string | null, industrialCity: string | null) {
  const parts = [region, city, industrialCity].map((part) => part?.trim()).filter(Boolean);
  return parts.length > 0 ? [...new Set(parts)].join(" · ") : "—";
}

function industryLabel(industry: string | null, subsector: string | null) {
  const main = industry?.trim();
  const sub = subsector?.trim();
  if (main && sub && main !== sub) {
    return { primary: main, secondary: sub };
  }
  return { primary: dash(main ?? sub), secondary: null };
}

function verificationVariant(status: string | null) {
  if (status === "Verified") {
    return "success" as const;
  }
  if (status === "Partially Verified") {
    return "teal" as const;
  }
  return "default" as const;
}

function buildQuery(params: Record<string, string>) {
  const search = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value) {
      search.set(key, value);
    }
  });
  const qs = search.toString();
  return qs ? `?${qs}` : "";
}

function FilterField({
  label,
  value,
  allLabel,
  options,
  onChange,
}: {
  label: string;
  value: string;
  allLabel: string;
  options: string[];
  onChange: (value: string) => void;
}) {
  return (
    <label className="block min-w-0">
      <span className="mb-1.5 block text-xs font-semibold text-steel-500">{label}</span>
      <Select
        className="w-full"
        value={value}
        onChange={onChange}
        options={[{ label: allLabel, value: "" }, ...options.map((item) => ({ label: item, value: item }))]}
      />
    </label>
  );
}

export function CompanyDirectory({ result }: { result: CompanyDirectoryResult }) {
  const router = useRouter();
  const pathname = usePathname();
  const [isPending, startTransition] = useTransition();
  const [notice, setNotice] = useState<string | null>(null);
  const [query, setQuery] = useState(result.filters.q);

  useEffect(() => {
    setQuery(result.filters.q);
  }, [result.filters.q]);

  useEffect(() => {
    const handle = window.setTimeout(() => {
      if (query.trim() === result.filters.q) {
        return;
      }
      navigate({ q: query.trim(), page: "" });
    }, 300);
    return () => window.clearTimeout(handle);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- debounce against local query only
  }, [query]);

  function navigate(updates: Record<string, string>) {
    const next = {
      q: result.filters.q,
      industry: result.filters.industry,
      subsector: result.filters.subsector,
      customer_type: result.filters.customerType,
      location: result.filters.location,
      verification_status: result.filters.verificationStatus,
      dataset_status: result.filters.datasetStatus,
      page: result.filters.page > 1 ? String(result.filters.page) : "",
      ...updates,
    };
    startTransition(() => {
      router.push(`${pathname}${buildQuery(next)}`);
    });
  }

  const from = result.total === 0 ? 0 : (result.page - 1) * result.pageSize + 1;
  const to = Math.min(result.page * result.pageSize, result.total);
  const summary = `Showing ${from}–${to} of ${result.total.toLocaleString()} companies`;

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end">
        <label className="block w-full lg:max-w-sm">
          <span className="mb-1.5 block text-xs font-semibold text-steel-500">Search</span>
          <SearchInput
            value={query}
            onChange={setQuery}
            placeholder="Company, legal name, or alias"
          />
        </label>
        <Button
          className="lg:ml-auto"
          onClick={() =>
            setNotice("Company capture will connect to Supabase in a later phase.")
          }
        >
          <Plus className="h-4 w-4" />
          Add Company
        </Button>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
        <FilterField
          label="Industry"
          allLabel="All Industries"
          value={result.filters.industry}
          options={result.facets.industries}
          onChange={(value) => navigate({ industry: value, page: "" })}
        />
        <FilterField
          label="Subsector"
          allLabel="All Subsectors"
          value={result.filters.subsector}
          options={result.facets.subsectors}
          onChange={(value) => navigate({ subsector: value, page: "" })}
        />
        <FilterField
          label="Customer Type"
          allLabel="All Customer Types"
          value={result.filters.customerType}
          options={result.facets.customerTypes}
          onChange={(value) => navigate({ customer_type: value, page: "" })}
        />
        <FilterField
          label="City / Industrial City"
          allLabel="All Locations"
          value={result.filters.location}
          options={result.facets.locations}
          onChange={(value) => navigate({ location: value, page: "" })}
        />
        <FilterField
          label="Verification Status"
          allLabel="All Verification Statuses"
          value={result.filters.verificationStatus}
          options={result.facets.verificationStatuses}
          onChange={(value) => navigate({ verification_status: value, page: "" })}
        />
        <FilterField
          label="Dataset Status"
          allLabel="All Dataset Statuses"
          value={result.filters.datasetStatus}
          options={result.facets.datasetStatuses}
          onChange={(value) => navigate({ dataset_status: value, page: "" })}
        />
      </div>

      {notice ? (
        <p className="rounded-md border border-brass-50 bg-brass-50 px-3 py-2 text-sm text-warning-700">
          {notice}
        </p>
      ) : null}

      <p className="text-sm font-medium text-navy-900">{summary}</p>

      <Card className={isPending ? "opacity-70" : undefined}>
        <Table>
          <THead>
            <Th>Company Name</Th>
            <Th>Industry / Subsector</Th>
            <Th>Customer Type</Th>
            <Th>Location</Th>
            <Th>Verification Status</Th>
          </THead>
          <tbody>
            {result.rows.map((company) => {
              const industry = industryLabel(company.industry, company.subsector);
              return (
                <tr key={company.id} className="border-b border-steel-100 last:border-0 hover:bg-steel-50">
                  <Td className="whitespace-normal">
                    <div className="font-medium">{company.companyName}</div>
                    {company.legalName?.trim() && company.legalName.trim() !== company.companyName ? (
                      <div className="mt-0.5 max-w-xs text-xs text-steel-500">{company.legalName}</div>
                    ) : null}
                  </Td>
                  <Td className="whitespace-normal">
                    <div>{industry.primary}</div>
                    {industry.secondary ? (
                      <div className="mt-0.5 text-xs text-steel-500">{industry.secondary}</div>
                    ) : null}
                  </Td>
                  <Td>{dash(company.customerType)}</Td>
                  <Td className="whitespace-normal">
                    {locationLabel(company.region, company.city, company.industrialCity)}
                  </Td>
                  <Td>
                    {company.verificationStatus ? (
                      <Badge variant={verificationVariant(company.verificationStatus)}>
                        {company.verificationStatus}
                      </Badge>
                    ) : (
                      "—"
                    )}
                  </Td>
                </tr>
              );
            })}
          </tbody>
        </Table>
        {result.total === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-steel-500">
            No companies match the current filters.
          </p>
        ) : (
          <div className="flex flex-col gap-3 border-t border-steel-100 px-4 py-3 sm:flex-row sm:items-center sm:justify-end">
            <div className="flex items-center gap-2">
              <Button
                variant="secondary"
                disabled={result.page <= 1 || isPending}
                onClick={() => navigate({ page: String(result.page - 1) })}
              >
                <ChevronLeft className="h-4 w-4" />
                Previous
              </Button>
              <span className="px-2 text-xs text-steel-500">
                Page {result.page} of {result.pageCount}
              </span>
              <Button
                variant="secondary"
                disabled={result.page >= result.pageCount || isPending}
                onClick={() => navigate({ page: String(result.page + 1) })}
              >
                Next
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}
