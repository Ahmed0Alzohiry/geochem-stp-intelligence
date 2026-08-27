/**
 * Canonical domain model for the future Supabase schema.
 * UI view-model types remain in `src/types/index.ts` so the current frontend
 * does not break.
 */

export type {
  AccountPotential,
  CustomerType,
  Industry,
  Region,
} from "@/types/segmentation";

export type {
  Company,
  AccountStatus,
  OwnershipType,
} from "@/types/company";

export type {
  CompanyService,
  CrossSellPotential,
  CurrentServiceStatus,
  NeedLevel,
  Service,
  ServiceFitRating,
} from "@/types/service";

export type {
  Contact,
  ContactRole,
  Department,
  RelationshipStrength,
} from "@/types/contact";

export type {
  ContactEvidenceType,
  ContactIntelligenceFields,
  ContactServiceRelevance,
  ContactSourceConfidence,
  ContactVerificationStatus,
  JobFunctionRecord,
  ServiceBuyingRole,
} from "@/types/contact-intelligence";

export type {
  AssessmentSource,
  AssessmentStatus,
  CompanyScore,
  CompanyTargetSnapshot,
  CriterionRating,
  CriterionRatingChange,
  DataConfidence,
  EvidenceQuality,
  RatingSnapshotItem,
  ScoringCriterion,
  ScoringIssue,
  ScoringSettings,
  SnapshotComparison,
  TargetScoreResult,
  TargetTier,
  TierThresholdSnapshot,
  TierThresholds,
  WeightConfigurationSnapshot,
} from "@/types/targeting";

export type {
  Activity,
  ActivityType,
  CrmStage,
  Opportunity,
} from "@/types/crm";

export type { Profile, UserRole } from "@/types/user";
