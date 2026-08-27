-- Reload PostgREST so public.company_entity_resolution is visible to the API.
-- Run after 005 if inserts fail with PGRST205 (schema cache).
-- Does not alter public.companies.

GRANT SELECT, INSERT, UPDATE ON public.company_entity_resolution TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.company_entity_resolution TO authenticator;

NOTIFY pgrst, 'reload schema';
