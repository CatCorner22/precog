# Wave 2 browser run and suite results

- **Source**: Claude Code session 79f4ec77 (session_01Rfson9Y63BcB71DDXYNrVb): the run skill's Playwright walk of wave 2 (screenshots in `screenshots/run-w2/`), the browser and compiled-server suites, and a favicon reproduction script. The working files are not kept; this entry is the record.
- **Type**: data
- **Author/Origin**: Claude Code (run skill), Precog at wave-2 commits d2899a0 to 02f71a9
- **Published**: 2026-10-06
- **Ingested**: 2026-10-06
- **Tags**: precog, run-skill, browser, report, monthly-checks, procedures, wave-2

## Summary

An owner's walk through the wave-2 screens on the dental and retail samples passed all 11 checks, with no page or console errors. Reading the screenshots found two display problems, and both were fixed the same day. The run also traced the browser suites' intermittent "404" failure to a race in the test helper, not to Precog. It also found that #216 had broken `main`'s browser suites by renaming a button.

## Key concepts

- **Monthly review on 2026-10-06:** the switcher reads "September (due October 10)" and "October", and September is selected. A note typed under September stays with September.
- **Needs attention:** it reads "9 Monthly review checks not done" (4 for September, 5 for October).
- **Scenario dollars:** they print rounded, for example "about $37,000". "If a control fails" reads "about $8,000 more retained loss", which matches its rounded figures ($29,000 and $37,000).
- **Report:**
  - the summary sentence "One person holds 12 of the 20 open duty conflicts";
  - "Monthly checks for September 2026 (due October 10)";
  - the priority-stack bands "Fix first / Fix soon / Worth doing";
  - two tiles, each naming its own scale.
- **Retail report:** it names no concentrated role. Its first step reads "move one duty of a conflicting pair to someone who holds neither duty".
- **A conflict card's "Written procedure":** it opens Procedures with that procedure highlighted, with the line "The procedure for the duty conflict you came from."
- **Payment threshold:**
  - "1,000" saves $1,000, and "12.50" saves $12.50.
  - "-5" shows "Enter an amount of $0 or more." and keeps the last good amount.
- **Display problems found and fixed** (commit 02f71a9):
  - The residual tile printed "4 fix first on the residual index" as its large figure, which wrapped to three lines. It now prints "4" under the label "Fix first on the residual index".
  - The threshold field showed "12.5" while its card said "$12.50". The field now shows "12.50".
- **Wording problem on `main`, for wave 3:** weekly actions read "Split reconcile the bank account from record payments received" (`weekly-actions/build.ts`, the `Split ${labelA} from ${labelB}` title).
- **Not driven in the browser:** firm sign-off, the override note, withdrawal, issuing alone, the review emails, the two-device merge and the export download (see the wave-2 validation audit).

## Notable quotes and data

- **Suites on wave 2 after the fixes:** dev-server `e2e:warmup`, `e2e` (10 steps), `e2e:enhancements` (8), `e2e:procedures` (13) and `e2e:tabs` (8 industries) passed.
- **Compiled server:** `e2e:safety` (13), `e2e:save-safety` (6), `perf:first-load` (every page within budget), `e2e:evidence` (11) and `e2e:tabs` passed.
- **`#216` rename:** "Explore the sample instead" became "Explore the fictional sample", and four scripts still clicked the old name. `main`'s run 37515991320 failed the builder suite and the compiled-server `e2e:tabs` step on it. The fix (commit "Click the renamed sample button in the browser suites") is on #221 and #219.
- **Flake root cause:** the reproduction ran the setup steps 30 times under load. One run logged "Failed to load resource: the server responded with a status of 404 ()", and `msg.location()` gave `http://127.0.0.1:8080/favicon.ico`.
  - `openSetup` answers that favicon request for `robots.txt` and then removes its route. Chromium sometimes sends the request late, after the route is gone.
  - The console line names no address, so the `/favicon/` filter never matched it.
  - Fix (commit 1c79cd3): `scripts/lib/e2e.mjs` adds each message's source address to the recorded line.

## Relationships

- Agrees with: [Wave 2 review findings](precog-wave-2-review-findings.md). The walk shows those fixes on screen.
- Contradicts: [Validation audit of how wave 2 was verified](precog-validation-audit-wave-2.md), finding 4, which left open whether the flake hid a product defect. It does not: the cause is the test helper's favicon race.
