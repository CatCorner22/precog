# Money checks

**Implementation record:** 2026-11-19. This describes the Phase 1 PR branches,
not a claim that every PR has merged or reached production. Phase 2 below is a
plan, not current behavior.

Precog's money checks are deterministic, advisory checks of lines, entries and
months, not judgments about people. Their levels are **Info**, **Watch** and
**Review** (`info | watch | review`). Review is the ceiling: a money finding
never becomes SoD `critical`, changes a score or changes a locked report.

## Implementation and merge order

The stack is [#303](https://github.com/CatCorner22/precog/pull/303) (parsing and
imports) → [#304](https://github.com/CatCorner22/precog/pull/304) (checks 1–5) →
[#305](https://github.com/CatCorner22/precog/pull/305) (checks 6–9) →
[#306](https://github.com/CatCorner22/precog/pull/306) (ledger and sign-offs) →
[#308](https://github.com/CatCorner22/precog/pull/308) (screen) →
[#312](https://github.com/CatCorner22/precog/pull/312) (Voyager tools).
Merge that stack in order, then the independent PRs
[#309](https://github.com/CatCorner22/precog/pull/309) (odd transactions),
[#311](https://github.com/CatCorner22/precog/pull/311) (knowledge),
[#314](https://github.com/CatCorner22/precog/pull/314) (building and pipe), and
[#316](https://github.com/CatCorner22/precog/pull/316) (transcript comparison).
Those four are independent of the money-check stack and of one another.

Several PRs raise the same total-gzip-budget line in
`scripts/check-bundle-size.mjs`. Later merges need a one-line budget rebase or
conflict resolution, retaining the dated reasons and measuring the combined
build rather than overwriting a larger allowance with a smaller branch value.
The per-chunk limit remains unchanged. Run `npm run verify` after integration.

The implementation references for the nine checks are `detect.ts`,
`control-checks.ts` and `all-checks.ts` under
`src/lib/precog/money-checks/`, as present on
`origin/devin/1795099983-voyager-money-tools`. The other primary references are
listed with each feature below. These are implementation paths; several do not
exist on main until their PRs merge.

## Inputs and exact arithmetic

The Money checks screen reads two CSV files with `FileReader` in the browser.
There is no bank-feed or QuickBooks transaction connection in this Phase 1
path. Precog's existing QuickBooks integration is separate.

| Input                | Columns and behavior                                                                                                                                                                                                     |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Bank file            | Requires `date`, `description` and either `amount` or both `debit` and `credit` headers. Optional `reference`; common header aliases include posted date, memo and transaction id.                                       |
| Books file           | Requires `date`, `type` and either `amount` or both `debit` and `credit`. Optional `account`/customer, `reference`, `entry_date`, `entered_by`, `approved_by`, `reverses`, `closed_period` and `channel`/payment method. |
| Profile              | Active team and duty assignments, dual-release policy and exceptions, decisions, reconciliation sign-offs and channel sign-offs.                                                                                         |
| Closed-through dates | An optional, add/remove list entered for this run. The list, like the imported files, is not persisted. Check 5 uses this list, not the imported `closed_period` field.                                                  |

Books types are `payment_received`, `deposit`, `payment_out`, `refund`,
`adjustment`, `write_off`, `reversal` and `payroll`. Type sets cash direction:
receipts/deposits are positive; payments out, refunds, write-offs and payroll
are negative. Adjustments and reversals retain file direction. Split debit
amounts are negative and credits positive. An optional `direction` column
accepts in/out or credit/debit; conflicting amount-column layouts are rejected.

Each file is capped at **5,000 data rows** (`MAX_ROWS`) and **5,000,000 UTF-8
bytes** (`MAX_BYTES`). Excess rows produce a truncation issue; an oversized
file produces no accepted rows. Bad headers, malformed rows, unreadable amounts
and invalid dates have explicit issues rather than inferred values. The screen
shows accepted row counts and each issue's row and message. A row of zero means
a file/header issue; data-row references start at one.

`parse.ts` parses amounts to safe integer cents using decimal strings and
`BigInt`, never binary floating-point arithmetic for matching or aging. Dollar
symbols, grouping commas and accounting parentheses are supported; fractions
smaller than a cent and values beyond the exact safe-cent range are rejected.
Dates accept `YYYY-MM-DD`, `MM/DD/YYYY` or `M/D/YY`; two-digit years mean 20YY.
Invalid calendar days are rejected. Date differences use calendar days, and
the screen supplies today with `localDateKey`, not a UTC date rollover.

Absent `entry_date` values default to effective date only when that column is
absent; checks needing the actual entry-date column still skip. A present but
invalid entry date rejects its row. Optional columns do not get invented data.

## The nine money checks

Bank/books matching is one-to-one by **identical signed cents**, within
**±3 calendar days** (`MATCH_DAYS = 3`), nearest date first with deterministic
ties. A books row cannot satisfy two bank lines. Future bank dates and books
effective/entry dates are excluded. There is **no 45-day age cap on unmatched
bank lines**. `LOOKBACK_DAYS = 45` applies to checks 2–5 as specified below,
including day 45. Checks 6–9 do not use that lookback.

| # / key                        | What produces a finding                                                                                                                                                                                                                    | Level and actual thresholds                                                                                                                                                                                                                                   |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1 · `unmatched_bank_line`      | A bank line without a books match, aged at least `BANK_DUE_DAYS = 2`.                                                                                                                                                                      | Info at 2–6 days; Watch at 7–30 (`BANK_WATCH_DAYS = 7`); Review after 30 (`BANK_REVIEW_AFTER_DAYS = 30`). Older loaded lines remain eligible.                                                                                                                 |
| 2 · `deposit_not_banked`       | A books `deposit` without a bank match, effective within 45 days and aged at least `DEPOSIT_DUE_DAYS = 5`.                                                                                                                                 | Watch at 5–14 days; Review after 14 (`DEPOSIT_REVIEW_AFTER_DAYS = 14`), through the 45-day effective-date window.                                                                                                                                             |
| 3 · `duplicate_payment`        | Later `payment_received` entries sharing a nonempty account/customer, exact cents and effective date in the last 45 days. A `reversal` whose `reverses` references any member suppresses that group. Needs the account column.             | Info for each entry after the first in a group of at least two; ordering uses entry date, then stable source order. No fuzzy customer or amount match.                                                                                                        |
| 4 · `backdated_entry`          | An adjustment, write-off, refund or reversal entered more than `BACKDATE_DAYS = 7` after its effective date. Needs `entry_date`; the 45-day window uses entry date, not effective date.                                                    | Watch for 8–30 days of lag; Review after 30 (`BACKDATE_REVIEW_AFTER_DAYS = 30`). Exactly seven days does not flag.                                                                                                                                            |
| 5 · `closed_period_entry`      | Effective date on/before a supplied close, entry date after it, and entry within the last 45 days. Entries with a nonempty `reverses` are excluded. Needs `entry_date` and closed-through dates. Each entry uses its latest crossed close. | Watch for one entry behind that close; Review for two or more behind the same close. A type label alone does not exempt a reversal/correction: the exclusion uses `reverses`.                                                                                 |
| 6 · `money_out_without_second` | A payment out, refund, write-off or payroll entry for which `evaluateRelease` requires dual release, but the second approver is blank or the same active person as the initiator.                                                          | Review. The absolute amount must exceed the effective saved channel threshold, unless a policy exception forces dual release. Equality alone does not trigger it. Policy exceptions can change or waive the limit; there is no fixed universal dollar cutoff. |
| 7 · `sole_money_duty_holder`   | Exactly one active holder of a duty in `HARD_GATE_DUTIES`: release payment, initiate ACH, sign checks, issue refunds, approve payroll, enter payroll or edit payroll master. No upload needed.                                             | Watch per duty with exactly one holder. Zero holders do not meet this particular rule; that is not an assurance that coverage exists.                                                                                                                         |
| 8 · `decision_overdue`         | An open decision past its `reviewBy`, using `decisionsDue`; entries with a disposition are excluded. Decisions have no money category, so this checks all eligible open decisions, not just money-tagged ones.                             | Watch for 1–30 days overdue; Review after 30 (`DECISION_REVIEW_AFTER_DAYS = 30`). A decision due today is not overdue.                                                                                                                                        |
| 9 · `weak_reconciliation`      | A weak sign-off in the last `RECONCILIATION_MONTHS = 3` closed months: missing, unsigned, future-dated, same preparer/signer, signed before month-end, or signed more than `RECONCILIATION_LATE_DAYS = 30` after month-end.                | Watch for an isolated weak month; Review for each weak month adjacent to another weak month in that three-month window. Exactly 30 days after month-end is not late.                                                                                          |

For check 6, an explicit valid `channel` overrides the type default. Without it,
payments out/refunds use ACH, write-offs use `writeoff`, and payroll uses
`payroll`. Recognized channels are `ach`, `check`, `writeoff`, `vendor_new`,
`deposit` and `payroll`. Team-name matching ignores case and whitespace and
requires exactly one active match. Unknown or ambiguous names, unknown channels,
disabled policy/channels and missing entered/approved-by columns produce skip
reasons, not guessed approvals. The evaluator's dollar adapter round-trips the
cents; amounts it cannot preserve are skipped.

## Skipped checks and incomplete files

The screen's `runScreenChecks` adds coverage safeguards around `runAllChecks`:

- Without either file, checks 1–2 skip. Without books, checks 3–6 also skip.
  Profile-only checks 7–9 can still run.
- Any import issue, including a rejected row in an otherwise valid file or
  truncation at the row cap, makes coverage incomplete. Bank issues suppress
  new findings for checks 1–2 and mark both skipped; books issues do the same
  for checks 1–6. Valid rows are not treated as a complete replacement file.
- The exact guidance is “The bank file had rejected rows; fix them and upload
  again.” or “The books file had rejected rows; fix them and upload again.”
  The truncation case uses this same guidance.
- Missing optional columns skip dependent checks. When the closed-through list
  is empty, the screen passes `undefined`, so check 5 skips rather than treating
  the absence as proof that no period is closed.
- “Checks that could not run” lists plain-language reasons, including a source
  row when available. Missing coverage is not an all-clear.

The screen suppresses incomplete-file findings before updating the ledger.
The pure detectors remain usable separately; callers bypassing the screen
adapter need the same coverage handling. Any skip for a check preserves that
check's previously open, absent findings instead of automatically closing them.

## Ledger, persistence and sign-offs

`ledger.ts` and `profile-state.ts` hold pure updaters. Normalized optional
`profile.moneyChecks` uses existing profile JSONB storage, without a migration;
signed-out use persists through existing browser profile storage. It contains
the ledger, last run date, reconciliation and channel sign-offs, and, from
#312, deduplicated skipped-check metadata without source-row numbers.

A ledger row has an ID, check, level, sentence, first/last-seen dates, open or
closed status, closure date/reason, reopen count and optional explanation/date.
IDs derive from source facts; findings are not anonymized records. Raw CSV text,
transaction arrays and bank descriptions are not persisted or uploaded by this
screen. Saved findings and notes follow the profile's existing sync boundary.

Each run refreshes present findings and closes absent open findings only when
their check was not skipped, with reason “no longer found in the latest run”.
A closed finding that reappears opens again and increments its reopen count.
An explanation requires at least **10 trimmed characters** and stays with the
finding; explaining does not close it. `LEDGER_LIMIT = 500` is a retention
target: oldest closed rows are removed first, but open findings are never
discarded to meet it. There is no automatic 13-month purge; more than 500 open
findings can remain.

Reconciliation forms cover the last three closed months. Preparer and signer
are chosen from active team people, with a signed-on date. Saving replaces that
month's record. Same-hands or late records can be saved; check 9 describes the
weakness on the next run. Saving a sign-off alone does not rerun the checks.
This is a recorded assertion, not verification of the bank reconciliation or
proof of independence, and is separate from the
[control evidence workflow](CONTROL_EVIDENCE_WORKFLOW.md).

For each enabled dual-release channel, the screen shows the current month's
sign-off or “No sign-off yet”. A reviewer from the active team records a note of
at least 10 trimmed characters; Precog records the author and local date.
One record is kept per month/channel. These notes are not transaction approvals
and do not clear check 6 or count as bank-reconciliation sign-offs.

## Screen and Voyager tools

Money checks is a lazy-loaded section **inside Monthly review**, not a new
top-level tab. Navigation registers the `money-checks` alias to that section.
`money-checks.tsx` shows labelled file pickers, import issues/counts, optional
closed-through dates, Run checks, the last run date, open findings grouped
Review/Watch/Info with text badges, explanations and closed findings with
closure reasons and reopen counts. Files and close dates need entering again
after a reload; saved findings, explanations and sign-offs remain.

The header says: “These checks are advisory. They describe lines, entries and
months, not people.” Browser-only imported text and rows remain component state;
they are not logged or sent to Voyager.

`src/lib/precog/llm/money-tools.ts` adds two deterministic, schema-validated,
read-only tools through the existing Voyager registry:

- `money_checks_summary` takes an empty object. It returns saved open counts by
  level and check, last run, recorded skips, the three closed months'
  reconciliation gaps and enabled channels' current-month sign-off gaps.
  Empty profiles explicitly say no data is saved. Older profiles without
  recorded skips report coverage as not recorded, not as zero skipped checks.
- `explain_money_check` accepts an optional `key`: a check key or saved finding
  ID. It returns the rule, thresholds imported from detector constants, level
  rules and the advisory disclaimer. With no key it lists keys; an unknown key
  returns an explicit not-found result. For check 6 it reports saved enabled
  base limits and whether exceptions exist, not an invented effective limit
  without a transaction context.

Neither tool reruns CSVs, changes the profile or exposes raw rows, ledger
sentences or notes. The normalized money state is wired through Voyager's
request validation and canonical profile builder.

## Five additional odd-transaction tests

#309 extends the existing forensic suite in `stats/odd-transactions.ts`,
`stats/forensic-suite.ts`, `stats/transactions-csv.ts` and `forensic-panel.tsx`.
It is separate from the nine-check ledger. Existing Benford, round-number,
outlier and duplicate calculations remain unchanged. Added optional CSV fields
are payee/vendor/supplier, number/check number/invoice number, time/entry time/
posted time, account/ledger account and channel/method. Alias lookup takes the
first nonempty cell and preserves check versus invoice provenance.

| Test                    | Implemented rule                                                                                                                                                                                                                                                                                                                                                                                                                 |
| ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Splitting below a limit | At least two negative payments to the same normalized payee/channel within **7 days** (`SPLIT_WINDOW_DAYS`), each strictly below a positive enabled channel limit, with a total strictly above it. Review when matched. Needs dates, payee, channel and limit.                                                                                                                                                                   |
| Number gaps and repeats | Trailing-digit series use a step of **1** (`NUMBER_STEP`) and repeat count of at least **2** (`REPEAT_MIN_COUNT`). Series separate number type, prefix and account; checks stay account-wide across payees. Invoices also use payee and channel/kind; an invoice without payee skips. Generic number series retain channel/kind. Multiline prefixes are safe. Gaps can reflect export boundaries or voids, not missing payments. |
| Weekend / outside hours | Needs real dates and either valid entry times or configured business hours. With times alone, screens weekend timed entries and times **before 06:00 or at/after 22:00** (`EARLY_END`, `LATE_START`). With business hours, screens nonworking days and times outside opening-inclusive/closing-exclusive hours. The current screen passes no business-hours configuration, so its path relies on uploaded times.                 |
| Same money in and out   | One-to-one matching of equal positive/negative cent values within **±3 days** (`IN_OUT_WINDOW_DAYS`); records marked `charge` are excluded. This does not establish a relationship between counterparties.                                                                                                                                                                                                                       |
| Untouched suspense      | Accounts whose names contain suspense or clearing, with nonzero **loaded net amount** and last activity **more than 90 days** before a valid as-of date (`SUSPENSE_IDLE_DAYS`). Future rows are excluded. This is not a verified opening or current ledger balance.                                                                                                                                                              |

Splitting matches are Review; matches for the other four are Watch. A completed
test with no matches is Info. Missing prerequisites produce a stated skip, not
an accusation or a substitute value. Undated pasted amounts cannot run the
date-dependent tests. The suite processes amounts it can read to whole cents
for these additions; it does not replace the original forensic importer with
the separate money-check importer.

## Knowledge additions

#311 updates `src/lib/precog/rag/corpus.ts`: 15 new chunks and extensions to five
existing chunks rather than duplicating COSO's 17 principles, Green Book
documentation or bookkeeper/vendor-master material. Coverage includes:

- The IIA Three Lines model; preventive/detective and hard/soft controls;
  key, supporting and compensating controls; deficiency severity.
- Cash/treasury completeness, purchasing/receiving/invoices, revenue collection,
  payroll/time/tax deposits, close entries/estimates, IT report quality and
  related-party/owner-override controls.
- Skimming, cash larceny and lapping; warning signs with explicit limits on
  inferring anything about a person.
- Reconciliation passes and residuals, duplicate tiers and reversals, Benford
  population limits, threshold splitting, sequence boundaries and suspense aging.

Framework chunks cite primary COSO, GAO Green Book, IIA, ACFE and, for ICFR
deficiency definitions, PCAOB AS 2201 sources. Practitioner analytics chunks
are explicitly labelled practice, not asserted framework requirements. Advisory
Info/Watch/Review is not an ICFR deficiency classification. These additions do
not create new detection rules, an ERP go-live tool or an audit-response tool.

## Building and pipe card

#314 adds a lazy optional card under **What could happen**, backed by
`src/lib/precog/physical-risk.ts`. Normalized `profile.physicalRisk` persists in
existing JSONB/browser profile storage, without a migration. Missing or unknown
inputs skip the affected estimate with a reason, never a default guess.

Pipe inputs are material and age in years. The internal calculation is
`1 − exp(−(age / scale)^shape)`, with the LLM source repository's Weibull pairs:

| Material     | Shape | Scale (years) |
| ------------ | ----: | ------------: |
| Cast iron    |   2.8 |            50 |
| Ductile iron |     3 |            70 |
| PVC          |   2.2 |            80 |
| Steel        |   3.5 |            60 |
| Concrete     |   2.5 |            65 |
| Lead         |     2 |            40 |

Building inputs are year built, condition (0 worst–1 best), occupancy, floor
area in square metres, seismic zone (0–4), fire suppression and last inspection
date. All are required for the building estimate. Source weights are age 0.20,
condition 0.25, occupancy 0.15, seismic 0.15, inspection 0.15 and fire 0.10.
The module records the source `infrastructure.py`, `building.py` and `models.py`
paths under the LLM repository's `src/pioneer/intelligence/risk/` directory.

Both outputs are bands only: **Low** below 0.25, **Watch** from 0.25 to below
0.50, **Review** from 0.50. This maps source low/moderate/high-or-critical to
Low/Watch/Review. No percentage is displayed; the pipe result is not an annual
forecast or an inspection. No score, index, report or figure consumes the card.
It states: “Rough estimate, not from a published source. It feeds no score.”

Weather and the flood-zone field were omitted: the source expected numeric
flood/wind indexes and storm inputs, without a sourced flood-zone mapping.
The card says: “Weather and flood risk come later, from published sources.”
The logistic accident model is not included.

## CPA transcript comparison

#316 adds a lazy **Interview transcript check** beside engagement tools in the
signed-in CPA/firm workspace, not the owner Monthly review. A CPA pastes a
transcript and reference text. `src/lib/precog/transcript-check.ts` uses
deterministic token alignment, based on p2c's `align.py` approach, to flag
differences in negations, exact amounts/numbers, dates and capitalized-name
candidates. Names are not verified identities. Slash dates are month/day/year
unless year-first. Currency prefixes/suffixes retain the currency, and
accounting parentheses, with or without a currency, mean a negative amount.

Each result shows both snippets and original positions: line/column and
zero-based offsets. Snippet edges expand to whole words and display ellipses
when context is clipped. Each text is capped at **200,000 characters**; inputs
past the cap, or alignment work beyond the divergence limit, produce an explicit
smaller-excerpt error rather than partial findings.

The screen states: “This check compares wording. It never judges whether anyone
told the truth.” Text and results remain browser component state, with no upload,
storage or Save action. Existing month/check-specific review notes were not a
compatible general engagement-note mechanism, so Phase 1 adds no migration or
engagement save. Reloading clears the comparison.

## Phase 2 plan and gates

Each step is a separate small PR. Complete its gate before starting the next.

1. **Pilot money checks.** Run three real, anonymized months from one business;
   record real/false outcomes for every flagged line. **Gate:** no check exceeds
   one false flag in five; tune and repeat before proceeding.
2. **QuickBooks transaction sync.** Read-only Deposit, Payment, Purchase,
   JournalEntry and closing-date fetches, with unchanged scope. Retain findings,
   not raw transaction rows. **Gate:** a sandbox company produces the same
   findings as its CSV export.
3. **Bank feed.** Choose bank exports or an aggregator. **Approval gate:** Blake
   approves bank-feed spend before any purchase; no paid feed without approval.
4. **Published physical-risk sources.** Research cited pipe-failure and
   building-loss data, for example AWWA, FEMA and insurer studies, to replace
   rough estimates. Also add weather and flood risk using **FEMA flood zones
   and NOAA** published inputs, deferred from Phase 1 for lack of sourced
   inputs/mapping. **Gate:** traceable sources and input mappings before use;
   show percentages only when they have a source.
5. **Interview claims against exhibits and engagement save.** After the CPA
   transcript pilot, add p2c `collision.py`'s claim-by-exhibit table. Add saving a
   transcript comparison to an engagement; this **requires an additive
   migration**, not reuse of the current month/check review notes. **Gate:** the
   CPA pilot precedes exhibit work; define the engagement-owned save schema and
   access boundaries before persistence.
6. **Policy drafting (Policy_Agent).** Add must/may model language and hierarchy
   rules to the procedures library; check the quoted terms “shall” and “should”,
   missing owners and missing review dates. **Gate:** model language and
   hierarchy land before the policy check.
7. **Smile Notes (CatCorner22/dental).** First review what works, what needs
   repair and placement under BlakeGPT beside Amanda's dental tools. Then bring
   over the Tennessee dental-law diagram as the first piece. **Gate:** its own
   spec before code.
8. **Optional locked-report section.** A money-check summary changes printed
   output. **Approval gate:** Blake approves before work starts. Use a new
   `REPORT_LAYOUT_VERSION`; the parity harness must show every older layout
   unchanged. No retrospective change to locked reports.

## Decisions made in Phase 1

| Decision                      | Implemented choice                                                                                          |
| ----------------------------- | ----------------------------------------------------------------------------------------------------------- |
| Highest money-check level     | Review, never SoD critical.                                                                                 |
| Money-check screen            | Under Monthly review, not a new top-level tab.                                                              |
| Raw-row storage               | No. Persist findings, lifecycle/explanations, sign-offs and run/skip metadata, not raw files or row arrays. |
| Uncited building/pipe numbers | Allowed only as labelled rough estimates, bands only, feeding no score.                                     |
| Transcript comparison         | Included only in the CPA/firm workspace.                                                                    |
| Weather/flood                 | Deferred until published sourced inputs and mappings exist; no flood-zone field in Phase 1.                 |
| Transcript save               | None in Phase 1; an engagement save needs a Phase 2 migration.                                              |

## Verification references

`npm run verify` runs formatting, types, lint, tests, build and bundle checks.
Relevant tests sit beside the parsing, detectors, ledger, profile state,
screen logic, money tools, odd transactions, provenance/retrieval, physical
risk and transcript modules. The browser scripts are registered in
[`scripts/README.md`](../scripts/README.md):

- `scripts/e2e-money-checks.mjs`: fixture uploads, a finding, minimum explanation
  length and guest explanation persistence after reload without imported rows.
- `scripts/e2e-physical-risk.mjs`: guest inputs, band-only display and persistence.
- `scripts/e2e-transcript-check.mjs`: real signed firm session, fixture differences
  and positions, then no saved text/results after reload.

These checks describe reproducible coverage on the feature branches, not a
claim that the independent docs branch contains their implementation or that
every sign-off interaction has a browser assertion.
