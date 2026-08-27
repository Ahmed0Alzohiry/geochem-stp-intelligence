-- GEOCHEM STP Intelligence — master / reference seed only.
-- Does NOT seed companies, contacts, opportunities, activities, or scores.
-- Canonical scoring weights (v1) total 100. Legacy demo UI weights 18/16/14/... are not used.

INSERT INTO public.industries (name, description, active) VALUES
  ('Oil & Gas', 'Upstream and midstream hydrocarbon operators and producing assets.', true),
  ('Refining', 'Crude refining and fuels manufacturing complexes.', true),
  ('Petrochemicals', 'Base chemicals, intermediates, and polymer complexes.', true),
  ('Chemicals', 'Specialty and industrial chemical producers.', true),
  ('Power & Utilities', 'Power generation, transmission, and related utilities.', true),
  ('Water & Wastewater', 'Desalination, distribution, and wastewater treatment.', true),
  ('Industrial Manufacturing', 'Heavy and process manufacturing plants.', true),
  ('Mining & Minerals', 'Metals, minerals, and phosphate mining operations.', true),
  ('Marine / Ports', 'Ports, terminals, and marine industrial facilities.', true),
  ('EPC / Projects', 'Engineering, procurement, construction, and giga-projects.', true),
  ('Government / Public Sector', 'Ministries, regulators, and public development entities.', true);

INSERT INTO public.customer_types (name, description, active) VALUES
  ('Asset Owner', 'Owns the industrial or energy asset and the associated capex/opex budget.', true),
  ('Operator', 'Operates assets and specifies ongoing testing, inspection, and reliability work.', true),
  ('Manufacturer', 'Produces chemicals, materials, or industrial products on site.', true),
  ('EPC Contractor', 'Delivers projects and often specifies laboratory and inspection packages.', true),
  ('O&M Contractor', 'Operations and maintenance contractors with recurring service demand.', true),
  ('Trader', 'Commodity or product traders with occasional quality and inspection needs.', true),
  ('Government Entity', 'Public bodies that procure testing, monitoring, and compliance services.', true),
  ('Technical Partner', 'Oilfield, inspection, or engineering partners that may subcontract laboratory work.', true);

INSERT INTO public.regions (name, country, industrial_cluster, active) VALUES
  ('Western Region', 'Saudi Arabia', 'Yanbu / Jeddah / Rabigh / Jazan / NEOM / Red Sea', true),
  ('Eastern Region', 'Saudi Arabia', 'Jubail / Dammam / Al Khobar / Ras Tanura / Dhahran', true),
  ('Central Region', 'Saudi Arabia', 'Riyadh and central industrial zones', true);

INSERT INTO public.departments (name, description, active) VALUES
  ('Procurement', 'Purchasing and vendor management.', true),
  ('QA/QC', 'Quality assurance and quality control.', true),
  ('Laboratory', 'Internal or site laboratory operations.', true),
  ('Reliability', 'Asset reliability and condition monitoring.', true),
  ('Maintenance', 'Plant and equipment maintenance.', true),
  ('HSE', 'Health, safety, and environment.', true),
  ('Environment', 'Environmental management and compliance.', true),
  ('Inspection', 'Inspection and integrity.', true),
  ('Projects', 'Capital projects and construction.', true),
  ('Engineering', 'Process, petroleum, and facilities engineering.', true);

INSERT INTO public.services (name, service_code, description, active) VALUES
  ('Petroleum Services', 'PET', 'Petroleum geochemistry, reservoir fluids, and wellsite geochemistry support.', true),
  ('Petrochemical Services', 'PCH', 'Process chemistry, product quality, and petrochemical plant laboratory support.', true),
  ('Minerals & Agriculture', 'MIN', 'Ores, minerals, and agricultural material analysis.', true),
  ('Environmental Services', 'ENV', 'Soil, water, wastewater, and environmental compliance testing.', true),
  ('Oil Condition Monitoring', 'OCM', 'Lubricant and oil condition monitoring programs.', true),
  ('Metering, Calibration & Topography', 'MCT', 'Metering, calibration, and topographic survey services.', true),
  ('Industrial Inspection', 'INS', 'Industrial inspection programs for plants, pipelines, and facilities.', true),
  ('Laboratory / Testing Services', 'LAB', 'General laboratory testing, HSE, and QA/QC analytical services.', true);

INSERT INTO public.crm_stages (name, display_order, active) VALUES
  ('Prospect', 1, true),
  ('Contacted', 2, true),
  ('Qualified', 3, true),
  ('Meeting', 4, true),
  ('Proposal', 5, true),
  ('Negotiation', 6, true),
  ('Won', 7, true),
  ('Lost', 8, true);

-- Canonical targeting model v1. Do NOT seed 18/16/14/10/10/8/12/12 (legacy demo UI).
INSERT INTO public.scoring_criteria (
  name,
  description,
  weight,
  active,
  scoring_direction,
  model_version
) VALUES
  ('Market Potential', 'Size of addressable laboratory, inspection, and geochemistry spend.', 20.00, true, 'positive', 'v1'),
  ('GEOCHEM Service Fit', 'Alignment with current GEOCHEM Arabia service lines.', 20.00, true, 'positive', 'v1'),
  ('Recurring Revenue Potential', 'Likelihood of multi-year or programmatic work.', 15.00, true, 'positive', 'v1'),
  ('Cross-Selling Potential', 'Ability to expand across adjacent GEOCHEM services.', 15.00, true, 'positive', 'v1'),
  ('Accessibility', 'Ease of reaching decision makers, sites, and laboratories.', 10.00, true, 'positive', 'v1'),
  (
    'Competitive Intensity',
    'Favorability rating: 5 = low competitive pressure / favorable; 1 = very high competitive pressure / unfavorable. Do not invert in the scoring engine.',
    10.00,
    true,
    'positive',
    'v1'
  ),
  ('Margin Potential', 'Expected contribution margin on typical workscopes.', 5.00, true, 'positive', 'v1'),
  ('Geographic Fit', 'Proximity to GEOCHEM operations and logistics.', 5.00, true, 'positive', 'v1');

INSERT INTO public.scoring_settings (
  model_name,
  model_version,
  tier1_min,
  tier2_min,
  tier3_min,
  active,
  notes
) VALUES (
  'GEOCHEM STP Canonical',
  'v1',
  4.00,
  3.00,
  2.00,
  true,
  'Tier 1 >= 4.00, Tier 2 >= 3.00, Tier 3 >= 2.00, Low Priority < 2.00. Active weights must total 100.'
);

DO $$
DECLARE
  weight_total numeric;
BEGIN
  SELECT coalesce(sum(weight), 0)
  INTO weight_total
  FROM public.scoring_criteria
  WHERE active = true
    AND model_version = 'v1';

  IF weight_total <> 100 THEN
    RAISE EXCEPTION 'Active v1 scoring weights must total 100. Found %.', weight_total;
  END IF;
END $$;
