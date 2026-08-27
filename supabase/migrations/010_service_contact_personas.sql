-- GEOCHEM STP Intelligence — STEP 7.4 service contact persona map.
-- Additive. DO NOT apply automatically from the app.
-- Seeds job_functions catalog and PCH persona rows. Does NOT insert people/contacts.
-- Does NOT modify companies, company_locations, or company_service_stp_scores.

CREATE TABLE IF NOT EXISTS public.service_contact_personas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  service_id uuid NOT NULL REFERENCES public.services (id) ON DELETE RESTRICT,
  department_id uuid NOT NULL REFERENCES public.departments (id) ON DELETE RESTRICT,
  job_function_id uuid NOT NULL REFERENCES public.job_functions (id) ON DELETE RESTRICT,
  buying_role text,
  priority integer NOT NULL,
  relevance_score numeric(5, 2) NOT NULL,
  relevance_reason text,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT service_contact_personas_service_dept_function_key UNIQUE (service_id, department_id, job_function_id),
  CONSTRAINT service_contact_personas_priority_check CHECK (priority BETWEEN 1 AND 3),
  CONSTRAINT service_contact_personas_score_check CHECK (relevance_score >= 0 AND relevance_score <= 100),
  CONSTRAINT service_contact_personas_buying_role_check
    CHECK (
      buying_role IS NULL OR buying_role IN (
        'DECISION_MAKER',
        'INFLUENCER',
        'TECHNICAL',
        'PROCUREMENT',
        'GATEKEEPER',
        'USER'
      )
    )
);

CREATE INDEX IF NOT EXISTS service_contact_personas_service_id_idx
  ON public.service_contact_personas (service_id);
CREATE INDEX IF NOT EXISTS service_contact_personas_priority_idx
  ON public.service_contact_personas (service_id, priority);

CREATE TRIGGER trg_service_contact_personas_set_updated_at
BEFORE UPDATE ON public.service_contact_personas
FOR EACH ROW
EXECUTE PROCEDURE public.set_updated_at();

COMMENT ON TABLE public.service_contact_personas IS
  'Service → department → job function personas. Not people. PCH is the reference map. Other services stay empty until defined.';

INSERT INTO public.job_functions (function_code, name, description, active)
VALUES
  ('laboratory', 'Laboratory', 'Site or central lab operations and product-quality testing.', true),
  ('quality', 'Quality', 'QA/QC, specifications, and product-release quality.', true),
  ('inspection', 'Inspection', 'Inspection and integrity programs that specify testing.', true),
  ('operations', 'Operations', 'Plant/process operations that consume lab and quality data.', true),
  ('technical_services', 'Technical Services', 'Process/technical services and plant support engineering.', true),
  ('procurement', 'Procurement', 'Purchasing and vendor selection for laboratory services.', true),
  ('contracts', 'Contracts', 'Contracts and frame-agreement owners for third-party labs.', true),
  ('commercial', 'Commercial / Vendor Management', 'Commercial and vendor-management counterparts.', true)
ON CONFLICT (function_code) DO NOTHING;

INSERT INTO public.service_contact_personas (
  service_id, department_id, job_function_id, buying_role, priority, relevance_score, relevance_reason, active
)
SELECT s.id, d.id, jf.id, v.buying_role, v.priority, v.relevance_score, v.relevance_reason, true
FROM public.services s
CROSS JOIN (VALUES
  ('Laboratory', 'laboratory', 'TECHNICAL', 1, 100.00, 'PCH work is process chemistry and product-quality laboratory support; lab owners specify and receive results.'),
  ('QA/QC', 'quality', 'TECHNICAL', 1, 95.00, 'Product-quality and specification control is a primary PCH buying and user function.'),
  ('Engineering', 'technical_services', 'TECHNICAL', 2, 85.00, 'Process/technical services influence assay, stream, and troubleshooting lab work.'),
  ('Inspection', 'inspection', 'TECHNICAL', 2, 80.00, 'Inspection programs generate sampling and third-party testing demand adjacent to PCH.'),
  ('Procurement', 'procurement', 'PROCUREMENT', 1, 90.00, 'Vendor selection and PO ownership for contracted laboratory services.'),
  ('Procurement', 'contracts', 'PROCUREMENT', 2, 78.00, 'Frame agreements and lab-service contracts sit with procurement/contracts counterparts.'),
  ('Engineering', 'operations', 'USER', 3, 72.00, 'Operations consumes lab data; no separate Operations department in the current catalog, so Engineering is the host department.'),
  ('Procurement', 'commercial', 'GATEKEEPER', 3, 70.00, 'Vendor-management / commercial gatekeeping for approved laboratory suppliers. No Commercial department in the current catalog.')
) AS v(department_name, function_code, buying_role, priority, relevance_score, relevance_reason)
JOIN public.departments d ON d.name = v.department_name
JOIN public.job_functions jf ON jf.function_code = v.function_code
WHERE s.service_code = 'PCH'
ON CONFLICT (service_id, department_id, job_function_id) DO NOTHING;

ALTER TABLE public.service_contact_personas ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS service_contact_personas_select_anon ON public.service_contact_personas;
CREATE POLICY service_contact_personas_select_anon
  ON public.service_contact_personas
  FOR SELECT
  TO anon, authenticated
  USING (true);

GRANT SELECT ON public.service_contact_personas TO anon, authenticated;
GRANT SELECT ON public.service_contact_personas TO authenticator;
GRANT SELECT ON public.job_functions TO anon, authenticated;
GRANT SELECT ON public.job_functions TO authenticator;
