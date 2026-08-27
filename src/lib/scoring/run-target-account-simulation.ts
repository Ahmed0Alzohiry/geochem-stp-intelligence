import { createSupabaseBrowserClient } from "../supabase/client";
import {
  scoreTargetAccount,
  type TargetAccountCompany,
  type TargetAccountTier,
} from "./target-account-score";

const PAGE = 1000;

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = (sorted.length - 1) * p;
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sorted[lo]!;
  return sorted[lo]! + (sorted[hi]! - sorted[lo]!) * (idx - lo);
}

async function fetchAllCompanies(): Promise<TargetAccountCompany[]> {
  const supabase = createSupabaseBrowserClient();
  const fields =
    "company_name, industry, subsector, customer_type, city, industrial_city, company_size, business_description, main_activities, verification_status, data_completeness_status, source_reliability, source_tier, record_type, dataset_status";

  const { count, error: countError } = await supabase.from("companies").select("id", { count: "exact", head: true });
  if (countError) throw new Error(countError.message);

  const total = count ?? 0;
  const rows: TargetAccountCompany[] = [];
  for (let from = 0; from < total; from += PAGE) {
    const to = Math.min(from + PAGE - 1, total - 1);
    const { data, error } = await supabase.from("companies").select(fields).range(from, to);
    if (error) throw new Error(error.message);
    rows.push(...((data ?? []) as TargetAccountCompany[]));
  }
  return rows;
}

async function main() {
  const rows = await fetchAllCompanies();
  const scored = rows.map(scoreTargetAccount);
  const totals = scored.map((row) => row.total_score).sort((a, b) => a - b);
  const sum = totals.reduce((acc, n) => acc + n, 0);
  const buckets: Record<string, number> = {};
  for (const total of totals) {
    const key = `${Math.floor(total / 5) * 5}-${Math.floor(total / 5) * 5 + 4}`;
    buckets[key] = (buckets[key] ?? 0) + 1;
  }

  const tierCount: Record<TargetAccountTier, number> = {
    "Tier 1": 0,
    "Tier 2": 0,
    "Tier 3": 0,
    Watchlist: 0,
  };
  for (const row of scored) tierCount[row.proposed_tier] += 1;

  const ranked = [...scored].sort((a, b) => b.total_score - a.total_score);
  const top20 = ranked.slice(0, 20);
  const bottom10 = ranked.slice(-10);

  const highLogistics = ranked.filter((row) => row.industry === "Logistics").slice(0, 5);
  const highHealthcare = ranked.filter((row) => row.industry === "Healthcare");
  const lowOilGas = ranked.filter((row) => row.industry === "Oil & Gas").slice(-5);
  const nullGeoHigh = ranked.filter((row) => !row.location && row.total_score >= 72).slice(0, 8);
  const verifiedWatchlist = ranked.filter(
    (row) => row.data_confidence_score >= 12 && row.proposed_tier === "Watchlist",
  ).slice(0, 8);
  const unverifiedTier1 = ranked.filter(
    (row) => row.data_confidence_score <= 2 && row.proposed_tier === "Tier 1",
  ).slice(0, 8);

  const report = {
    rowCount: rows.length,
    min: totals[0],
    max: totals[totals.length - 1],
    average: Math.round((sum / totals.length) * 100) / 100,
    median: percentile(totals, 0.5),
    p90: percentile(totals, 0.9),
    p95: percentile(totals, 0.95),
    p99: percentile(totals, 0.99),
    buckets,
    tierCount,
    top20,
    bottom10,
    highLogistics,
    highHealthcare,
    lowOilGas,
    nullGeoHigh,
    verifiedWatchlist,
    unverifiedTier1,
  };

  console.log(JSON.stringify(report, null, 2));
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
