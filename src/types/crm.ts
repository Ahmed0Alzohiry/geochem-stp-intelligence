import type { DataConfidence } from "@/types/targeting";

export interface CrmStage {
  id: string;
  name: string;
  displayOrder: number;
  active: boolean;
  defaultProbability?: number;
}

export interface Opportunity {
  id: string;
  companyId: string;
  serviceId: string;
  contactId: string | null;
  ownerId: string;
  opportunityName: string;
  stageId: string;
  estimatedValue: number;
  currency: string;
  probability: number;
  expectedCloseDate: string;
  source: string;
  description: string;
  lostReason: string | null;
  dataConfidence?: DataConfidence;
  createdAt: string;
  updatedAt: string;
}

export type ActivityType =
  | "Call"
  | "Email"
  | "Meeting"
  | "Site Visit"
  | "Proposal"
  | "Follow-up"
  | "Other";

export interface Activity {
  id: string;
  companyId: string;
  contactId: string | null;
  opportunityId: string | null;
  ownerId: string;
  activityType: ActivityType;
  subject: string;
  description: string;
  activityDate: string;
  nextAction: string | null;
  nextActionDate: string | null;
  createdAt: string;
}
