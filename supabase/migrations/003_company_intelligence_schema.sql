-- GEOCHEM STP Intelligence — company intelligence schema (additive).
-- DO NOT apply automatically. Review, then apply via Supabase CLI/SQL editor.
-- Does not drop, rename, or rewrite existing companies columns.
-- Does not insert companies, contacts, opportunities, or scores.

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.normalize_company_name(input text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN input IS NULL OR btrim(input) = '' THEN NULL
    ELSE regexp_replace(lower(btrim(input)), '[^[:alnum:]]+', '', 'g')
  END;
$$;

-- ---------------------------------------------------------------------------
-- Additive columns on companies
-- ---------------------------------------------------------------------------

ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS name_ar text,
  ADD COLUMN IF NOT EXISTS company_status text NOT NULL DEFAULT 'Active',
  ADD COLUMN IF NOT EXISTS industrial_city text,
  ADD COLUMN IF NOT EXISTS employee_size_band text,
  ADD COLUMN IF NOT EXISTS is_existing_geochem_customer text NOT NULL DEFAULT 'Unknown',
  ADD COLUMN IF NOT EXISTS estimated_commercial_potential numeric(18, 2),
  ADD COLUMN IF NOT EXISTS is_strategic_account boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS parent_company_id uuid REFERENCES public.companies (id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS parent_company_name text,
  ADD COLUMN IF NOT EXISTS is_subsidiary boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS business_description text,
  ADD COLUMN IF NOT EXISTS main_activities text,
  ADD COLUMN IF NOT EXISTS major_facilities text,
  ADD COLUMN IF NOT EXISTS verification_status text NOT NULL DEFAULT 'Unverified',
  ADD COLUMN IF NOT EXISTS last_verified_at timestamptz,
  ADD COLUMN IF NOT EXISTS data_completeness_status text NOT NULL DEFAULT 'Incomplete',
  ADD COLUMN IF NOT EXISTS created_by uuid REFERENCES public.profiles (id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS normalized_name text,
  ADD COLUMN IF NOT EXISTS website_domain text,
  ADD COLUMN IF NOT EXISTS commercial_registration_number text;

ALTER TABLE public.companies
  DROP CONSTRAINT IF EXISTS companies_company_status_check,
  DROP CONSTRAINT IF EXISTS companies_existing_customer_check,
  DROP CONSTRAINT IF EXISTS companies_verification_status_check,
  DROP CONSTRAINT IF EXISTS companies_completeness_status_check,
  DROP CONSTRAINT IF EXISTS companies_employee_size_band_check;

ALTER TABLE public.companies
  ADD CONSTRAINT companies_company_status_check
    CHECK (company_status IN ('Active', 'Inactive', 'Unknown')),
  ADD CONSTRAINT companies_existing_customer_check
    CHECK (is_existing_geochem_customer IN ('Yes', 'No', 'Unknown')),
  ADD CONSTRAINT companies_verification_status_check
    CHECK (verification_status IN ('Unverified', 'Partially Verified', 'Verified')),
  ADD CONSTRAINT companies_completeness_status_check
    CHECK (data_completeness_status IN ('Draft', 'Incomplete', 'Complete')),
  ADD CONSTRAINT companies_employee_size_band_check
    CHECK (
      employee_size_band IS NULL OR employee_size_band IN (
        '1-50', '51-200', '201-500', '501-1000', '1001-5000', '5000+', 'Unknown'
      )
    );

COMMENT ON COLUMN public.companies.company_name IS 'Trading / common name used in GEOCHEM targeting.';
COMMENT ON COLUMN public.companies.legal_name IS 'Registered legal name when known.';
COMMENT ON COLUMN public.companies.city IS 'Headquarters city. Operating sites live in company_locations.';
COMMENT ON COLUMN public.companies.account_status IS 'CRM relationship status, not legal company_status.';
COMMENT ON COLUMN public.companies.data_confidence IS 'Judgment confidence for commercial fields. Distinct from verification_status.';
COMMENT ON COLUMN public.companies.verification_status IS 'Provenance: Unverified / Partially Verified / Verified. Never mark Verified without a source.';

CREATE OR REPLACE FUNCTION public.set_company_identity_keys()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.normalized_name := public.normalize_company_name(
    COALESCE(NULLIF(btrim(NEW.legal_name), ''), NEW.company_name)
  );
  IF NEW.website IS NULL OR btrim(NEW.website) = '' THEN
    NEW.website_domain := NULL;
  ELSE
    NEW.website_domain := regexp_replace(
      lower(btrim(NEW.website)),
      '^https?://(www\.)?',
      ''
    );
    NEW.website_domain := regexp_replace(NEW.website_domain, '[/#?].*$', '');
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_companies_set_identity_keys ON public.companies;
CREATE TRIGGER trg_companies_set_identity_keys
BEFORE INSERT OR UPDATE OF company_name, legal_name, website
ON public.companies
FOR EACH ROW
EXECUTE PROCEDURE public.set_company_identity_keys();

CREATE UNIQUE INDEX IF NOT EXISTS companies_cr_number_key
  ON public.companies (commercial_registration_number)
  WHERE commercial_registration_number IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS companies_website_domain_key
  ON public.companies (website_domain)
  WHERE website_domain IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS companies_normalized_name_key
  ON public.companies (normalized_name)
  WHERE normalized_name IS NOT NULL;

CREATE INDEX IF NOT EXISTS companies_industrial_city_idx ON public.companies (industrial_city);
CREATE INDEX IF NOT EXISTS companies_verification_status_idx ON public.companies (verification_status);
CREATE INDEX IF NOT EXISTS companies_strategic_idx ON public.companies (is_strategic_account);
CREATE INDEX IF NOT EXISTS companies_parent_company_id_idx ON public.companies (parent_company_id);
CREATE INDEX IF NOT EXISTS companies_existing_customer_idx ON public.companies (is_existing_geochem_customer);
CREATE INDEX IF NOT EXISTS companies_company_status_idx ON public.companies (company_status);

-- ---------------------------------------------------------------------------
-- company_aliases — alternate names pointing at one canonical company
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.company_aliases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies (id) ON DELETE CASCADE,
  alias_name text NOT NULL,
  normalized_alias text NOT NULL,
  alias_type text NOT NULL DEFAULT 'Trading',
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT company_aliases_type_check
    CHECK (alias_type IN ('Legal', 'Trading', 'Arabic', 'Abbreviation', 'Former', 'Facility')),
  CONSTRAINT company_aliases_company_alias_key UNIQUE (company_id, normalized_alias)
);

CREATE UNIQUE INDEX IF NOT EXISTS company_aliases_normalized_alias_key
  ON public.company_aliases (normalized_alias);

CREATE INDEX IF NOT EXISTS company_aliases_company_id_idx
  ON public.company_aliases (company_id);

CREATE OR REPLACE FUNCTION public.set_company_alias_key()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.normalized_alias := public.normalize_company_name(NEW.alias_name);
  IF NEW.normalized_alias IS NULL THEN
    RAISE EXCEPTION 'Company alias cannot be empty.';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_company_aliases_set_key ON public.company_aliases;
CREATE TRIGGER trg_company_aliases_set_key
BEFORE INSERT OR UPDATE OF alias_name
ON public.company_aliases
FOR EACH ROW
EXECUTE PROCEDURE public.set_company_alias_key();

COMMENT ON TABLE public.company_aliases IS
  'Alternate names (e.g. Aramco vs Saudi Arabian Oil Company). Global unique normalized_alias prevents two companies claiming the same alias. RLS ENABLED — POLICIES TO BE ADDED IN AUTH STEP.';

-- ---------------------------------------------------------------------------
-- company_locations — HQ plus operating sites / industrial cities
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.company_locations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies (id) ON DELETE CASCADE,
  location_type text NOT NULL DEFAULT 'Operating site',
  city text NOT NULL,
  region_id uuid REFERENCES public.regions (id) ON DELETE RESTRICT,
  industrial_city text,
  industrial_cluster text,
  is_headquarters boolean NOT NULL DEFAULT false,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT company_locations_type_check
    CHECK (location_type IN ('Headquarters', 'Operating site', 'Industrial city', 'Project site', 'Other'))
);

CREATE INDEX IF NOT EXISTS company_locations_company_id_idx ON public.company_locations (company_id);
CREATE INDEX IF NOT EXISTS company_locations_city_idx ON public.company_locations (city);
CREATE INDEX IF NOT EXISTS company_locations_region_id_idx ON public.company_locations (region_id);
CREATE INDEX IF NOT EXISTS company_locations_industrial_city_idx ON public.company_locations (industrial_city);

CREATE TRIGGER trg_company_locations_set_updated_at
BEFORE UPDATE ON public.company_locations
FOR EACH ROW
EXECUTE PROCEDURE public.set_updated_at();

COMMENT ON TABLE public.company_locations IS
  'Multiple Saudi sites per company (Yanbu, Jubail, Ras Tanura, etc.). companies.city remains HQ city. RLS ENABLED — POLICIES TO BE ADDED IN AUTH STEP.';

-- ---------------------------------------------------------------------------
-- company_sources — provenance; required before verification_status = Verified
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.company_sources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies (id) ON DELETE CASCADE,
  source_url text,
  source_type text NOT NULL DEFAULT 'Other',
  source_reliability text NOT NULL DEFAULT 'Unknown',
  source_title text,
  captured_at timestamptz NOT NULL DEFAULT now(),
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT company_sources_type_check
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
  CONSTRAINT company_sources_reliability_check
    CHECK (source_reliability IN ('High', 'Medium', 'Low', 'Unknown'))
);

CREATE INDEX IF NOT EXISTS company_sources_company_id_idx ON public.company_sources (company_id);
CREATE INDEX IF NOT EXISTS company_sources_type_idx ON public.company_sources (source_type);

COMMENT ON TABLE public.company_sources IS
  'Evidence for market-intelligence fields. A company must not be Verified without at least one High or Medium reliability source. RLS ENABLED — POLICIES TO BE ADDED IN AUTH STEP.';

-- Potential GEOCHEM services remain in existing public.company_services.

-- ---------------------------------------------------------------------------
-- RLS preparation (no policies — Auth step). Do not connect the app to these tables yet.
-- RLS ENABLED — POLICIES TO BE ADDED IN AUTH STEP.
-- ---------------------------------------------------------------------------

ALTER TABLE public.company_aliases ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.company_locations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.company_sources ENABLE ROW LEVEL SECURITY;
