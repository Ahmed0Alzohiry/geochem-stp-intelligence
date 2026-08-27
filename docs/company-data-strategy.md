# Company data strategy — GEOCHEM STP Intelligence

Database preparation for a Saudi Arabia B2B / B2G prospect universe. **No companies have been inserted.** Mock UI data remains in `src/data/mock.ts`. Migration `003_company_intelligence_schema.sql` is additive and **must not be applied until Step 5.2 is approved**.

---

## Current `public.companies` fields (001)

| Column | Role today |
|---|---|
| id | UUID PK |
| company_name | Display / trading name |
| legal_name | Optional legal name |
| industry_id | FK industries |
| subsector | Free text |
| customer_type_id | FK customer_types |
| country | Default Saudi Arabia |
| region_id | FK regions (Western / Eastern / Central) |
| city | Single city (mixed HQ vs site) |
| website, linkedin_url, main_phone, general_email | Identity / contact |
| company_size, ownership_type | Unconstrained text |
| account_status | CRM: Prospect / Current Customer / Former Customer / Partner |
| account_potential | STP: Strategic / Growth / Development / Transactional |
| account_owner_id | FK profiles |
| crm_stage_id | FK crm_stages |
| last_activity_date, next_action, next_action_date | Lightweight CRM |
| notes | Free text |
| data_confidence | Unknown / Estimated / Probable / Verified (judgment, not provenance) |
| created_at, updated_at | Governance |

Already related: **`company_services`** (ACCOUNT × SERVICE matrix). Do not duplicate service lists onto `companies`.

**Verdict:** sufficient for a CRM stub, **not** sufficient for hundreds/thousands of Saudi organizations with aliases, multi-site operations, and sourced market intelligence.

---

## Recommended company schema

### Keep on `companies` (one row = one legal/commercial account)

**Identity**

- `company_name` — trading / common name (e.g. Aramco in GEOCHEM usage)
- `legal_name` — registered name (e.g. Saudi Arabian Oil Company)
- `name_ar` — Arabic name
- `website`, phones, email, LinkedIn (existing)
- `company_status` — Active / Inactive / Unknown (legal/operating status; **not** CRM `account_status`)
- `commercial_registration_number` — Saudi CR when known (strong unique key)

**Segmentation (existing FKs + light attributes)**

- `industry_id`, `customer_type_id`, `region_id` (HQ region)
- `city` — **headquarters city only**
- `industrial_city` — HQ industrial city if applicable (Jubail, Yanbu, Ras Tanura, Rabigh…)
- `ownership_type`, `company_size` (existing)
- `employee_size_band` — 1-50 … 5000+ / Unknown

**Commercial intelligence**

- `account_status` — prospect / customer (existing)
- `is_existing_geochem_customer` — Yes / No / Unknown
- `account_potential` — account priority (existing)
- `is_strategic_account` — boolean flag
- `estimated_commercial_potential` — SAR, account-level estimate (service-level stays on `company_services`)
- Potential GEOCHEM services → **`company_services` only**

**Group structure**

- `parent_company_id` — self-FK when parent is also a row
- `parent_company_name` — text when parent is not yet in the database
- `is_subsidiary`

**Market intelligence (short, account-level)**

- `business_description`, `main_activities`, `major_facilities`

**Quality / governance**

- `verification_status` — Unverified / Partially Verified / Verified
- `last_verified_at`
- `data_completeness_status` — Draft / Incomplete / Complete
- `data_confidence` — keep for commercial *judgment*
- `created_at`, `updated_at`, `created_by`
- `normalized_name`, `website_domain` — maintained by trigger for dedup

### Related tables (not dumped onto companies)

| Table | Why |
|---|---|
| `company_aliases` | Aramco / Saudi Arabian Oil Company / Arabic names without extra company rows |
| `company_locations` | Many operating cities and industrial zones per account |
| `company_sources` | Provenance; required evidence trail |
| `company_services` | Already exists — service need / fit / potential |

No generic “segmentation” table. STP remains Company → Industry → Customer type → Geography → Services → Account potential.

---

## Field definitions (new)

| Field / table | Definition |
|---|---|
| company_status | Operating/legal state of the organization |
| industrial_city | Named Saudi industrial city for HQ |
| employee_size_band | Coarse headcount band for targeting filters |
| is_existing_geochem_customer | Known GEOCHEM relationship, independent of CRM stage |
| estimated_commercial_potential | Whole-account SAR estimate (analyst) |
| is_strategic_account | Board-level / NOC / giga-project flag |
| parent_company_* | Group ownership without forcing a full parent record |
| verification_status | Whether **facts** are sourced |
| data_completeness_status | Whether the **profile** is filled enough to use |
| commercial_registration_number | Saudi CR; unique when present |
| company_aliases | Non-canonical names; globally unique after normalization |
| company_locations | Sites; `is_headquarters` should match `companies.city` in the app layer |
| company_sources | URL, type, reliability, capture date |

---

## Normalization decisions

| Put on `companies` | Put in a child table |
|---|---|
| One HQ city, HQ region, one CR, one primary website | Many sites (`company_locations`) |
| Short description / activities / flagship assets | Long evidence trail (`company_sources`) |
| One trading + one legal name | Extra names (`company_aliases`) |
| Account-level SAR potential | Per-service potential (`company_services`) |

Avoided: separate tables for ownership, employee bands, or industrial cities as master data until volume proves we need catalogs. Industrial city remains text aligned with known KSA names.

---

## Duplicate strategy

1. **Canonical row** = one commercial account GEOCHEM will sell to.
2. **Unique Saudi CR** when known (`companies_cr_number_key`).
3. **Unique website domain** when known (ignore `www.` / scheme).
4. **Unique `normalized_name`** on the canonical legal/trading name (letters/digits/Arabic only, lowercased).
5. **Aliases** store Aramco, Arabic short names, former names. `normalized_alias` is **globally unique**, so two companies cannot both claim “aramco”.
6. **Facilities** are locations, not companies. “Aramco Ras Tanura” is a `company_locations` row (or an alias of type Facility), not a second `companies` row unless it is a distinct legal entity (e.g. a JV).
7. Import workflow: normalize name → check alias + CR + domain → merge or attach alias → never insert a second canonical Aramco.

Application matching in Step 5.2+ should search `companies.normalized_name` **union** `company_aliases.normalized_alias` before insert.

---

## Source / provenance strategy

- Store evidence in `company_sources` (`source_url`, `source_type`, `source_reliability`).
- **Verified** only if at least one source is Official website, Regulator / government, Annual report, or Internal GEOCHEM with reliability High or Medium, and `last_verified_at` is set.
- Analyst web research, news, and directories default to **Unverified** or **Partially Verified**.
- `data_confidence` remains for STP *judgment* (potential, fit). Do not set it to Verified just because a website exists.
- Inferred industry/customer type without a source stays Unverified.

---

## Data-quality rules

| Status | Rule |
|---|---|
| Unverified | Default for new research imports |
| Partially Verified | Identity confirmed (name + website or CR) but commercial fields still inferred |
| Verified | Identity + key segmentation fields backed by sources |
| Complete | Required STP fields filled: name, industry, customer type, region, city, at least one service need |
| Incomplete / Draft | Usable as a stub; must not be treated as a targeting fact |

Never promote mock UI scores into Verified company_scores.

---

## Future scaling

- Indexes already target industry, region, city, status, owner, verification, CR, domain, normalized name.
- Expect 10³–10⁴ Saudi orgs: keep search via `normalized_name` / alias unique indexes; add `pg_trgm` later only if fuzzy search is required.
- Parent groups: use `parent_company_id` when both exist; otherwise `parent_company_name` until the parent is imported.
- RLS policies still wait for Auth. New tables have RLS enabled with **no policies** (same as 001).

---

## Recommended acquisition / import workflow (Step 5.2+)

1. Apply `003` in Supabase after review (not done in 5.1).
2. Add read RLS for authenticated/service use (Auth step) before the Companies UI connects.
3. Import **identity-only** batches: legal name, trading name, Arabic name, website, city, region, CR if available.
4. Dedup gate: CR → domain → normalized name → aliases.
5. Attach sources immediately; leave `verification_status = Unverified`.
6. Classify industry / customer type / services as a second pass.
7. Add locations for industrial cities and plants.
8. Keep mock companies in the UI until an explicit cutover.

---

## Out of scope for 5.1

Inserting companies, applying 003, deleting mocks, wiring the Companies page, changing scores, Auth.
