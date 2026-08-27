-- GEOCHEM STP Intelligence — STEP 6.5 service-first STP persistence schema.
-- Additive only. DO NOT apply automatically from the app.
-- Review, then apply via Supabase SQL editor / CLI.
--
-- Does NOT alter public.companies source columns.
-- Does NOT insert scores, tiers, or company rows.
-- Does NOT grant INSERT/UPDATE (score writes stay blocked until a later persist step).
--
-- Why a new table:
--   public.company_scores is company × scoring_criteria (1–5 ratings), no service_id.
--   public.company_target_snapshots is one targeting freeze per company, no service_id.
--   Those tables cannot distinguish Company A + PCH vs Company A + PET vs Company A + ENV.
--   Patching them would mix the v1 1–5 model with service-first commercial scores.
--
-- Grain: one current STP result per (company_id, service_id),
--        and one current representative per (account_group_key, service_id).

CREATE TABLE IF NOT EXISTS public.company_service_stp_scores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies (id) ON DELETE CASCADE,
  service_id uuid NOT NULL REFERENCES public.services (id) ON DELETE RESTRICT,
  account_group_key text NOT NULL,
  entity_type text,
  is_account_group_representative boolean NOT NULL DEFAULT true,
  is_current boolean NOT NULL DEFAULT true,
  eligibility text NOT NULL,
  eligibility_reason text,
  commercial_score numeric(5, 2),
  known_weight_total numeric(5, 2) NOT NULL DEFAULT 0,
  ranking_eligible boolean NOT NULL DEFAULT false,
  tier text,
  industry_fit numeric(5, 2),
  application_fit numeric(5, 2),
  service_need_fit numeric(5, 2),
  commercial_potential numeric(5, 2),
  customer_type_fit numeric(5, 2),
  geographic_fit numeric(5, 2),
  strategic_fit numeric(5, 2),
  data_confidence_score numeric(5, 2) NOT NULL,
  data_confidence_band text NOT NULL,
  data_confidence_explanation text,
  positioning_statement text,
  targeting_reason text,
  recommended_contact_roles text[] NOT NULL DEFAULT '{}',
  recommended_departments text[] NOT NULL DEFAULT '{}',
  dimension_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  scoring_model_version text NOT NULL,
  scored_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT company_service_stp_eligibility_check
    CHECK (eligibility IN ('ELIGIBLE', 'OUT_OF_SCOPE', 'INSUFFICIENT_TO_ELIGIBLE')),
  CONSTRAINT company_service_stp_tier_check
    CHECK (tier IS NULL OR tier IN ('Tier 1', 'Tier 2', 'Tier 3', 'Watchlist')),
  CONSTRAINT company_service_stp_confidence_band_check
    CHECK (data_confidence_band IN ('HIGH', 'MEDIUM', 'LOW')),
  CONSTRAINT company_service_stp_entity_type_check
    CHECK (entity_type IS NULL OR entity_type IN ('ACCOUNT', 'FACILITY', 'BRANCH', 'RELATED', 'REVIEW')),
  CONSTRAINT company_service_stp_related_not_representative_check
    CHECK (
      NOT (
        is_account_group_representative
        AND entity_type IN ('RELATED', 'REVIEW')
      )
    )
);

COMMENT ON TABLE public.company_service_stp_scores IS
  'Service-first STP results. One current row per company×service and one current representative per account_group×service. Data confidence is stored separately from commercial_score. Does not write public.companies. RLS SELECT-only until a later persist step.';

COMMENT ON COLUMN public.company_service_stp_scores.service_id IS
  'Required. Distinguishes PCH vs PET vs ENV (and other catalog services) for the same company.';
COMMENT ON COLUMN public.company_service_stp_scores.account_group_key IS
  'Copied from company_entity_resolution. STEP 6.4: one ranked representative per group per service.';
COMMENT ON COLUMN public.company_service_stp_scores.application_fit IS
  'Subsector / Application Fit (0–100). NULL means UNKNOWN, not zero.';
COMMENT ON COLUMN public.company_service_stp_scores.data_confidence_score IS
  'Evidence completeness. Not added into commercial_score.';
COMMENT ON COLUMN public.company_service_stp_scores.targeting_reason IS
  'Why Target narrative for the selected service.';
COMMENT ON COLUMN public.company_service_stp_scores.is_current IS
  'Current result for uniqueness. Historical rows keep is_current = false.';

CREATE UNIQUE INDEX IF NOT EXISTS company_service_stp_current_company_service_uidx
  ON public.company_service_stp_scores (company_id, service_id)
  WHERE is_current;

CREATE UNIQUE INDEX IF NOT EXISTS company_service_stp_current_group_service_uidx
  ON public.company_service_stp_scores (account_group_key, service_id)
  WHERE is_current AND is_account_group_representative;

CREATE INDEX IF NOT EXISTS company_service_stp_service_id_idx
  ON public.company_service_stp_scores (service_id);
CREATE INDEX IF NOT EXISTS company_service_stp_company_id_idx
  ON public.company_service_stp_scores (company_id);
CREATE INDEX IF NOT EXISTS company_service_stp_account_group_idx
  ON public.company_service_stp_scores (account_group_key, service_id);
CREATE INDEX IF NOT EXISTS company_service_stp_tier_idx
  ON public.company_service_stp_scores (service_id, tier);
CREATE INDEX IF NOT EXISTS company_service_stp_scored_at_idx
  ON public.company_service_stp_scores (scored_at DESC);

DROP TRIGGER IF EXISTS trg_company_service_stp_scores_set_updated_at ON public.company_service_stp_scores;
CREATE TRIGGER trg_company_service_stp_scores_set_updated_at
BEFORE UPDATE ON public.company_service_stp_scores
FOR EACH ROW
EXECUTE PROCEDURE public.set_updated_at();

ALTER TABLE public.company_service_stp_scores ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS company_service_stp_scores_select_anon ON public.company_service_stp_scores;
CREATE POLICY company_service_stp_scores_select_anon
  ON public.company_service_stp_scores
  FOR SELECT
  TO anon, authenticated
  USING (true);

GRANT SELECT ON public.company_service_stp_scores TO anon, authenticated;
GRANT SELECT ON public.company_service_stp_scores TO authenticator;

CREATE OR REPLACE VIEW public.company_service_stp_current AS
SELECT
  s.id,
  s.company_id,
  s.service_id,
  s.account_group_key,
  s.entity_type,
  s.is_account_group_representative,
  s.eligibility,
  s.eligibility_reason,
  s.commercial_score,
  s.known_weight_total,
  s.ranking_eligible,
  s.tier,
  s.industry_fit,
  s.application_fit,
  s.service_need_fit,
  s.commercial_potential,
  s.customer_type_fit,
  s.geographic_fit,
  s.strategic_fit,
  s.data_confidence_score,
  s.data_confidence_band,
  s.data_confidence_explanation,
  s.positioning_statement,
  s.targeting_reason,
  s.recommended_contact_roles,
  s.recommended_departments,
  s.dimension_snapshot,
  s.scoring_model_version,
  s.scored_at,
  s.created_at,
  s.updated_at
FROM public.company_service_stp_scores s
WHERE s.is_current
  AND s.is_account_group_representative;

COMMENT ON VIEW public.company_service_stp_current IS
  'Current account-group representative STP row per service. Dashboard should filter by service_id. Historical rows remain in company_service_stp_scores.';

GRANT SELECT ON public.company_service_stp_current TO anon, authenticated;
GRANT SELECT ON public.company_service_stp_current TO authenticator;
