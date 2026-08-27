# Contact Intelligence data model (STEP 7.2)

Design only. Migration **not applied**. No people invented. STP / companies / locations / PCH scores unchanged.

Workflow: **Selected service → ranked target account → department → job function → person → details → evidence → verification/confidence.**

## Decision: junction, not clones

Service relevance is `contact_service_relevance` `(contact_id, service_id)` unique.

One person can be relevant to PCH and PET with different `buying_role`, `relevance_score`, and `relevance_reason`. Optional `stp_score_id` ties that pair to a persisted `company_service_stp_scores` row (same `company_id` and `service_id`, trigger-enforced).

Do not create a second `contacts` row per service.

## Existing `contacts` preserved

Kept: `company_id`, `full_name`, `job_title`, `department_id`, `email`, `phone`, `linkedin_url`, `contact_role` (Decision Maker / … / Other), `relationship_strength`, `is_primary`, `notes`, `data_confidence` (Verified/Probable/Estimated/Unknown), timestamps.

`contact_role` remains company-level. Service-level role is `buying_role` on the junction (`DECISION_MAKER`, `INFLUENCER`, `TECHNICAL`, `PROCUREMENT`, `GATEKEEPER`, `USER`).

## Additive contacts columns

`company_location_id` (optional, same company as contact).  
`job_function_id` → empty catalog `job_functions` (seed later; suggested codes in TypeScript only).  
Evidence: `source_url`, `source_name`, `evidence_type`, `source_confidence` HIGH/MEDIUM/LOW.  
`verification_status`, `verified_at`.  
Evidence CHECK matches locations: all empty or URL + name + type + confidence required.

## Duplicate prevention

Partial unique indexes: `(company_id, lower(email))`, `(company_id, lower(linkedin_url))` when non-blank.

## RLS

SELECT for `anon`/`authenticated` on `contacts`, `job_functions`, `contact_service_relevance`. **No INSERT/UPDATE** in 7.2.

## Suggested job function codes (not seeded)

laboratory, quality, inspection, operations, technical_services, procurement, contracts, commercial.

## File

`supabase/migrations/009_contact_intelligence.sql`
