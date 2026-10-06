# Validation audit of how wave 2 was verified

- **Source**: Claude Code session 79f4ec77 (session_01Rfson9Y63BcB71DDXYNrVb), working file `validation-audit-w2.md`, written with the validation-design skill in audit mode. The working file is not kept; this entry is the record.
- **Type**: other (audit report)
- **Author/Origin**: Claude Code (validation-design skill), reading wave 2 at commit d2899a0 plus the browser-suite fixes, and GitHub's check runs
- **Published**: 2026-10-06
- **Ingested**: 2026-10-06
- **Tags**: precog, validation-design, wave-2, audit, process

## Summary

The audit tested the claim "Wave 2 fixes its planned findings and the review findings without breaking anything an owner or CPA relies on." The verification could fail and did: reviews found 22 defects that every automated check had passed, and each result was acted on. The evidence supports the claim for server rules, data paths and figures. It supports only a narrower claim for the CPA review screens, the two-device merge and the export download, because no browser exercise drives them. The largest finding is about process: nothing makes a merge wait for verification, so #216 and #218 merged before their own CI finished.

## Key concepts

- **High: merges do not wait for verification.**
  - `main` has no branch protection and no ruleset.
  - #216 merged at 18:57:16 UTC, and its CI then failed: "Typecheck, lint, test, build", the builder suite, the compiled-server suite and the Release gate.
  - #218 merged at 19:05:10, one minute after it opened, before any review ran. Its CI finished green afterwards.
  - Fix: the owner adds a ruleset requiring the "Release gate" check.
- **Medium-high: three flows are never driven in a browser.**
  - Not driven: the CPA review workflow (sign-off dialog, override note, withdrawal, issuing alone, review emails), the two-device merge, and the export download.
  - The repository has no DOM test environment, so component tests render static markup and nothing clicks.
  - Fix: add these flows to the compiled-server suites, which already make signed test sessions with firm roles.
- **Medium: one model family.** Every builder and every reviewer came from one model family, and no person reviewed the diff. Fix: a person walks the owner flows and the firm sign-off before merging.
- **Medium: an intermittent browser-suite failure.** It was first re-run, not root-caused. It was later root-caused: see Relationships.
- **Low-medium: moved figures.** Pins are re-set by the agent that moved the figure, and no person reads a full 8-sample before-and-after table.
- **Medium: artificiality in both directions.**
  - It flatters: the dev server and PGlite, signed test sessions, and Stripe and Resend stubs.
  - It can also damn unfairly: runs on a loaded 4-CPU machine produced the flaky failure.
- **Wave 2 against the wave-1 product findings:**
  - A-1 is unchanged, and the new correcting entries carry the same wrong performer name.
  - A-2 is mostly fixed, but the printed report still shows only the latest result per check.
  - A-3, A-4, B-1, B-2, C-1, C-2, C-3 and C-4 are unchanged.
- **Wave 2's new exercises:**
  - Correcting entries and issuing alone reach the record honestly.
  - The override note is stored and logged, but the printed report does not show it until slice S46.

## Notable quotes and data

> "As things stand, the strongest true statement is: 'wave 2's code, as tested, fixes the findings; whether it reaches `main` in that state depends on the owner waiting for green.'" — Verdict

- Check runs on #216's head (748fbc5): "Migrations against real Postgres, applied twice" passed at 18:57:31. "Authenticated compiled-server safety" failed at 18:59:25, "Typecheck, lint, test, build" failed at 19:00:32, and "Builder end-to-end smoke" and the Release gate failed at 19:10.
- Check runs on #218's head (014f802): all five passed, between 19:05:12 and 19:09:11, after its merge at 19:05:10.
- Evidence for A-1 at wave-2 head: `monthly-review.tsx:309` saves with `task.suggestedOwner`, and `review-bridge.ts:193,212` writes it as `performedBy`.

## Relationships

- Agrees with: [Validation audit (wave 1)](precog-validation-audit-wave-1.md), which found that nothing enforces CI on `main`. Wave 2's merges show the cost.
- Agrees with: [Wave 2 review findings](precog-wave-2-review-findings.md) on the deferrals and the security results.
- Contradicts: the audit's first reading of the browser-suite flake as possibly a product defect. Its cause was later found in the test helper: [Wave 2 browser run](precog-wave-2-browser-run.md).
