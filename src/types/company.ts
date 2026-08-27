import type { AccountPotential } from "@/types/segmentation";
import type { DataConfidence } from "@/types/targeting";

export type AccountStatus =
  | "Prospect"
  | "Current Customer"
  | "Former Customer"
  | "Partner";

export type OwnershipType =
  | "State-owned"
  | "Public"
  | "Private"
  | "Joint Venture"
  | "Government"
  | "Unknown";

export interface Company {
  id: string;
  companyName: string;
  legalName: string;
  industryId: string;
  subsector: string;
  customerTypeId: string;
  country: string;
  regionId: string;
  city: string;
  website: string | null;
  linkedinUrl: string | null;
  mainPhone: string | null;
  generalEmail: string | null;
  companySize: string;
  ownershipType: OwnershipType;
  accountStatus: AccountStatus;
  accountPotential: AccountPotential;
  /**
   * Confidence in judged commercial fields (potential, status, next action).
   * Not required on simple master-data attributes such as city.
   */
  dataConfidence?: DataConfidence;
  accountOwnerId: string | null;
  crmStageId: string;
  lastActivityDate: string | null;
  nextAction: string | null;
  nextActionDate: string | null;
  notes: string;
  createdAt: string;
  updatedAt: string;
}
