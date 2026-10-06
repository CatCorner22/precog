# Validation audit of Precog's own checks (wave 1)

- **Source**: Claude Code session 79f4ec77 (session_01Rfson9Y63BcB71DDXYNrVb), working file `validation-audit.md`, written with the validation-design skill in audit mode. The working file is not kept; this entry is the record.
- **Type**: other (audit report)
- **Author/Origin**: Claude Code (validation-design skill), reading Precog at commit 2625d77
- **Published**: 2026-10-06
- **Ingested**: 2026-10-06
- **Tags**: precog, validation-design, monthly-checks, procedures, report, wave-1

## Summary

The audit asked whether four exercises can return an unwelcome result: the monthly checklist with its evidence log, procedure verification and proofs, the report's claims that controls are in place, and the way the review-fix programme verified wave 1. Its verdict: the product's exercises can produce an unwelcome result, but that result rarely reaches the record a CPA relies on, so as built they support only the narrower claim that the owner reports these checks and controls exist. Wave 1's own verification could return bad news and did, but every builder and reviewer came from one model family and no person reviewed the diff.

## Key concepts

- **Claims under test.** (1) A month marked Done shows the key money checks were performed, by someone independent, and passed. (2) A verified procedure, proven by a stand-in, shows someone else can do the work from the written steps. (3) The controls the report credits are in place. (4) Wave 1 fixes the verified defects without breaking anything.
- **A-1 (High).** The monthly review saves each result under the suggested independent reviewer's name, not the person who recorded it, so the report can print an independent reviewer's name for a check the holder of the conflicting duty recorded.
- **A-2 (High).** A Skipped result counted as Done in the firm table, a later Done hid an earlier Exception in the report, and the evidence log kept the first bridged result and dropped corrections.
- **C-1 (High).** No credited control rests on a recorded result. Bank reconciliation, dual release, owner statement review, cameras, alarm and background checks are credited from setup answers or configuration; monthly results and evidence entries feed no score.
- **A-3 (Medium).** No evidence is asked for and nothing is sampled; a bridged monthly result enters the evidence log as "inquiry" with no evidence reference.
- **A-4 (Medium).** The checklist is the same five checks for every business, whatever its conflicts and setup answers.
- **B-1 (Medium).** A procedure proof has no failing outcome; anyone except a preparer can verify their own procedure; proofs carry no account stamp and no server check.
- **B-2 (Medium).** Proofs keep counting after the procedure's steps change.
- **C-2 (Medium).** An owner-held conflicting pair earns full segregation credit in the residual score.
- **C-3 (Medium).** The hand-set dual-control flag is not disclosed on the report.
- **C-4 (Low).** Setup answers hide recommended steps under "Do these first" without saying so.
- **What the design gets right.** The server's monthly log is insert-only and records the recording account. The evidence log refuses a reviewer who did the work, requires re-performance to close a retest, and marks a sole issuer's review "Not an independent review". Procedure verification is cleared by edits and refused for preparers on the server. Risk acceptance and compensating notes earn no score credit. Hand-set segregation and bank reconciliation cannot be set for an owner's own team. Partial dual release prints "Reduced, not closed".
- **How wave 1 was verified (Exercise D).** Tests written to fail first; three adversarial reviewers, who found 18 more defects; the code-review skill, which found 10 more; real-Postgres race tests; five browser suites and the compiled signed-in suites, which caught two real integration breaks. Weak points: one model family for every builder and reviewer; "fails on the base" mostly self-reported; no real Google or X sign-in, no Stripe test account and no production-shaped data; nothing enforced CI on `main`.

## Notable quotes and data

> "As built, each exercise supports a narrower claim: 'the owner reports that these checks and controls exist'." — Verdict

> "Changing nothing means a CPA can sign a report on firm letterhead that shows a month as Done with an independent reviewer's name, when the person who holds the conflicting duty skipped or self-recorded every check, and that credits bank reconciliation and dual release that nobody has evidenced." — Residual risk

- Code cited, at commit 2625d77: `monthly-review.tsx:245-246`, `firm/server.ts:524`, `firm/reviews.ts:268-272` (A-1); `firm/store.ts:960-961`, `client-table-csv.ts:77-84`, `control-report.tsx:166-167`, `review-bridge.server.ts:64-66` (A-2); `likelihood-model.ts:43-95`, `residual-engine.ts:485-494`, `sod/score.ts:47,53-55`, `controls/executions/model.ts:219` (C-1); `review-bridge.ts:20,55,94` (A-3); `firm/reviews.ts:46-93` (A-4); `procedures/types.ts:54-62`, `quality.ts:115-121`, `procedures-panel.tsx:452`, `normalize.ts:252-268` (B-1); `attention.ts:36-43` (B-2); `active-template.ts:184-186,209-210`, `residual-engine.ts:482-484` (C-2); `profile-actions.ts:186-191`, `practice-profile.ts:419-423` (C-3); `build-control-report.ts:175-179` (C-4).
- Missing artifacts: the validation-design skill's reference files (`failure-modes.md`, `legitimate-vs-rigged.md`, `design-checklist.md`, `mc02-case.md`) were absent from the synced copy, so the audit used the six failure modes as `SKILL.md` states them. No pilot results with success criteria set in advance were found (`docs/COMMERCIAL_VALIDATION_PLAN.md` exists).
- Plan status on 2026-10-06: A-2 is addressed in wave 2 by slice S20a (only Done counts toward completion) and slice S20b (correcting evidence entries); A-4 is planned for wave-3 slice PC; A-1, A-3, B-1, B-2, C-1, C-2, C-3 and C-4 remain to be scheduled.

## Relationships

- Agrees with: [Wave 2 review findings](precog-wave-2-review-findings.md). After wave 2 the evidence log and the monthly log can still disagree (a Done changed to Skipped is not corrected, and two devices can race), so A-2 is narrowed but not closed until those fixes land.
- Contradicts: none noted.

## Raw notes (optional)

The audit's proposed fixes, in brief: record the signed-in account and a chosen performer; refuse or flag a result recorded by the holder of the duty the check guards; count only Done; print every Exception in the month; label each credited control "Reported by the business" or "Evidenced: N recorded checks, last on <date>"; let a recorded Exception reduce that control's credit; ask for the one fact per check that would expose a problem; add "Could not complete" and "Completed with errors" proof outcomes and stamp proofs on the server; mark proofs made on earlier steps; give no segregation credit where the only open pair is the owner's; derive and disclose the dual-control flag.
