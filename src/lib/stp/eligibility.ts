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

const OCM_INDUSTRIES = new Set([
  "Oil & Gas",
  "Refining",
  "Petrochemicals",
  "Chemicals",
  "Power & Utilities",
  "Water & Wastewater",
  "Mining & Minerals",
  "Industrial Manufacturing",
]);

export const SERVICE_ELIGIBLE_INDUSTRIES: Record<ServiceCode, Set<string>> = {
  PET: new Set([...CORE_OIL, "Marine / Ports"]),
  PCH: new Set([...CHEM, "Oil & Gas"]),
  MIN: MINING,
  ENV: ENV_INDUSTRIES,
  OCM: OCM_INDUSTRIES,
  /** Industry is a filter only. MCT also requires metering/calibration/topography buying evidence. */
  MCT: new Set([
    "Oil & Gas",
    "Refining",
    "Petrochemicals",
    "Chemicals",
    "Power & Utilities",
    "Water & Wastewater",
    "Marine / Ports",
  ]),
  INS: HEAVY_INDUSTRIAL,
  /** Industry is a filter only. LAB also requires plant/product-testing evidence. */
  LAB: OCM_INDUSTRIES,
};

const APPLICATION: Record<ServiceCode, RegExp> = {
  PET: /refin|petrochem|petroleum terminal|oil terminal|tank farm|bulk plant|bunker|marine fuel|custody|ship.?shore|fuel distribution|aviation fuel|base oil|petroleum product|crude|midstream|downstream|luberef|satorp|sasref|samref|yasref/i,
  PCH: /petrochem|polymer|polyethylene|polypropylene|polyolefin|polycarbonate|ethylene|glycol|catalyst|methanol|elastomer|synthetic rubber|alkyl benzene|industrial fiber|amine|olefin|cracker|aromatic|mtbe|refin|crude|downstream|midstream|upstream|oilfield|gas process|hydrocarbon|feedstock|assay|process chemistry|product quality|reservoir|wellsite/i,
  MIN: /mine|mineral|ore|phosphate|bauxite|gold|copper|smelt|cement|industrial mineral/i,
  ENV: /wastewater|desal|environmental|effluent|soil|groundwater|produced water|hse|emission/i,
  OCM: /lubricant|lube oil|used oil|oil condition|wear metal|rotating equipment|compressor|turbine|gearbox|hydraulic|base oil|refin|petrochem|polymer|polypropylene|polyethylene|olefin|gas plant|gas process|power plant|power generation|thermal power|independent power|\bipp\b|\biwpp\b|desal|cement|rolling mill|steel mill|kiln|integrated chemical/i,
  MCT: /metering|calibration|custody|petroleum terminal|terminal operations|tank farm|gas plant|gas process|refin|petrochem|polymer|polypropylene|polyethylene|base oil|power plant|power generation|desal|samref|yasref|luberef|yanpet|satorp|sasref|yansab|natpet|sipchem|hawiyah|ras tanura|jazan refinery|riyadh refinery|petro rabigh|\bkemya\b|sadara|acwa power|integrated chemical|topograph|plant survey|site survey/i,
  INS: /inspection|integrity|ndt|pipeline|plant|turnaround|corrosion|coating/i,
  LAB: /refin|petrochem|polymer|polyethylene|polypropylene|polyolefin|base oil|gas plant|gas process|cracker|olefin|integrated chemical|process chemistry|feedstock|hydrocarbon stream|samref|yasref|luberef|yanpet|satorp|sasref|yansab|natpet|sipchem|hawiyah|ras tanura|jazan refinery|riyadh refinery|petro rabigh|petrokemya|\bkemya\b|\bsharq\b|sadara|product.?qc/i,
};

export function industryEligible(serviceCode: ServiceCode, industry: string | null): boolean {
  if (!industry) return false;
  return SERVICE_ELIGIBLE_INDUSTRIES[serviceCode].has(industry);
}

export function subsectorSuggestsApplication(serviceCode: ServiceCode, subsector: string | null): boolean {
  if (!subsector) return false;
  return APPLICATION[serviceCode].test(subsector);
}

/** OCM application evidence on name + subsector. Industry membership alone is not enough. */
export function hasOcmApplicationEvidence(companyName: string | null, subsector: string | null): boolean {
  const blob = [companyName, subsector].filter(Boolean).join(" | ");
  if (!blob) return false;
  return APPLICATION.OCM.test(blob);
}

const LAB_COMPETITOR =
  /\bsgs\b|intertek|bureau veritas|\bbv\b|applus|t[uü]v|element materials|saybolt|core lab|core laboratories|arabian lab|arabian laboratories|als limited|\bals\b testing/i;

/** TIC / independent-lab competitors are not GEOCHEM LAB buyers. */
export function isLabCompetitorName(companyName: string | null): boolean {
  return Boolean(companyName && LAB_COMPETITOR.test(companyName));
}

/** Plant / product-stream evidence. Industry membership and PCH/ENV/INS/PET/OCM overlap are not enough. */
export function hasLabApplicationEvidence(companyName: string | null, subsector: string | null): boolean {
  if (isLabCompetitorName(companyName)) return false;
  const blob = [companyName, subsector].filter(Boolean).join(" | ");
  if (!blob) return false;
  return APPLICATION.LAB.test(blob);
}

const MCT_COMPETITOR =
  /arabian calibration|gulf calibration|calibration company|geophysical and surveying|surveying company|\bsgs\b|intertek|bureau veritas|\bbv\b|applus|t[uü]v|element materials|saybolt|core lab|core laboratories|metrology/i;

export type MctApplicationClass =
  | "refinery_metering"
  | "terminal_custody"
  | "gas_plant_metering"
  | "petrochem_calibration"
  | "utility_metering"
  | "topography"
  | "generic_mct"
  | "none";

/** TIC / calibration-service / surveying-service sellers are not GEOCHEM MCT buyers. */
export function isMctCompetitorName(companyName: string | null): boolean {
  return Boolean(companyName && MCT_COMPETITOR.test(companyName));
}

/**
 * Application-fit score independent of company size.
 * Weights: refinery 98, terminal/custody 96, gas plant 94, petrochem calibration 90,
 * utility metering 86, explicit topography 88, generic metering/calibration phrase 72.
 */
export function classifyMctApplication(
  companyName: string | null,
  subsector: string | null,
): { cls: MctApplicationClass; score: number; label: string } {
  if (isMctCompetitorName(companyName)) {
    return { cls: "none", score: 0, label: "Competitor / MCT service seller" };
  }
  const blob = [companyName, subsector].filter(Boolean).join(" | ");
  if (!blob) return { cls: "none", score: 0, label: "No MCT application evidence" };
  if (/petroleum terminal|terminal operations/i.test(blob)) {
    return { cls: "terminal_custody", score: 96, label: "Terminal / custody-transfer metering" };
  }
  if (/gas plant|gas process/i.test(blob)) {
    return { cls: "gas_plant_metering", score: 94, label: "Gas-plant allocation / fiscal metering" };
  }
  if (/power plant|power generation|desal|\biwpp\b|\bipp\b|acwa power|power and desalination/i.test(blob)) {
    return { cls: "utility_metering", score: 86, label: "Utility / water / power metering and calibration" };
  }
  if (
    /refin|samref|yasref|luberef|satorp|sasref|base oil|jazan refinery|riyadh refinery|ras tanura refinery/i.test(blob)
  ) {
    return { cls: "refinery_metering", score: 98, label: "Refinery fiscal/process metering and calibration" };
  }
  if (
    /petrochem|polymer|polypropylene|polyethylene|olefin|yanpet|yansab|natpet|sipchem|\bkemya\b|sadara|integrated chemical/i.test(
      blob,
    )
  ) {
    return {
      cls: "petrochem_calibration",
      score: 90,
      label: "Petrochemical / polymer process instrumentation calibration",
    };
  }
  if (/topograph|industrial survey|plant survey|site survey/i.test(blob)) {
    return { cls: "topography", score: 88, label: "Explicit plant/site surveying requirement" };
  }
  if (/metering|calibration|custody|flow measurement/i.test(blob)) {
    return { cls: "generic_mct", score: 72, label: "Generic metering/calibration phrase without plant class" };
  }
  return { cls: "none", score: 0, label: "No credible MCT buying application" };
}

/** Metering / calibration / topography buying evidence. Industry and cross-sell are not enough. */
export function hasMctApplicationEvidence(companyName: string | null, subsector: string | null): boolean {
  return classifyMctApplication(companyName, subsector).cls !== "none";
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
  if (input.serviceCode === "OCM" && !hasOcmApplicationEvidence(input.companyName, input.subsector)) {
    return {
      decision: "OUT_OF_SCOPE",
      reason:
        "OCM requires plant/fleet evidence of rotating equipment, lubrication systems, or equivalent — industry membership alone is not eligible.",
    };
  }
  if (input.serviceCode === "LAB" && isLabCompetitorName(input.companyName)) {
    return {
      decision: "OUT_OF_SCOPE",
      reason: "Independent laboratory / TIC / certification competitors are excluded from GEOCHEM LAB targeting.",
    };
  }
  if (input.serviceCode === "LAB" && !hasLabApplicationEvidence(input.companyName, input.subsector)) {
    return {
      decision: "OUT_OF_SCOPE",
      reason:
        "LAB requires commercially credible plant or product-testing evidence — industry membership and cross-sell overlap do not create eligibility.",
    };
  }
  if (input.serviceCode === "MCT" && isMctCompetitorName(input.companyName)) {
    return {
      decision: "OUT_OF_SCOPE",
      reason: "Calibration / metrology / surveying / TIC competitors are excluded from GEOCHEM MCT targeting.",
    };
  }
  if (input.serviceCode === "MCT" && !hasMctApplicationEvidence(input.companyName, input.subsector)) {
    return {
      decision: "OUT_OF_SCOPE",
      reason:
        "MCT requires commercially credible metering, calibration, or explicit topography evidence — industry membership and cross-sell overlap do not create eligibility.",
    };
  }
  return {
    decision: "ELIGIBLE",
    reason: `${input.industry} is in scope for ${input.serviceCode}${input.subsector ? `; subsector ${input.subsector} is available for application scoring` : ""}.`,
  };
}
