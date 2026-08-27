/**
 * UI view-model types for the current frontend.
 * They are not the database schema.
 *
 * Canonical domain entities (future Supabase) live in:
 * src/types/company.ts, contact.ts, service.ts, segmentation.ts,
 * targeting.ts, crm.ts, user.ts — barrel: src/types/domain.ts
 */
export type Industry =
  | "Oil & Gas"
  | "Petrochemicals"
  | "Mining & Minerals"
  | "Power & Utilities"
  | "Water & Wastewater"
  | "Construction & Infrastructure"
  | "Industrial Manufacturing"
  | "Environmental Services";

export type CustomerType =
  | "National Oil Company"
  | "IOC / Operator"
  | "EPC Contractor"
  | "Service Company"
  | "Industrial Plant"
  | "Government / Regulator"
  | "Mining Operator"
  | "Utility Provider";

export type ServiceNeed =
  | "Petroleum Geochemistry"
  | "Core & Reservoir Analysis"
  | "Environmental Testing"
  | "Water Quality Analysis"
  | "Minerals & Ores Analysis"
  | "Industrial Process Chemistry"
  | "HSE & Compliance Testing"
  | "Mud Logging Support";

export type Region =
  | "Eastern Province"
  | "Riyadh"
  | "Makkah"
  | "Madinah"
  | "Asir"
  | "Tabuk"
  | "Najran"
  | "Northern Borders"
  | "Al-Qassim"
  | "Jazan";

export type AccountPotential = "Strategic" | "High" | "Medium" | "Nurture";

export type TargetTier = "Tier 1" | "Tier 2" | "Tier 3" | "Watch";

export type CrmStage =
  | "Lead"
  | "Prospect"
  | "Contacted"
  | "Qualified"
  | "Meeting"
  | "Proposal"
  | "Negotiation"
  | "Won"
  | "Lost";

export type GeochemService =
  | "Petroleum Geochemistry"
  | "Core Analysis"
  | "Formation Water Analysis"
  | "Environmental Soil & Water Testing"
  | "Industrial Wastewater Analysis"
  | "Mineralogical Analysis"
  | "HSE Laboratory Services"
  | "Wellsite Geochemistry Support";

export interface ScoringCriteria {
  marketPotential: number;
  serviceFit: number;
  recurringRevenue: number;
  crossSelling: number;
  accessibility: number;
  competitiveIntensity: number;
  marginPotential: number;
  geographicFit: number;
}

export interface Company {
  id: string;
  name: string;
  industry: Industry;
  city: string;
  region: Region;
  customerType: CustomerType;
  serviceNeed: ServiceNeed;
  accountPotential: AccountPotential;
  targetTier: TargetTier;
  targetScore: number;
  bestService: GeochemService;
  crmStage: CrmStage;
  scoring: ScoringCriteria;
  pipelineValueSar: number;
  employees: string;
  website?: string;
}

export interface Contact {
  id: string;
  companyId: string;
  name: string;
  title: string;
  email: string;
  phone: string;
}

export interface Opportunity {
  id: string;
  companyId: string;
  companyName: string;
  title: string;
  stage: CrmStage;
  valueSar: number;
  service: GeochemService;
  owner: string;
  closeDate: string;
}

export interface ScoringWeight {
  key: keyof ScoringCriteria;
  label: string;
  weight: number;
  description: string;
}

export interface DashboardKpis {
  totalCompanies: number;
  tier1Accounts: number;
  activeOpportunities: number;
  pipelineValueSar: number;
}

export interface NamedCount {
  name: string;
  value: number;
}
