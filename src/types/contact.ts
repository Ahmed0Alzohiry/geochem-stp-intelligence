export type ContactRole =
  | "Decision Maker"
  | "Influencer"
  | "Technical"
  | "Procurement"
  | "Gatekeeper"
  | "Other";

export type RelationshipStrength = "Strong" | "Medium" | "Weak" | "None";

/**
 * Department catalog is reference data, not application logic.
 * Contacts store the selected department name (later: department_id FK).
 */
export interface Department {
  id: string;
  name: string;
  description: string;
  active: boolean;
}

export interface Contact {
  id: string;
  companyId: string;
  fullName: string;
  jobTitle: string;
  department: string;
  email: string;
  phone: string;
  linkedinUrl: string | null;
  contactRole: ContactRole;
  relationshipStrength: RelationshipStrength;
  isPrimary: boolean;
  notes: string;
  createdAt: string;
  updatedAt: string;
}
