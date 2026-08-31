import { NextResponse } from "next/server";
import { loadLatestDiscovery, loadServiceCoverage, runFullDatabaseTargeting } from "@/lib/stp/run-full-database-targeting";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

function first(value: string | string[] | undefined): string {
  if (Array.isArray(value)) return value[0] ?? "";
  return value ?? "";
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    if (url.searchParams.get("coverage") === "1") {
      const coverage = await loadServiceCoverage();
      return NextResponse.json(coverage);
    }
    const service = first(url.searchParams.get("service") ?? undefined) || "OCM";
    const loaded = await loadLatestDiscovery(service, {
      search: first(url.searchParams.get("search") ?? undefined),
      tier: first(url.searchParams.get("tier") ?? undefined),
      industry: first(url.searchParams.get("industry") ?? undefined),
      subsector: first(url.searchParams.get("subsector") ?? undefined),
      city: first(url.searchParams.get("city") ?? undefined),
      customerType: first(url.searchParams.get("customerType") ?? undefined),
      eligibility: first(url.searchParams.get("eligibility") ?? undefined),
      confidence: first(url.searchParams.get("confidence") ?? undefined),
      missing: first(url.searchParams.get("missing") ?? undefined),
      provenance: first(url.searchParams.get("provenance") ?? undefined),
    });
    const page = Math.max(1, Number(first(url.searchParams.get("page") ?? undefined) || "1"));
    const pageSize = Math.min(100, Math.max(25, Number(first(url.searchParams.get("pageSize") ?? undefined) || "50")));
    const start = (page - 1) * pageSize;
    const rankedFirst = [...loaded.rows].sort((a, b) => {
      if (a.rank != null && b.rank != null) return a.rank - b.rank;
      if (a.rank != null) return -1;
      if (b.rank != null) return 1;
      return a.companyName.localeCompare(b.companyName);
    });
    return NextResponse.json({
      ...loaded,
      rows: rankedFirst.slice(start, start + pageSize),
      page,
      pageSize,
      rowCount: loaded.rows.length,
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to load discovery" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { service?: string };
    const service = (body.service ?? "OCM").toUpperCase();
    const result = await runFullDatabaseTargeting(service);
    const rankedFirst = [...result.rows].sort((a, b) => {
      if (a.rank != null && b.rank != null) return a.rank - b.rank;
      if (a.rank != null) return -1;
      if (b.rank != null) return 1;
      return a.companyName.localeCompare(b.companyName);
    });
    return NextResponse.json({
      ...result,
      rows: rankedFirst.slice(0, 50),
      page: 1,
      pageSize: 50,
      rowCount: result.rows.length,
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to run full-database targeting" }, { status: 500 });
  }
}
