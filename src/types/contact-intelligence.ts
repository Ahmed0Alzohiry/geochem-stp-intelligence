/**
 * STEP 7.2 Contact Intelligence domain types (proposed schema 009).
 * Does not replace the existing Contact / ContactRole UI types.
 * Do not invent people from these types.
 */

export const CONTACT_INTELLIGENCE_SCHEMA_VERSION = "7.2.0";
export const CONTACT_COLLECTION_RULES_VERSION = "7.5.0";
export const CONTACT_PERSIST_GRAIN_VERSION = "7.8.0";
export const CONTACT_PERSIST_WRITER_VERSION = "7.12.1";
export const PROPOSED_CONTACT_MIGRATION_FILE = "supabase/migrations/009_contact_intelligence.sql";
export const PROPOSED_PERSONA_MIGRATION_FILE = "supabase/migrations/010_service_contact_personas.sql";
export const PROPOSED_CONTACT_WRITE_POLICY_FILE = "supabase/migrations/011_contact_persist_write_policies.sql";

/** Service-specific buying role on contact_service_relevance (not contacts.contact_role). */
export type ServiceBuyingRole =
  | "DECISION_MAKER"
  | "INFLUENCER"
  | "TECHNICAL"
  | "PROCUREMENT"
  | "GATEKEEPER"
  | "USER";

export type ContactSourceConfidence = "HIGH" | "MEDIUM" | "LOW";

export type ContactVerificationStatus = "Unverified" | "Partially Verified" | "Verified";

export type ContactEvidenceType =
  | "Official website"
  | "Company directory"
  | "Regulator / government"
  | "LinkedIn"
  | "Trade directory"
  | "News"
  | "Internal GEOCHEM"
  | "Other";

export type JobFunctionRecord = {
  id: string;
  functionCode: string;
  name: string;
  description: string | null;
  active: boolean;
};

/** Additive fields on public.contacts. Legacy contact_role and data_confidence stay. */
export type ContactIntelligenceFields = {
  companyLocationId: string | null;
  jobFunctionId: string | null;
  jobTitle: string | null;
  email: string | null;
  phone: string | null;
  linkedinUrl: string | null;
  sourceUrl: string | null;
  sourceName: string | null;
  evidenceType: ContactEvidenceType | null;
  sourceConfidence: ContactSourceConfidence | null;
  verificationStatus: ContactVerificationStatus;
  verifiedAt: string | null;
};

export type ContactServiceRelevance = {
  id: string;
  contactId: string;
  serviceId: string;
  stpScoreId: string | null;
  relevanceScore: number | null;
  buyingRole: ServiceBuyingRole | null;
  relevanceReason: string | null;
};

export const SUGGESTED_JOB_FUNCTION_CODES = [
  "laboratory",
  "quality",
  "inspection",
  "operations",
  "technical_services",
  "procurement",
  "contracts",
  "commercial",
] as const;

export const SERVICE_RELEVANCE_GRAIN =
  "One contact_service_relevance row per (contact_id, service_id). Do not duplicate contacts per service.";
