# Intuitiveness evaluation of Precog (October 2026)

- **Source**: Claude Code session 79f4ec77 (session_01Rfson9Y63BcB71DDXYNrVb): four persona walkthroughs and an expert audit of `main` at 6cc922f, with a protocol dated before the first walkthrough. Report: the Claude Doc "Precog intuitiveness evaluation". Working files (screenshots, transcripts) are not kept; this entry is the record.
- **Type**: data
- **Author/Origin**: Claude Code (AI personas, expert audit, validation-design skill)
- **Published**: 2026-10-07
- **Ingested**: 2026-10-07
- **Tags**: precog, usability, onboarding, monthly-checks, report, validation-design, process

## Summary

The owner asked whether Precog is so intuitive that no training materials are needed. The answer on 2026-10-07 is no. Under a pass/fail rule fixed before testing (one failed core task means no), 7 of 10 owner tasks failed, and in 6 of 35 attempts Precog kept a wrong record without the user noticing. The fixes are mostly small; the largest is one consistent count and one first step, already planned as SC2a and SC3.

## Key concepts

- **Personas:** Dana (dental, laptop), Marco (restaurant, phone only), Priya (nonprofit), Sam (CPA on a seeded signed-in firm). They saw only the screen. Of 35 attempts, 8 went smoothly, 24 succeeded after confusion and 3 failed.
- **Critical (wrong records):**
  - Monthly results save under the check's assigned person, not who recorded them (`monthly-review.tsx:309`, `task.suggestedOwner`); the report repeats the wrong name.
  - Job titles silently tick duties nobody named, which then drive critical findings.
  - "Mark as left" is an unlabelled icon, records today rather than the last day, and cannot be undone.
- **Consistency:** the sample shows 19, 20, 14 and 4 "conflicts" on different screens; "Fix first" has three meanings; the first advice ("the concentrated role") names nobody.
- **Gaps:** no fake-employee payroll scenario in any industry; no check for a donation never deposited, a doubled invoice or the cash drawer; the report prints a "3-person" team for a 12-person office.
- **Language and layout:** no glossary; 9 of 18 screens read above grade 8 (Start here intro 14.3); the report scrolls sideways at 390 px.
- **CPA:** clients sit 2,000 px below firm settings; nothing ranks clients by urgency; "Open report" leads a reviewer to the draft; no "Add client" on the firm page.
- **Fix plan (four slices, in order):** records stay true; setup asks, never assumes; one count and one first step; plain words and the missing cases.
- **Real-user test (validation-design, Mode B):** 5 owners and 5 CPAs, no help. Pass = every core task unaided by 4 of 5, no repeated critical error, median ease 5.5+, SUS 80+. Fail = any task 3 of 5 or fewer, a repeated critical error, or SUS under 68.

## Notable quotes and data

> "Reported result: Exception by Lisa on Oct 7, 2026" — what Precog saved when Dana, the owner, recorded a vendor problem.

- Start here: 3,725 words; "Unverified" repeated 49 times.
- Two reported problems did not hold up: the bank-reconciliation column exists (off-screen right), and "restaurant picked, dental shown" did not reproduce.

## Relationships

- Agrees with: [Wave 2 review findings](precog-wave-2-review-findings.md), which deferred the single open-conflict count (SC2a) and the single plan (SC3); real users confirm both are needed.
- Agrees with: [Validation audit (wave 1)](precog-validation-audit-wave-1.md), finding A-1: monthly results attributed to the suggested owner. Still open on 2026-10-07.
- Contradicts: none noted.
