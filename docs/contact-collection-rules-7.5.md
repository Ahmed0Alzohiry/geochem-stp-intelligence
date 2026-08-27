# Contact collection rules (STEP 7.5)

Rules only. **Do not scrape. Do not invent people. Do not insert contacts yet.**

Workflow: **Selected service → ranked STP company → relevant department / job function → verified person → contact details → evidence / source.**

PCH is the reference service. A person is accepted only when a reliable **public** source names them in a **current** role at the **same ranked company**, mapped to a **PCH persona**.

## Allowed sources (priority)

| Priority | `evidence_type` | Tier | Persist? | Verified alone? |
|---|---|---|---|---|
| 1 | Regulator / government | A | Yes | Yes |
| 2 | Official website | B | Yes | Yes |
| 3 | Company directory (corporate domain) | B | Yes | Yes |
| 4 | LinkedIn | C | No — HOLD | No |
| 5 | Trade directory | D | No — HOLD | No |
| 6 | News | D | No — HOLD | No |
| 7 | Internal GEOCHEM | Internal | No | No |
| 8 | Other | Disallowed | No | No |

Collection is **human capture of a live URL**. Automated website scraping is out of scope.

## Evidence bundle (required to evaluate)

`source_url` (http/https), `source_name`, `evidence_type`, `source_confidence` (HIGH / MEDIUM / LOW).

Copied from the source, never inferred: `full_name`, `job_title`, company name on the page. Email, phone, and LinkedIn only if the source shows them.

## Verification

| Status | Rule |
|---|---|
| Unverified | Default. Incomplete identity or discovery-only capture. `verified_at` must be empty. |
| Partially Verified | Named person, current role, same company, complete evidence on an allowed public source. Typical persist status before a dated A/B confirmation. |
| Verified | Partially Verified **plus** persist-ready A/B source, HIGH or MEDIUM confidence, PCH persona match, `verified_at` set to the date the researcher confirmed the live page. |

LinkedIn, news, trade directories, and internal notes **cannot** mark Verified and **cannot** persist a person alone.

## `verified_at`

Required if and only if status is **Verified**. Empty for Unverified. Must be a real date, not in the future. It is the confirmation date, not an inferred hire date.

## Duplicates

One `contacts` row per person per `company_id`. Do not clone per service — use `contact_service_relevance`.

Block persist when the same company already has the same `lower(email)`, `lower(linkedin_url)`, or normalized `full_name`. Do not copy a person from a parent onto a facility without source evidence they work at that entity.

## Data quality / persist bar (ACCEPT)

- Ranked for the selected service (PCH STP list).
- Real person name (not “QA Manager”, “Unknown”, one token).
- Department + job function match an active PCH persona.
- Persist-ready source (A/B).
- No invented email/phone.
- No shared mailbox as the person.
- Claimed verification must not exceed derived verification.

**HOLD** = named person on a non-persist source (e.g. LinkedIn) or missing persona mapping. Keep out of `contacts`.  
**REJECT** = invented, wrong company, duplicate, over-claimed Verified, or missing public URL.

Canonical code: `src/lib/contacts/collection-rules.ts`
