-- Full-database STP discovery. Additive. Does not alter company_service_stp_scores
-- current rows, companies, contacts, or locations.
-- Apply via Supabase SQL editor. The app still scores in-memory if this table is missing.

CREATE TABLE IF NOT EXISTS public.stp_discovery_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  service_id uuid NOT NULL REFERENCES public.services (id) ON DELETE RESTRICT,
  scoring_model_version text NOT NULL,
  scored_at timestamptz NOT NULL DEFAULT now(),
  total_companies integer NOT NULL,
  evaluated integer NOT NULL,
  eligible integer NOT NULL,
  ineligible integer NOT NULL,
  ranking_eligible integer NOT NULL,
  insufficient integer NOT NULL,
  tier1 integer NOT NULL,
  tier2 integer NOT NULL,
  tier3 integer NOT NULL,
  watchlist integer NOT NULL,
  persisted_current_count integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS stp_discovery_runs_service_scored_idx
  ON public.stp_discovery_runs (service_id, scored_at DESC);

CREATE TABLE IF NOT EXISTS public.company_service_stp_discovery (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid NOT NULL REFERENCES public.stp_discovery_runs (id) ON DELETE CASCADE,
  company_id uuid NOT NULL REFERENCES public.companies (id) ON DELETE CASCADE,
  service_id uuid NOT NULL REFERENCES public.services (id) ON DELETE RESTRICT,
  account_group_key text NOT NULL,
  entity_type text,
  company_name text NOT NULL,
  industry text,
  subsector text,
  customer_type text,
  city text,
  eligibility text NOT NULL,
  eligibility_reason text,
  commercial_score numeric(5, 2),
  known_weight_total numeric(5, 2) NOT NULL DEFAULT 0,
  ranking_eligible boolean NOT NULL DEFAULT false,
  ranking_reason text,
  tier text,
  tier_reason text,
  industry_fit numeric(5, 2),
  application_fit numeric(5, 2),
  service_need_fit numeric(5, 2),
  commercial_potential numeric(5, 2),
  customer_type_fit numeric(5, 2),
  geographic_fit numeric(5, 2),
  strategic_fit numeric(5, 2),
  data_confidence_score numeric(5, 2) NOT NULL,
  data_confidence_band text NOT NULL,
  positioning_statement text,
  targeting_reason text,
  recommended_contact_roles text[] NOT NULL DEFAULT '{}',
  recommended_departments text[] NOT NULL DEFAULT '{}',
  missing_intelligence text[] NOT NULL DEFAULT '{}',
  dimension_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  scoring_model_version text NOT NULL,
  scored_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT company_service_stp_discovery_eligibility_check
    CHECK (eligibility IN ('ELIGIBLE', 'OUT_OF_SCOPE', 'INSUFFICIENT_TO_ELIGIBLE')),
  CONSTRAINT company_service_stp_discovery_tier_check
    CHECK (tier IS NULL OR tier IN ('Tier 1', 'Tier 2', 'Tier 3', 'Watchlist')),
  CONSTRAINT company_service_stp_discovery_confidence_band_check
    CHECK (data_confidence_band IN ('HIGH', 'MEDIUM', 'LOW'))
);

CREATE UNIQUE INDEX IF NOT EXISTS company_service_stp_discovery_run_company_uidx
  ON public.company_service_stp_discovery (run_id, company_id);

CREATE INDEX IF NOT EXISTS company_service_stp_discovery_run_idx
  ON public.company_service_stp_discovery (run_id);
CREATE INDEX IF NOT EXISTS company_service_stp_discovery_service_idx
  ON public.company_service_stp_discovery (service_id);

ALTER TABLE public.stp_discovery_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.company_service_stp_discovery ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS stp_discovery_runs_select_anon ON public.stp_discovery_runs;
CREATE POLICY stp_discovery_runs_select_anon ON public.stp_discovery_runs
  FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS stp_discovery_runs_insert_anon ON public.stp_discovery_runs;
CREATE POLICY stp_discovery_runs_insert_anon ON public.stp_discovery_runs
  FOR INSERT TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS company_service_stp_discovery_select_anon ON public.company_service_stp_discovery;
CREATE POLICY company_service_stp_discovery_select_anon ON public.company_service_stp_discovery
  FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS company_service_stp_discovery_insert_anon ON public.company_service_stp_discovery;
CREATE POLICY company_service_stp_discovery_insert_anon ON public.company_service_stp_discovery
  FOR INSERT TO anon, authenticated WITH CHECK (true);

GRANT SELECT, INSERT ON public.stp_discovery_runs TO anon, authenticated, authenticator;
GRANT SELECT, INSERT ON public.company_service_stp_discovery TO anon, authenticated, authenticator;
GRANT SELECT ON public.stp_discovery_runs TO anon, authenticated, authenticator;
GRANT SELECT ON public.company_service_stp_discovery TO anon, authenticated, authenticator;

COMMENT ON TABLE public.stp_discovery_runs IS
  'One full-database targeting evaluation per service. Does not replace company_service_stp_current.';
COMMENT ON TABLE public.company_service_stp_discovery IS
  'Discovery STP rows for a run. Not current production targeting. Promote copies ELIGIBLE rows into company_service_stp_scores only when no current company×service row exists.';

NOTIFY pgrst, 'reload schema';
