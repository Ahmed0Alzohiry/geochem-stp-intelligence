import type { EligibilityDecision, ServiceCode, ServiceFirstInput } from "./types";

const CORE_OIL = new Set(["Oil & Gas", "Refining", "Petrochemicals"]);
const CHEM = new Set(["Petrochemicals", "Chemicals", "Refining"]);
const MINING = new Set(["Mining & Minerals"]);
const ENV_INDUSTRIES = new Set([
  "Oil & Gas",
  "Refining",
  "Petrochemicals",
  "Chemicals",
  "Water & Wastewater",
  "Power & Utilities",
  "Mining & Minerals",
  "Industrial Manufacturing",
]);
const HEAVY_INDUSTRIAL = new Set([
  "Oil & Gas",
  "Refining",
  "Petrochemicals",
  "Chemicals",
  "Mining & Minerals",
  "Power & Utilities",
  "Water & Wastewater",
  "Industrial Manufacturing",
  "EPC / Projects",
  "Marine / Ports",
]);

export const SERVICE_ELIGIBLE_INDUSTRIES: Record<ServiceCode, Set<string>> = {
  PET: new Set([...CORE_OIL, "Marine / Ports"]),
  PCH: new Set([...CHEM, "Oil & Gas"]),
  MIN: MINING,
  ENV: ENV_INDUSTRIES,
  OCM: new Set([...HEAVY_INDUSTRIAL, "Industrial Services"]),
  MCT: HEAVY_INDUSTRIAL,
  INS: HEAVY_INDUSTRIAL,
  LAB: new Set([...HEAVY_INDUSTRIAL, "Industrial Services", "Government / Public Sector"]),
};

const APPLICATION: Record<ServiceCode, RegExp> = {
  PET: /refin|petrochem|petroleum terminal|oil terminal|tank farm|bulk plant|bunker|marine fuel|custody|ship.?shore|fuel distribution|aviation fuel|base oil|petroleum product|crude|midstream|downstream|luberef|satorp|sasref|samref|yasref/i,
  PCH: /petrochem|polymer|polyethylene|polypropylene|polyolefin|polycarbonate|ethylene|glycol|catalyst|methanol|elastomer|synthetic rubber|alkyl benzene|industrial fiber|amine|olefin|cracker|aromatic|mtbe|refin|crude|downstream|midstream|upstream|oilfield|gas process|hydrocarbon|feedstock|assay|process chemistry|product quality|reservoir|wellsite/i,
  MIN: /mine|mineral|ore|phosphate|bauxite|gold|copper|smelt|cement|industrial mineral/i,
  ENV: /wastewater|desal|environmental|effluent|soil|groundwater|produced water|hse|emission/i,
  OCM: /lubricant|base oil|rotating|compressor|turbine|gearbox|oil condition|reliability|maintenance/i,
  MCT: /metering|calibration|custody|tank farm|terminal|pipeline|topograph/i,
  INS: /inspection|integrity|ndt|pipeline|plant|turnaround|corrosion|coating/i,
  LAB: /laboratory|qa\/qc|quality|testing|analytical|hse|process chemistry/i,
};

export function industryEligible(serviceCode: ServiceCode, industry: string | null): boolean {
  if (!industry) return false;
  return SERVICE_ELIGIBLE_INDUSTRIES[serviceCode].has(industry);
}

export function subsectorSuggestsApplication(serviceCode: ServiceCode, subsector: string | null): boolean {
  if (!subsector) return false;
  return APPLICATION[serviceCode].test(subsector);
}

export function decideEligibility(input: ServiceFirstInput): {
  decision: EligibilityDecision;
  reason: string;
} {
  if (!input.industry) {
    return { decision: "INSUFFICIENT_TO_ELIGIBLE", reason: "Industry is unknown; cannot place the company in a service market." };
  }
  if (!industryEligible(input.serviceCode, input.industry)) {
    return {
      decision: "OUT_OF_SCOPE",
      reason: `${input.industry} is outside the eligible market for ${input.serviceCode}.`,
    };
  }
  if (input.entityType === "REVIEW") {
    return {
      decision: "INSUFFICIENT_TO_ELIGIBLE",
      reason: "Entity resolution is REVIEW; do not auto-score until the record is classified.",
    };
  }
  return {
    decision: "ELIGIBLE",
    reason: `${input.industry} is in scope for ${input.serviceCode}${input.subsector ? `; subsector ${input.subsector} is available for application scoring` : ""}.`,
  };
}
