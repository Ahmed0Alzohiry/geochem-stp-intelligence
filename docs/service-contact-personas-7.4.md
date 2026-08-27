# Service contact persona map (STEP 7.4)

PCH reference map only. **Not people.** Does not write contacts, companies, locations, or STP scores.

Workflow: Service → ranked STP account → **department** → **job function / persona** → (later) person → details → evidence.

## PCH personas (priority 1–3)

| Priority | Department | Job function | Buying role | Score |
|---|---|---|---|---|
| 1 | Laboratory | Laboratory | TECHNICAL | 100 |
| 1 | QA/QC | Quality | TECHNICAL | 95 |
| 1 | Procurement | Procurement | PROCUREMENT | 90 |
| 2 | Engineering | Technical Services | TECHNICAL | 85 |
| 2 | Inspection | Inspection | TECHNICAL | 80 |
| 2 | Procurement | Contracts | PROCUREMENT | 78 |
| 3 | Engineering | Operations | USER | 72 |
| 3 | Procurement | Commercial / Vendor Management | GATEKEEPER | 70 |

Other services: empty until a later step. Operations/Commercial are functions hosted on Engineering/Procurement because those departments are not in the current catalog.

Canonical code: `src/lib/contacts/service-persona-map.ts`  
Persist (unapplied): `supabase/migrations/010_service_contact_personas.sql`
