-- GEOCHEM STP Intelligence — STEP 32.1.5 ENV Wave-1 scoped DELETE.
-- Additive RLS/GRANT only. DO NOT apply automatically from the app.
-- Review, then apply via Supabase SQL editor before using --write rollback.
--
-- Does NOT alter public.companies or PCH STP rows.
-- Does NOT insert scores.
-- DELETE is allowed only when service_id is Environmental Services (ENV).

ALTER TABLE public.company_service_stp_scores ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS company_service_stp_scores_delete_env_wave1 ON public.company_service_stp_scores;
CREATE POLICY company_service_stp_scores_delete_env_wave1
  ON public.company_service_stp_scores
  FOR DELETE
  TO anon, authenticated
  USING (service_id = '164a9647-d6fd-4db0-8f9f-42e281c28ccf');

GRANT DELETE ON public.company_service_stp_scores TO anon, authenticated;
GRANT DELETE ON public.company_service_stp_scores TO authenticator;

COMMENT ON POLICY company_service_stp_scores_delete_env_wave1 ON public.company_service_stp_scores IS
  'ENV-only DELETE for Wave-1 rollback. PCH and other service_id values cannot be deleted through this policy.';

NOTIFY pgrst, 'reload schema';
