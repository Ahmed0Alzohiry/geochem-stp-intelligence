-- GEOCHEM STP Intelligence — STEP 7.9 contact persist write policies.
-- Additive RLS/GRANT only. DO NOT apply automatically from the app.
-- Review, then apply via Supabase SQL Editor.
--
-- Does NOT insert contacts.
-- Does NOT alter companies, company_locations, STP scores, personas, or entity resolution.
-- Does NOT grant UPDATE or DELETE on contacts.
--
-- Applying 011 only makes a later --write INSERT possible.

ALTER TABLE public.contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contact_service_relevance ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS contacts_insert_anon ON public.contacts;
CREATE POLICY contacts_insert_anon
  ON public.contacts
  FOR INSERT
  TO anon, authenticated
  WITH CHECK (
    btrim(full_name) <> ''
    AND source_url IS NOT NULL
    AND btrim(source_url) <> ''
    AND source_name IS NOT NULL
    AND btrim(source_name) <> ''
    AND evidence_type IS NOT NULL
    AND source_confidence IS NOT NULL
    AND verification_status IN ('Unverified', 'Partially Verified', 'Verified')
    AND (
      verification_status <> 'Verified'
      OR verified_at IS NOT NULL
    )
  );

DROP POLICY IF EXISTS contact_service_relevance_insert_anon ON public.contact_service_relevance;
CREATE POLICY contact_service_relevance_insert_anon
  ON public.contact_service_relevance
  FOR INSERT
  TO anon, authenticated
  WITH CHECK (
    service_id IS NOT NULL
    AND contact_id IS NOT NULL
  );

GRANT SELECT, INSERT ON public.contacts TO anon, authenticated;
GRANT SELECT, INSERT ON public.contacts TO authenticator;
GRANT SELECT, INSERT ON public.contact_service_relevance TO anon, authenticated;
GRANT SELECT, INSERT ON public.contact_service_relevance TO authenticator;

COMMENT ON POLICY contacts_insert_anon ON public.contacts IS
  'STEP 7.9: INSERT requires a named person, evidence bundle, and non-primary flag. App writer still requires --write. Grain (no facility clones) is enforced in application code.';

NOTIFY pgrst, 'reload schema';
