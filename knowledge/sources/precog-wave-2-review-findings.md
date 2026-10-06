# Wave 2 review findings

- **Source**: Claude Code session 79f4ec77 (session_01Rfson9Y63BcB71DDXYNrVb): the code-review skill, three adversarial reviewers (server, screens, report figures and wording) and the security-review skill, all run on wave 2 at commit 014f802, and the working file `wave2-integration-checks.md`. The working file is not kept; this entry is the record. Pull requests: #218 (merged into the wave-1 branch) and #219 (wave 2 into `main`).
- **Type**: conversation
- **Author/Origin**: Claude Code
- **Published**: 2026-10-06
- **Ingested**: 2026-10-06
- **Tags**: precog, code-review, security, monthly-checks, export, report, procedures, wave-2

## Summary

Wave 2 (11 slices) passed `npm run verify` and the five dev-server browser suites, yet four reviews found 22 distinct defects and the security review found two low-severity exposures. Four fix agents are fixing the defects that belong to wave 2; five overlap work the plan already gives to wave 3. This entry also records the merge events of 2026-10-06, so a later session knows what reached `main`.

## Key concepts

- **High, fixed in wave 2:**
  - "Export data" leaves out, without any warning, a business saved during the download, because businesses are keyed on `updated_at || id` (`account-store.ts:216`).
  - After a two-device merge, Undo on the map can remove a person the other device added, because `acceptMerge` in `use-cloud-sync.ts` does not clear the undo history.
  - On the same report page, "Fix first" means priority 88 or more on one figure and residual 80 or more on another (dental 3 and 4; retail 4 and 6).
  - An open locked version keeps printing the old review status after a sign-off or a withdrawal until the page reloads.
- **Medium, fixed in wave 2:**
  - Accepted findings print "risk accepted (no decision logged)" because the acceptance date is never passed, and versions locked under layouts 1 to 4 changed wording.
  - Changing a check from Done to Skipped leaves the evidence log on Done.
  - A month recorded on time with one Exception reads "Overdue" for good.
  - The owner's Needs attention counts monthly checks differently from the firm's client table.
  - The "Returned" email can reach a preparer who has left the firm.
  - A merged copy can carry derived `staff` figures that no longer match its own team, map and register.
  - Some scenario dollars still print exact while the scenario page prints them rounded.
- **Low, fixed in wave 2:** an export part can pass the 4.5 MB limit in two edge cases; the export has no per-part retry; a demoted reviewer can withdraw a review; the evidence log can race with the monthly log; the evidence chain is read page by page; a note typed for one month can be saved on the other; "about -$0" prints; the "If a control fails" change line disagrees with the rounded figures beside it; the concentration sentence can name a minority holder; the threshold display drops cents and the field rejects "1,000"; `rule-admin-pay` links to the wrong procedure; the controlled-drug count text contradicts the dental case; weekly hand-off actions can name the wrong process or a duty that is not a check.
- **Deferred to wave 3, already in the plan:** one open-conflict count on Start here, the coach and the duty-conflict tab (slice SC2a); one "Do this first" plan on the report (SC3); the remaining interim procedure links (PB). Review emails are sent inside the request; a queue is a later improvement.
- **Security review:** no finding reached confidence 8 of 10. Two low-severity true positives were confirmed below that bar: the review-override note travels in report-link data although no page prints it (7 of 10), and the "Returned" email can reach a departed preparer (6 of 10). Both are in the wave-2 fix list.

## Notable quotes and data

- Dental sample with dual release on, before the fixes: Start here's tile showed 16, its subtitle "14 gaps across 20 duty conflicts", the report and the firm list 17, and the tab "Duty conflicts (20)".
- Merge events on 2026-10-06 (UTC): #215 (wave 1) and #214 merged at 17:57; #216 at 18:57; #217 (the wave-1 follow-up) into `main` at 19:02:48; #218 (wave 2) at 19:05:10 into the wave-1 branch, not into `main`; #219 opened to bring wave 2 into `main`.
- Migrations: `0055_assessment_credit_reversals.sql` (wave-1 follow-up, on `main`) and `0056_report_review_override.sql` (wave 2).
- Report layout 5: versions locked under layouts 1 to 4 keep their monthly heading ("Monthly review · <Month YYYY>") and band words ("Top priority", "High priority", "Medium priority", "Low priority").
- Browser-suite flake: `e2e:enhancements` logged one console line, "Failed to load resource: … 404", with no address, in 5 of its first 16 runs on wave-1 code (all while other runs loaded the machine) and in none of the last 19. The cause was not found.
- `npm run verify` on wave 2 merged with `main` (commit a3abf86): 4,734 tests passed; bundle 837.6 KB of the 845 KB budget.

## Relationships

- Agrees with: [Validation audit (wave 1)](precog-validation-audit-wave-1.md), finding A-2. Wave 2 narrows the evidence-log gap, but the Skipped and race cases keep it open until their fixes land.
- Contradicts: wave 2's own promise of one open-conflict count. The report and the firm list agree, but Start here and the duty-conflict tab count differently until slice SC2a.
