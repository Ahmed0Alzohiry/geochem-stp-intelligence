# Company import guide

Use `docs/company-import-template.csv` for staging loads. DEMO rows are fictional and must not be promoted as real GEOCHEM accounts.

Do not scrape automatically. Do not import the CSV straight into `public.companies`.

---

## Column reference

| Column | Required | Allowed values / notes |
|---|---|---|
| batch_id | Yes | e.g. `W1-B1` (Wave 1, Batch 1) |
| source_row | Yes | Integer row number in the researcher workbook |
| company_name | Yes | Trading / common name |
| legal_name | No | Registered English legal name |
| name_ar | No | Arabic name; leave blank if unknown |
| alias_name | No | Extra name to store as alias after promotion |
| website | No | Full URL if known |
| website_domain | No | Host only (`aramco.example`); leave blank to derive later |
| commercial_registration_number | No | Saudi CR; never invent |
| industry | No | Must match `industries.name` when filled (e.g. Oil & Gas, Refining, Petrochemicals) |
| subsector | No | Free text |
| customer_type | No | Must match `customer_types.name` when filled |
| region | Yes | `Western Region`, `Eastern Region`, or `Central Region` |
| city | Yes | HQ or primary city (Yanbu, Jeddah, Jubail, …) |
| industrial_city | No | e.g. Yanbu Industrial City, Jubail |
| parent_company_name | No | Group name if subsidiary / site of a group |
| business_description | No | Short English description |
| main_activities | No | Short activity list |
| location_type | No | `Headquarters`, `Operating site`, `Industrial city`, `Project site`, `Other` |
| location_city | No | If this row is a **site** rather than HQ |
| source_url | Yes | Page actually used |
| source_type | Yes | `Official website`, `Regulator / government`, `Annual report`, `Trade directory`, `News`, `Internal GEOCHEM`, `Analyst research`, `Other` |
| source_reliability | Yes | `High`, `Medium`, `Low`, `Unknown` |
| source_tier | Yes | `A`, `B`, `C`, `D` (see acquisition pipeline) |
| verification_status | Yes | `Unverified`, `Partially Verified`, `Verified` |
| last_verified_at | No | ISO date `YYYY-MM-DD`; required if Verified |
| data_completeness_status | No | `Draft`, `Incomplete`, `Complete`; default Incomplete on promote |
| is_demo | Yes | `true` for template samples; production research = `false` |
| researcher_notes | No | Free text |

Staging (not in CSV, set by import job): `normalized_name`, `dedup_status`, `matched_company_id`, `import_decision`, `reviewer_notes`.

---

## Source tier vs verification

- Tier A/B may become Partially Verified or Verified (Verified needs URL + date + High/Medium reliability).  
- Tier C/D stay Unverified (or Partially Verified only after a later Tier A/B check).  
- Never set Verified from news or directories alone.

---

## Dedup outcomes (after staging match)

| import_decision | Meaning |
|---|---|
| NEW_COMPANY | Promote to `companies` |
| UPDATE_EXISTING | Merge into `matched_company_id` |
| MANUAL_REVIEW | Ambiguous; do not promote |
| FACILITY_OF_EXISTING | Promote as `company_locations` only |
| REJECT | Out of GEOCHEM universe or junk |

---

## First batches

1. 100 Western industrial accounts  
2. 200 Western/Eastern petrochemical, utility, manufacturing  
3. 200–700 further qualified orgs in reviewed sub-batches  
