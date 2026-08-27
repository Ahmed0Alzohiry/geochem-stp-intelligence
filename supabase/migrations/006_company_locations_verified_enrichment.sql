-- GEOCHEM STP Intelligence — STEP 5.19 verified facility locations (additive).
-- public.company_locations already exists (migration 003). This does NOT create a second table.
-- Does NOT alter public.companies (including companies.city).
-- Does NOT insert location rows. Apply schema only; persist is a later step.

ALTER TABLE public.company_locations
  ADD COLUMN IF NOT EXISTS region text,
  ADD COLUMN IF NOT EXISTS country text NOT NULL DEFAULT 'Saudi Arabia',
  ADD COLUMN IF NOT EXISTS confidence text,
  ADD COLUMN IF NOT EXISTS evidence_type text,
  ADD COLUMN IF NOT EXISTS source_url text,
  ADD COLUMN IF NOT EXISTS source_name text,
  ADD COLUMN IF NOT EXISTS verified_at timestamptz;

ALTER TABLE public.company_locations
  DROP CONSTRAINT IF EXISTS company_locations_confidence_check;
ALTER TABLE public.company_locations
  ADD CONSTRAINT company_locations_confidence_check
  CHECK (confidence IS NULL OR confidence IN ('HIGH', 'MEDIUM', 'LOW'));

ALTER TABLE public.company_locations
  DROP CONSTRAINT IF EXISTS company_locations_evidence_required_check;
ALTER TABLE public.company_locations
  ADD CONSTRAINT company_locations_evidence_required_check
  CHECK (
    (
      source_url IS NULL
      AND confidence IS NULL
      AND evidence_type IS NULL
      AND source_name IS NULL
      AND verified_at IS NULL
    )
    OR (
      source_url IS NOT NULL
      AND confidence IS NOT NULL
      AND evidence_type IS NOT NULL
      AND source_name IS NOT NULL
    )
  );

CREATE INDEX IF NOT EXISTS company_locations_confidence_idx
  ON public.company_locations (confidence);
CREATE INDEX IF NOT EXISTS company_locations_source_url_idx
  ON public.company_locations (source_url);

COMMENT ON COLUMN public.company_locations.region IS
  'Human-readable Saudi region (e.g. Western Region). Additive; does not overwrite companies.city.';
COMMENT ON COLUMN public.company_locations.confidence IS
  'HIGH/MEDIUM/LOW for verified enrichment rows. NULL only for legacy/unverified rows.';
COMMENT ON COLUMN public.company_locations.source_url IS
  'Required for any verified enrichment row. Name-only geography must not be persisted.';
COMMENT ON TABLE public.company_locations IS
  'Typed Saudi sites. Additive to companies; never overwrite imported companies.city. Verified rows require source_url, confidence, and evidence_type.';

ALTER TABLE public.company_locations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS company_locations_select_anon ON public.company_locations;
CREATE POLICY company_locations_select_anon
  ON public.company_locations
  FOR SELECT
  TO anon, authenticated
  USING (true);

DROP POLICY IF EXISTS company_locations_insert_anon ON public.company_locations;
CREATE POLICY company_locations_insert_anon
  ON public.company_locations
  FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

DROP POLICY IF EXISTS company_locations_update_anon ON public.company_locations;
CREATE POLICY company_locations_update_anon
  ON public.company_locations
  FOR UPDATE
  TO anon, authenticated
  USING (true)
  WITH CHECK (true);

GRANT SELECT, INSERT, UPDATE ON public.company_locations TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.company_locations TO authenticator;

NOTIFY pgrst, 'reload schema';
