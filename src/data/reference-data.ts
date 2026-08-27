import type { CrmStage } from "@/types/crm";
import type { Department } from "@/types/contact";
import type { CustomerType, Industry, Region } from "@/types/segmentation";
import type { ScoringCriterion, ScoringSettings, TierThresholds } from "@/types/targeting";
import type { Service } from "@/types/service";
import type { Profile } from "@/types/user";
import { DEFAULT_TIER_THRESHOLDS } from "@/lib/scoring-engine";

export const SAUDI_ARABIA = "Saudi Arabia";
export const MOCK_ASSESSMENT_SOURCE = "DEMO / MOCK ASSESSMENT" as const;

export const industries: Industry[] = [
  { id: "ind-oil-gas", name: "Oil & Gas", description: "Upstream and midstream hydrocarbon operators and producing assets.", active: true },
  { id: "ind-refining", name: "Refining", description: "Crude refining and fuels manufacturing complexes.", active: true },
  { id: "ind-petrochemicals", name: "Petrochemicals", description: "Base chemicals, intermediates, and polymer complexes.", active: true },
  { id: "ind-chemicals", name: "Chemicals", description: "Specialty and industrial chemical producers.", active: true },
  { id: "ind-power-utilities", name: "Power & Utilities", description: "Power generation, transmission, and related utilities.", active: true },
  { id: "ind-water", name: "Water & Wastewater", description: "Desalination, distribution, and wastewater treatment.", active: true },
  { id: "ind-manufacturing", name: "Industrial Manufacturing", description: "Heavy and process manufacturing plants.", active: true },
  { id: "ind-mining", name: "Mining & Minerals", description: "Metals, minerals, and phosphate mining operations.", active: true },
  { id: "ind-marine", name: "Marine / Ports", description: "Ports, terminals, and marine industrial facilities.", active: true },
  { id: "ind-epc", name: "EPC / Projects", description: "Engineering, procurement, construction, and giga-projects.", active: true },
  { id: "ind-government", name: "Government / Public Sector", description: "Ministries, regulators, and public development entities.", active: true },
];

export const customerTypes: CustomerType[] = [
  { id: "ct-asset-owner", name: "Asset Owner", description: "Owns the industrial or energy asset and the associated capex/opex budget.", active: true },
  { id: "ct-operator", name: "Operator", description: "Operates assets and specifies ongoing testing, inspection, and reliability work.", active: true },
  { id: "ct-manufacturer", name: "Manufacturer", description: "Produces chemicals, materials, or industrial products on site.", active: true },
  { id: "ct-epc", name: "EPC Contractor", description: "Delivers projects and often specifies laboratory and inspection packages.", active: true },
  { id: "ct-om", name: "O&M Contractor", description: "Operations and maintenance contractors with recurring service demand.", active: true },
  { id: "ct-trader", name: "Trader", description: "Commodity or product traders with occasional quality and inspection needs.", active: true },
  { id: "ct-government", name: "Government Entity", description: "Public bodies that procure testing, monitoring, and compliance services.", active: true },
  { id: "ct-technical-partner", name: "Technical Partner", description: "Oilfield, inspection, or engineering partners that may subcontract laboratory work.", active: true },
];

export const regions: Region[] = [
  {
    id: "reg-western",
    name: "Western Region",
    country: SAUDI_ARABIA,
    industrialCluster: "Yanbu / Jeddah / Rabigh / Jazan / NEOM / Red Sea",
    active: true,
  },
  {
    id: "reg-eastern",
    name: "Eastern Region",
    country: SAUDI_ARABIA,
    industrialCluster: "Jubail / Dammam / Al Khobar / Ras Tanura / Dhahran",
    active: true,
  },
  {
    id: "reg-central",
    name: "Central Region",
    country: SAUDI_ARABIA,
    industrialCluster: "Riyadh and central industrial zones",
    active: true,
  },
];

export const services: Service[] = [
  { id: "svc-petroleum", name: "Petroleum Services", serviceCode: "PET", description: "Petroleum geochemistry, reservoir fluids, and wellsite geochemistry support.", active: true },
  { id: "svc-petrochemical", name: "Petrochemical Services", serviceCode: "PCH", description: "Process chemistry, product quality, and petrochemical plant laboratory support.", active: true },
  { id: "svc-minerals", name: "Minerals & Agriculture", serviceCode: "MIN", description: "Ores, minerals, and agricultural material analysis.", active: true },
  { id: "svc-environmental", name: "Environmental Services", serviceCode: "ENV", description: "Soil, water, wastewater, and environmental compliance testing.", active: true },
  { id: "svc-ocm", name: "Oil Condition Monitoring", serviceCode: "OCM", description: "Lubricant and oil condition monitoring programs.", active: true },
  { id: "svc-metering", name: "Metering, Calibration & Topography", serviceCode: "MCT", description: "Metering, calibration, and topographic survey services.", active: true },
  { id: "svc-inspection", name: "Industrial Inspection", serviceCode: "INS", description: "Industrial inspection programs for plants, pipelines, and facilities.", active: true },
  { id: "svc-lab", name: "Laboratory / Testing Services", serviceCode: "LAB", description: "General laboratory testing, HSE, and QA/QC analytical services.", active: true },
];

export const departments: Department[] = [
  { id: "dept-procurement", name: "Procurement", description: "Purchasing and vendor management.", active: true },
  { id: "dept-qaqc", name: "QA/QC", description: "Quality assurance and quality control.", active: true },
  { id: "dept-laboratory", name: "Laboratory", description: "Internal or site laboratory operations.", active: true },
  { id: "dept-reliability", name: "Reliability", description: "Asset reliability and condition monitoring.", active: true },
  { id: "dept-maintenance", name: "Maintenance", description: "Plant and equipment maintenance.", active: true },
  { id: "dept-hse", name: "HSE", description: "Health, safety, and environment.", active: true },
  { id: "dept-environment", name: "Environment", description: "Environmental management and compliance.", active: true },
  { id: "dept-inspection", name: "Inspection", description: "Inspection and integrity.", active: true },
  { id: "dept-projects", name: "Projects", description: "Capital projects and construction.", active: true },
  { id: "dept-engineering", name: "Engineering", description: "Process, petroleum, and facilities engineering.", active: true },
];

export const scoringCriteria: ScoringCriterion[] = [
  {
    id: "sc-market-potential",
    name: "Market Potential",
    description: "Size of addressable laboratory, inspection, and geochemistry spend.",
    weight: 20,
    active: true,
    highRatingMeans: "Large, durable testing and service budget.",
  },
  {
    id: "sc-service-fit",
    name: "GEOCHEM Service Fit",
    description: "Alignment with current GEOCHEM Arabia service lines.",
    weight: 20,
    active: true,
    highRatingMeans: "Strong match to GEOCHEM capabilities.",
  },
  {
    id: "sc-recurring-revenue",
    name: "Recurring Revenue Potential",
    description: "Likelihood of multi-year or programmatic work.",
    weight: 15,
    active: true,
    highRatingMeans: "High probability of recurring programs.",
  },
  {
    id: "sc-cross-selling",
    name: "Cross-Selling Potential",
    description: "Ability to expand across adjacent GEOCHEM services.",
    weight: 15,
    active: true,
    highRatingMeans: "Multiple adjacent service lines are relevant.",
  },
  {
    id: "sc-accessibility",
    name: "Accessibility",
    description: "Ease of reaching decision makers, sites, and laboratories.",
    weight: 10,
    active: true,
    highRatingMeans: "Decision makers and sites are reachable.",
  },
  {
    id: "sc-competitive-intensity",
    name: "Competitive Intensity",
    description: "Competitive pressure in the account. High rating is favorable (low pressure).",
    weight: 10,
    active: true,
    highRatingMeans: "Favorable / low competitive pressure. 1 = very high competitive pressure.",
  },
  {
    id: "sc-margin-potential",
    name: "Margin Potential",
    description: "Expected contribution margin on typical workscopes.",
    weight: 5,
    active: true,
    highRatingMeans: "Attractive contribution margin.",
  },
  {
    id: "sc-geographic-fit",
    name: "Geographic Fit",
    description: "Proximity to GEOCHEM operations and logistics.",
    weight: 5,
    active: true,
    highRatingMeans: "Strong logistics and coverage fit.",
  },
];

export const SCORING_MODEL_VERSION = "stp-weights-v1";
export const TIER_THRESHOLD_VERSION = "stp-tiers-v1";

export const tierThresholds: TierThresholds = { ...DEFAULT_TIER_THRESHOLDS };

export const scoringSettings: ScoringSettings = {
  scoringModelVersion: SCORING_MODEL_VERSION,
  tierThresholdVersion: TIER_THRESHOLD_VERSION,
  criteria: scoringCriteria,
  tierThresholds,
};

const activeWeightTotal = scoringCriteria
  .filter((criterion) => criterion.active)
  .reduce((sum, criterion) => sum + criterion.weight, 0);

if (Math.abs(activeWeightTotal - 100) > 0.01) {
  throw new Error(`Active scoring weights must total 100%. Found ${activeWeightTotal}%.`);
}

export const crmStages: CrmStage[] = [
  { id: "crm-prospect", name: "Prospect", displayOrder: 1, active: true },
  { id: "crm-contacted", name: "Contacted", displayOrder: 2, active: true },
  { id: "crm-qualified", name: "Qualified", displayOrder: 3, active: true },
  { id: "crm-meeting", name: "Meeting", displayOrder: 4, active: true },
  { id: "crm-proposal", name: "Proposal", displayOrder: 5, active: true },
  { id: "crm-negotiation", name: "Negotiation", displayOrder: 6, active: true },
  { id: "crm-won", name: "Won", displayOrder: 7, active: true },
  { id: "crm-lost", name: "Lost", displayOrder: 8, active: true },
];

export const profiles: Profile[] = [
  {
    id: "usr-ahmed",
    fullName: "Ahmed",
    email: "ahmed@geochem.example",
    role: "Manager",
    jobTitle: "Commercial Intelligence",
    active: true,
    createdAt: "2026-01-15T08:00:00.000Z",
  },
  {
    id: "usr-omar",
    fullName: "Omar Al-Ghamdi",
    email: "omar.alghamdi@geochem.example",
    role: "Sales_BD",
    jobTitle: "Business Development",
    active: true,
    createdAt: "2026-01-15T08:00:00.000Z",
  },
  {
    id: "usr-sara",
    fullName: "Sara Al-Otaibi",
    email: "sara.alotaibi@geochem.example",
    role: "Sales_BD",
    jobTitle: "Key Account Manager",
    active: true,
    createdAt: "2026-01-15T08:00:00.000Z",
  },
  {
    id: "usr-hassan",
    fullName: "Hassan Al-Zahrani",
    email: "hassan.alzahrani@geochem.example",
    role: "Sales_BD",
    jobTitle: "Business Development",
    active: true,
    createdAt: "2026-01-15T08:00:00.000Z",
  },
];

export function requireByName<T extends { name: string }>(items: T[], name: string): T {
  const match = items.find((item) => item.name === name);
  if (!match) {
    throw new Error(`Reference record not found: ${name}`);
  }
  return match;
}
