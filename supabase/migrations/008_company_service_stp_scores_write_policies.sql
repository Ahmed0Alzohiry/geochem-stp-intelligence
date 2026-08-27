-- GEOCHEM STP Intelligence — STEP 6.8 STP score write policies.
-- Additive RLS/GRANT only. DO NOT apply automatically from the app.
-- Review, then apply via Supabase SQL editor / CLI.
--
-- Does NOT alter public.companies or public.company_locations.
-- Does NOT insert scores, tiers, or company rows.
-- Does NOT change uniqueness indexes or account_group columns from 007.
-- Does NOT grant DELETE.
--
-- Persist still requires a later explicit writer (--write). Applying 008
-- only makes controlled INSERT/UPDATE possible; it does not write PCH scores.

ALTER TABLE public.company_service_stp_scores ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS company_service_stp_scores_insert_anon ON public.company_service_stp_scores;
CREATE POLICY company_service_stp_scores_insert_anon
  ON public.company_service_stp_scores
  FOR INSERT
  TO anon, authenticated
  WITH CHECK (
    entity_type IS NULL
    OR entity_type NOT IN ('RELATED', 'REVIEW')
    OR is_account_group_representative = false
  );

DROP POLICY IF EXISTS company_service_stp_scores_update_anon ON public.company_service_stp_scores;
CREATE POLICY company_service_stp_scores_update_anon
  ON public.company_service_stp_scores
  FOR UPDATE
  TO anon, authenticated
  USING (true)
  WITH CHECK (
    entity_type IS NULL
    OR entity_type NOT IN ('RELATED', 'REVIEW')
    OR is_account_group_representative = false
  );

GRANT SELECT, INSERT, UPDATE ON public.company_service_stp_scores TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.company_service_stp_scores TO authenticator;

COMMENT ON TABLE public.company_service_stp_scores IS
  'Service-first STP results. One current row per company×service and one current representative per account_group×service. Data confidence is stored separately from commercial_score. Does not write public.companies. RLS: SELECT/INSERT/UPDATE for the research app key; no DELETE. RELATED/REVIEW cannot be representatives.';

NOTIFY pgrst, 'reload schema';
