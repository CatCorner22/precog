# Wave 3, slice S1: monthly results are true (October 2026)

What slice S1 changes on the Monthly review, and every count it moves. "Before" is `main` at bd26e58.

## Who a result is saved under

- Before: every result was saved under the person Precog suggested for the check (`task.suggestedOwner`), whoever pressed the button. In the evaluation, Dana's vendor note was saved as "Exception by Lisa", Marco's as "Exception by Gina" and Priya's as "Exception by Ana", and the report repeated each name.
- After: each check has a "Who did this check" picker with the active team and "Someone else" (with a name field). It starts empty, and Precog refuses a result until someone is picked ("Choose who did this check."). After a save, the next check starts on the same pick for the rest of the browser session, per business. The suggested person stays as a hint: "Suggested: Lisa".
- Results saved before this change keep the name they were saved under. Precog cannot tell which of them were misattributed.

## What the screen shows

| Item                          | Before                                                                                | After                                                                                                                         |
| ----------------------------- | ------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| Intro sentence                | The checks below come from the register; record each result with an owner and a note. | Do each check below. Choose who did it, then press Done, or Exception if you found a problem and say what you found.          |
| Latest result line            | Reported result: Exception by Lisa on Oct 7, 2026 — note                              | Saved: Exception by Dana on Oct 7 — note (the year shows only for another year)                                               |
| Exception button              | Exception                                                                             | Exception (found a problem), with one line under the buttons that says when to press it                                       |
| Exception with a blank note   | Saved                                                                                 | Refused: "Say what you found."                                                                                                |
| Selected result               | No selected state                                                                     | The latest result's button is filled and has `aria-pressed="true"`                                                            |
| Typed note, no result pressed | Lost on leaving, with no warning                                                      | "Not saved yet: press a result" under the note, and the browser asks before the page closes                                   |
| Resolving an Exception        | No control                                                                            | "Mark resolved" saves Done with the note "Resolved: {what was typed}", or "Resolved: {the Exception's note}" when nothing was |
| Each check's list item        | No id                                                                                 | `id="check-<period>-<key>"`, focusable, for Needs attention to open (slice S2)                                                |
| Check header                  | 2026-09 · due Oct 10, 2026 · Lisa                                                     | 2026-09 · due Oct 10, 2026 · Suggested: Lisa                                                                                  |

The report still prints `RESULT_LABEL` ("Done", "Exception", "Skipped"), so no printed label changes. The printed name changes only for results saved from now on.

## Two new monthly checks from November 2026 (OD-1)

| Key                  | Title                                                                          | Duties it checks                                                             |
| -------------------- | ------------------------------------------------------------------------------ | ---------------------------------------------------------------------------- |
| `deposits_match`     | Match each deposit to the takings, donations or payments recorded for that day | collect_cash, post_payments, prepare_deposit                                 |
| `duplicate_payments` | Look for the same invoice paid twice                                           | enter_invoices, approve_invoices, release_payment, sign_checks, initiate_ach |

Migration 0057 widens the control evidence log's `controlKey` check to the seven keys, the same way 0034 added `card_statement`.

## Counts that move

| Figure                                                           | Through September 2026 | October 2026 | From November 2026 |
| ---------------------------------------------------------------- | ---------------------- | ------------ | ------------------ |
| Checks in a month (`reviewItemsFor`)                             | 4                      | 5            | 7 (was 5)          |
| Firm client table: a month's total, and "overdue" after the 10th | 4                      | 5            | 7 (was 5)          |
| Needs attention: a month's checks not done, before any result    | 4                      | 5            | 7 (was 5)          |
| Report: monthly checks listed for the month                      | 4                      | 5            | 7 (was 5)          |

The control evidence form lists every check whatever the month, so its list grows from 5 to 7 as soon as this merges. No month before November 2026 changes on the Monthly review, the firm table, Needs attention or the report. No score, index or sample figure moves. `MAX_REVIEW_RECORDS` stays 1,200: seven checks a month for over fourteen years.
