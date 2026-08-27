# PCH reference STP model (STEP 6.17)

Validated freeze for GEOCHEM Petrochemical Services (PCH). Scoring model **6.4.0**. Weights and thresholds are unchanged. **350** current rows in `company_service_stp_current`.

## Coverage

| Area | Status |
|---|---|
| Service selection | Targeting defaults to PCH. PET (and other services) stay empty until persisted. |
| Segmentation / eligibility | PCH industry scope and eligibility reasons persist on each row. Segmentation UI is taxonomy-only, not the scorer. |
| Account-group handling | One representative per `account_group_key`. RELATED is never representative (4 groups skipped). |
| Scoring dimensions | Industry, Application, Service Need, Commercial Potential, Customer Type, Geographic, Strategic. UNKNOWN is not zero. Data confidence is separate. |
| Ranking | Unique groups, score desc then group key. Rank 1: Petro Rabigh Polymer Operations, **97.2**, Tier 2. |
| Tier assignment | T1 **0**, T2 **16** (Application Fit ≥ 70), T3 **334**. Known-weight floors apply. |
| Targeting dashboard | Reads current PCH STP. **1,769** companies. T1 card shows **0**. |
| Target account detail | Read-only persisted row: scores, eligibility, HIGH locations, positioning. |
| Positioning / why-target | Stored playbook + dimension rationale. Same PCH sentence for all 350. |
| Data-confidence limitations | Completeness band is not in the commercial total. HIGH locations: **8**. |
| Contact-data readiness | Roles/departments are playbook labels only. No named contacts in the STP flow. |

## VERIFIED AND WORKING

- PCH is the default selected service; isolation from PET holds.
- Eligibility, 6.4.0 commercial score, tiers, and ranking persist and match a live in-memory rescore (no drift at freeze).
- Account-group uniqueness: 350 / 350. RELATED representatives: 0.
- Dashboard, targeting list (paginated), and account detail read `company_service_stp_current` only.
- UNKNOWN dimensions render as UNKNOWN.
- Rank-1 detail shows verified HIGH Rabigh location and stored why-target.

## DATA QUALITY GAPS

- Geographic Fit UNKNOWN: **345 / 350** (only 8 HIGH `company_locations`).
- Service Need Fit UNKNOWN: **350 / 350**.
- Commercial Potential UNKNOWN: **350 / 350**.
- Customer Type Fit UNKNOWN: **327 / 350** (imported customer type often unused by the dimension).
- No named people: STP stores recommended **roles** (Technical, Procurement) and **departments**, not contacts.

## FUNCTIONAL GAPS

- Segmentation page does not select PCH or feed ranking.
- Dashboard has no service selector (always PCH counts).
- Ranked table includes **322** rows that are not `ranking_eligible` (28 are).
- Positioning is a generic PCH playbook prefixed with company name, not account-specific copy.
- Pipeline/opportunities are empty; no contact capture on the target-detail path.

## ITEMS REQUIRED BEFORE PRODUCTION USE

1. Named contacts (or an explicit “roles only” operating rule).
2. Verified locations for accounts that should have Geographic Fit.
3. Evidence for Service Need and Commercial Potential (today all UNKNOWN).
4. Decision: show all 350 representatives vs ranking-eligible only.
5. Optional: service switch on dashboard; account-specific positioning.
6. Do not treat this freeze as clearance to persist PET or other services.

Persisted PCH current rows at freeze: **350**. This document does not authorize rescore or rewrite.
