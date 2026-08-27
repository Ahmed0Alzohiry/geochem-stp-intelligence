-- GEOCHEM STP Intelligence — company import staging (additive).
-- DO NOT apply automatically. Does not insert production companies.
-- Does not alter public.companies rows.

CREATE TABLE IF NOT EXISTS public.company_import_staging (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id text NOT NULL,
  source_row integer NOT NULL,
  raw_name text NOT NULL,
  legal_name text,
  name_ar text,
  alias_name text,
  normalized_name text,
  website text,
  website_domain text,
  commercial_registration_number text,
  industry_name text,
  subsector text,
  customer_type_name text,
  region_name text,
  city text,
  industrial_city text,
  parent_company_name text,
  business_description text,
  main_activities text,
  location_type text,
  location_city text,
  source_url text NOT NULL,
  source_type text NOT NULL,
  source_reliability text NOT NULL,
  source_tier text NOT NULL,
  verification_status text NOT NULL DEFAULT 'Unverified',
  last_verified_at date,
  data_completeness_status text,
  is_demo boolean NOT NULL DEFAULT false,
  researcher_notes text,
  dedup_status text NOT NULL DEFAULT 'UNMATCHED',
  matched_company_id uuid REFERENCES public.companies (id) ON DELETE SET NULL,
  import_decision text NOT NULL DEFAULT 'MANUAL_REVIEW',
  reviewer_notes text,
  reviewed_at timestamptz,
  promoted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT company_import_staging_batch_row_key UNIQUE (batch_id, source_row),
  CONSTRAINT company_import_staging_source_type_check
    CHECK (source_type IN (
      'Official website',
      'Regulator / government',
      'Annual report',
      'Trade directory',
      'News',
      'Internal GEOCHEM',
      'Analyst research',
      'Other'
    )),
  CONSTRAINT company_import_staging_reliability_check
    CHECK (source_reliability IN ('High', 'Medium', 'Low', 'Unknown')),
  CONSTRAINT company_import_staging_tier_check
    CHECK (source_tier IN ('A', 'B', 'C', 'D')),
  CONSTRAINT company_import_staging_verification_check
    CHECK (verification_status IN ('Unverified', 'Partially Verified', 'Verified')),
  CONSTRAINT company_import_staging_completeness_check
    CHECK (
      data_completeness_status IS NULL
      OR data_completeness_status IN ('Draft', 'Incomplete', 'Complete')
    ),
  CONSTRAINT company_import_staging_dedup_check
    CHECK (dedup_status IN (
      'UNMATCHED',
      'CR_MATCH',
      'DOMAIN_MATCH',
      'NAME_MATCH',
      'ALIAS_MATCH',
      'FACILITY_MATCH',
      'AMBIGUOUS'
    )),
  CONSTRAINT company_import_staging_decision_check
    CHECK (import_decision IN (
      'NEW_COMPANY',
      'UPDATE_EXISTING',
      'MANUAL_REVIEW',
      'FACILITY_OF_EXISTING',
      'REJECT'
    ))
);

CREATE INDEX IF NOT EXISTS company_import_staging_batch_id_idx
  ON public.company_import_staging (batch_id);
CREATE INDEX IF NOT EXISTS company_import_staging_decision_idx
  ON public.company_import_staging (import_decision);
CREATE INDEX IF NOT EXISTS company_import_staging_dedup_idx
  ON public.company_import_staging (dedup_status);
CREATE INDEX IF NOT EXISTS company_import_staging_normalized_name_idx
  ON public.company_import_staging (normalized_name);

CREATE TRIGGER trg_company_import_staging_set_updated_at
BEFORE UPDATE ON public.company_import_staging
FOR EACH ROW
EXECUTE PROCEDURE public.set_updated_at();

ALTER TABLE public.company_import_staging ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.company_import_staging IS
  'Raw researched company rows before promotion to public.companies. RLS ENABLED — POLICIES TO BE ADDED IN AUTH STEP. Do not treat DEMO rows as production accounts.';
