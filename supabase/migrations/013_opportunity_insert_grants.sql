-- GEOCHEM STP Intelligence — opportunity INSERT permission (idempotent).
-- Additive RLS/GRANT only. DO NOT apply automatically from the app.
-- Review, then apply via Supabase SQL Editor.
-- APPLY 013 IN SUPABASE SQL EDITOR
--
-- Does NOT insert opportunities.
-- Does NOT modify companies, contacts, company_locations, or STP scores.

ALTER TABLE public.opportunities ENABLE ROW LEVEL SECURITY;

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

GRANT SELECT, INSERT, UPDATE ON public.opportunities TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.opportunities TO authenticator;

NOTIFY pgrst, 'reload schema';
