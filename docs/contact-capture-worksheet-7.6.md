# Contact capture worksheet (STEP 7.6)

Rank-1 **PCH** account only. Human research from a live public URL. **Does not insert contacts.**

Route: `/targeting/capture`

Locked from persisted STP: company, service, rank, tier, commercial score.  
Researcher captures: persona, name, title, optional LinkedIn/email/phone, source URL/type/name, evidence notes, verification date/status.

Every Evaluate click runs `evaluateContactCandidate` (7.5). Worksheet labels:

- ACCEPT = persist-ready later (still not written)
- REVIEW = 7.5 HOLD, or ACCEPT blocked by missing evidence notes
- REJECT = 7.5 REJECT (invented name, missing source, wrong company, etc.)
