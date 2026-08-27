-- GEOCHEM STP Intelligence — STEP 5.19A
-- Creates ONLY the missing public.company_locations base table (migration 003 design).
-- Does NOT rerun migration 003.
-- Does NOT alter public.companies or insert location rows.
-- Does NOT drop anything.
-- Apply in the SQL editor, then run 006_company_locations_verified_enrichment.sql.
-- Do not apply automatically from the app.

-- Required parents (live project already has these; IF NOT EXISTS / CREATE OR REPLACE are no-ops if present).
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TABLE IF NOT EXISTS public.regions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  country text NOT NULL DEFAULT 'Saudi Arabia',
  industrial_cluster text,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT regions_country_name_key UNIQUE (country, name)
);

DO $$
BEGIN
  IF to_regclass('public.companies') IS NULL THEN
    RAISE EXCEPTION 'public.companies does not exist; cannot create public.company_locations';
  END IF;
  IF to_regclass('public.regions') IS NULL THEN
    RAISE EXCEPTION 'public.regions does not exist; cannot create public.company_locations';
  END IF;
END
$$;

-- ---------------------------------------------------------------------------
-- company_locations — HQ plus operating sites / industrial cities
-- (verbatim base design from 003_company_intelligence_schema.sql)
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

DROP TRIGGER IF EXISTS trg_company_locations_set_updated_at ON public.company_locations;
CREATE TRIGGER trg_company_locations_set_updated_at
BEFORE UPDATE ON public.company_locations
FOR EACH ROW
EXECUTE PROCEDURE public.set_updated_at();

COMMENT ON TABLE public.company_locations IS
  'Multiple Saudi sites per company (Yanbu, Jubail, Ras Tanura, etc.). companies.city remains HQ city. RLS ENABLED — POLICIES TO BE ADDED IN AUTH STEP.';

ALTER TABLE public.company_locations ENABLE ROW LEVEL SECURITY;
