# Batch 1 research guide

Use `data/imports/batch-01-saudi-companies.csv` for Wave 1 Western Saudi industrial accounts (target ~100 rows).

The file currently has **headers only**. Do not invent companies to fill it.

This CSV is the same column set as `docs/company-import-template.csv` and is accepted by the Step 5.6 loader without renaming columns.

```text
npx tsx --env-file=.env.local src/lib/import/run-staging-import.ts --csv data/imports/batch-01-saudi-companies.csv
```

Add `--read-production --write-staging` only when a reviewed research batch is ready for staging. That still does **not** insert `public.companies`.

---

## Batch 1 scope (collection, not targeting rank)

Geography: Western Saudi Arabia — Yanbu, Rabigh, Jeddah, nearby industrial clusters.

Sector order: Oil & Gas / Refining → Petrochemicals / Chemicals → Power & Utilities → Water & Wastewater → Industrial Manufacturing → then EPC, mining, marine, government only if they are clearly in-scope for this wave.

One commercial account per row. A plant or industrial-city site of a known parent is a **facility row** (`location_type` = Operating site / Industrial city / Project site plus `parent_company_name`), not a second company.

---

## Hard rules

- Source provenance is **mandatory** for every real row: `source_url`, `source_type`, `source_reliability`, `source_tier`.
- `is_demo` must be `false` for Batch 1 research.
- If a fact is not on the cited source, leave the cell **blank**. Use `Unknown` only where the loader allows that token (`source_reliability`).
- Never invent CR numbers, Arabic names, websites, or activities to make a row look complete.
- Do not scrape automatically. Record the page you actually used.

---

## Columns

| Field | Required | Format / allowed values | Notes |
|---|---|---|---|
| `batch_id` | Yes | Text. Use `W1-B1` for this file. | Identifies the import batch. |
| `source_row` | Yes | Positive integer, unique in this file (1, 2, 3…). | Researcher workbook row; staging unique key is (`batch_id`, `source_row`). |
| `company_name` | Yes | Trading / common name as written on the source. | Loader normalizes letters/digits only for matching. |
| `legal_name` | Optional | Registered English legal name. | Blank if not on the source. Preferred for name matching when present. |
| `name_ar` | Optional | Arabic name. | Blank if unknown. Do not machine-translate. |
| `alias_name` | Optional | One extra name (short form, former name). | Blank if none. |
| `website` | Optional | Full `https://…` URL. | Blank if unknown. Must agree with `website_domain` if both are filled. |
| `website_domain` | Optional | Host only, no `www.` (e.g. `company.com.sa`). | May be left blank; loader can derive it from `website`. |
| `commercial_registration_number` | Optional | Saudi CR digits; spaces/dashes allowed. | Loader strips to digits. Never invent. Strongest dedup key. |
| `industry` | Optional | Must match live `industries.name` when filled: Oil & Gas, Refining, Petrochemicals, Chemicals, Power & Utilities, Water & Wastewater, Industrial Manufacturing, Mining & Minerals, Marine / Ports, EPC / Projects, Government / Public Sector. | Blank if not evidenced. |
| `subsector` | Optional | Free text. | e.g. fuels, IWPP — only if sourced. |
| `customer_type` | Optional | Must match live `customer_types.name` when filled: Asset Owner, Operator, Manufacturer, EPC Contractor, O&M Contractor, Trader, Government Entity, Technical Partner. | Blank if not evidenced. |
| `region` | Yes | `Western Region`, `Eastern Region`, or `Central Region`. | Batch 1 should be `Western Region`. |
| `city` | Yes | HQ or primary city (Yanbu, Rabigh, Jeddah, …). | Required even for site rows. |
| `industrial_city` | Optional | e.g. Yanbu Industrial City. | Blank if not applicable. |
| `parent_company_name` | Optional | Group / parent trading name. | Required in practice for facility rows. |
| `business_description` | Optional | Short English description copied/paraphrased from the source. | Blank if none. |
| `main_activities` | Optional | Short activity list from the source. | Blank if none. |
| `location_type` | Optional | `Headquarters`, `Operating site`, `Industrial city`, `Project site`, `Other`. | Use a site type (not Headquarters) when the row is a facility of a parent. |
| `location_city` | Optional | City of the site if different from HQ `city`. | Often same as `city` for Western plant rows. |
| `source_url` | Yes | `http://` or `https://` URL of the page used. | Mandatory provenance. |
| `source_type` | Yes | `Official website`, `Regulator / government`, `Annual report`, `Trade directory`, `News`, `Internal GEOCHEM`, `Analyst research`, `Other`. | Prefer official website or regulator. |
| `source_reliability` | Yes | `High`, `Medium`, `Low`, `Unknown`. | Use `Unknown` when you cannot judge; do not guess High. |
| `source_tier` | Yes | `A`, `B`, `C`, `D`. | A = official/government; B = official company; C = industry/association/exhibition; D = discovery (news, maps, tenders). |
| `verification_status` | Yes | `Unverified`, `Partially Verified`, `Verified`. | See verification rules below. Default new research to `Unverified` unless evidence meets a higher bar. |
| `last_verified_at` | Conditional | `YYYY-MM-DD`. | **Required if** `verification_status` is `Verified`. Blank otherwise is fine. |
| `data_completeness_status` | Optional | `Draft`, `Incomplete`, `Complete`. | Profile completeness, not verification. Leave blank or `Draft`/`Incomplete` until industry + customer type + intended services exist (services are not in this CSV). |
| `is_demo` | Yes | `false` for Batch 1 real research. | `true` is only for DEMO templates, not this file. |
| `researcher_notes` | Optional | Free text. | Capture doubts, alternate URLs, why a field was left blank. |

Staging-only fields (not in this CSV; set by the loader/matcher): `normalized_name`, `dedup_status`, `matched_company_id`, `import_decision`, `reviewer_notes`.

---

## Source provenance (mandatory)

Every real row needs a real URL and an honest type/tier/reliability.

| Tier | Typical sources | Can support Verified identity alone? |
|---|---|---|
| A | Regulator / government listings, official CR extracts, Royal Commission / industrial-city tenant lists | Yes, with date |
| B | Company website About/Contact, annual report | Yes, if it is the real corporate domain |
| C | Associations, exhibitions, chamber lists | No |
| D | News, maps, tenders, third-party directories | No |

`Trade directory` and `News` are valid `source_type` values but stay **Unverified** (or at most Partially Verified after a later A/B check). They cannot justify `Verified`.

---

## Verification requirements

| Status | Minimum evidence |
|---|---|
| Unverified | Name + working `source_url` only (typical first capture, especially Tier C/D). |
| Partially Verified | Identity confirmed on an official website **or** government/CR listing that matches the name; `city`/`region` present. |
| Verified | Partially Verified **plus** Tier A or B, reliability High or Medium, `source_url` stored, and `last_verified_at` set. |

Do not mark Verified because a directory listed the name. Commercial estimates stay out of this CSV (`data_confidence` is not an import column).

---

## Normalization (automatic; do not pre-invent values)

- **Name:** lowercased, punctuation/spaces removed, letters and digits kept (including Arabic).
- **Domain:** scheme, `www.`, path, and port stripped.
- **CR:** non-digits stripped.

Dedup order after load: CR → website domain → normalized legal/company name → aliases → facility/site of an existing or earlier-batch parent.

---

## Completeness vs empty cells

A row may be imported as Incomplete/Draft with many blanks. That is correct. Filling `industry`, `customer_type`, or `commercial_registration_number` without a source is not allowed.
