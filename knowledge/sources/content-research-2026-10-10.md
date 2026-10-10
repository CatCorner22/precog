# Content research notes and benchmark check (2026-10-10)

- **Source**: Claude Code session 79f4ec77 (session_01Rfson9Y63BcB71DDXYNrVb), four research notes in `scratchpad/content/research/` (`canon.md`, `dental-auto-retail.md`, `restaurant-construction-general.md`, `nonprofit-professional.md`, about 34,600 words together) and `scratchpad/content/benchmarks-check.md`. The working files are not kept; this entry is the record.
- **Type**: data (research notes)
- **Author/Origin**: Claude Code research agents using web search; the benchmark check read `evidence/benchmarks.ts` in the `content-e` worktree
- **Published**: 2026-10-10
- **Ingested**: 2026-10-10
- **Tags**: precog, content, research, procedures, scenarios, validation-design

## Summary

Four research notes gathered the canon on segregation of duties, compensating controls and written procedures for businesses of 2 to 25 people, then the money flows, prosecuted schemes, incompatible duty pairs, recommended procedures, monthly checks and vocabulary for eight lines of business. They are the evidence behind PR #270 (merged 2026-10-10, "Content: 33 industry procedures, a 24-case golden dataset and 12 prosecuted cases"), which added 33 procedures to `procedures/library.ts`, the 24-team golden dataset in `golden/cases.ts`, and 12 cases in `evidence/cases.ts` (commit `d56f7ae`, `CASE_COUNT` 53 to 65). **Every web fact came from search-result extracts: the sandbox proxy refused every direct page fetch** (DNS `ENOTFOUND` from WebFetch, 403 on CONNECT), so no primary PDF or page was read in full. The benchmark check found no figure in `benchmarks.ts` plainly wrong and changed none.

## Key concepts

### What each note covers

- **`canon.md`**: COSO 2013 (5 components, 17 principles; segregation of duties is a point of focus under Principle 10, Principle 12 anchors written procedures), COSO's 2006 smaller-company guidance, AICPA engagement types (SSAE 19 AUP reports findings only; CS §100 consulting gives no assurance; SOC 1 and SOC 2), ACFE 2024 figures, the four incompatible functions (authorization, custody, recording, reconciliation) with pairs by process, GAO Green Book §10.03 and §10.12, compensating controls, procedure structure (ISO 9001:2015 clause 7.5.2) and a monthly close checklist.
- **`dental-auto-retail.md`**: practice-management systems and audit trails, EOBs and write-offs, refunds and membership plans (dental); repair orders, parts and core returns, sublet, warranty (auto repair); POS X and Z reports, blind counts, voids, refunds, gift cards and shrink (retail). Cases D1 to D5, A1 to A10, R1 to R8; ten or eleven duty pairs and eight candidate procedures each.
- **`restaurant-construction-general.md`**: POS deposits, voids and comps, tip pools, receiving, pour cost and delivery-platform payouts (restaurant); pay applications, retainage, lien waivers, certified payroll, WIP and change orders (construction); QuickBooks Online roles, audit log, bank-feed rules and vendor bank-detail changes (general office). Cases R1 to R8, C1 to C11, G1 to G10.
- **`nonprofit-professional.md`**: offering counts, mailed gifts, online giving, restricted funds, grant draws, ECFA standards and Form 990 Part VI (nonprofits); IOLTA and three-way trust reconciliation by state (law firms), ERA/835 posting and copays (medical), premium trust (insurance). Cases N1 to N10, L1 to L8, M1 to M6, I1 to I3, C1 to C2.
- **`benchmarks-check.md`**: compares the 12 benchmarks in `evidence/benchmarks.ts` (ACFE 2026 edition: 2,402 cases, 143 countries) with canon §3 (2024 edition: 1,921 cases, 138 countries). Four agree with the only figure available, eight cannot be verified, none is plainly wrong; `benchmarks.ts` and `DEFAULT_FRAUD_STATS` are unchanged and benchmark pages stay empty.

### The strongest sourced facts

- **ACFE 2024**: median loss $141,000 for organisations under 100 employees, against $200,000 over 10,000 (the one sentence quoted from an ACFE PDF extract); global median $145,000; median duration 12 months; tips detect 43%, more than three times the next method; four controls (surprise audits, financial-statement audits, hotlines, proactive data analysis) associated with at least a 50% reduction in loss and duration. Not-for-profit median $76,000.
- **Do not mix editions**: the 2026 edition gives $126,000 for small organisations and about $104,000 globally (one secondary source).
- **COSO and GAO**: where segregation is not practical, management selects alternative control activities (COSO Executive Summary p. 4 via the University of Arizona; GAO-14-704G §10.12 via the Oklahoma State Auditor).
- **The first compensating control** for a 2- to 25-person business is an owner who receives the bank statement directly and reviews it; the second is an independently reviewed, signed monthly bank reconciliation (NY OSC, Penn, Minnesota OSA).
- **A CPA's Precog deliverable is consulting work** with no opinion, conclusion or assurance.
- **Federal law**: managers may not take from a tip pool (DOL Fact Sheet #15B); certified payroll is weekly with a signed Statement of Compliance (WH-347).
- **Trust accounts**: three-way reconciliation means bank = trust journal = sum of client ledgers; Florida monthly (records 6 years), California monthly plus CTAPP, New York lawyers-only signatories (7 years), Colorado and Alabama quarterly floors.
- **Two-signature checks are not enforced by most banks** (Virginia Bankers Association), so the control is the review of cleared checks.
- **Patterns across cases**: large federal losses are bookkeeper or office-manager schemes (checks, insurer payments, company cards, payroll edits); frequent small losses are counter schemes (cash taken, the sale voided, deleted or refunded). Detection is mostly accidental. Sentences cluster at 41 months for $250,000 to $500,000 dental and auto cases.

### Gaps marked unverified

- ACFE 2024 per-control "with/without" medians, the job-rotation row, Figure 24 scheme-by-size percentages, and every page number; the billing-scheme median ($100,000 or $155,000) and the financial-statement median ($766,000 or $799,000) conflict.
- The 17 COSO principle titles verbatim; Principle 11 and 12 wording; GAO paragraph numbers; exact CS §100 "no assurance" wording; ISO 9001 text (paywalled).
- No SBA, SCORE or state CPA society procedure template; no ASA or ASE controls guidance; no NRF or LPRC procedure document; no AGC or ABC fraud guidance; no AADOM checklist.
- Vendor-master and customer-master pairs rest on vendor blogs only; payroll pairs and payroll-register-to-GL tie-out guidance not captured.
- ADA's 48 to 49% theft figure (secondary); NRF's 29% internal-theft share; Form 990 line 5 threshold; ECFA audit tiers; Texas safekeeping rule number (1.14 or 1.15); several case outcomes, detection methods and sentencing dates.
- For 2026, `bm-duration-cost-curve`, `bm-duration-distribution` and `bm-small-org-hotline-gap` have no corroboration at all.

## Notable quotes and data

> "The median loss for organizations with fewer than 100 employees was $141,000, compared to $200,000 for those with more than 10,000 employees." — ACFE 2024, via search extract of the report PDF

- Cases with the largest losses in the notes: Barcus (home builder, $1.79 million), Quanz Auto Body ($2.03 million restitution), Tubolino (medical practice, $1.34 million), Northcutt (Habitat for Humanity, about $826,000), Darrey (parish, $875,323).
- Each industry section ends with a "top 8 facts" list and eight candidate procedure titles; PR #270's 33 procedures draw on them.

## Relationships

- Agrees with: [Voyager design (2026-10-10)](voyager-design-2026-10-10.md), section 12.3: the golden dataset built from these notes exposes three engine gaps and backs the two proposed rules (the Keller and Northcutt cases ground `rule-payroll-master-approve`).
- Contradicts: [Commercial viability report (2026-10-10)](precog-commercial-viability-2026-10-10.md), A10 and decision 11: PR #270 added 12 named case records before any is verified (`VERIFIED_CASE_COUNT` is 0), while that report asks for a freeze on the library and no personal names on client reports. The notes themselves warn that every case comes from search extracts and must be checked against the primary release before publication.
- Agrees with: [Intuitiveness evaluation (October 2026)](precog-intuitiveness-evaluation-2026-10.md), which found no check for a donation never deposited, a doubled invoice or the cash drawer, and no fake-employee payroll scenario; the notes supply the canon and prosecuted cases for each.
- Agrees with: [Validation audit (wave 1)](precog-validation-audit-wave-1.md), finding A-4 (the same five monthly checks for every business): the notes list ten monthly checks per industry, each tied to a scheme in the cases.
