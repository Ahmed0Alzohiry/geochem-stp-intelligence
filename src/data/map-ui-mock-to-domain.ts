import { companies as uiCompanies, contacts as uiContacts, opportunities as uiOpportunities } from "@/data/mock";
import {
  crmStages,
  customerTypes,
  industries,
  MOCK_ASSESSMENT_SOURCE,
  profiles,
  regions,
  scoringCriteria,
  scoringSettings,
  services,
} from "@/data/reference-data";
import { calculateTargetScore, demoDisplayScoreToRating } from "@/lib/scoring-engine";
import { freezeTierThresholds, freezeWeightConfiguration } from "@/lib/compare-snapshots";
import type { AccountPotential } from "@/types/segmentation";
import type { AccountStatus, Company, OwnershipType } from "@/types/company";
import type { Activity, Opportunity } from "@/types/crm";
import type { Contact } from "@/types/contact";
import type { CompanyService } from "@/types/service";
import type { CompanyScore, CompanyTargetSnapshot } from "@/types/targeting";
import type { CrmStage as UiCrmStage, GeochemService, ScoringCriteria } from "@/types";

const DEMO_ASSESSED_AT = "2026-08-01T00:00:00.000Z";
const DEMO_CREATED_AT = "2026-06-01T00:00:00.000Z";

const INDUSTRY_MAP: Record<string, string> = {
  "Oil & Gas": "ind-oil-gas",
  Refining: "ind-refining",
  Petrochemicals: "ind-petrochemicals",
  Chemicals: "ind-chemicals",
  "Power & Utilities": "ind-power-utilities",
  "Water & Wastewater": "ind-water",
  "Industrial Manufacturing": "ind-manufacturing",
  "Mining & Minerals": "ind-mining",
  "Marine / Ports": "ind-marine",
  "Construction & Infrastructure": "ind-epc",
  "EPC / Projects": "ind-epc",
  "Government / Public Sector": "ind-government",
  "Environmental Services": "ind-water",
};

const CUSTOMER_TYPE_MAP: Record<string, string> = {
  "National Oil Company": "ct-asset-owner",
  "IOC / Operator": "ct-operator",
  "EPC Contractor": "ct-epc",
  "Service Company": "ct-technical-partner",
  "Industrial Plant": "ct-manufacturer",
  "Government / Regulator": "ct-government",
  "Mining Operator": "ct-operator",
  "Utility Provider": "ct-operator",
};

const REGION_MAP: Record<string, string> = {
  "Eastern Province": "reg-eastern",
  Riyadh: "reg-central",
  Makkah: "reg-western",
  Madinah: "reg-western",
  Asir: "reg-western",
  Tabuk: "reg-western",
  Najran: "reg-western",
  "Northern Borders": "reg-central",
  "Al-Qassim": "reg-central",
  Jazan: "reg-western",
};

const ACCOUNT_POTENTIAL_MAP: Record<string, AccountPotential> = {
  Strategic: "Strategic",
  High: "Growth",
  Medium: "Development",
  Nurture: "Transactional",
};

const SERVICE_LINE_MAP: Record<GeochemService | string, string> = {
  "Petroleum Geochemistry": "svc-petroleum",
  "Core Analysis": "svc-petroleum",
  "Wellsite Geochemistry Support": "svc-petroleum",
  "Industrial Process Chemistry": "svc-petrochemical",
  "Mineralogical Analysis": "svc-minerals",
  "Minerals & Ores Analysis": "svc-minerals",
  "Environmental Soil & Water Testing": "svc-environmental",
  "Environmental Testing": "svc-environmental",
  "Industrial Wastewater Analysis": "svc-environmental",
  "Water Quality Analysis": "svc-environmental",
  "Formation Water Analysis": "svc-lab",
  "HSE Laboratory Services": "svc-lab",
  "HSE & Compliance Testing": "svc-lab",
  "Mud Logging Support": "svc-petroleum",
  "Core & Reservoir Analysis": "svc-petroleum",
};

const CRITERION_KEY_MAP: Record<keyof ScoringCriteria, string> = {
  marketPotential: "sc-market-potential",
  serviceFit: "sc-service-fit",
  recurringRevenue: "sc-recurring-revenue",
  crossSelling: "sc-cross-selling",
  accessibility: "sc-accessibility",
  competitiveIntensity: "sc-competitive-intensity",
  marginPotential: "sc-margin-potential",
  geographicFit: "sc-geographic-fit",
};

const OWNER_CYCLE = ["usr-omar", "usr-sara", "usr-hassan"] as const;

const STAGE_PROBABILITY: Record<string, number> = {
  Prospect: 10,
  Contacted: 20,
  Qualified: 35,
  Meeting: 45,
  Proposal: 60,
  Negotiation: 75,
  Won: 100,
  Lost: 0,
};

function requireMapped(map: Record<string, string>, value: string, field: string) {
  const id = map[value];
  if (!id) {
    throw new Error(`No domain mapping for ${field}: ${value}`);
  }
  return id;
}

function ownershipFor(name: string): OwnershipType {
  const lower = name.toLowerCase();
  if (lower.includes("aramco") || lower.includes("ma'aden") || lower.includes("swcc") || lower.includes("nwc") || lower.includes("electricity")) {
    return "State-owned";
  }
  if (lower.includes("government") || lower.includes("neom") || lower.includes("partnership")) {
    return "Government";
  }
  if (lower.includes("yasref") || lower.includes("sadara") || lower.includes("rabigh") || lower.includes("chevron")) {
    return "Joint Venture";
  }
  if (lower.includes("halliburton") || lower.includes("schlumberger") || lower.includes("baker") || lower.includes("nesr")) {
    return "Private";
  }
  return "Public";
}

function accountStatusFor(stage: UiCrmStage): AccountStatus {
  if (stage === "Won") return "Current Customer";
  if (stage === "Lost") return "Former Customer";
  return "Prospect";
}

function stageIdFor(name: string) {
  const stage = crmStages.find((item) => item.name === name);
  if (!stage) throw new Error(`Unknown CRM stage: ${name}`);
  return stage.id;
}

function subsectorFor(industry: string, city: string) {
  return `${industry} · ${city}`;
}

export const domainCompanies: Company[] = uiCompanies.map((company, index) => ({
  id: company.id,
  companyName: company.name,
  legalName: company.name,
  industryId: requireMapped(INDUSTRY_MAP, company.industry, "industry"),
  subsector: subsectorFor(company.industry, company.city),
  customerTypeId: requireMapped(CUSTOMER_TYPE_MAP, company.customerType, "customerType"),
  country: "Saudi Arabia",
  regionId: requireMapped(REGION_MAP, company.region, "region"),
  city: company.city,
  website: company.website ? `https://${company.website}` : null,
  linkedinUrl: null,
  mainPhone: null,
  generalEmail: null,
  companySize: company.employees,
  ownershipType: ownershipFor(company.name),
  accountStatus: accountStatusFor(company.crmStage),
  accountPotential: ACCOUNT_POTENTIAL_MAP[company.accountPotential],
  dataConfidence: "Unknown",
  accountOwnerId: OWNER_CYCLE[index % OWNER_CYCLE.length],
  crmStageId: stageIdFor(company.crmStage),
  lastActivityDate: "2026-08-15",
  nextAction: "Confirm buying unit and relevant GEOCHEM service line",
  nextActionDate: "2026-09-15",
  notes: `${MOCK_ASSESSMENT_SOURCE}. Mapped from frontend mock record. Original UI service need: ${company.serviceNeed}.`,
  createdAt: DEMO_CREATED_AT,
  updatedAt: DEMO_CREATED_AT,
}));

function serviceIdFor(label: string) {
  return requireMapped(SERVICE_LINE_MAP, label, "service");
}

export const domainCompanyServices: CompanyService[] = uiCompanies.flatMap((company) => {
  const primaryServiceId = serviceIdFor(company.bestService);
  const needServiceId = serviceIdFor(company.serviceNeed);
  const rows: CompanyService[] = [
    {
      id: `cs-${company.id}-primary`,
      companyId: company.id,
      serviceId: primaryServiceId,
      needLevel: "High",
      serviceFitRating: demoDisplayScoreToRating(company.scoring.serviceFit),
      currentServiceStatus:
        company.crmStage === "Won" ? "Active" : company.crmStage === "Lost" ? "Previous" : company.crmStage === "Proposal" || company.crmStage === "Negotiation" ? "Proposal" : "Prospect",
      currentSupplier: null,
      estimatedAnnualPotential: company.pipelineValueSar,
      crossSellPotential: company.scoring.crossSelling >= 75 ? "High" : company.scoring.crossSelling >= 55 ? "Medium" : "Low",
      dataConfidence: "Unknown",
      notes: `${MOCK_ASSESSMENT_SOURCE}. Primary mapped service from UI "Best Service".`,
    },
  ];

  if (needServiceId !== primaryServiceId) {
    rows.push({
      id: `cs-${company.id}-need`,
      companyId: company.id,
      serviceId: needServiceId,
      needLevel: "Medium",
      serviceFitRating: demoDisplayScoreToRating(company.scoring.serviceFit),
      currentServiceStatus: "Not Offered",
      currentSupplier: null,
      estimatedAnnualPotential: null,
      crossSellPotential: "Medium",
      dataConfidence: "Unknown",
      notes: `${MOCK_ASSESSMENT_SOURCE}. Additional service inferred from UI "Service Need".`,
    });
  }

  return rows;
});

export const domainContacts: Contact[] = uiContacts.map((contact, index) => ({
  id: contact.id,
  companyId: contact.companyId,
  fullName: contact.name,
  jobTitle: contact.title,
  department: contact.title.toLowerCase().includes("procur")
    ? "Procurement"
    : contact.title.toLowerCase().includes("hse")
      ? "HSE"
      : "Laboratory",
  email: contact.email,
  phone: contact.phone,
  linkedinUrl: null,
  contactRole: index === 4 ? "Procurement" : "Technical",
  relationshipStrength: "Medium",
  isPrimary: true,
  notes: `${MOCK_ASSESSMENT_SOURCE}. Mapped from frontend mock contact.`,
  createdAt: DEMO_CREATED_AT,
  updatedAt: DEMO_CREATED_AT,
}));

export const domainCompanyScores: CompanyScore[] = uiCompanies.flatMap((company) =>
  (Object.keys(CRITERION_KEY_MAP) as (keyof ScoringCriteria)[]).map((key) => ({
    id: `score-${company.id}-${CRITERION_KEY_MAP[key]}`,
    companyId: company.id,
    criterionId: CRITERION_KEY_MAP[key],
    rating: demoDisplayScoreToRating(company.scoring[key]),
    justification: `${MOCK_ASSESSMENT_SOURCE}. Converted from UI 0–100 display value ${company.scoring[key]}. Not a factual GEOCHEM assessment.`,
    evidenceSource: MOCK_ASSESSMENT_SOURCE,
    evidenceUrl: null,
    evidenceDate: null,
    evidenceQuality: "Unknown",
    assessedBy: "usr-ahmed",
    assessedAt: DEMO_ASSESSED_AT,
  })),
);

export const domainTargetSnapshots: CompanyTargetSnapshot[] = uiCompanies.map((company) => {
  const companyScores = domainCompanyScores.filter((score) => score.companyId === company.id);
  const ratings = companyScores.map((score) => ({ criterionId: score.criterionId, rating: score.rating }));

  const result = calculateTargetScore({
    criteria: scoringSettings.criteria,
    ratings,
    thresholds: scoringSettings.tierThresholds,
  });

  if (result.status !== "complete" || result.scoreOutOf5 === null || result.scoreOutOf100 === null || result.tier === null) {
    throw new Error(`Incomplete demo score for ${company.id}: ${result.issues.map((issue) => issue.message).join("; ")}`);
  }

  return {
    id: `snap-${company.id}-v1`,
    companyId: company.id,
    scoreOutOf5: result.scoreOutOf5,
    scoreOutOf100: result.scoreOutOf100,
    tier: result.tier,
    assessmentStatus: "Complete",
    assessmentDate: DEMO_ASSESSED_AT,
    assessedBy: "usr-ahmed",
    scoringModelVersion: scoringSettings.scoringModelVersion,
    tierThresholdVersion: scoringSettings.tierThresholdVersion,
    weightConfigurationSnapshot: freezeWeightConfiguration(scoringSettings, DEMO_ASSESSED_AT),
    tierThresholdSnapshot: freezeTierThresholds(scoringSettings, DEMO_ASSESSED_AT),
    ratingSnapshot: companyScores.map((score) => ({
      criterionId: score.criterionId,
      criterionName: scoringSettings.criteria.find((criterion) => criterion.id === score.criterionId)?.name ?? score.criterionId,
      rating: score.rating,
      justification: score.justification,
      evidenceQuality: score.evidenceQuality,
    })),
    changeReason: `${MOCK_ASSESSMENT_SOURCE}. Initial mapped snapshot from frontend mock scores.`,
    notes: `${MOCK_ASSESSMENT_SOURCE}. Not a verified GEOCHEM targeting assessment.`,
    createdAt: DEMO_ASSESSED_AT,
    assessmentSource: MOCK_ASSESSMENT_SOURCE,
  };
});

export const domainOpportunities: Opportunity[] = uiOpportunities.map((opportunity, index) => {
  const uiCompany = uiCompanies.find((company) => company.id === opportunity.companyId);
  if (!uiCompany) {
    throw new Error(`Opportunity ${opportunity.id} has no company`);
  }
  const contact = domainContacts.find((item) => item.companyId === opportunity.companyId);
  return {
    id: opportunity.id,
    companyId: opportunity.companyId,
    serviceId: serviceIdFor(opportunity.service),
    contactId: contact?.id ?? null,
    ownerId: OWNER_CYCLE[index % OWNER_CYCLE.length],
    opportunityName: opportunity.title,
    stageId: stageIdFor(opportunity.stage),
    estimatedValue: opportunity.valueSar,
    currency: "SAR",
    probability: STAGE_PROBABILITY[opportunity.stage] ?? 10,
    expectedCloseDate: opportunity.closeDate,
    source: "Mock market intelligence",
    description: `${MOCK_ASSESSMENT_SOURCE}. Mapped from frontend pipeline card.`,
    lostReason: opportunity.stage === "Lost" ? "Incumbent retained the work (demo)" : null,
    dataConfidence: "Unknown",
    createdAt: DEMO_CREATED_AT,
    updatedAt: DEMO_CREATED_AT,
  };
});

export const domainActivities: Activity[] = domainOpportunities.map((opportunity) => ({
  id: `act-${opportunity.id}`,
  companyId: opportunity.companyId,
  contactId: opportunity.contactId,
  opportunityId: opportunity.id,
  ownerId: opportunity.ownerId,
  activityType: opportunity.lostReason ? "Follow-up" : "Call",
  subject: "Demo activity mapped from mock pipeline",
  description: `${MOCK_ASSESSMENT_SOURCE}. Placeholder activity to illustrate CRM next-action tracking.`,
  activityDate: "2026-08-15",
  nextAction: "Confirm service-line owner and request technical briefing",
  nextActionDate: "2026-09-15",
  createdAt: DEMO_CREATED_AT,
}));

export const fieldMapping = {
  uiCompanyName: "company.companyName / legalName",
  uiIndustry: "company.industryId → industries.name",
  uiCity: "company.city (kept as a company attribute, not a region)",
  uiRegion: "company.regionId → regions.name (Western / Eastern / Central)",
  uiCustomerType: "company.customerTypeId → customerTypes.name",
  uiServiceNeed: "company_services.need + services.name",
  uiAccountPotential: "company.accountPotential",
  uiTargetTier: "company_target_snapshots.tier (calculated, not stored on companies)",
  uiTargetScore: "company_target_snapshots.scoreOutOf100 (calculated cache)",
  uiBestService: "company_services where needLevel = High",
  uiCrmStage: "company.crmStageId and opportunities.stageId",
  uiScoring: "company_scores.rating (1–5, DEMO / MOCK ASSESSMENT)",
  uiPipelineValue: "opportunities.estimatedValue",
  uiEmployees: "company.companySize",
  uiWebsite: "company.website",
} as const;

export const domainCatalog = {
  industries,
  customerTypes,
  regions,
  services,
  scoringCriteria,
  crmStages,
  profiles,
};
