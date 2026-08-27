# Contact persist grain (STEP 7.8)

Policy only. **Does not insert contacts.** Does not change companies, STP scores, or entity resolution.

One `contacts` row per person. `company_id` is the persist grain. Facilities **inherit** account/parent contacts in the UI. They do not get a second person row.

## Attach rules

| Grain | When | `company_id` |
|---|---|---|
| **FACILITY** | Source names that facility (distinct site tokens, or proven facility relationship) | That facility |
| **ACCOUNT** | Capture company is the group ACCOUNT, or source is the legal company | The ACCOUNT member |
| **ACCOUNT_GROUP_PARENT** | Corporate/group executive captured while viewing a facility/branch | The group ACCOUNT (parent) |

Never attach to RELATED/REVIEW. Never invent a parent if the group has no ACCOUNT member — HOLD.

Corporate titles (VP, CEO, CFO, President, Executive Management, board) without a named facility stay on the parent.

`contact_service_relevance` stays on the person (`contact_id`, `service_id`). Optional `stp_score_id` must match **persist** `company_id`, not a different ranked facility STP row.

## UI inheritance

On a FACILITY or BRANCH page in the same `account_group_key`:

- **Owned:** contacts whose `company_id` is this facility
- **Inherited from account:** contacts whose `company_id` is the group ACCOUNT, labeled inherited, linked to the parent. Not copied.

Sibling facilities do not see each other’s facility contacts. Facility contacts do not auto-appear on the parent.

## Petro Rabigh (7.7)

Group `er:v1:id:039f7219-431b-4467-9a89-9cdc89b1e226`:

- ACCOUNT: Rabigh Refining and Petrochemical Company (`039f7219-…`)
- FACILITY: Petro Rabigh Polymer Operations (rank-1 capture)
- FACILITY: Petro Rabigh Refining Operations

Fahad AlTherwi, VP Engineering and Support, official corporate page, source company “Petro Rabigh”, no polymer/refining site named → **ACCOUNT_GROUP_PARENT** → attach to Rabigh Refining and Petrochemical Company. Polymer Operations **displays** the row as inherited. Do not INSERT yet.

Canonical code: `src/lib/contacts/persist-grain.ts`
