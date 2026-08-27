-- GEOCHEM STP Intelligence — FAST-3A CRM opportunity pipeline.
-- Additive only. Reuses public.opportunities and public.crm_stages.
-- DO NOT apply automatically from the app.
-- Review, then apply via Supabase SQL Editor.
--
-- Does NOT insert opportunities.
-- Does NOT modify companies, contacts, company_locations, or STP scores.

ALTER TABLE public.crm_stages
  ADD COLUMN IF NOT EXISTS default_probability numeric(5, 2);

UPDATE public.crm_stages SET name = 'Lead' WHERE name = 'Prospect';

UPDATE public.crm_stages SET display_order = display_order + 100;

UPDATE public.crm_stages SET display_order = 1, default_probability = 10, active = true WHERE name = 'Lead';
UPDATE public.crm_stages SET display_order = 2, default_probability = 20, active = true WHERE name = 'Qualified';
UPDATE public.crm_stages SET display_order = 3, default_probability = 30, active = true WHERE name = 'Contacted';
UPDATE public.crm_stages SET display_order = 4, default_probability = 40, active = true WHERE name = 'Meeting';
UPDATE public.crm_stages SET display_order = 5, default_probability = 60, active = true WHERE name = 'Proposal';
UPDATE public.crm_stages SET display_order = 6, default_probability = 80, active = true WHERE name = 'Negotiation';
UPDATE public.crm_stages SET display_order = 7, default_probability = 100, active = true WHERE name = 'Won';
UPDATE public.crm_stages SET display_order = 8, default_probability = 0, active = true WHERE name = 'Lost';

ALTER TABLE public.crm_stages
  ALTER COLUMN default_probability SET NOT NULL;

ALTER TABLE public.crm_stages
  DROP CONSTRAINT IF EXISTS crm_stages_default_probability_check;
ALTER TABLE public.crm_stages
  ADD CONSTRAINT crm_stages_default_probability_check
  CHECK (default_probability >= 0 AND default_probability <= 100);

ALTER TABLE public.opportunities
  ADD COLUMN IF NOT EXISTS status text;
ALTER TABLE public.opportunities
  ADD COLUMN IF NOT EXISTS notes text;
ALTER TABLE public.opportunities
  ADD COLUMN IF NOT EXISTS owner text;

UPDATE public.opportunities SET status = 'Open' WHERE status IS NULL;

ALTER TABLE public.opportunities
  ALTER COLUMN status SET DEFAULT 'Open';
ALTER TABLE public.opportunities
  ALTER COLUMN status SET NOT NULL;

ALTER TABLE public.opportunities
  DROP CONSTRAINT IF EXISTS opportunities_status_check;
ALTER TABLE public.opportunities
  ADD CONSTRAINT opportunities_status_check
  CHECK (status IN ('Open', 'Won', 'Lost'));

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'opportunities'
      AND column_name = 'weighted_value'
  ) THEN
    ALTER TABLE public.opportunities
      ADD COLUMN weighted_value numeric(18, 2)
      GENERATED ALWAYS AS (
        round((COALESCE(estimated_value, 0) * COALESCE(probability, 0)) / 100.0, 2)
      ) STORED;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS opportunities_status_idx ON public.opportunities (status);
CREATE INDEX IF NOT EXISTS opportunities_owner_idx ON public.opportunities (owner);

CREATE OR REPLACE FUNCTION public.opportunities_apply_stage_defaults()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  stage_name text;
  stage_prob numeric;
BEGIN
  IF NEW.company_id IS NULL THEN
    RAISE EXCEPTION 'company_id is required';
  END IF;
  IF NEW.service_id IS NULL THEN
    RAISE EXCEPTION 'service_id is required';
  END IF;
  IF NEW.stage_id IS NULL THEN
    RAISE EXCEPTION 'stage_id is required';
  END IF;
  IF NEW.opportunity_name IS NULL OR btrim(NEW.opportunity_name) = '' THEN
    RAISE EXCEPTION 'opportunity_name is required';
  END IF;

  SELECT s.name, s.default_probability
    INTO stage_name, stage_prob
  FROM public.crm_stages s
  WHERE s.id = NEW.stage_id;

  IF stage_name IS NULL THEN
    RAISE EXCEPTION 'unknown stage_id';
  END IF;

  IF NEW.probability IS NULL THEN
    NEW.probability := stage_prob;
  END IF;

  IF stage_name = 'Won' THEN
    NEW.status := 'Won';
  ELSIF stage_name = 'Lost' THEN
    NEW.status := 'Lost';
  ELSE
    NEW.status := 'Open';
  END IF;

  IF NEW.is_demo IS NULL THEN
    NEW.is_demo := false;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_opportunities_apply_stage_defaults ON public.opportunities;
CREATE TRIGGER trg_opportunities_apply_stage_defaults
BEFORE INSERT OR UPDATE ON public.opportunities
FOR EACH ROW
EXECUTE PROCEDURE public.opportunities_apply_stage_defaults();

ALTER TABLE public.opportunities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crm_stages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS crm_stages_select_anon ON public.crm_stages;
CREATE POLICY crm_stages_select_anon
  ON public.crm_stages
  FOR SELECT
  TO anon, authenticated
  USING (true);

DROP POLICY IF EXISTS opportunities_select_anon ON public.opportunities;
CREATE POLICY opportunities_select_anon
  ON public.opportunities
  FOR SELECT
  TO anon, authenticated
  USING (is_demo = false);

DROP POLICY IF EXISTS opportunities_insert_anon ON public.opportunities;
CREATE POLICY opportunities_insert_anon
  ON public.opportunities
  FOR INSERT
  TO anon, authenticated
  WITH CHECK (
    is_demo = false
    AND company_id IS NOT NULL
    AND service_id IS NOT NULL
    AND stage_id IS NOT NULL
    AND btrim(opportunity_name) <> ''
    AND estimated_value IS NOT NULL
    AND estimated_value >= 0
    AND expected_close_date IS NOT NULL
  );

DROP POLICY IF EXISTS opportunities_update_anon ON public.opportunities;
CREATE POLICY opportunities_update_anon
  ON public.opportunities
  FOR UPDATE
  TO anon, authenticated
  USING (is_demo = false)
  WITH CHECK (
    is_demo = false
    AND company_id IS NOT NULL
    AND service_id IS NOT NULL
    AND stage_id IS NOT NULL
    AND btrim(opportunity_name) <> ''
  );

GRANT SELECT ON public.crm_stages TO anon, authenticated;
GRANT SELECT ON public.crm_stages TO authenticator;
GRANT SELECT, INSERT, UPDATE ON public.opportunities TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.opportunities TO authenticator;

COMMENT ON COLUMN public.crm_stages.default_probability IS
  'FAST-3A: default win probability for the stage. App may override per opportunity.';
COMMENT ON COLUMN public.opportunities.weighted_value IS
  'FAST-3A: estimated_value * probability / 100. Generated; not written by the app.';
COMMENT ON COLUMN public.opportunities.owner IS
  'FAST-3A: free-text sales owner. profiles.owner_id remains available for later auth.';
COMMENT ON TABLE public.opportunities IS
  'FAST-3A: live CRM opportunities. is_demo rows are excluded from anon policies.';

NOTIFY pgrst, 'reload schema';
