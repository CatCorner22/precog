# What Precog needs to change to be commercially viable (final report, 2026-10-10)

- **Source**: Claude Code session 79f4ec77 (session_01Rfson9Y63BcB71DDXYNrVb), working file `scratchpad/viability/VIABILITY-REPORT.md` (about 21,500 words), built from ten dimension assessments, eleven code reads, a market report with seven research notes, the Voyager design, persona walkthroughs, a validation audit, a pilot design and a critic's 17 findings. The working files are not kept; this entry is the record.
- **Type**: other (assessment report)
- **Author/Origin**: Claude Code (assessors, two AI skeptic passes, a critic, and the validation-design skill), reading `main` at `5dfcc2f` and re-checking some findings at `9afe09b`
- **Published**: 2026-10-10
- **Ingested**: 2026-10-10
- **Tags**: precog, commercial, pricing, legal, validation-design, process, report, audit, security

## Summary

The owner asked what has to change for Precog to be commercially viable. The verdict: Precog cannot be sold today. The open question is whether the idea is right, because no buyer has been asked. The buyer is a CPA or bookkeeping firm that sells a fixed-fee monthly package to businesses of 5 to 30 people; the business owner is the firm's client. "Viable" is defined as monthly profit after all cash costs and paid support at or above a draw the owner chooses. The report stages 40 changes (Stage A before the first pilot, B before the first dollar, C before scaling, D later), prices the path at $8,020 to $19,900 one-off to the first dollar plus an unpriced E&O premium, and designs the first paying pilot so that it can fail. Every blocker is paperwork the owner (a lawyer) can draft, a configuration change, or a narrow code change.

## Key concepts

### The five obstacles, in the order they bite

1. **No buyer has been asked.** 1,598 commits since 2026-08-07 and no recorded firm, interview, pilot or payment. The plan's 12 firm and 8 owner interviews (weeks 3 to 4 from 2026-09-22) have not started.
2. **Precog cannot go live under its own build rule, and no legal entity exists.** Four bracketed operator placeholders (`legal/operator.ts:9-12`) block the production build (`scripts/migrate.mjs:123-129`). GitHub lists 0 deployments, but `firm/entitlements.ts:19` calls 2026-10-05 "the first production deploy"; the owner confirms. No assignment moves the code to a company.
3. **The signed report would not survive a firm's lawyer.** Assurance words ("Reviewed for issuance", "Issued by") above a footer that disclaims AICPA standards; unverified case records naming convicted private people (53 at `5dfcc2f`, 65 at `9afe09b`); 0 to 100 headline indices from unvalidated weights; no generated PDF.
4. **Precog's own pilot measures pass by construction.** "Findings judged valid" reads 100% until someone clicks "Not valid"; a "complete map" is two people holding one duty each.
5. **The owner's hours go to building, not selling.** Commits in 59 to 70 distinct clock-hours a week (an upper bound); five AI tools write to one repository; `main` failed its checks on 35 to 40 of its last 100 pushes; the owner's weekly hours are written nowhere.

### What stays

The core loop (all four round-3 personas finished the core tasks), the counts a CPA can recompute, the firm's letterhead deliverable, the save path, the billing code (about 3,800 lines, 209 tests, never met a real Stripe event), the production placeholder guard and AI ceilings, the owner's validation plan design, and the persona protocol. Infrastructure costs about $1 to $4 per client business a month. No direct competitor was found in 48 searches, but two earlier attempts went dormant (Vitalics Internal Control Application; a 2013 Journal of Accountancy self-assessment), which may mean thin demand.

### The staged changes

Stage A is split: **A-start** (before client data enters Precog, target 2026-11-20, pilot 1 by 2026-11-23) and **A-report** (before the first report leaves the firm, about 2026-12-04).

| #   | Change                                                                                                                                                                                   | Priority and stage                             |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------- |
| A1  | Pre-register the claim, thresholds, cash, draw, four dated gates and an amendments table in one dated commit                                                                             | Blocker, A-start                               |
| A2  | Sell-first calls to about 10 warm contacts ending in a priced offer; one host firm; written consent for related contacts (Rule 1.8(a))                                                   | Blocker, A-start                               |
| A3  | One-page priced pilot letter: 45 to 50 days over two month-ends, 3 to 5 clients, pass bars, liability cap, no-reliance clause, data-entry role; one outside lawyer reads it              | Blocker, A-start                               |
| A4  | Form an LLC, assign Precog to it, fill the placeholders, knockout trademark search, Rule 1.8(a)/5.7 ethics memo, ACFE permission, rename "COSO heat map"                                 | Blocker, A-start                               |
| A5  | One real production deploy with its own database, or confirm the one that exists                                                                                                         | Blocker, A-start                               |
| A6  | Ruleset on `main` requiring the Release gate, revert-first rule, private repository, MFA on every console                                                                                | Blocker, A-start                               |
| A7  | Error alerts, uptime check, weekly cron check, $100 prepaid xAI cap                                                                                                                      | High, A-start                                  |
| A8  | One timed restore drill, a 7-day backup window, a true Privacy sentence about backups                                                                                                    | High, A-start                                  |
| A9  | Consulting wording ("Record my review", "sent" not "issued"), stored attestation, owner decisions on the cover, an engagement-letter clause, one CPA's read                              | Blocker, A-report                              |
| A10 | Only verified cases on client reports, no third-party personal names, freeze the library, source the ACFE figures                                                                        | Blocker; steps 1 to 4 A-start, 5 to 7 A-report |
| A11 | Confirmed controls only, counts on page one with indices in an appendix (layout 10), delete the 12% frequency and scenario dollars, one count, browser "Save as PDF" with a print header | Blocker; step 4 A-start, rest A-report         |
| A12 | One first step: the report's `firstStep` from `firstDoNextLine`                                                                                                                          | High, A-report                                 |
| A13 | Say the rulebook is unreviewed, print `RULEBOOK_VERSION`, fix four known defects, the pilot partner reviews the rules                                                                    | High, A-report                                 |
| A14 | Pilot measures that cannot flatter: "not yet judged", a stricter complete map, a stopwatch time log                                                                                      | High, A-start                                  |
| A15 | An independent flat-fee grading CPA and a metrics auditor engaged by 2026-10-23                                                                                                          | Blocker, A-start                               |
| A16 | A DPA, one subprocessor list pinned by a test, Hugging Face unset, a security summary, an honest Privacy page                                                                            | Blocker, A-start                               |
| A17 | Pilots on email and password; hide Google and X; ask Grok who runs `auth.grok.me` and to rotate the public preview secret                                                                | High, A-start                                  |
| A18 | Setup drafts survive a closed tab, a leave-page warning on the procedure editor, restore #244's no-tick rule                                                                             | High; step 1 A-start, rest A-report            |
| A19 | Label model-written text; record who accepted each recommended move; Colorado AI Act memo                                                                                                | High, A-report                                 |
| A20 | Wording for the firm, `/firms` page, flags off for analysis tabs, delete overclaims, remove "The QuickBooks link"                                                                        | Medium, A-report                               |
| A21 | Moved to Stage B as B7                                                                                                                                                                   | —                                              |
| A22 | Two fixed 4-hour selling blocks a week; freeze new features and Voyager until the first paid letter; merge once a day                                                                    | High, A-start                                  |
| A23 | Open Stripe in the LLC's name; one real payment and one refund before 2026-11-20                                                                                                         | Blocker, A-start                               |
| A24 | Bind technology E&O and cyber insurance before the first report leaves a firm                                                                                                            | High, A-report                                 |
| B1  | Publish only Firm Starter; hide the Assessment, unpriced tiers and yearly column; $25 per-client floor                                                                                   | Blocker, B                                     |
| B2  | Invoice the first payers; rehearse self-serve Checkout before 2027-01-04                                                                                                                 | Blocker, B                                     |
| B3  | Terms that keep only promises the code or the owner keeps; Rule 5.7 sentence                                                                                                             | High, B                                        |
| B4  | A real support mailbox, a service promise, a monthly ledger                                                                                                                              | High, B                                        |
| B5  | A second operator (a contractor) who has rehearsed deploy, restore and Stripe                                                                                                            | High, B                                        |
| B6  | Print each credited control's last monthly-check result, or "never recorded"                                                                                                             | Medium, B                                      |
| B7  | The real-user test: 5 owners and 5 CPAs, unaided, on production                                                                                                                          | High, B                                        |
| C1  | Security programme on a trigger: in-app MFA, audit-log role, CAIQ-Lite, pen test, SOC 2 trigger                                                                                          | High, C                                        |
| C2  | A part-time senior engineer as reviewer of record, after the first paid conversion                                                                                                       | High, C                                        |
| C3  | Billing completeness: trial, receipts, cancel and change-tier buttons                                                                                                                    | Medium, C                                      |
| C4  | Per-firm AI pool and split weekly job; the shared cap binds near 1,150 businesses                                                                                                        | Medium, C                                      |
| C5  | Channel: case study, referral offer, Intuit terms, crime-insurance page                                                                                                                  | Medium, C                                      |
| C6  | Narrow the industry picker to the pilot firms' industries plus General                                                                                                                   | Medium, C                                      |
| C7  | An architecture map and guard tests for a second engineer                                                                                                                                | Medium, C                                      |
| D1  | Voyager slices 0b to 4 (50 days) behind their own gates                                                                                                                                  | Medium, D                                      |
| D2  | SOC 2, single sign-on and row-level security on the C1 trigger                                                                                                                           | Low, D                                         |

Changes dropped by both skeptics: a "send setup" link, the phone card layout, a merge queue through a new organisation, a database "pilot block", funnel fields, yearly prepayment as the lead offer, a shared support inbox.

### The money (all estimates)

- **Break-even** at ARPA $289 and 10 clients a firm, with support bought at $35 an hour: **11 firms** for costs only, **29 firms for a $4,000 draw**, **47 firms for an $8,000 draw**. At 5 clients on Starter ($149): 21, 56, 90. At 10 clients on Practice ($399): 8, 20, 32. Clients per firm is the largest lever.
- **Cash to the first dollar**: Stage A $6,470 to $17,350 (20.5 owner days, 25 engineering days); Stage B $1,550 to $2,550; total **$8,020 to $19,900** one-off, plus E&O, plus about $85 a month of services and $300 to $1,500 a month of AI coding tools.
- **The central path spends about $18,000 by 2027-03-31** (range $10,000 to $29,000). It breaks a $2,000 monthly ceiling in November ($5,675) and December ($6,320); the default is a one-off pre-pilot budget with the ceiling from April 2027. Revenue to 2027-03-31 is about $300 if pilot 1 converts at $149.
- **Gate 3 (10 paying firms by 2027-10-15) does not pay the owner**: it runs about $150 a month short of costs. Gates: 1 signed letter by 2027-01-15; 3 paying firms by 2027-04-15; 10 by 2027-10-15; about 29 by a date the owner sets (proposed 2028-04-15), needing 115 to 175 qualified offers.
- Market: about 46,000 CPA firms (via search extract); about 2 million businesses of 5 to 49 people (unverified). Market size does not limit Precog; reaching and converting firms does.

### The first paying pilot

- **The claim**: a CPA or bookkeeping firm with a fixed-fee monthly package for businesses of 5 to 30 people will pay Precog's stated per-client price after two month-ends on its own clients, run the monthly checks across several clients, and put its name to the reports as a consulting deliverable.
- **Four parts must each pass**: Pay, Monthly, Across clients, Sign. Supporting conditions: Correct, Actionable (restored from plan line 58), Cheaper.
- **What "no" looks like**: no signature from at least 12 qualified firms by 2027-01-15; no payment at the letter's price, or only after a discount of more than 50%; under 30% of pilot clients complete the second month; under 50% of critical findings valid.
- **Shape**: three firms, 3 to 5 clients each, two month-ends each; pilot 1 checks due 2026-12-10 and 2027-01-11, converts by 2027-01-25; cohort decision 2027-03-31 (2 or 3 pass: proceed; 1: one rerun; 0: stop). Two of three passing gives a Wilson range of about 21% to 94%, so "proceed" means "worth six more months of selling". Interim stops (a wrong count on a sent report, a data incident, an "Unverified" case or a third party's name on a signed page, a firm withdrawing) count as a fail.
- **Thirteen amendments to the owner's plan**, each dated 2026-10-10: for example, H5's 90-day pilot becomes 45 to 50 days; five pilots become three firms; H4 "50% actionable" is kept; plan decision 15 is reversed; pilots 2 and 3 choose a start by 2026-12-14, after 2027-04-15, or January reported as a busy-season pilot.

### The 30 owner decisions, with defaults

1. Buyer: the CPA or bookkeeping firm.
2. Zero signatures from 12 qualified firms by 2027-01-15 means stop: yes, in writing.
3. Cash: about $18,000 to 2027-03-31; $2,000 a month from April.
4. Entity: a single-member LLC in the home state, with all rights assigned.
5. Pilot price: Firm Starter $149 for up to 5 clients; $25 per-client floor.
6. Host firm: the owner's own CPA first, marked related; written consent if also a law client.
7. Engagement type: consulting only.
8. Hugging Face: unset in production.
9. Google and X sign-in: email and password for pilots.
10. Job-title duties: restore #244.
11. Case library naming: no personal names on client reports; name and district in the in-app library only after verification. **This reverses plan decision 15** ("keep names, ages and towns as given in the press releases").
12. Repository: private before pilot 1, "all rights reserved", ask Grok to rotate the preview secret.
13. Grader: a flat-fee CPA engaged by 2026-10-23, working from the preparer's notes.
14. Second operator now (a contractor); the engineer's audit on the first conversion or 3 paying firms.
15. AI coding tools: Claude Code writes, one other tool reviews, merges once a day.
16. Feature freeze until the first paid letter.
17. Scope: pilot firms' industries plus General.
18. Analysis tabs and Plain/Tactical: behind one flag, off.
19. Signed page: counts on page one, indices in an appendix.
20. Scenario dollars hidden; the 12% frequency deleted.
21. Selling time: two fixed 4-hour blocks a week.
22. Voyager starts after the cohort decision reads proceed or at 3 paying firms, whichever is later.
23. The owner's draw: write a figure ($4,000 needs 29 firms, $8,000 needs 47).
24. The owner's weekly hours: state them; the calendar needs about 3.5 owner-days a week to 2026-11-20.
25. Pilots 2 and 3: offer a start by 2026-12-14 first, otherwise after 2027-04-15.
26. Assessment offer: off the published list during pilots.
27. Deliverable: browser "Save as PDF" with a print header; a generated PDF only if the host firm refuses it.
28. Insurance: bind E&O and cyber before the first report leaves a firm.
29. Independent legal read: one outside technology lawyer reads the Terms, DPA and pilot letter.
30. Who enters each client's team: the firm's preparer, with the client's owner invited to confirm.

### Evidence gaps

- **Only the owner can answer** (this week, in order): whether the Grok platform published Precog live with real accounts or data; the owner's weekly hours; the draw figure; the Grok Build and xAI terms of 2026-08-07 (any rights in the output, "Remix"); whether any warm contact is a law client. Also: the real grok-4.5 price and retention terms; who runs `auth.grok.me`; what the "9 October commercial viability review" decided; the Neon and Vercel plans; who the "CatCorner22" account is.
- **Only the first firms can answer**: insurer coverage of a "controls reviewed" line; whether browser print is acceptable; pilot timing; per-client price; whether a firm's lawyer accepts the consulting wording; who types in the client's team; clients per firm; ET 1.520 referral shares; the Colorado AI Act's reach.
- **Primary documents nobody opened**: the ACFE 2024 report's size tables, AICPA CS §100, ET 1.295.030, ET 1.700.040, AT-C §215, 16 CFR Part 314, Intuit partner fees, the AICPA/CPA.com 2024 CAS Benchmark Survey (the one most likely to change the buyer thesis), Census SUSB 2022, vendor pricing pages; no source prices technology E&O.

### Limits

- **One AI model family**: assessors, skeptics, critic and author. Skeptic verdicts were not saved as files.
- **No human CPA, lawyer or engineer** has reviewed the report.
- **Market figures rest on search extracts**: the sandbox proxy refused primary pages. Hosting prices are from memory and unverified.
- Most code citations were read at `5dfcc2f`; only those marked were re-checked at `9afe09b`, 47 commits later.

## Notable quotes and data

> "Can Precog be sold today? No, not yet. The open question is whether the idea is right, because no buyer has been asked." — Section 1

- This week (12 to 16 October): answer the five owner questions (2 hours); commit the pre-registration (12); ruleset, MFA, private repository (4); LLC, knockout search, ethics memo (12); 10 warm contacts and 4 calls booked (4); alerts, AI cap, case-library fence (12 engineering hours).
- 904 of 1,598 commits are authored "Claude"; pull requests #267, #268, #270 and #271 merged within 61 seconds of each other on 2026-10-10.
- The 90-day calendar runs 2026-10-12 to 2027-01-08: 20.5 owner days and 17.5 engineering days in weeks 1 to 6.

## Relationships

- Agrees with: [Validation audit of how wave 2 was verified](precog-validation-audit-wave-2.md): one model family, no person reviewing the diff, and no ruleset on `main`. A6 and A15 are the fixes.
- Agrees with: [Validation audit (wave 1)](precog-validation-audit-wave-1.md), which found nothing enforces CI on `main`.
- Agrees with: [Intuitiveness evaluation (October 2026)](precog-intuitiveness-evaluation-2026-10.md): the real-user test was designed and never run (B7), three different first steps (A12), and job titles ticking duties nobody named (A18). It updates that entry: by persona round 3 all four personas finished the core tasks, though own setup still read "completed after confusion".
- Agrees with: [Voyager design (2026-10-10)](voyager-design-2026-10-10.md) on what Voyager is and that it is not a pilot blocker.
- Contradicts: plan decision 15 in the owner's plan file (`/root/.claude/plans/effervescent-crunching-rose.md:268`), reversed by decision 11. The knowledge base holds no entry for that plan.
- Contradicts: the owner's `docs/COMMERCIAL_VALIDATION_PLAN.md` on pilot length, pilot count and H2's buyer (amendments 1, 2 and 5), and the Voyager design's decision 12 to commit to slices 0 to 4 now (this report freezes Voyager until the first paid letter).
