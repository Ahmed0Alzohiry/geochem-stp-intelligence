/**
 * STEP 5.15 Target Account Score (0–100) — design model.
 * Field-based commercial ranking for GEOCHEM. Not the 1–5 analyst engine.
 * Do not persist results unless a later step explicitly asks.
 */

export type TargetAccountTier = "Tier 1" | "Tier 2" | "Tier 3" | "Watchlist";

export type TargetAccountCompany = {
  company_name: string | null;
  industry: string | null;
  subsector: string | null;
  customer_type: string | null;
  city: string | null;
  industrial_city: string | null;
  company_size: string | null;
  business_description: string | null;
  main_activities: string | null;
  verification_status: string | null;
  data_completeness_status: string | null;
  source_reliability: string | null;
  source_tier: string | null;
  record_type: string | null;
  dataset_status: string | null;
};

export type TargetAccountBreakdown = {
  company_name: string;
  industry: string | null;
  subsector: string | null;
  location: string | null;
  total_score: number;
  industry_score: number;
  service_fit_score: number;
  geography_score: number;
  account_potential_score: number;
  data_confidence_score: number;
  proposed_tier: TargetAccountTier;
  short_reason: string;
};

export const TARGET_ACCOUNT_WEIGHTS = {
  industry: 30,
  serviceFit: 25,
  geography: 15,
  accountPotential: 15,
  dataConfidence: 15,
} as const;

/** Percentile-informed after full 1,769 simulation (v1). */
export const TARGET_ACCOUNT_TIER_THRESHOLDS = {
  tier1Min: 70,
  tier2Min: 55,
  tier3Min: 42,
} as const;

const INDUSTRY_POINTS: Record<string, number> = {
  "Oil & Gas": 30,
  Petrochemicals: 30,
  Refining: 30,
  Chemicals: 26,
  "Mining & Minerals": 26,
  "Water & Wastewater": 26,
  "Power & Utilities": 20,
  "Industrial Manufacturing": 16,
  "Industrial Services": 16,
  "EPC / Projects": 12,
  "Marine / Ports": 12,
  Logistics: 8,
  Healthcare: 4,
};

const SERVICE_FLOOR: Record<string, number> = {
  "Oil & Gas": 25,
  Petrochemicals: 25,
  Refining: 25,
  Chemicals: 18,
  "Mining & Minerals": 18,
  "Water & Wastewater": 20,
  "Power & Utilities": 14,
  "Industrial Manufacturing": 12,
  "Industrial Services": 12,
  "EPC / Projects": 10,
  "Marine / Ports": 10,
  Logistics: 6,
  Healthcare: 4,
};

const CORE_SUBSECTOR =
  /refin|petrochem|oilfield|drilling|gas process|lubricant|base oil|desal|wastewater|water treatment|cement|industrial mineral|environmental|industrial gas|specialty chemical|phosphate|urea|ammonia|polymer|ethylene|polyethylene|crude|upstream|midstream|downstream|reservoir|wellsite|geophysic|seismic|catalyst|smelt|aluminium|aluminum|copper mine|gold mine|industrial water|power & desal|gas processing|testing inspection|ndt|pipe coating|\bore\b/i;

const STRONG_SUBSECTOR =
  /steel|power generation|industrial city util|coatings|paint|fertilizer|mining|chemical|waste management|industrial maintenance|fuel distribution|water & wastewater|concrete|precast/i;

const MODERATE_SUBSECTOR =
  /food manufactur|pharmaceutical|pump|cable|automotive|industrial construction|power epc|industrial epc|heavy fabrication|electrical equipment|healthcare \/ process/i;

const WEAK_CHANNEL_SUBSECTOR =
  /freight|forwarding|container shipping|logistics|trading|retail|hospital|clinic|healthcare/i;

function text(value: string | null | undefined): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function combinedLocation(city: string | null, industrialCity: string | null): string | null {
  const parts = [text(city), text(industrialCity)];
  const filled = parts.filter((part): part is string => Boolean(part));
  return filled.length > 0 ? filled.join(" / ") : null;
}

export function scoreIndustry(industry: string | null): number {
  const key = text(industry);
  if (!key) return 0;
  return INDUSTRY_POINTS[key] ?? 0;
}

export function scoreServiceFit(industry: string | null, subsector: string | null): number {
  const industryKey = text(industry);
  const floor = industryKey ? (SERVICE_FLOOR[industryKey] ?? 0) : 0;
  const sub = text(subsector);
  if (!sub) return floor;

  if (CORE_SUBSECTOR.test(sub)) return 25;
  if (STRONG_SUBSECTOR.test(sub)) return Math.max(floor, 20);
  if (MODERATE_SUBSECTOR.test(sub)) return Math.max(floor, 16);
  const coreIndustry = Boolean(
    industryKey && ["Oil & Gas", "Petrochemicals", "Refining", "Chemicals", "Mining & Minerals", "Water & Wastewater"].includes(industryKey),
  );
  if (WEAK_CHANNEL_SUBSECTOR.test(sub) && !coreIndustry) return Math.min(floor, 8);
  return floor;
}

export function scoreGeography(city: string | null, industrialCity: string | null): number {
  const location = combinedLocation(city, industrialCity);
  if (!location) return 0;
  const hay = location.toLowerCase();
  if (hay.includes("yanbu") || hay.includes("jeddah") || hay.includes("rabigh")) return 15;
  if (hay.includes("jabal sayid")) return 12;
  if (
    hay.includes("jubail") ||
    hay.includes("dammam") ||
    hay.includes("khobar") ||
    hay.includes("ras al khair") ||
    hay.includes("dhahran") ||
    hay.includes("king abdulaziz port")
  ) {
    return 10;
  }
  if (hay.includes("riyadh") || hay.includes("alfanar")) return 5;
  return 4;
}

export function scoreAccountPotential(
  customerType: string | null,
  recordType: string | null,
  companySize: string | null,
): number {
  // company_size is 100% empty on this dataset; do not infer size.
  void companySize;

  const type = text(customerType);
  const typePoints =
    type === "Asset Owner"
      ? 12
      : type === "Operator"
        ? 11
        : type === "Manufacturer"
          ? 10
          : type === "Government Entity"
            ? 9
            : type === "EPC Contractor"
              ? 7
              : type === "Technical Partner"
                ? 6
                : type === "Prospect Segment"
                  ? 3
                  : type === "Prospect"
                    ? 2
                    : type === "Trader"
                      ? 1
                      : 0;

  const record = text(recordType);
  const recordPoints = record === "Facility/Operations" ? 3 : record === "Company" ? 1 : 0;
  return Math.min(15, typePoints + recordPoints);
}

export function scoreDataConfidence(input: {
  verification_status: string | null;
  data_completeness_status: string | null;
  source_reliability: string | null;
  source_tier: string | null;
}): number {
  const verification = text(input.verification_status);
  const verificationPoints =
    verification === "Verified" ? 6 : verification === "Partially Verified" ? 3 : 0;

  const completeness = text(input.data_completeness_status);
  const completenessPoints =
    completeness === "Verified_Core" ? 4 : completeness === "Incomplete" ? 2 : 0;

  const reliability = text(input.source_reliability);
  const reliabilityPoints = reliability === "High" ? 3 : reliability === "Medium" ? 2 : 0;

  const tier = text(input.source_tier);
  const tierPoints = tier === "A" ? 2 : tier === "B" ? 1 : 0;

  return Math.min(15, verificationPoints + completenessPoints + reliabilityPoints + tierPoints);
}

export function classifyTargetAccountTier(total: number): TargetAccountTier {
  if (total >= TARGET_ACCOUNT_TIER_THRESHOLDS.tier1Min) return "Tier 1";
  if (total >= TARGET_ACCOUNT_TIER_THRESHOLDS.tier2Min) return "Tier 2";
  if (total >= TARGET_ACCOUNT_TIER_THRESHOLDS.tier3Min) return "Tier 3";
  return "Watchlist";
}

function shortReason(row: TargetAccountBreakdown): string {
  const bits: string[] = [];
  bits.push(row.industry ?? "No industry");
  if (row.subsector) bits.push(row.subsector);
  if (row.location) bits.push(row.location);
  else bits.push("location unknown");
  bits.push(`I${row.industry_score}/S${row.service_fit_score}/G${row.geography_score}/P${row.account_potential_score}/C${row.data_confidence_score}`);
  return bits.join(" · ");
}

export function scoreTargetAccount(row: TargetAccountCompany): TargetAccountBreakdown {
  const industry_score = scoreIndustry(row.industry);
  const service_fit_score = scoreServiceFit(row.industry, row.subsector);
  const geography_score = scoreGeography(row.city, row.industrial_city);
  const account_potential_score = scoreAccountPotential(
    row.customer_type,
    row.record_type,
    row.company_size,
  );
  const data_confidence_score = scoreDataConfidence(row);
  const total_score =
    industry_score + service_fit_score + geography_score + account_potential_score + data_confidence_score;
  const location = combinedLocation(row.city, row.industrial_city);
  const breakdown: TargetAccountBreakdown = {
    company_name: text(row.company_name) ?? "(unnamed)",
    industry: text(row.industry),
    subsector: text(row.subsector),
    location,
    total_score,
    industry_score,
    service_fit_score,
    geography_score,
    account_potential_score,
    data_confidence_score,
    proposed_tier: classifyTargetAccountTier(total_score),
    short_reason: "",
  };
  breakdown.short_reason = shortReason(breakdown);
  return breakdown;
}
