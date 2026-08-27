-- GEOCHEM STP Intelligence — initial PostgreSQL / Supabase schema
-- Do not run automatically from the application. Apply via Supabase CLI / dashboard
-- after review. This migration does NOT connect the Next.js app and does NOT
-- seed mock companies, contacts, opportunities, or scores.
--
-- Auth: profiles.id is NOT linked to auth.users yet (Auth step).
-- RLS: enabled on business tables with NO policies.
--       Application access via the anon/authenticated roles will be blocked
--       until policies are added. Do not wire the app to this schema yet.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ---------------------------------------------------------------------------
-- updated_at helper
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- ---------------------------------------------------------------------------
-- 1. profiles (not linked to auth.users in this migration)
-- ---------------------------------------------------------------------------

CREATE TABLE public.profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name text NOT NULL,
  email text NOT NULL UNIQUE,
  role text NOT NULL,
  job_title text,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT profiles_role_check
    CHECK (role IN ('Admin', 'Manager', 'Sales_BD'))
);

CREATE TRIGGER trg_profiles_set_updated_at
BEFORE UPDATE ON public.profiles
FOR EACH ROW
EXECUTE PROCEDURE public.set_updated_at();

-- ---------------------------------------------------------------------------
-- 2–7. Master / reference data
-- ---------------------------------------------------------------------------

CREATE TABLE public.industries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  description text,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.customer_types (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  description text,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.regions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  country text NOT NULL DEFAULT 'Saudi Arabia',
  industrial_cluster text,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT regions_country_name_key UNIQUE (country, name)
);

CREATE TABLE public.departments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  description text,
  active boolean NOT NULL DEFAULT true
);

CREATE TABLE public.services (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  service_code text UNIQUE,
  description text,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.crm_stages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  display_order integer NOT NULL,
  active boolean NOT NULL DEFAULT true,
  CONSTRAINT crm_stages_display_order_positive CHECK (display_order > 0)
);

CREATE UNIQUE INDEX crm_stages_display_order_key ON public.crm_stages (display_order);

-- ---------------------------------------------------------------------------
-- 8. companies
-- ---------------------------------------------------------------------------

CREATE TABLE public.companies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_name text NOT NULL,
  legal_name text,
  industry_id uuid REFERENCES public.industries (id) ON DELETE RESTRICT,
  subsector text,
  customer_type_id uuid REFERENCES public.customer_types (id) ON DELETE RESTRICT,
  country text NOT NULL DEFAULT 'Saudi Arabia',
  region_id uuid REFERENCES public.regions (id) ON DELETE RESTRICT,
  city text,
  website text,
  linkedin_url text,
  main_phone text,
  general_email text,
  company_size text,
  ownership_type text,
  account_status text NOT NULL DEFAULT 'Prospect',
  account_potential text NOT NULL DEFAULT 'Development',
  account_owner_id uuid REFERENCES public.profiles (id) ON DELETE SET NULL,
  crm_stage_id uuid REFERENCES public.crm_stages (id) ON DELETE RESTRICT,
  last_activity_date timestamptz,
  next_action text,
  next_action_date timestamptz,
  notes text,
  data_confidence text NOT NULL DEFAULT 'Unknown',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT companies_account_status_check
    CHECK (account_status IN ('Prospect', 'Current Customer', 'Former Customer', 'Partner')),
  CONSTRAINT companies_account_potential_check
    CHECK (account_potential IN ('Strategic', 'Growth', 'Development', 'Transactional')),
  CONSTRAINT companies_data_confidence_check
    CHECK (data_confidence IN ('Verified', 'Probable', 'Estimated', 'Unknown'))
);

CREATE INDEX companies_company_name_idx ON public.companies (company_name);
CREATE INDEX companies_industry_id_idx ON public.companies (industry_id);
CREATE INDEX companies_customer_type_id_idx ON public.companies (customer_type_id);
CREATE INDEX companies_region_id_idx ON public.companies (region_id);
CREATE INDEX companies_city_idx ON public.companies (city);
CREATE INDEX companies_account_status_idx ON public.companies (account_status);
CREATE INDEX companies_account_potential_idx ON public.companies (account_potential);
CREATE INDEX companies_crm_stage_id_idx ON public.companies (crm_stage_id);
CREATE INDEX companies_account_owner_id_idx ON public.companies (account_owner_id);

CREATE TRIGGER trg_companies_set_updated_at
BEFORE UPDATE ON public.companies
FOR EACH ROW
EXECUTE PROCEDURE public.set_updated_at();

-- ---------------------------------------------------------------------------
-- 9. company_services (ACCOUNT × SERVICE matrix)
-- ---------------------------------------------------------------------------

CREATE TABLE public.company_services (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies (id) ON DELETE CASCADE,
  service_id uuid NOT NULL REFERENCES public.services (id) ON DELETE CASCADE,
  need_level text NOT NULL DEFAULT 'Unknown',
  service_fit_rating integer,
  current_service_status text NOT NULL DEFAULT 'Not Offered',
  current_supplier text,
  estimated_annual_potential numeric(18, 2),
  cross_sell_potential text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT company_services_company_service_key UNIQUE (company_id, service_id),
  CONSTRAINT company_services_need_level_check
    CHECK (need_level IN ('High', 'Medium', 'Low', 'Unknown')),
  CONSTRAINT company_services_fit_rating_check
    CHECK (service_fit_rating IS NULL OR (service_fit_rating BETWEEN 1 AND 5)),
  CONSTRAINT company_services_status_check
    CHECK (current_service_status IN ('Not Offered', 'Prospect', 'Proposal', 'Active', 'Previous')),
  CONSTRAINT company_services_cross_sell_check
    CHECK (cross_sell_potential IS NULL OR cross_sell_potential IN ('High', 'Medium', 'Low'))
);

CREATE INDEX company_services_company_id_idx ON public.company_services (company_id);
CREATE INDEX company_services_service_id_idx ON public.company_services (service_id);
CREATE INDEX company_services_need_level_idx ON public.company_services (need_level);
CREATE INDEX company_services_status_idx ON public.company_services (current_service_status);
CREATE INDEX company_services_cross_sell_idx ON public.company_services (cross_sell_potential);

CREATE TRIGGER trg_company_services_set_updated_at
BEFORE UPDATE ON public.company_services
FOR EACH ROW
EXECUTE PROCEDURE public.set_updated_at();

-- ---------------------------------------------------------------------------
-- 10. contacts
-- ---------------------------------------------------------------------------

CREATE TABLE public.contacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies (id) ON DELETE CASCADE,
  full_name text NOT NULL,
  job_title text,
  department_id uuid REFERENCES public.departments (id) ON DELETE RESTRICT,
  email text,
  phone text,
  linkedin_url text,
  contact_role text,
  relationship_strength text NOT NULL DEFAULT 'None',
  is_primary boolean NOT NULL DEFAULT false,
  notes text,
  data_confidence text NOT NULL DEFAULT 'Unknown',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT contacts_role_check
    CHECK (contact_role IS NULL OR contact_role IN (
      'Decision Maker', 'Influencer', 'Technical', 'Procurement', 'Gatekeeper', 'Other'
    )),
  CONSTRAINT contacts_relationship_check
    CHECK (relationship_strength IN ('Strong', 'Medium', 'Weak', 'None')),
  CONSTRAINT contacts_data_confidence_check
    CHECK (data_confidence IN ('Verified', 'Probable', 'Estimated', 'Unknown'))
);

CREATE INDEX contacts_company_id_idx ON public.contacts (company_id);
CREATE INDEX contacts_department_id_idx ON public.contacts (department_id);
CREATE INDEX contacts_contact_role_idx ON public.contacts (contact_role);
CREATE INDEX contacts_is_primary_idx ON public.contacts (company_id, is_primary);

CREATE TRIGGER trg_contacts_set_updated_at
BEFORE UPDATE ON public.contacts
FOR EACH ROW
EXECUTE PROCEDURE public.set_updated_at();

-- ---------------------------------------------------------------------------
-- 11–12. scoring model
-- ---------------------------------------------------------------------------

CREATE TABLE public.scoring_criteria (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  description text,
  weight numeric(5, 2) NOT NULL,
  active boolean NOT NULL DEFAULT true,
  -- Competitive Intensity uses a FAVORABILITY rating (5 = low pressure).
  -- Keep scoring_direction = 'positive' unless a future model explicitly inverts.
  scoring_direction text NOT NULL DEFAULT 'positive',
  model_version text NOT NULL DEFAULT 'v1',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT scoring_criteria_direction_check
    CHECK (scoring_direction IN ('positive', 'inverse')),
  CONSTRAINT scoring_criteria_weight_check
    CHECK (weight >= 0 AND weight <= 100)
);

CREATE INDEX scoring_criteria_active_idx ON public.scoring_criteria (active);
CREATE INDEX scoring_criteria_model_version_idx ON public.scoring_criteria (model_version);

CREATE TRIGGER trg_scoring_criteria_set_updated_at
BEFORE UPDATE ON public.scoring_criteria
FOR EACH ROW
EXECUTE PROCEDURE public.set_updated_at();

CREATE TABLE public.scoring_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  model_name text NOT NULL,
  model_version text NOT NULL UNIQUE,
  tier1_min numeric(4, 2) NOT NULL,
  tier2_min numeric(4, 2) NOT NULL,
  tier3_min numeric(4, 2) NOT NULL,
  active boolean NOT NULL DEFAULT false,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT scoring_settings_tier_order_check
    CHECK (tier1_min > tier2_min AND tier2_min > tier3_min AND tier3_min >= 0)
);

-- At most one active scoring model at a time.
CREATE UNIQUE INDEX scoring_settings_single_active_idx
  ON public.scoring_settings (active)
  WHERE active;

-- ---------------------------------------------------------------------------
-- 13. company_scores (historical assessments allowed)
-- ---------------------------------------------------------------------------

CREATE TABLE public.company_scores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies (id) ON DELETE CASCADE,
  criterion_id uuid NOT NULL REFERENCES public.scoring_criteria (id) ON DELETE RESTRICT,
  rating integer NOT NULL,
  justification text,
  evidence_source text,
  evidence_url text,
  evidence_date date,
  evidence_quality text NOT NULL DEFAULT 'Unknown',
  assessed_by uuid REFERENCES public.profiles (id) ON DELETE SET NULL,
  assessed_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT company_scores_rating_check CHECK (rating BETWEEN 1 AND 5),
  CONSTRAINT company_scores_evidence_quality_check
    CHECK (evidence_quality IN ('Verified', 'Strong Evidence', 'Strategic Estimate', 'Unknown'))
);

CREATE INDEX company_scores_company_id_idx ON public.company_scores (company_id);
CREATE INDEX company_scores_criterion_id_idx ON public.company_scores (criterion_id);
CREATE INDEX company_scores_assessed_at_idx ON public.company_scores (assessed_at DESC);
CREATE INDEX company_scores_evidence_quality_idx ON public.company_scores (evidence_quality);
CREATE INDEX company_scores_company_criterion_assessed_idx
  ON public.company_scores (company_id, criterion_id, assessed_at DESC);

-- ---------------------------------------------------------------------------
-- 14. company_target_snapshots (frozen weights / ratings / thresholds)
-- ---------------------------------------------------------------------------

CREATE TABLE public.company_target_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies (id) ON DELETE CASCADE,
  score_out_of_5 numeric(4, 2),
  score_out_of_100 numeric(5, 2),
  tier text,
  assessment_status text NOT NULL,
  assessment_date timestamptz NOT NULL DEFAULT now(),
  assessed_by uuid REFERENCES public.profiles (id) ON DELETE SET NULL,
  scoring_model_version text,
  tier_threshold_version text,
  weight_configuration_snapshot jsonb,
  rating_snapshot jsonb,
  change_reason text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT company_target_snapshots_tier_check
    CHECK (tier IS NULL OR tier IN ('Tier 1', 'Tier 2', 'Tier 3', 'Low Priority')),
  CONSTRAINT company_target_snapshots_status_check
    CHECK (assessment_status IN ('complete', 'incomplete', 'invalid'))
);

CREATE INDEX company_target_snapshots_company_id_idx
  ON public.company_target_snapshots (company_id);
CREATE INDEX company_target_snapshots_assessment_date_idx
  ON public.company_target_snapshots (assessment_date DESC);
CREATE INDEX company_target_snapshots_tier_idx
  ON public.company_target_snapshots (tier);
CREATE INDEX company_target_snapshots_latest_idx
  ON public.company_target_snapshots (company_id, assessment_date DESC, created_at DESC);

-- ---------------------------------------------------------------------------
-- 15. opportunities
-- ---------------------------------------------------------------------------

CREATE TABLE public.opportunities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies (id) ON DELETE CASCADE,
  service_id uuid REFERENCES public.services (id) ON DELETE RESTRICT,
  contact_id uuid REFERENCES public.contacts (id) ON DELETE SET NULL,
  owner_id uuid REFERENCES public.profiles (id) ON DELETE SET NULL,
  opportunity_name text NOT NULL,
  stage_id uuid REFERENCES public.crm_stages (id) ON DELETE RESTRICT,
  estimated_value numeric(18, 2),
  currency text NOT NULL DEFAULT 'SAR',
  probability numeric(5, 2),
  expected_close_date date,
  source text,
  description text,
  lost_reason text,
  is_demo boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT opportunities_probability_check
    CHECK (probability IS NULL OR (probability >= 0 AND probability <= 100))
);

CREATE INDEX opportunities_company_id_idx ON public.opportunities (company_id);
CREATE INDEX opportunities_service_id_idx ON public.opportunities (service_id);
CREATE INDEX opportunities_stage_id_idx ON public.opportunities (stage_id);
CREATE INDEX opportunities_owner_id_idx ON public.opportunities (owner_id);
CREATE INDEX opportunities_expected_close_date_idx ON public.opportunities (expected_close_date);
CREATE INDEX opportunities_is_demo_idx ON public.opportunities (is_demo);

CREATE TRIGGER trg_opportunities_set_updated_at
BEFORE UPDATE ON public.opportunities
FOR EACH ROW
EXECUTE PROCEDURE public.set_updated_at();

-- ---------------------------------------------------------------------------
-- 16. activities
-- ---------------------------------------------------------------------------

CREATE TABLE public.activities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies (id) ON DELETE CASCADE,
  contact_id uuid REFERENCES public.contacts (id) ON DELETE SET NULL,
  opportunity_id uuid REFERENCES public.opportunities (id) ON DELETE SET NULL,
  owner_id uuid REFERENCES public.profiles (id) ON DELETE SET NULL,
  activity_type text NOT NULL,
  subject text,
  description text,
  activity_date timestamptz NOT NULL DEFAULT now(),
  next_action text,
  next_action_date timestamptz,
  is_demo boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT activities_type_check
    CHECK (activity_type IN (
      'Call', 'Email', 'Meeting', 'Site Visit', 'Proposal', 'Follow-up', 'Other'
    ))
);

CREATE INDEX activities_company_id_idx ON public.activities (company_id);
CREATE INDEX activities_contact_id_idx ON public.activities (contact_id);
CREATE INDEX activities_opportunity_id_idx ON public.activities (opportunity_id);
CREATE INDEX activities_owner_id_idx ON public.activities (owner_id);
CREATE INDEX activities_activity_date_idx ON public.activities (activity_date DESC);
CREATE INDEX activities_next_action_date_idx ON public.activities (next_action_date);

-- ---------------------------------------------------------------------------
-- 20. views
-- ---------------------------------------------------------------------------

CREATE OR REPLACE VIEW public.company_target_latest AS
SELECT DISTINCT ON (s.company_id)
  s.id,
  s.company_id,
  s.score_out_of_5,
  s.score_out_of_100,
  s.tier,
  s.assessment_status,
  s.assessment_date,
  s.assessed_by,
  s.scoring_model_version,
  s.tier_threshold_version,
  s.weight_configuration_snapshot,
  s.rating_snapshot,
  s.change_reason,
  s.notes,
  s.created_at
FROM public.company_target_snapshots s
WHERE s.assessment_status = 'complete'
ORDER BY s.company_id, s.assessment_date DESC, s.created_at DESC;

COMMENT ON VIEW public.company_target_latest IS
  'Latest complete targeting snapshot per company. Historical scores stay in company_target_snapshots.';

CREATE OR REPLACE VIEW public.company_pipeline_summary AS
SELECT
  c.id AS company_id,
  c.company_name,
  count(o.id) AS opportunity_count,
  count(o.id) FILTER (WHERE o.is_demo = false) AS non_demo_opportunity_count,
  coalesce(sum(o.estimated_value), 0) AS estimated_pipeline_value,
  coalesce(sum(o.estimated_value) FILTER (WHERE o.is_demo = false), 0) AS non_demo_pipeline_value
FROM public.companies c
LEFT JOIN public.opportunities o ON o.company_id = c.id
GROUP BY c.id, c.company_name;

COMMENT ON VIEW public.company_pipeline_summary IS
  'Opportunity counts and estimated values by company. Prefer non_demo_* columns for production reporting.';

-- ---------------------------------------------------------------------------
-- 21. RLS preparation (no policies yet)
-- RLS ENABLED — POLICIES TO BE ADDED IN AUTH STEP.
-- Until then, anon/authenticated clients cannot read or write these tables.
-- ---------------------------------------------------------------------------

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.industries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customer_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.regions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.departments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.services ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crm_stages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.companies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.company_services ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.scoring_criteria ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.scoring_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.company_scores ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.company_target_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.opportunities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.activities ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.profiles IS 'RLS ENABLED — POLICIES TO BE ADDED IN AUTH STEP. Not linked to auth.users yet.';
COMMENT ON TABLE public.companies IS 'RLS ENABLED — POLICIES TO BE ADDED IN AUTH STEP.';
COMMENT ON TABLE public.company_services IS 'RLS ENABLED — POLICIES TO BE ADDED IN AUTH STEP.';
COMMENT ON TABLE public.contacts IS 'RLS ENABLED — POLICIES TO BE ADDED IN AUTH STEP.';
COMMENT ON TABLE public.company_scores IS 'RLS ENABLED — POLICIES TO BE ADDED IN AUTH STEP. Multiple historical rows per company+criterion are allowed.';
COMMENT ON TABLE public.company_target_snapshots IS 'RLS ENABLED — POLICIES TO BE ADDED IN AUTH STEP. Freeze weights and ratings at assessment time.';
COMMENT ON TABLE public.opportunities IS 'RLS ENABLED — POLICIES TO BE ADDED IN AUTH STEP. is_demo marks non-production pipeline rows.';
COMMENT ON TABLE public.activities IS 'RLS ENABLED — POLICIES TO BE ADDED IN AUTH STEP.';
COMMENT ON TABLE public.scoring_criteria IS 'Canonical targeting weights. Competitive Intensity is a favorability rating (do not auto-invert).';
COMMENT ON TABLE public.scoring_settings IS 'Canonical tier thresholds. Only one row should be active.';
