import type { DataConfidence } from "@/types/targeting";

export type NeedLevel = "High" | "Medium" | "Low" | "Unknown";
export type ServiceFitRating = 1 | 2 | 3 | 4 | 5;
export type CurrentServiceStatus =
  | "Not Offered"
  | "Prospect"
  | "Proposal"
  | "Active"
  | "Previous";
export type CrossSellPotential = "High" | "Medium" | "Low";

export interface Service {
  id: string;
  name: string;
  serviceCode: string;
  description: string;
  active: boolean;
}

/**
 * Join entity for Company ↔ Service (many-to-many).
 * Powers the future ACCOUNT × SERVICE matrix and cross-sell engine.
 */
export interface CompanyService {
  id: string;
  companyId: string;
  serviceId: string;
  needLevel: NeedLevel;
  serviceFitRating: ServiceFitRating;
  currentServiceStatus: CurrentServiceStatus;
  currentSupplier: string | null;
  estimatedAnnualPotential: number | null;
  crossSellPotential: CrossSellPotential;
  dataConfidence?: DataConfidence;
  notes: string;
}
