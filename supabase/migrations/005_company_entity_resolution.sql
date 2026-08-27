-- GEOCHEM STP Intelligence — STEP 5.17 entity resolution (additive).
-- Does NOT alter imported public.companies source columns.
-- Does NOT delete, merge, or score companies.
-- Reversible: DROP TABLE public.company_entity_resolution;

CREATE TABLE IF NOT EXISTS public.company_entity_resolution (
  company_id uuid PRIMARY KEY REFERENCES public.companies (id) ON DELETE CASCADE,
  entity_type text NOT NULL,
  account_group_key text NOT NULL,
  entity_resolution_confidence text NOT NULL,
  entity_resolution_reason text NOT NULL,
  classifier_version text NOT NULL DEFAULT '5.17.1',
  classified_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT company_entity_resolution_type_check
    CHECK (entity_type IN ('ACCOUNT', 'FACILITY', 'BRANCH', 'RELATED', 'REVIEW')),
  CONSTRAINT company_entity_resolution_confidence_check
    CHECK (entity_resolution_confidence IN ('HIGH', 'MEDIUM', 'LOW', 'UNRESOLVED'))
);

CREATE INDEX IF NOT EXISTS company_entity_resolution_group_idx
  ON public.company_entity_resolution (account_group_key);
CREATE INDEX IF NOT EXISTS company_entity_resolution_type_idx
  ON public.company_entity_resolution (entity_type);
CREATE INDEX IF NOT EXISTS company_entity_resolution_confidence_idx
  ON public.company_entity_resolution (entity_resolution_confidence);

CREATE TRIGGER trg_company_entity_resolution_set_updated_at
BEFORE UPDATE ON public.company_entity_resolution
FOR EACH ROW
EXECUTE PROCEDURE public.set_updated_at();

COMMENT ON TABLE public.company_entity_resolution IS
  'Non-destructive account/facility classification. Source company fields are never written by this table. RLS: readable and upsertable for the research app key; does not grant UPDATE on public.companies.';

ALTER TABLE public.company_entity_resolution ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS company_entity_resolution_select_anon ON public.company_entity_resolution;
CREATE POLICY company_entity_resolution_select_anon
  ON public.company_entity_resolution
  FOR SELECT
  TO anon, authenticated
  USING (true);

DROP POLICY IF EXISTS company_entity_resolution_upsert_anon ON public.company_entity_resolution;
CREATE POLICY company_entity_resolution_upsert_anon
  ON public.company_entity_resolution
  FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

DROP POLICY IF EXISTS company_entity_resolution_update_anon ON public.company_entity_resolution;
CREATE POLICY company_entity_resolution_update_anon
  ON public.company_entity_resolution
  FOR UPDATE
  TO anon, authenticated
  USING (true)
  WITH CHECK (true);

GRANT SELECT, INSERT, UPDATE ON public.company_entity_resolution TO anon, authenticated;
