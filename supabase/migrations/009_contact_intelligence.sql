-- GEOCHEM STP Intelligence — STEP 7.2 Contact Intelligence schema (design).
-- Additive only. DO NOT apply automatically from the app.
-- Review, then apply via Supabase SQL editor / CLI in a later step.
--
-- Does NOT alter STP scores, companies source fields, or company_locations rows.
-- Does NOT insert contacts or people.
-- Does NOT rename or drop contacts.contact_role / contacts.data_confidence.
-- Does NOT grant INSERT/UPDATE (contact writes stay blocked until a persist step).
--
-- Grain:
--   contacts: one person per company (optional site).
--   contact_service_relevance: one row per (contact_id, service_id) — do not clone people per service.

CREATE TABLE IF NOT EXISTS public.job_functions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  function_code text NOT NULL UNIQUE,
  name text NOT NULL UNIQUE,
  description text,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.job_functions IS
  'Normalized job functions (e.g. laboratory, quality, procurement). Catalog only. STEP 7.2 does not seed values or invent people.';

ALTER TABLE public.contacts
  ADD COLUMN IF NOT EXISTS company_location_id uuid REFERENCES public.company_locations (id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS job_function_id uuid REFERENCES public.job_functions (id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS source_url text,
  ADD COLUMN IF NOT EXISTS source_name text,
  ADD COLUMN IF NOT EXISTS evidence_type text,
  ADD COLUMN IF NOT EXISTS source_confidence text,
  ADD COLUMN IF NOT EXISTS verification_status text NOT NULL DEFAULT 'Unverified',
  ADD COLUMN IF NOT EXISTS verified_at timestamptz;

ALTER TABLE public.contacts
  DROP CONSTRAINT IF EXISTS contacts_evidence_type_check;
ALTER TABLE public.contacts
  ADD CONSTRAINT contacts_evidence_type_check
  CHECK (
    evidence_type IS NULL OR evidence_type IN (
      'Official website',
      'Company directory',
      'Regulator / government',
      'LinkedIn',
      'Trade directory',
      'News',
      'Internal GEOCHEM',
      'Other'
    )
  );

ALTER TABLE public.contacts
  DROP CONSTRAINT IF EXISTS contacts_source_confidence_check;
ALTER TABLE public.contacts
  ADD CONSTRAINT contacts_source_confidence_check
  CHECK (source_confidence IS NULL OR source_confidence IN ('HIGH', 'MEDIUM', 'LOW'));

ALTER TABLE public.contacts
  DROP CONSTRAINT IF EXISTS contacts_verification_status_check;
ALTER TABLE public.contacts
  ADD CONSTRAINT contacts_verification_status_check
  CHECK (verification_status IN ('Unverified', 'Partially Verified', 'Verified'));

ALTER TABLE public.contacts
  DROP CONSTRAINT IF EXISTS contacts_evidence_required_check;
ALTER TABLE public.contacts
  ADD CONSTRAINT contacts_evidence_required_check
  CHECK (
    (
      source_url IS NULL
      AND source_name IS NULL
      AND evidence_type IS NULL
      AND source_confidence IS NULL
      AND verified_at IS NULL
    )
    OR (
      source_url IS NOT NULL
      AND source_name IS NOT NULL
      AND evidence_type IS NOT NULL
      AND source_confidence IS NOT NULL
    )
  );

COMMENT ON COLUMN public.contacts.company_location_id IS
  'Optional facility/site. Must belong to the same company_id (enforced by trigger).';
COMMENT ON COLUMN public.contacts.job_function_id IS
  'Normalized function. Distinct from free-text job_title and from contact_role (buying-center).';
COMMENT ON COLUMN public.contacts.source_confidence IS
  'HIGH/MEDIUM/LOW for sourced rows. Distinct from legacy contacts.data_confidence (Verified/Probable/Estimated/Unknown).';
COMMENT ON COLUMN public.contacts.contact_role IS
  'Company-level buying-center role (legacy CHECK). Service-specific role lives on contact_service_relevance.buying_role.';

CREATE INDEX IF NOT EXISTS contacts_company_location_id_idx ON public.contacts (company_location_id);
CREATE INDEX IF NOT EXISTS contacts_job_function_id_idx ON public.contacts (job_function_id);
CREATE INDEX IF NOT EXISTS contacts_verification_status_idx ON public.contacts (verification_status);
CREATE INDEX IF NOT EXISTS contacts_source_url_idx ON public.contacts (source_url);

CREATE UNIQUE INDEX IF NOT EXISTS contacts_company_email_uidx
  ON public.contacts (company_id, lower(email))
  WHERE email IS NOT NULL AND btrim(email) <> '';

CREATE UNIQUE INDEX IF NOT EXISTS contacts_company_linkedin_uidx
  ON public.contacts (company_id, lower(linkedin_url))
  WHERE linkedin_url IS NOT NULL AND btrim(linkedin_url) <> '';

CREATE OR REPLACE FUNCTION public.contacts_location_company_match()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.company_location_id IS NULL THEN
    RETURN NEW;
  END IF;
  IF NOT EXISTS (
    SELECT 1
    FROM public.company_locations loc
    WHERE loc.id = NEW.company_location_id
      AND loc.company_id = NEW.company_id
  ) THEN
    RAISE EXCEPTION 'contacts.company_location_id must reference a location of contacts.company_id';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_contacts_location_company_match ON public.contacts;
CREATE TRIGGER trg_contacts_location_company_match
BEFORE INSERT OR UPDATE OF company_id, company_location_id ON public.contacts
FOR EACH ROW
EXECUTE PROCEDURE public.contacts_location_company_match();

CREATE TABLE IF NOT EXISTS public.contact_service_relevance (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id uuid NOT NULL REFERENCES public.contacts (id) ON DELETE CASCADE,
  service_id uuid NOT NULL REFERENCES public.services (id) ON DELETE RESTRICT,
  stp_score_id uuid REFERENCES public.company_service_stp_scores (id) ON DELETE SET NULL,
  relevance_score numeric(5, 2),
  buying_role text,
  relevance_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT contact_service_relevance_contact_service_key UNIQUE (contact_id, service_id),
  CONSTRAINT contact_service_relevance_score_check
    CHECK (relevance_score IS NULL OR (relevance_score >= 0 AND relevance_score <= 100)),
  CONSTRAINT contact_service_relevance_buying_role_check
    CHECK (
      buying_role IS NULL OR buying_role IN (
        'DECISION_MAKER',
        'INFLUENCER',
        'TECHNICAL',
        'PROCUREMENT',
        'GATEKEEPER',
        'USER'
      )
    )
);

CREATE INDEX IF NOT EXISTS contact_service_relevance_service_id_idx
  ON public.contact_service_relevance (service_id);
CREATE INDEX IF NOT EXISTS contact_service_relevance_stp_score_id_idx
  ON public.contact_service_relevance (stp_score_id);
CREATE INDEX IF NOT EXISTS contact_service_relevance_buying_role_idx
  ON public.contact_service_relevance (buying_role);

CREATE TRIGGER trg_contact_service_relevance_set_updated_at
BEFORE UPDATE ON public.contact_service_relevance
FOR EACH ROW
EXECUTE PROCEDURE public.set_updated_at();

COMMENT ON TABLE public.contact_service_relevance IS
  'Service relevance for a person. One contact can be relevant to PCH and PET without two people rows. Optional stp_score_id points at a persisted STP row for that company×service.';

CREATE OR REPLACE FUNCTION public.contact_service_relevance_stp_match()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  contact_company uuid;
  score_company uuid;
  score_service uuid;
BEGIN
  IF NEW.stp_score_id IS NULL THEN
    RETURN NEW;
  END IF;
  SELECT c.company_id INTO contact_company FROM public.contacts c WHERE c.id = NEW.contact_id;
  SELECT s.company_id, s.service_id INTO score_company, score_service
  FROM public.company_service_stp_scores s
  WHERE s.id = NEW.stp_score_id;
  IF score_company IS NULL THEN
    RAISE EXCEPTION 'contact_service_relevance.stp_score_id not found';
  END IF;
  IF score_company <> contact_company THEN
    RAISE EXCEPTION 'stp_score_id company must match contact.company_id';
  END IF;
  IF score_service <> NEW.service_id THEN
    RAISE EXCEPTION 'stp_score_id service must match contact_service_relevance.service_id';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_contact_service_relevance_stp_match ON public.contact_service_relevance;
CREATE TRIGGER trg_contact_service_relevance_stp_match
BEFORE INSERT OR UPDATE OF contact_id, service_id, stp_score_id ON public.contact_service_relevance
FOR EACH ROW
EXECUTE PROCEDURE public.contact_service_relevance_stp_match();

ALTER TABLE public.job_functions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contact_service_relevance ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS job_functions_select_anon ON public.job_functions;
CREATE POLICY job_functions_select_anon
  ON public.job_functions
  FOR SELECT
  TO anon, authenticated
  USING (true);

DROP POLICY IF EXISTS contact_service_relevance_select_anon ON public.contact_service_relevance;
CREATE POLICY contact_service_relevance_select_anon
  ON public.contact_service_relevance
  FOR SELECT
  TO anon, authenticated
  USING (true);

DROP POLICY IF EXISTS contacts_select_anon ON public.contacts;
CREATE POLICY contacts_select_anon
  ON public.contacts
  FOR SELECT
  TO anon, authenticated
  USING (true);

GRANT SELECT ON public.job_functions TO anon, authenticated;
GRANT SELECT ON public.job_functions TO authenticator;
GRANT SELECT ON public.contact_service_relevance TO anon, authenticated;
GRANT SELECT ON public.contact_service_relevance TO authenticator;
GRANT SELECT ON public.contacts TO anon, authenticated;
GRANT SELECT ON public.contacts TO authenticator;
