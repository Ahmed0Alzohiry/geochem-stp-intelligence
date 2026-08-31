"use client";

import { useMemo, useState } from "react";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Table, THead, Th, Td } from "@/components/ui/Table";
import { TierBadge } from "@/components/ui/Badge";
import type { CoverageRow, DiscoveryRow, DiscoverySummary } from "@/lib/stp/full-database-targeting";

function scoreLabel(value: number | null | undefined): string {
  return value == null ? "UNKNOWN" : String(value);
}

type LoadResponse = {
  summary: DiscoverySummary | null;
  persistedCurrentCount: number;
  evaluationStatus: "not_run" | "completed";
  rows: DiscoveryRow[];
  rowCount: number;
  page: number;
  pageSize: number;
  storeWarning?: string | null;
  error?: string;
};

export function FullDatabaseTargetingPanel({
  serviceCode,
  persistedCount,
  coverage,
}: {
  serviceCode: string;
  persistedCount: number;
  coverage: { totalCompanies: number; rows: CoverageRow[] } | null;
}) {
  const [busy, setBusy] = useState<"run" | "promote" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [summary, setSummary] = useState<DiscoverySummary | null>(null);
  const [rows, setRows] = useState<DiscoveryRow[]>([]);
  const [rowCount, setRowCount] = useState(0);
  const [page, setPage] = useState(1);
  const [evaluationStatus, setEvaluationStatus] = useState<"not_run" | "completed">("not_run");
  const [storeWarning, setStoreWarning] = useState<string | null>(null);
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [filters, setFilters] = useState({
    search: "",
    tier: "",
    industry: "",
    subsector: "",
    city: "",
    customerType: "",
    eligibility: "",
    confidence: "",
    missing: "",
    provenance: "",
  });

  const coverageRow = coverage?.rows.find((row) => row.serviceCode === serviceCode);
  const totalCompanies = coverage?.totalCompanies ?? coverageRow?.totalDb ?? 0;
  const status = summary ? "completed" : coverageRow?.evaluationStatus ?? evaluationStatus;

  async function loadPage(nextPage: number, nextFilters = filters) {
    const query = new URLSearchParams({ service: serviceCode, page: String(nextPage), pageSize: "50" });
    for (const [key, value] of Object.entries(nextFilters)) {
      if (value) query.set(key, value);
    }
    const response = await fetch(`/api/targeting/full-database?${query.toString()}`, { cache: "no-store" });
    const body = (await response.json()) as LoadResponse;
    if (!response.ok) throw new Error(body.error || "Unable to load discovery");
    setSummary(body.summary);
    setRows(body.rows ?? []);
    setRowCount(body.rowCount ?? 0);
    setPage(body.page ?? nextPage);
    setEvaluationStatus(body.evaluationStatus);
    setStoreWarning(body.storeWarning ?? null);
  }

  async function run() {
    setBusy("run");
    setError(null);
    setMessage(null);
    try {
      const response = await fetch("/api/targeting/full-database", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ service: serviceCode }),
      });
      const body = (await response.json()) as LoadResponse & { summary: DiscoverySummary };
      if (!response.ok) throw new Error(body.error || "Run failed");
      setSummary(body.summary);
      setRows(body.rows ?? []);
      setRowCount(body.rowCount ?? 0);
      setPage(1);
      setEvaluationStatus("completed");
      setStoreWarning(body.storeWarning ?? null);
      setSelected({});
      setMessage(
        `Evaluated ${body.summary?.evaluated ?? 0} companies for ${serviceCode}. Persisted current targets remain ${body.persistedCurrentCount}.`,
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Run failed");
    } finally {
      setBusy(null);
    }
  }

  async function promote(allEligible: boolean) {
    setBusy("promote");
    setError(null);
    setMessage(null);
    try {
      const companyIds = Object.entries(selected)
        .filter(([, on]) => on)
        .map(([id]) => id);
      if (!allEligible && companyIds.length === 0) throw new Error("Select at least one discovery row.");
      const response = await fetch("/api/targeting/promote", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ service: serviceCode, companyIds, allEligible }),
      });
      const body = (await response.json()) as {
        inserted?: number;
        skippedPersistedCompany?: number;
        skippedPersistedGroup?: number;
        skippedNotEligible?: number;
        errors?: string[];
        error?: string;
      };
      if (!response.ok) throw new Error(body.error || "Promote failed");
      setMessage(
        `Promoted ${body.inserted ?? 0} new current targets. Skipped existing company ${body.skippedPersistedCompany ?? 0}, existing group ${body.skippedPersistedGroup ?? 0}, ineligible ${body.skippedNotEligible ?? 0}. Existing Wave-1 rows were not updated.`,
      );
      if (body.errors?.length) setError(body.errors.join(" | "));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Promote failed");
    } finally {
      setBusy(null);
    }
  }

  const missingOptions = useMemo(() => {
    const set = new Set<string>();
    for (const row of rows) for (const item of row.missingIntelligence) set.add(item);
    return [...set].sort();
  }, [rows]);

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader
          title="Full database targeting"
          description="Evaluates every master company with the existing 6.4.0 engine. Does not replace current production targeting."
        />
        <CardBody className="space-y-4">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div className="text-sm">
              <p className="font-semibold text-navy-900">{serviceCode} coverage</p>
              <p className="text-steel-600">
                {persistedCount} persisted targets · {totalCompanies || "—"} master companies · Full database evaluation:{" "}
                {status === "completed" ? "Completed" : "Not run"}
              </p>
            </div>
            <button
              type="button"
              onClick={() => void run()}
              disabled={busy !== null}
              className="h-10 rounded-md bg-teal-800 px-4 text-sm font-medium text-white disabled:opacity-60"
            >
              {busy === "run" ? "Running full database targeting…" : "Run Full Database Targeting"}
            </button>
          </div>
          {error ? <p className="text-sm text-danger-700">{error}</p> : null}
          {message ? <p className="text-sm text-steel-700">{message}</p> : null}
          {storeWarning ? (
            <p className="text-sm text-steel-600">
              Discovery table not stored ({storeWarning}). Apply migration 016_stp_full_database_discovery.sql to keep
              runs. Results below are still from this evaluation.
            </p>
          ) : null}
        </CardBody>
      </Card>

      {coverage ? (
        <Card>
          <CardHeader title="Service coverage" description="Latest stored full-database run vs persisted current STP." />
          <CardBody className="overflow-x-auto">
            <Table>
              <THead>
                <Th>Service</Th>
                <Th>Total DB</Th>
                <Th>Evaluated</Th>
                <Th>Eligible</Th>
                <Th>Ranked</Th>
                <Th>Tier 1</Th>
                <Th>Tier 2</Th>
                <Th>Tier 3</Th>
                <Th>Persisted</Th>
                <Th>Status</Th>
              </THead>
              <tbody>
                {coverage.rows.map((row) => (
                  <tr key={row.serviceCode} className="border-b border-steel-100 last:border-0">
                    <Td className="font-medium">{row.serviceCode}</Td>
                    <Td>{row.totalDb}</Td>
                    <Td>{row.evaluated ?? "—"}</Td>
                    <Td>{row.eligible ?? "—"}</Td>
                    <Td>{row.rankingEligible ?? "—"}</Td>
                    <Td>{row.tier1 ?? "—"}</Td>
                    <Td>{row.tier2 ?? "—"}</Td>
                    <Td>{row.tier3 ?? "—"}</Td>
                    <Td>{row.persisted}</Td>
                    <Td>{row.evaluationStatus === "completed" ? "Completed" : "Not run"}</Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </CardBody>
        </Card>
      ) : null}

      {summary ? (
        <Card>
          <CardHeader title={`${serviceCode} full-database summary`} description="Counts from this evaluation of the master company table." />
          <CardBody className="grid gap-3 text-sm sm:grid-cols-3 lg:grid-cols-5">
            <div>
              <p className="text-xs text-steel-500">Total companies</p>
              <p className="font-semibold">{summary.totalCompanies}</p>
            </div>
            <div>
              <p className="text-xs text-steel-500">Evaluated</p>
              <p className="font-semibold">{summary.evaluated}</p>
            </div>
            <div>
              <p className="text-xs text-steel-500">Eligible</p>
              <p className="font-semibold">{summary.eligible}</p>
            </div>
            <div>
              <p className="text-xs text-steel-500">Ineligible</p>
              <p className="font-semibold">{summary.ineligible}</p>
            </div>
            <div>
              <p className="text-xs text-steel-500">Ranking eligible</p>
              <p className="font-semibold">{summary.rankingEligible}</p>
            </div>
            <div>
              <p className="text-xs text-steel-500">Insufficient data</p>
              <p className="font-semibold">{summary.insufficient}</p>
            </div>
            <div>
              <p className="text-xs text-steel-500">Tier 1</p>
              <p className="font-semibold">{summary.tier1}</p>
            </div>
            <div>
              <p className="text-xs text-steel-500">Tier 2</p>
              <p className="font-semibold">{summary.tier2}</p>
            </div>
            <div>
              <p className="text-xs text-steel-500">Tier 3</p>
              <p className="font-semibold">{summary.tier3}</p>
            </div>
            <div>
              <p className="text-xs text-steel-500">UNKNOWN / unclassified</p>
              <p className="font-semibold">{summary.unclassified}</p>
            </div>
          </CardBody>
        </Card>
      ) : null}

      {summary ? (
        <Card>
          <CardHeader title="Discovery results" description="DISCOVERY RESULT is not current targeting. PERSISTED TARGET is already in company_service_stp_current." />
          <CardBody className="space-y-3">
            <div className="grid gap-2 sm:grid-cols-3 lg:grid-cols-5">
              {(
                [
                  ["search", "Search company"],
                  ["tier", "Tier"],
                  ["industry", "Industry"],
                  ["subsector", "Subsector"],
                  ["city", "City"],
                  ["customerType", "Customer type"],
                  ["eligibility", "Eligibility"],
                  ["confidence", "Data confidence"],
                  ["missing", "Missing intelligence"],
                  ["provenance", "Source"],
                ] as const
              ).map(([key, label]) => (
                <label key={key} className="text-xs text-steel-600">
                  {label}
                  {key === "search" || key === "industry" || key === "subsector" || key === "city" || key === "customerType" ? (
                    <input
                      className="mt-1 h-9 w-full rounded-md border border-steel-200 px-2 text-sm"
                      value={filters[key]}
                      onChange={(event) => setFilters((current) => ({ ...current, [key]: event.target.value }))}
                    />
                  ) : (
                    <select
                      className="mt-1 h-9 w-full rounded-md border border-steel-200 px-2 text-sm"
                      value={filters[key]}
                      onChange={(event) => setFilters((current) => ({ ...current, [key]: event.target.value }))}
                    >
                      <option value="">All</option>
                      {key === "tier"
                        ? ["Tier 1", "Tier 2", "Tier 3", "Watchlist"].map((item) => (
                            <option key={item} value={item}>
                              {item}
                            </option>
                          ))
                        : null}
                      {key === "eligibility"
                        ? ["ELIGIBLE", "OUT_OF_SCOPE", "INSUFFICIENT_TO_ELIGIBLE"].map((item) => (
                            <option key={item} value={item}>
                              {item}
                            </option>
                          ))
                        : null}
                      {key === "confidence"
                        ? ["HIGH", "MEDIUM", "LOW"].map((item) => (
                            <option key={item} value={item}>
                              {item}
                            </option>
                          ))
                        : null}
                      {key === "missing"
                        ? missingOptions.map((item) => (
                            <option key={item} value={item}>
                              {item}
                            </option>
                          ))
                        : null}
                      {key === "provenance" ? (
                        <>
                          <option value="DISCOVERY_RESULT">Discovery result</option>
                          <option value="PERSISTED_TARGET">Persisted target</option>
                        </>
                      ) : null}
                    </select>
                  )}
                </label>
              ))}
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                className="h-9 rounded-md border border-steel-200 px-3 text-sm"
                onClick={() => void loadPage(1)}
              >
                Apply filters
              </button>
              <button
                type="button"
                className="h-9 rounded-md border border-steel-200 px-3 text-sm"
                disabled={busy !== null}
                onClick={() => void promote(false)}
              >
                Save selected targets
              </button>
              <button
                type="button"
                className="h-9 rounded-md border border-steel-200 px-3 text-sm"
                disabled={busy !== null}
                onClick={() => void promote(true)}
              >
                Save all eligible
              </button>
            </div>
            <div className="overflow-x-auto">
              <Table>
                <THead>
                  <Th> </Th>
                  <Th>Rank</Th>
                  <Th>Account</Th>
                  <Th>Source</Th>
                  <Th>Eligibility</Th>
                  <Th>Tier</Th>
                  <Th>Score</Th>
                  <Th>Industry</Th>
                  <Th>Application</Th>
                  <Th>Need</Th>
                  <Th>Potential</Th>
                  <Th>Customer</Th>
                  <Th>Geo</Th>
                  <Th>Strategic</Th>
                  <Th>Known %</Th>
                  <Th>Confidence</Th>
                  <Th>Missing</Th>
                </THead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={row.companyId} className="border-b border-steel-100 align-top last:border-0">
                      <Td>
                        <input
                          type="checkbox"
                          checked={Boolean(selected[row.companyId])}
                          onChange={(event) =>
                            setSelected((current) => ({ ...current, [row.companyId]: event.target.checked }))
                          }
                          disabled={row.provenance === "PERSISTED_TARGET" || row.eligibility !== "ELIGIBLE"}
                        />
                      </Td>
                      <Td>{row.rank ?? "—"}</Td>
                      <Td className="min-w-48 whitespace-normal">
                        <p className="font-medium">{row.companyName}</p>
                        <p className="text-xs text-steel-500">{row.entityType ?? "Unspecified"}</p>
                        <p className="text-xs text-steel-500" title={row.eligibilityReason}>
                          {row.eligibilityReason}
                        </p>
                        {row.tierReason ? <p className="text-xs text-steel-500">{row.tierReason}</p> : null}
                        <p className="text-xs text-steel-500">{row.rankingReason}</p>
                      </Td>
                      <Td className="text-xs">{row.provenance === "PERSISTED_TARGET" ? "Persisted target" : "Discovery result"}</Td>
                      <Td className="text-xs">{row.eligibility}</Td>
                      <Td>{row.tier ? <TierBadge tier={row.tier} /> : "—"}</Td>
                      <Td>{scoreLabel(row.commercialScore)}</Td>
                      <Td>{scoreLabel(row.industryFit)}</Td>
                      <Td>{scoreLabel(row.applicationFit)}</Td>
                      <Td>{scoreLabel(row.serviceNeedFit)}</Td>
                      <Td>{scoreLabel(row.commercialPotential)}</Td>
                      <Td>{scoreLabel(row.customerTypeFit)}</Td>
                      <Td>{scoreLabel(row.geographicFit)}</Td>
                      <Td>{scoreLabel(row.strategicFit)}</Td>
                      <Td>{row.knownWeightTotal}</Td>
                      <Td className="text-xs">
                        {row.dataConfidenceBand} {row.dataConfidenceScore}
                      </Td>
                      <Td className="min-w-40 whitespace-normal text-xs">{row.missingIntelligence.join("; ") || "—"}</Td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            </div>
            <div className="flex items-center justify-between text-sm">
              <p className="text-steel-500">
                {rowCount} filtered rows · page {page}
              </p>
              <div className="flex gap-2">
                {page > 1 ? (
                  <button type="button" className="text-teal-700" onClick={() => void loadPage(page - 1)}>
                    Previous
                  </button>
                ) : null}
                {page * 50 < rowCount ? (
                  <button type="button" className="text-teal-700" onClick={() => void loadPage(page + 1)}>
                    Next
                  </button>
                ) : null}
              </div>
            </div>
          </CardBody>
        </Card>
      ) : null}
    </div>
  );
}
