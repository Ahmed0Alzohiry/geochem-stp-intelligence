# Saudi company acquisition pipeline

Workflow for collecting the first 500–1,000 GEOCHEM-relevant Saudi organizations.

**This step does not insert companies, scrape sites, apply SQL, or connect the Companies UI.**

Collection **priority** is research sequencing. It is **not** STP targeting rank.

---

## Acquisition pipeline

### A. Geography waves

| Wave | Region | Focus cities / clusters |
|---|---|---|
| 1 | Western Saudi Arabia | Yanbu, Rabigh, Jeddah, plus nearby industrial clusters (e.g. King Abdullah Economic City / Rabigh corridor) |
| 2 | Eastern Province | Jubail, Dammam, Al Khobar, Ras Tanura, plus other major Eastern industrial clusters |
| 3 | Central / mining / projects | Riyadh, Ras Al-Khair, selected mining clusters, major EPC / giga-project ecosystems |

Complete Wave 1 review before scaling Wave 2. Do not skip Western industrial density because Eastern NOCs score higher in targeting later.

### B. Sector sequence (within each wave)

1. Oil & Gas / Refining  
2. Petrochemicals / Chemicals  
3. Power & Utilities  
4. Water & Wastewater  
5. Industrial Manufacturing  
6. EPC / Projects  
7. Mining & Minerals  
8. Marine / Ports  
9. Government / Public Sector  

A Western refinery is collected before an Eastern mining name in Wave 1 work, even if the miner later becomes a Tier 1 target.

### C. Operating model

1. Research into **staging** (`company_import_staging`), never straight into `public.companies`.  
2. Dedup gate.  
3. Human review for ambiguous rows.  
4. Promote only `NEW_COMPANY` / `UPDATE_EXISTING` / `FACILITY_OF_EXISTING` decisions.  
5. Attach `company_sources` on promotion.  
6. Close the batch before opening the next.

---

## Source hierarchy

| Tier | Typical sources | Reliability | Default verification | Can verify identity alone? |
|---|---|---|---|---|
| **A — Official / government** | Ministry / regulator listings, Saudi gazette, official CR extracts, SAW, municipal / RCJY / Royal Commission directories, official industrial-city tenant lists | High | Partially Verified after identity match; Verified when name + CR or official listing + date are captured | **Yes** — identity (name, CR, city) |
| **B — Official company** | Company website About/Contact, annual report, official IR PDF, official LinkedIn company page used only as corroboration | High–Medium | Partially Verified with live URL; Verified with official site **and** matching legal/trading name (and CR if shown) | **Yes** — identity if URL is the real corporate domain |
| **C — Industry / association / exhibition** | GPCA, SPE, Water Arabia, industrial-city exhibitions, chamber directories, association member lists | Medium | Unverified or Partially Verified; never Verified on this tier alone | **No** — discovery + hypothesis only |
| **D — Discovery** | News, maps, tenders, analyst notes, third-party databases, Wikipedia | Low–Unknown | Unverified | **No** |

Promotion to **Verified** requires at least one Tier A or Tier B source with reliability High or Medium, `source_url` stored, and `last_verified_at` set. Tier C/D may create a staging row; they must not mark production `verification_status = Verified`.

---

## Minimum import fields

**Required to enter staging**

| Field | Rule |
|---|---|
| company_name | Required |
| source_url | Required |
| source_type | Required |
| source_reliability | Required |
| verification_status | Required; default Unverified |
| region | Required (Western / Eastern / Central or mapped name) |
| city | Required for HQ or primary site |

**Include when available (do not block import)**

legal_name, name_ar, website, website_domain, commercial_registration_number, industry, subsector, customer_type, industrial_city, parent_company_name, business_description, main_activities, last_verified_at, alias_name, location_city, location_type, notes

Empty optional cells are valid. Do not invent CR numbers or Arabic names.

---

## Dedup logic

Match **production** `companies` + `company_aliases` + `company_locations` in this order:

1. **commercial_registration_number** (exact, trimmed)  
2. **website_domain** (normalized host, no `www.`)  
3. **normalized legal/company name** (`normalize_company_name(legal_name)` then `company_name`)  
4. **company aliases** (`normalized_alias`)  
5. **facility/site** — name looks like “{Parent} {City/Plant}” and parent already exists, or city matches an existing location of a matched parent  

| Outcome | When | Action |
|---|---|---|
| NEW COMPANY | No match on 1–4; not a facility of a known parent | Insert `companies` + source (+ location if site given) |
| EXISTING COMPANY — UPDATE | Single confident match on 1, 2, or 3 | Fill empty production fields; add source; do not overwrite Verified fields with weaker data |
| POSSIBLE DUPLICATE — MANUAL REVIEW | Two different keys match two companies, or name is fuzzy/partial | Leave in staging |
| FACILITY OF EXISTING COMPANY | Step 5 match to one parent | Insert `company_locations` (and optional Facility alias); do not create a second company |

---

## Staging process

Raw research → CSV → `company_import_staging` → reviewer → promote.

Staging holds the source row, raw and normalized names, URL, verification, dedup status, matched company id, import decision, and reviewer notes. Production tables are written only after decision is approved.

Recommended SQL: `supabase/migrations/004_company_import_staging.sql` (**not applied**).

---

## Data quality rules

### verification_status

| Status | Minimum evidence |
|---|---|
| Unverified | Name + source URL only (typical Tier C/D) |
| Partially Verified | Identity confirmed: official website **or** government/CR listing matching the name; city or region present |
| Verified | Partially Verified **plus** Tier A or B source, High/Medium reliability, `last_verified_at` set. Commercial estimates still use `data_confidence`, not this flag |

### data_completeness_status (after promotion)

| Status | Minimum profile |
|---|---|
| Draft | Name + source only |
| Incomplete | Draft + region + city |
| Complete | Incomplete + industry + customer type + at least one intended GEOCHEM service (`company_services`) |

---

## Batch import strategy

| Batch | Size | Scope | Gate |
|---|---|---|---|
| 1 | **100** | Wave 1 Western high-relevance industrial (refining, petrochemicals, utilities, water, manufacturing in Yanbu / Rabigh / Jeddah) | 100% staging review; zero unresolved MANUAL_REVIEW |
| 2 | **200** | Remaining Western + start Eastern petrochemical, utility, manufacturing | Same review; confirm no duplicate Jubail/Yanbu groups |
| 3 | **200–700** | Finish Eastern clusters; then Wave 3 Riyadh / Ras Al-Khair / mining / EPC | Smaller sub-batches (100–150) if match rate drops |

Do not start Batch 2 until Batch 1 promotion errors are zero.

---

## CSV template

See `docs/company-import-template.csv` and `docs/company-import-guide.md`.
