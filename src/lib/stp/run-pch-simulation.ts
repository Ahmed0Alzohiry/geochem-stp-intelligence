/**
 * STEP 6.4 in-memory PCH simulation on live companies.
 * Does not persist scores, tiers, or source fields.
 */
import { PCH_TIER2_MIN_APPLICATION_FIT } from "./weights";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createSupabaseBrowserClient } from "../supabase/client";
import { scoreServiceAccount } from "./score";
import { collapseByAccountGroup } from "./account-group";
import { SERVICE_FIRST_MODEL_VERSION } from "./types";
import type { ServiceFirstInput, ServiceFirstScore } from "./types";

const PAGE = 1000;

type CompanyRow = {
  id: string;
  company_name: string | null;
  industry: string | null;
  subsector: string | null;
  customer_type: string | null;
  parent_company_name: string | null;
  is_existing_geochem_customer?: string | null;
  account_status: string | null;
  city: string | null;
};

type EntityRow = {
  company_id: string;
  entity_type: string;
  account_group_key: string;
};

type LocationRow = {
  company_id: string;
  city: string;
  confidence: string | null;
};

function loadEnvLocal() {
  const envPath = resolve(process.cwd(), ".env.local");
  const text = readFileSync(envPath, "utf8");
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim();
    if (!process.env[key]) process.env[key] = value;
  }
}

function text(value: string | null | undefined): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

async function fetchAll<T>(table: string, fields: string, idCol: string): Promise<T[]> {
  const supabase = createSupabaseBrowserClient();
  const { count, error: countError } = await supabase.from(table).select(idCol, { count: "exact", head: true });
  if (countError) throw new Error(`${table}: ${countError.message}`);
  const total = count ?? 0;
  const rows: T[] = [];
  for (let from = 0; from < total; from += PAGE) {
    const to = Math.min(from + PAGE - 1, total - 1);
    const { data, error } = await supabase.from(table).select(fields).range(from, to);
    if (error) throw new Error(`${table}: ${error.message}`);
    rows.push(...(((data ?? []) as unknown) as T[]));
  }
  return rows;
}

function dim(score: ServiceFirstScore, key: string) {
  const row = score.dimensions.find((item) => item.key === key);
  if (!row) return "—";
  return row.status === "UNKNOWN" ? "UNKNOWN" : String(row.rawScore);
}

async function main() {
  loadEnvLocal();
  const supabase = createSupabaseBrowserClient();
  const services = await fetchAll<{ id: string; name: string; service_code: string }>(
    "services",
    "id, name, service_code",
    "id",
  );
  const pch = services.find((row) => row.service_code === "PCH");
  if (!pch) throw new Error("PCH service not found in public.services");

  const probe = await supabase.from("companies").select("is_existing_geochem_customer").limit(1);
  const companySelect = probe.error
    ? "id, company_name, industry, subsector, customer_type, parent_company_name, account_status, city"
    : "id, company_name, industry, subsector, customer_type, parent_company_name, is_existing_geochem_customer, account_status, city";
  const companies = await fetchAll<CompanyRow>("companies", companySelect, "id");
  const entities = await fetchAll<EntityRow>(
    "company_entity_resolution",
    "company_id, entity_type, account_group_key",
    "company_id",
  );
  const locations = await fetchAll<LocationRow>("company_locations", "company_id, city, confidence", "id");
  const er = new Map(entities.map((row) => [row.company_id, row]));
  const locByCompany = new Map<string, string[]>();
  for (const row of locations) {
    if (row.confidence !== "HIGH") continue;
    locByCompany.set(row.company_id, [...(locByCompany.get(row.company_id) ?? []), row.city]);
  }

  const scored = companies.map((company) => {
    const meta = er.get(company.id);
    const input: ServiceFirstInput = {
      serviceId: pch.id,
      serviceCode: "PCH",
      serviceName: pch.name,
      companyId: company.id,
      companyName: text(company.company_name) ?? "(unnamed)",
      industry: text(company.industry),
      subsector: text(company.subsector),
      customerType: text(company.customer_type),
      entityType: (meta?.entity_type as ServiceFirstInput["entityType"]) ?? null,
      parentCompanyName: text(company.parent_company_name),
      isExistingGeochemCustomer: text(company.is_existing_geochem_customer),
      accountStatus: text(company.account_status),
      verifiedCities: locByCompany.get(company.id) ?? [],
      importedCity: text(company.city),
      companyServicesNeed: null,
      companyServicesFitRating: null,
    };
    const result = scoreServiceAccount(input);
    return { input, result, accountGroupKey: meta?.account_group_key ?? company.id };
  });

  const eligibleRows = scored.filter((row) => row.result.eligibility === "ELIGIBLE" && row.result.commercialScore != null);
  const outOfScope = scored.filter((row) => row.result.eligibility === "OUT_OF_SCOPE");
  const insufficient = scored.filter((row) => row.result.eligibility === "INSUFFICIENT_TO_ELIGIBLE");
  const relatedOnlyGroupsSkipped = (() => {
    const groups = new Map<string, typeof eligibleRows>();
    for (const row of eligibleRows) {
      groups.set(row.accountGroupKey, [...(groups.get(row.accountGroupKey) ?? []), row]);
    }
    let skipped = 0;
    for (const members of groups.values()) {
      const hasRep = members.some(
        (member) => member.input.entityType !== "RELATED" && member.input.entityType !== "REVIEW",
      );
      if (!hasRep) skipped += 1;
    }
    return skipped;
  })();
  const grouped = collapseByAccountGroup(eligibleRows);
  const ranked = [...grouped]
    .filter((row) => row.result.rankingEligible)
    .sort((a, b) => {
      const scoreDiff = (b.result.commercialScore ?? 0) - (a.result.commercialScore ?? 0);
      if (scoreDiff !== 0) return scoreDiff;
      return a.input.companyName.localeCompare(b.input.companyName);
    });

  const segments = new Map<string, number>();
  for (const row of grouped) {
    const key = `${row.input.industry ?? "Unknown"} | ${row.input.subsector ?? "Unknown subsector"}`;
    segments.set(key, (segments.get(key) ?? 0) + 1);
  }
  const segmentList = [...segments.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([name, count]) => ({ name, count }));

  const scores = ranked.map((row) => row.result.commercialScore as number);
  const bucket = (min: number, maxExclusive: number) => scores.filter((score) => score >= min && score < maxExclusive).length;

  const top20 = ranked.slice(0, 20).map((row, index) => ({
    rank: index + 1,
    company: row.input.companyName,
    accountGroupKey: row.accountGroupKey,
    groupSize: row.groupSize,
    industry: row.input.industry,
    subsector: row.input.subsector,
    location: row.input.verifiedCities.length > 0 ? row.input.verifiedCities.join(", ") : "UNKNOWN",
    commercialScore: row.result.commercialScore,
    dataConfidence: `${row.result.dataConfidenceBand} ${row.result.dataConfidenceScore}`,
    provisionalTier: row.result.tier,
    industryFit: dim(row.result, "industryFit"),
    applicationFit: dim(row.result, "subsectorFit"),
    serviceNeedFit: dim(row.result, "serviceNeedFit"),
    commercialPotential: dim(row.result, "commercialPotential"),
    geographicFit: dim(row.result, "geographicFit"),
    strategicFit: dim(row.result, "strategicAccountFit"),
    whyTarget: row.result.targetingReason,
    positioning: row.result.positioningStatement,
    contactRoles: row.result.recommendedContactRoles,
    entityType: row.input.entityType,
    knownWeightTotal: row.result.knownWeightTotal,
    rankingEligible: row.result.rankingEligible,
    tierGateFailed: row.result.tierGateFailed,
  }));

  const top20Groups = new Map<string, number>();
  for (const row of top20) top20Groups.set(row.accountGroupKey, (top20Groups.get(row.accountGroupKey) ?? 0) + 1);
  const duplicateGroups = [...top20Groups.entries()].filter(([, count]) => count > 1);

  const geoUnknownEligible = eligibleRows.filter((row) => dim(row.result, "geographicFit") === "UNKNOWN");
  const geoKnownEligible = eligibleRows.filter((row) => dim(row.result, "geographicFit") !== "UNKNOWN");
  const avg = (rows: typeof eligibleRows) =>
    rows.length === 0 ? null : Math.round((rows.reduce((sum, row) => sum + (row.result.commercialScore ?? 0), 0) / rows.length) * 10) / 10;

  const oilGas = scored.filter((row) => row.input.industry === "Oil & Gas");
  const healthcare = scored.filter((row) => (row.input.industry ?? "").toLowerCase().includes("health"));
  const logistics = scored.filter((row) => (row.input.industry ?? "").toLowerCase().includes("logistics"));
  const highScoreWeakApp = ranked.filter(
    (row) => (row.result.commercialScore ?? 0) >= 70 && dim(row.result, "subsectorFit") !== "UNKNOWN" && Number(dim(row.result, "subsectorFit")) <= 48,
  );

  const confidenceVsScore = {
    highConfAvg: avg(eligibleRows.filter((row) => row.result.dataConfidenceBand === "HIGH")),
    mediumConfAvg: avg(eligibleRows.filter((row) => row.result.dataConfidenceBand === "MEDIUM")),
    lowConfAvg: avg(eligibleRows.filter((row) => row.result.dataConfidenceBand === "LOW")),
  };

  const { count: companyCount } = await supabase.from("companies").select("id", { count: "exact", head: true });
  const { count: locationCount } = await supabase.from("company_locations").select("id", { count: "exact", head: true });
  const { count: scoreCount } = await supabase.from("company_scores").select("id", { count: "exact", head: true });

  const groupedTiers = {
    tier1: grouped.filter((row) => row.result.tier === "Tier 1").length,
    tier2: grouped.filter((row) => row.result.tier === "Tier 2").length,
    tier3: grouped.filter((row) => row.result.tier === "Tier 3").length,
    watchlist: grouped.filter((row) => row.result.tier === "Watchlist").length,
  };

  const relatedRepresentatives = grouped.filter((row) => row.input.entityType === "RELATED");
  const relatedInTop20 = top20.filter((row) => row.entityType === "RELATED");
  const allGroupKeys = grouped.map((row) => row.accountGroupKey);
  const duplicateAccountGroups = [...new Set(allGroupKeys.filter((key, index) => allGroupKeys.indexOf(key) !== index))];
  const parseApp = (value: string) => (value === "UNKNOWN" ? null : Number(value));
  const tier2WeakApp = grouped.filter((row) => {
    if (row.result.tier !== "Tier 2") return false;
    const app = parseApp(dim(row.result, "subsectorFit"));
    return app == null || app < PCH_TIER2_MIN_APPLICATION_FIT;
  });
  const tier1WeakApp = grouped.filter((row) => {
    if (row.result.tier !== "Tier 1") return false;
    const app = parseApp(dim(row.result, "subsectorFit"));
    return app == null || app < 90;
  });
  const insufficientFit = grouped.filter((row) => {
    const app = parseApp(dim(row.result, "subsectorFit"));
    return app == null || app < PCH_TIER2_MIN_APPLICATION_FIT;
  });
  const top20AppFits = top20.map((row) => ({
    rank: row.rank,
    company: row.company,
    entityType: row.entityType,
    applicationFit: row.applicationFit,
    provisionalTier: row.provisionalTier,
    commercialScore: row.commercialScore,
    industry: row.industry,
    subsector: row.subsector,
  }));

  console.log(
    JSON.stringify(
      {
        persisted: false,
        step: "6.4",
        modelVersion: SERVICE_FIRST_MODEL_VERSION,
        catalogServiceName: pch.name,
        catalogServiceCode: pch.service_code,
        before: {
          eligibleCompanies: 222,
          notEligible: 1545,
          unknownInsufficient: 2,
          scoreDistribution: { "0-39": 0, "40-54": 0, "55-69": 2, "70-84": 36, "85-100": 135 },
          tiers: { tier1: 22, tier2: 200, tier3: 0, watchlist: 0 },
          top20DuplicateGroups: 1,
          oilGasEligible: 0,
        },
        after: {
          eligibleCompanies: eligibleRows.length,
          eligibleAccountGroups: grouped.length,
          rankingEligibleGroups: ranked.length,
          notEligible: outOfScope.length,
          unknownInsufficient: insufficient.length,
          segments: { count: segmentList.length, top: segmentList.slice(0, 12) },
          scoreDistributionRankedGroups: {
            "0-39": bucket(0, 40),
            "40-54": bucket(40, 55),
            "55-69": bucket(55, 70),
            "70-84": bucket(70, 85),
            "85-100": bucket(85, 101),
          },
          groupedTiers,
          confidenceBands: {
            HIGH: eligibleRows.filter((row) => row.result.dataConfidenceBand === "HIGH").length,
            MEDIUM: eligibleRows.filter((row) => row.result.dataConfidenceBand === "MEDIUM").length,
            LOW: eligibleRows.filter((row) => row.result.dataConfidenceBand === "LOW").length,
          },
        },
        top20Names: top20.map((row) => `${row.rank}. ${row.company} (${row.industry} / ${row.subsector} / ${row.location} / ${row.commercialScore} / ${row.provisionalTier} / g${row.groupSize})`),
        companyCount,
        locationCount,
        companyScoresTableRows: scoreCount,
        sanity: {
          oilGasTotal: oilGas.length,
          oilGasEligible: oilGas.filter((row) => row.result.eligibility === "ELIGIBLE").length,
          healthcareEligible: healthcare.filter((row) => row.result.eligibility === "ELIGIBLE").length,
          logisticsEligible: logistics.filter((row) => row.result.eligibility === "ELIGIBLE").length,
          geoUnknownEligible: geoUnknownEligible.length,
          geoKnownEligible: geoKnownEligible.length,
          avgScoreGeoUnknown: avg(geoUnknownEligible),
          avgScoreGeoKnown: avg(geoKnownEligible),
          top20DuplicateGroups: duplicateGroups.map(([key, count]) => ({ accountGroupKey: key, count })),
          uniqueTop20Groups: top20Groups.size,
          highScoreWeakApplication: highScoreWeakApp.length,
          highScoreWeakApplicationExamples: highScoreWeakApp.slice(0, 8).map((row) => ({
            company: row.input.companyName,
            industry: row.input.industry,
            subsector: row.input.subsector,
            score: row.result.commercialScore,
            applicationFit: dim(row.result, "subsectorFit"),
            knownWeightTotal: row.result.knownWeightTotal,
          })),
          relatedOnlyGroupsSkipped,
          relatedRepresentatives: relatedRepresentatives.map((row) => row.input.companyName),
          relatedRepresentativesCount: relatedRepresentatives.length,
          relatedInTop20: relatedInTop20.map((row) => row.company),
          duplicateAccountGroups,
          duplicateAccountGroupsCount: duplicateAccountGroups.length,
          insufficientFitGroups: insufficientFit.length,
          tier2BelowApp70: tier2WeakApp.map((row) => ({
            company: row.input.companyName,
            applicationFit: dim(row.result, "subsectorFit"),
            tier: row.result.tier,
          })),
          tier1BelowApp90: tier1WeakApp.map((row) => ({
            company: row.input.companyName,
            applicationFit: dim(row.result, "subsectorFit"),
          })),
          top20ApplicationFit: top20AppFits,
          confidenceVsScore,
          tier1Names: grouped.filter((row) => row.result.tier === "Tier 1").map((row) => row.input.companyName),
          tier2Names: grouped.filter((row) => row.result.tier === "Tier 2").map((row) => ({
            company: row.input.companyName,
            industry: row.input.industry,
            subsector: row.input.subsector,
            applicationFit: dim(row.result, "subsectorFit"),
            entityType: row.input.entityType,
            commercialScore: row.result.commercialScore,
          })),
        },
      },
      null,
      2,
    ),
  );
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
