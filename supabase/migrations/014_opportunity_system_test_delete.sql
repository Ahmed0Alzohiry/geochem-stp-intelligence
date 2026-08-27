-- GEOCHEM STP Intelligence — FAST-4 opportunity DELETE for system-test rows only.
-- Additive RLS/GRANT. DO NOT apply automatically from the app.
-- Review, then apply via Supabase SQL Editor.
-- APPLY 014 IN SUPABASE SQL EDITOR
--
-- Does NOT modify companies, contacts, company_locations, or STP scores.
-- Deletes only the current FAST-4 system-test opportunity fingerprint.

ALTER TABLE public.opportunities ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS opportunities_delete_system_test ON public.opportunities;
CREATE POLICY opportunities_delete_system_test
  ON public.opportunities
  FOR DELETE
  TO anon, authenticated
  USING (
    is_demo = false
    AND (
      opportunity_name ILIKE '%system-test%'
      OR opportunity_name ILIKE '%system test%'
      OR coalesce(notes, '') ILIKE '%system-test%'
      OR coalesce(notes, '') ILIKE '%system test%'
      OR coalesce(source, '') ILIKE '%system-test%'
      OR coalesce(source, '') ILIKE '%system test%'
      OR (
        opportunity_name = 'Petro Rabigh Polymer Operations PCH'
        AND coalesce(source, '') = 'Target Account'
        AND coalesce(owner, '') = 'Ahmed'
        AND estimated_value = 100000
      )
    )
  );

GRANT SELECT, INSERT, UPDATE, DELETE ON public.opportunities TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.opportunities TO authenticator;

DELETE FROM public.opportunities
WHERE id = '545e083d-4cbb-431f-ab60-b4225a48b83f'
  AND opportunity_name = 'Petro Rabigh Polymer Operations PCH'
  AND estimated_value = 100000
  AND coalesce(owner, '') = 'Ahmed'
  AND coalesce(source, '') = 'Target Account';

NOTIFY pgrst, 'reload schema';
