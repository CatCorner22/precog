# Wave 3, slice S5: one open-conflict count and a first step that names someone (October 2026)

Every open-conflict count and first-step sentence that slice S5 moves on the 8 industry samples. "Before" is `main` at bd26e58; "after" is branch `claude/stoic-lovelace-payzni-w3-s5`. Each sample appears twice: with its saved settings, and with dual release turned on. Figures are for 2026-10-07.

The one count is `openConflictHeadline(...).open` (`src/lib/precog/headline/open-conflicts.ts`): every open duty conflict of every severity, the owner's own pairs and pairs dual release covers at every amount left out. The report's summary already used it; after this slice Start here, the duty-conflict tab and the coach use it too.

Not moved on any sample: the report's open count (summary, first sentence), the tab badge (critical only, as labelled; `index.tsx` is not touched), "Narrowed by dual release", "No decision yet", and every score and index. No sample has two or more locations, so the location filter ("All locations (N)") shows on none of them; on an own team it now counts open findings, as the tile does (see the test in `src/components/precog/one-count.test.tsx`).

What changes (the sections below give each sample's figures):

- Start here's tile counts every open duty conflict, not critical and high only. Its hint adds "· N other" (medium and related duties) when there are any.
- Start here's exposure sentence counts open duty conflicts instead of "N gaps across M duty conflicts", which counted pairs closed by dual release.
- Start here's concentration line counts open duty conflicts, as the report's does ("holds 12 of the 20 open duty conflicts"), and shows only when one person holds half or more of them, as on the report.
- The duty-conflict tab replaces the "Critical open" and "High open" tiles with one "Open duty conflicts" tile, and its "Duty conflicts (N)" sub-tab counts open findings only.
- The first step ("split one duty out") names the person and the duty, or, with nobody holding half the open conflicts, says "Move one duty of a conflicting pair to someone who holds neither duty". Neither form says "even just the bank reconciliation". The same label is printed in the report's first-step line and its list of steps.
- The coach states the total, in the situation line of the brief built from the team's conflicts and as the first line under "Your open duty conflicts" in the full brief: "20 open duty conflicts (4 critical · 15 high · 1 other), held by 3 people."

## Dental office (`dental`), default

| Screen and figure                      | Before                          | After                               |
| -------------------------------------- | ------------------------------- | ----------------------------------- |
| Start here tile: Open duty conflicts   | 19 (4 critical · 15 high)       | 20 (4 critical · 15 high · 1 other) |
| Duty-conflict tab: Critical open       | 4 (Not closed by dual release)  | not shown                           |
| Duty-conflict tab: High open           | 15 (Not closed by dual release) | not shown                           |
| Duty-conflict tab: Open duty conflicts | not shown                       | 20 (4 critical · 15 high · 1 other) |
| Duty-conflict tab: Duty conflicts (N)  | 20                              | 20                                  |
| Duty-conflict tab: All locations (N)   | not shown                       | not shown                           |
| Report summary: open duty conflicts    | 20                              | 20                                  |

Start here, exposure sentence:

- Before: 14 gaps across 20 duty conflicts, worst first.
- After: 20 open duty conflicts, grouped by pair of duties, worst first.

Start here, concentration line:

- Before: Maya Chen (Office Manager) holds 12 of the 14 open gaps.
- After: Maya Chen (Office Manager) holds 12 of the 20 open duty conflicts.

First step (Start here's "Do these first" and the report's list of steps):

- Before: Move any single duty out of the concentrated role — even just the bank reconciliation
- After: Move one duty, enter write-offs, away from Maya Chen: it closes 4 of the 20 open duty conflicts

Report summary, first-step line:

- Before: First step: move any single duty out of the concentrated role — even just the bank reconciliation.
- After: First step: move one duty, enter write-offs, away from Maya Chen: it closes 4 of the 20 open duty conflicts.

Coach (the brief built from the team's conflicts), situation line:

- Before: **Sample**: 3 people hold an open duty conflict. Question: _What do I fix first?_
- After: **Sample**: 20 open duty conflicts (4 critical · 15 high · 1 other), held by 3 people. Question: _What do I fix first?_

## Dental office (`dental`), dual release on

| Screen and figure                      | Before                          | After                               |
| -------------------------------------- | ------------------------------- | ----------------------------------- |
| Start here tile: Open duty conflicts   | 16 (3 critical · 13 high)       | 17 (3 critical · 13 high · 1 other) |
| Duty-conflict tab: Critical open       | 3 (Not closed by dual release)  | not shown                           |
| Duty-conflict tab: High open           | 13 (Not closed by dual release) | not shown                           |
| Duty-conflict tab: Open duty conflicts | not shown                       | 17 (3 critical · 13 high · 1 other) |
| Duty-conflict tab: Duty conflicts (N)  | 20                              | 17                                  |
| Duty-conflict tab: All locations (N)   | not shown                       | not shown                           |
| Report summary: open duty conflicts    | 17                              | 17                                  |

Start here, exposure sentence:

- Before: 14 gaps across 20 duty conflicts, worst first. 2 of them your dual-release policy narrows rather than closes. 2 are covered by dual release at every amount.
- After: 17 open duty conflicts, grouped by pair of duties, worst first. 4 of them your dual-release policy narrows rather than closes. Dual release covers 3 more duty conflicts at every amount, so they are not counted.

Start here, concentration line:

- Before: Maya Chen (Office Manager) holds 10 of the 12 open gaps.
- After: Maya Chen (Office Manager) holds 10 of the 17 open duty conflicts.

First step (Start here's "Do these first" and the report's list of steps):

- Before: Move any single duty out of the concentrated role — even just the bank reconciliation
- After: Move one duty, enter write-offs, away from Maya Chen: it closes 4 of the 17 open duty conflicts

Report summary, first-step line:

- Before: First step: move any single duty out of the concentrated role — even just the bank reconciliation.
- After: First step: move one duty, enter write-offs, away from Maya Chen: it closes 4 of the 17 open duty conflicts.

Coach (the brief built from the team's conflicts), situation line:

- Before: **Sample**: 3 people hold an open duty conflict. Question: _What do I fix first?_
- After: **Sample**: 17 open duty conflicts (3 critical · 13 high · 1 other), held by 3 people. Question: _What do I fix first?_

## Retail store (`retail`), default

| Screen and figure                      | Before                          | After                     |
| -------------------------------------- | ------------------------------- | ------------------------- |
| Start here tile: Open duty conflicts   | 16 (6 critical · 10 high)       | 16 (6 critical · 10 high) |
| Duty-conflict tab: Critical open       | 6 (Not closed by dual release)  | not shown                 |
| Duty-conflict tab: High open           | 10 (Not closed by dual release) | not shown                 |
| Duty-conflict tab: Open duty conflicts | not shown                       | 16 (6 critical · 10 high) |
| Duty-conflict tab: Duty conflicts (N)  | 16                              | 16                        |
| Duty-conflict tab: All locations (N)   | not shown                       | not shown                 |
| Report summary: open duty conflicts    | 16                              | 16                        |

Start here, exposure sentence:

- Before: 10 gaps across 16 duty conflicts, worst first.
- After: 16 open duty conflicts, grouped by pair of duties, worst first.

Start here, concentration line:

- Before: Sam Nguyen (Store Manager) holds 7 of the 10 open gaps.
- After: none (nobody holds half or more of the open duty conflicts)

First step (Start here's "Do these first" and the report's list of steps):

- Before: Move any single duty out of the concentrated role — even just the bank reconciliation
- After: Move one duty of a conflicting pair to someone who holds neither duty

Report summary, first-step line:

- Before: First step: move one duty of a conflicting pair to someone who holds neither duty — even just the bank reconciliation.
- After: First step: move one duty of a conflicting pair to someone who holds neither duty.

Coach (the brief built from the team's conflicts), situation line:

- Before: **Sample**: 3 people hold an open duty conflict. Question: _What do I fix first?_
- After: **Sample**: 16 open duty conflicts (6 critical · 10 high), held by 3 people. Question: _What do I fix first?_

## Retail store (`retail`), dual release on

| Screen and figure                      | Before                         | After                    |
| -------------------------------------- | ------------------------------ | ------------------------ |
| Start here tile: Open duty conflicts   | 12 (4 critical · 8 high)       | 12 (4 critical · 8 high) |
| Duty-conflict tab: Critical open       | 4 (Not closed by dual release) | not shown                |
| Duty-conflict tab: High open           | 8 (Not closed by dual release) | not shown                |
| Duty-conflict tab: Open duty conflicts | not shown                      | 12 (4 critical · 8 high) |
| Duty-conflict tab: Duty conflicts (N)  | 16                             | 12                       |
| Duty-conflict tab: All locations (N)   | not shown                      | not shown                |
| Report summary: open duty conflicts    | 12                             | 12                       |

Start here, exposure sentence:

- Before: 10 gaps across 16 duty conflicts, worst first. 1 of them your dual-release policy narrows rather than closes. 2 are covered by dual release at every amount.
- After: 12 open duty conflicts, grouped by pair of duties, worst first. 2 of them your dual-release policy narrows rather than closes. Dual release covers 4 more duty conflicts at every amount, so they are not counted.

Start here, concentration line:

- Before: Sam Nguyen (Store Manager) holds 5 of the 8 open gaps.
- After: none (nobody holds half or more of the open duty conflicts)

First step (Start here's "Do these first" and the report's list of steps):

- Before: Move any single duty out of the concentrated role — even just the bank reconciliation
- After: Move one duty of a conflicting pair to someone who holds neither duty

Report summary, first-step line:

- Before: First step: move one duty of a conflicting pair to someone who holds neither duty — even just the bank reconciliation.
- After: First step: move one duty of a conflicting pair to someone who holds neither duty.

Coach (the brief built from the team's conflicts), situation line:

- Before: **Sample**: 3 people hold an open duty conflict. Question: _What do I fix first?_
- After: **Sample**: 12 open duty conflicts (4 critical · 8 high), held by 3 people. Question: _What do I fix first?_

## Professional services firm (`professional_services`), default

| Screen and figure                      | Before                         | After                    |
| -------------------------------------- | ------------------------------ | ------------------------ |
| Start here tile: Open duty conflicts   | 14 (6 critical · 8 high)       | 14 (6 critical · 8 high) |
| Duty-conflict tab: Critical open       | 6 (Not closed by dual release) | not shown                |
| Duty-conflict tab: High open           | 8 (Not closed by dual release) | not shown                |
| Duty-conflict tab: Open duty conflicts | not shown                      | 14 (6 critical · 8 high) |
| Duty-conflict tab: Duty conflicts (N)  | 14                             | 14                       |
| Duty-conflict tab: All locations (N)   | not shown                      | not shown                |
| Report summary: open duty conflicts    | 14                             | 14                       |

Start here, exposure sentence:

- Before: 11 gaps across 14 duty conflicts, worst first.
- After: 14 open duty conflicts, grouped by pair of duties, worst first.

Start here, concentration line:

- Before: Greg Holloway (Bookkeeper) holds 7 of the 11 open gaps.
- After: Greg Holloway (Bookkeeper) holds 7 of the 14 open duty conflicts.

First step (Start here's "Do these first" and the report's list of steps):

- Before: Move any single duty out of the concentrated role — even just the bank reconciliation
- After: Move one duty, reconcile the bank account, away from Greg Holloway: it closes 3 of the 14 open duty conflicts

Report summary, first-step line:

- Before: First step: move any single duty out of the concentrated role — even just the bank reconciliation.
- After: First step: move one duty, reconcile the bank account, away from Greg Holloway: it closes 3 of the 14 open duty conflicts.

Coach (the brief built from the team's conflicts), situation line:

- Before: **Sample**: 3 people hold an open duty conflict. Question: _What do I fix first?_
- After: **Sample**: 14 open duty conflicts (6 critical · 8 high), held by 3 people. Question: _What do I fix first?_

## Professional services firm (`professional_services`), dual release on

| Screen and figure                      | Before                         | After                   |
| -------------------------------------- | ------------------------------ | ----------------------- |
| Start here tile: Open duty conflicts   | 9 (4 critical · 5 high)        | 9 (4 critical · 5 high) |
| Duty-conflict tab: Critical open       | 4 (Not closed by dual release) | not shown               |
| Duty-conflict tab: High open           | 5 (Not closed by dual release) | not shown               |
| Duty-conflict tab: Open duty conflicts | not shown                      | 9 (4 critical · 5 high) |
| Duty-conflict tab: Duty conflicts (N)  | 14                             | 9                       |
| Duty-conflict tab: All locations (N)   | not shown                      | not shown               |
| Report summary: open duty conflicts    | 9                              | 9                       |

Start here, exposure sentence:

- Before: 11 gaps across 14 duty conflicts, worst first. 2 of them your dual-release policy narrows rather than closes. 3 are covered by dual release at every amount.
- After: 9 open duty conflicts, grouped by pair of duties, worst first. 2 of them your dual-release policy narrows rather than closes. Dual release covers 5 more duty conflicts at every amount, so they are not counted.

Start here, concentration line:

- Before: Greg Holloway (Bookkeeper) holds 5 of the 8 open gaps.
- After: Greg Holloway (Bookkeeper) holds 5 of the 9 open duty conflicts.

First step (Start here's "Do these first" and the report's list of steps):

- Before: Move any single duty out of the concentrated role — even just the bank reconciliation
- After: Move one duty, reconcile the bank account, away from Greg Holloway: it closes 3 of the 9 open duty conflicts

Report summary, first-step line:

- Before: First step: move any single duty out of the concentrated role — even just the bank reconciliation.
- After: First step: move one duty, reconcile the bank account, away from Greg Holloway: it closes 3 of the 9 open duty conflicts.

Coach (the brief built from the team's conflicts), situation line:

- Before: **Sample**: 3 people hold an open duty conflict. Question: _What do I fix first?_
- After: **Sample**: 9 open duty conflicts (4 critical · 5 high), held by 3 people. Question: _What do I fix first?_

## Restaurant (`restaurant`), default

| Screen and figure                      | Before                          | After                     |
| -------------------------------------- | ------------------------------- | ------------------------- |
| Start here tile: Open duty conflicts   | 14 (3 critical · 11 high)       | 14 (3 critical · 11 high) |
| Duty-conflict tab: Critical open       | 3 (Not closed by dual release)  | not shown                 |
| Duty-conflict tab: High open           | 11 (Not closed by dual release) | not shown                 |
| Duty-conflict tab: Open duty conflicts | not shown                       | 14 (3 critical · 11 high) |
| Duty-conflict tab: Duty conflicts (N)  | 14                              | 14                        |
| Duty-conflict tab: All locations (N)   | not shown                       | not shown                 |
| Report summary: open duty conflicts    | 14                              | 14                        |

Start here, exposure sentence:

- Before: 9 gaps across 14 duty conflicts, worst first.
- After: 14 open duty conflicts, grouped by pair of duties, worst first.

Start here, concentration line:

- Before: Keisha Moore (General Manager) holds 7 of the 9 open gaps.
- After: Keisha Moore (General Manager) holds 7 of the 14 open duty conflicts.

First step (Start here's "Do these first" and the report's list of steps):

- Before: Move any single duty out of the concentrated role — even just the bank reconciliation
- After: Move one duty, enter write-offs, away from Keisha Moore: it closes 3 of the 14 open duty conflicts

Report summary, first-step line:

- Before: First step: move any single duty out of the concentrated role — even just the bank reconciliation.
- After: First step: move one duty, enter write-offs, away from Keisha Moore: it closes 3 of the 14 open duty conflicts.

Coach (the brief built from the team's conflicts), situation line:

- Before: **Sample**: 4 people hold an open duty conflict. Question: _What do I fix first?_
- After: **Sample**: 14 open duty conflicts (3 critical · 11 high), held by 4 people. Question: _What do I fix first?_

## Restaurant (`restaurant`), dual release on

| Screen and figure                      | Before                         | After                    |
| -------------------------------------- | ------------------------------ | ------------------------ |
| Start here tile: Open duty conflicts   | 11 (2 critical · 9 high)       | 11 (2 critical · 9 high) |
| Duty-conflict tab: Critical open       | 2 (Not closed by dual release) | not shown                |
| Duty-conflict tab: High open           | 9 (Not closed by dual release) | not shown                |
| Duty-conflict tab: Open duty conflicts | not shown                      | 11 (2 critical · 9 high) |
| Duty-conflict tab: Duty conflicts (N)  | 14                             | 11                       |
| Duty-conflict tab: All locations (N)   | not shown                      | not shown                |
| Report summary: open duty conflicts    | 11                             | 11                       |

Start here, exposure sentence:

- Before: 9 gaps across 14 duty conflicts, worst first. 1 of them your dual-release policy narrows rather than closes. 2 are covered by dual release at every amount.
- After: 11 open duty conflicts, grouped by pair of duties, worst first. 1 of them your dual-release policy narrows rather than closes. Dual release covers 3 more duty conflicts at every amount, so they are not counted.

Start here, concentration line:

- Before: Keisha Moore (General Manager) holds 5 of the 7 open gaps.
- After: none (nobody holds half or more of the open duty conflicts)

First step (Start here's "Do these first" and the report's list of steps):

- Before: Move any single duty out of the concentrated role — even just the bank reconciliation
- After: Move one duty of a conflicting pair to someone who holds neither duty

Report summary, first-step line:

- Before: First step: move one duty of a conflicting pair to someone who holds neither duty — even just the bank reconciliation.
- After: First step: move one duty of a conflicting pair to someone who holds neither duty.

Coach (the brief built from the team's conflicts), situation line:

- Before: **Sample**: 4 people hold an open duty conflict. Question: _What do I fix first?_
- After: **Sample**: 11 open duty conflicts (2 critical · 9 high), held by 4 people. Question: _What do I fix first?_

## Construction company (`construction`), default

| Screen and figure                      | Before                         | After                    |
| -------------------------------------- | ------------------------------ | ------------------------ |
| Start here tile: Open duty conflicts   | 10 (5 critical · 5 high)       | 10 (5 critical · 5 high) |
| Duty-conflict tab: Critical open       | 5 (Not closed by dual release) | not shown                |
| Duty-conflict tab: High open           | 5 (Not closed by dual release) | not shown                |
| Duty-conflict tab: Open duty conflicts | not shown                      | 10 (5 critical · 5 high) |
| Duty-conflict tab: Duty conflicts (N)  | 10                             | 10                       |
| Duty-conflict tab: All locations (N)   | not shown                      | not shown                |
| Report summary: open duty conflicts    | 10                             | 10                       |

Start here, exposure sentence:

- Before: 10 gaps across 10 duty conflicts, worst first.
- After: 10 open duty conflicts, grouped by pair of duties, worst first.

Start here, concentration line:

- Before: Dana Whitfield (Office Manager) holds 8 of the 10 open gaps.
- After: Dana Whitfield (Office Manager) holds 8 of the 10 open duty conflicts.

First step (Start here's "Do these first" and the report's list of steps):

- Before: Move any single duty out of the concentrated role — even just the bank reconciliation
- After: Move one duty, reconcile the bank account, away from Dana Whitfield: it closes 3 of the 10 open duty conflicts

Report summary, first-step line:

- Before: First step: move any single duty out of the concentrated role — even just the bank reconciliation.
- After: First step: move one duty, reconcile the bank account, away from Dana Whitfield: it closes 3 of the 10 open duty conflicts.

Coach (the brief built from the team's conflicts), situation line:

- Before: **Sample**: 3 people hold an open duty conflict. Question: _What do I fix first?_
- After: **Sample**: 10 open duty conflicts (5 critical · 5 high), held by 3 people. Question: _What do I fix first?_

## Construction company (`construction`), dual release on

| Screen and figure                      | Before                         | After                   |
| -------------------------------------- | ------------------------------ | ----------------------- |
| Start here tile: Open duty conflicts   | 7 (4 critical · 3 high)        | 7 (4 critical · 3 high) |
| Duty-conflict tab: Critical open       | 4 (Not closed by dual release) | not shown               |
| Duty-conflict tab: High open           | 3 (Not closed by dual release) | not shown               |
| Duty-conflict tab: Open duty conflicts | not shown                      | 7 (4 critical · 3 high) |
| Duty-conflict tab: Duty conflicts (N)  | 10                             | 7                       |
| Duty-conflict tab: All locations (N)   | not shown                      | not shown               |
| Report summary: open duty conflicts    | 7                              | 7                       |

Start here, exposure sentence:

- Before: 10 gaps across 10 duty conflicts, worst first. 3 are covered by dual release at every amount.
- After: 7 open duty conflicts, grouped by pair of duties, worst first. Dual release covers 3 more duty conflicts at every amount, so they are not counted.

Start here, concentration line:

- Before: Dana Whitfield (Office Manager) holds 5 of the 7 open gaps.
- After: Dana Whitfield (Office Manager) holds 5 of the 7 open duty conflicts.

First step (Start here's "Do these first" and the report's list of steps):

- Before: Move any single duty out of the concentrated role — even just the bank reconciliation
- After: Move one duty, reconcile the bank account, away from Dana Whitfield: it closes 3 of the 7 open duty conflicts

Report summary, first-step line:

- Before: First step: move any single duty out of the concentrated role — even just the bank reconciliation.
- After: First step: move one duty, reconcile the bank account, away from Dana Whitfield: it closes 3 of the 7 open duty conflicts.

Coach (the brief built from the team's conflicts), situation line:

- Before: **Sample**: 3 people hold an open duty conflict. Question: _What do I fix first?_
- After: **Sample**: 7 open duty conflicts (4 critical · 3 high), held by 3 people. Question: _What do I fix first?_

## Auto repair shop (`automotive`), default

| Screen and figure                      | Before                          | After                               |
| -------------------------------------- | ------------------------------- | ----------------------------------- |
| Start here tile: Open duty conflicts   | 21 (7 critical · 14 high)       | 22 (7 critical · 14 high · 1 other) |
| Duty-conflict tab: Critical open       | 7 (Not closed by dual release)  | not shown                           |
| Duty-conflict tab: High open           | 14 (Not closed by dual release) | not shown                           |
| Duty-conflict tab: Open duty conflicts | not shown                       | 22 (7 critical · 14 high · 1 other) |
| Duty-conflict tab: Duty conflicts (N)  | 22                              | 22                                  |
| Duty-conflict tab: All locations (N)   | not shown                       | not shown                           |
| Report summary: open duty conflicts    | 22                              | 22                                  |

Start here, exposure sentence:

- Before: 19 gaps across 22 duty conflicts, worst first.
- After: 22 open duty conflicts, grouped by pair of duties, worst first.

Start here, concentration line:

- Before: Linda Marsh (Office Manager) holds 14 of the 19 open gaps.
- After: Linda Marsh (Office Manager) holds 14 of the 22 open duty conflicts.

First step (Start here's "Do these first" and the report's list of steps):

- Before: Move any single duty out of the concentrated role — even just the bank reconciliation
- After: Move one duty, reconcile the bank account, away from Linda Marsh: it closes 5 of the 22 open duty conflicts

Report summary, first-step line:

- Before: First step: move any single duty out of the concentrated role — even just the bank reconciliation.
- After: First step: move one duty, reconcile the bank account, away from Linda Marsh: it closes 5 of the 22 open duty conflicts.

Coach (the brief built from the team's conflicts), situation line:

- Before: **Sample**: 7 people hold an open duty conflict. Question: _What do I fix first?_
- After: **Sample**: 22 open duty conflicts (7 critical · 14 high · 1 other), held by 7 people. Question: _What do I fix first?_

## Auto repair shop (`automotive`), dual release on

| Screen and figure                      | Before                          | After                               |
| -------------------------------------- | ------------------------------- | ----------------------------------- |
| Start here tile: Open duty conflicts   | 18 (6 critical · 12 high)       | 19 (6 critical · 12 high · 1 other) |
| Duty-conflict tab: Critical open       | 6 (Not closed by dual release)  | not shown                           |
| Duty-conflict tab: High open           | 12 (Not closed by dual release) | not shown                           |
| Duty-conflict tab: Open duty conflicts | not shown                       | 19 (6 critical · 12 high · 1 other) |
| Duty-conflict tab: Duty conflicts (N)  | 22                              | 19                                  |
| Duty-conflict tab: All locations (N)   | not shown                       | not shown                           |
| Report summary: open duty conflicts    | 19                              | 19                                  |

Start here, exposure sentence:

- Before: 19 gaps across 22 duty conflicts, worst first. 3 are covered by dual release at every amount.
- After: 19 open duty conflicts, grouped by pair of duties, worst first. Dual release covers 3 more duty conflicts at every amount, so they are not counted.

Start here, concentration line:

- Before: Linda Marsh (Office Manager) holds 11 of the 16 open gaps.
- After: Linda Marsh (Office Manager) holds 11 of the 19 open duty conflicts.

First step (Start here's "Do these first" and the report's list of steps):

- Before: Move any single duty out of the concentrated role — even just the bank reconciliation
- After: Move one duty, reconcile the bank account, away from Linda Marsh: it closes 5 of the 19 open duty conflicts

Report summary, first-step line:

- Before: First step: move any single duty out of the concentrated role — even just the bank reconciliation.
- After: First step: move one duty, reconcile the bank account, away from Linda Marsh: it closes 5 of the 19 open duty conflicts.

Coach (the brief built from the team's conflicts), situation line:

- Before: **Sample**: 7 people hold an open duty conflict. Question: _What do I fix first?_
- After: **Sample**: 19 open duty conflicts (6 critical · 12 high · 1 other), held by 7 people. Question: _What do I fix first?_

## Nonprofit (`nonprofit`), default

| Screen and figure                      | Before                          | After                     |
| -------------------------------------- | ------------------------------- | ------------------------- |
| Start here tile: Open duty conflicts   | 19 (8 critical · 11 high)       | 19 (8 critical · 11 high) |
| Duty-conflict tab: Critical open       | 8 (Not closed by dual release)  | not shown                 |
| Duty-conflict tab: High open           | 11 (Not closed by dual release) | not shown                 |
| Duty-conflict tab: Open duty conflicts | not shown                       | 19 (8 critical · 11 high) |
| Duty-conflict tab: Duty conflicts (N)  | 19                              | 19                        |
| Duty-conflict tab: All locations (N)   | not shown                       | not shown                 |
| Report summary: open duty conflicts    | 19                              | 19                        |

Start here, exposure sentence:

- Before: 19 gaps across 19 duty conflicts, worst first.
- After: 19 open duty conflicts, grouped by pair of duties, worst first.

Start here, concentration line:

- Before: Martin Alvarez (Finance & Operations Manager) holds 15 of the 19 open gaps.
- After: Martin Alvarez (Finance & Operations Manager) holds 15 of the 19 open duty conflicts.

First step (Start here's "Do these first" and the report's list of steps):

- Before: Move any single duty out of the concentrated role — even just the bank reconciliation
- After: Move one duty, reconcile the bank account, away from Martin Alvarez: it closes 5 of the 19 open duty conflicts

Report summary, first-step line:

- Before: First step: move any single duty out of the concentrated role — even just the bank reconciliation.
- After: First step: move one duty, reconcile the bank account, away from Martin Alvarez: it closes 5 of the 19 open duty conflicts.

Coach (the brief built from the team's conflicts), situation line:

- Before: **Sample**: 4 people hold an open duty conflict. Question: _What do I fix first?_
- After: **Sample**: 19 open duty conflicts (8 critical · 11 high), held by 4 people. Question: _What do I fix first?_

## Nonprofit (`nonprofit`), dual release on

| Screen and figure                      | Before                         | After                    |
| -------------------------------------- | ------------------------------ | ------------------------ |
| Start here tile: Open duty conflicts   | 16 (7 critical · 9 high)       | 16 (7 critical · 9 high) |
| Duty-conflict tab: Critical open       | 7 (Not closed by dual release) | not shown                |
| Duty-conflict tab: High open           | 9 (Not closed by dual release) | not shown                |
| Duty-conflict tab: Open duty conflicts | not shown                      | 16 (7 critical · 9 high) |
| Duty-conflict tab: Duty conflicts (N)  | 19                             | 16                       |
| Duty-conflict tab: All locations (N)   | not shown                      | not shown                |
| Report summary: open duty conflicts    | 16                             | 16                       |

Start here, exposure sentence:

- Before: 19 gaps across 19 duty conflicts, worst first. 2 of them your dual-release policy narrows rather than closes. 3 are covered by dual release at every amount.
- After: 16 open duty conflicts, grouped by pair of duties, worst first. 2 of them your dual-release policy narrows rather than closes. Dual release covers 3 more duty conflicts at every amount, so they are not counted.

Start here, concentration line:

- Before: Martin Alvarez (Finance & Operations Manager) holds 12 of the 16 open gaps.
- After: Martin Alvarez (Finance & Operations Manager) holds 12 of the 16 open duty conflicts.

First step (Start here's "Do these first" and the report's list of steps):

- Before: Move any single duty out of the concentrated role — even just the bank reconciliation
- After: Move one duty, reconcile the bank account, away from Martin Alvarez: it closes 5 of the 16 open duty conflicts

Report summary, first-step line:

- Before: First step: move any single duty out of the concentrated role — even just the bank reconciliation.
- After: First step: move one duty, reconcile the bank account, away from Martin Alvarez: it closes 5 of the 16 open duty conflicts.

Coach (the brief built from the team's conflicts), situation line:

- Before: **Sample**: 4 people hold an open duty conflict. Question: _What do I fix first?_
- After: **Sample**: 16 open duty conflicts (7 critical · 9 high), held by 4 people. Question: _What do I fix first?_

## General small business (`general`), default

| Screen and figure                      | Before                         | After                    |
| -------------------------------------- | ------------------------------ | ------------------------ |
| Start here tile: Open duty conflicts   | 13 (4 critical · 9 high)       | 13 (4 critical · 9 high) |
| Duty-conflict tab: Critical open       | 4 (Not closed by dual release) | not shown                |
| Duty-conflict tab: High open           | 9 (Not closed by dual release) | not shown                |
| Duty-conflict tab: Open duty conflicts | not shown                      | 13 (4 critical · 9 high) |
| Duty-conflict tab: Duty conflicts (N)  | 13                             | 13                       |
| Duty-conflict tab: All locations (N)   | not shown                      | not shown                |
| Report summary: open duty conflicts    | 13                             | 13                       |

Start here, exposure sentence:

- Before: 10 gaps across 13 duty conflicts, worst first.
- After: 13 open duty conflicts, grouped by pair of duties, worst first.

Start here, concentration line:

- Before: Maya Chen (Operations Manager) holds 5 of the 10 open gaps.
- After: none (nobody holds half or more of the open duty conflicts)

First step (Start here's "Do these first" and the report's list of steps):

- Before: Move any single duty out of the concentrated role — even just the bank reconciliation
- After: Move one duty of a conflicting pair to someone who holds neither duty

Report summary, first-step line:

- Before: First step: move one duty of a conflicting pair to someone who holds neither duty — even just the bank reconciliation.
- After: First step: move one duty of a conflicting pair to someone who holds neither duty.

Coach (the brief built from the team's conflicts), situation line:

- Before: **Sample**: 4 people hold an open duty conflict. Question: _What do I fix first?_
- After: **Sample**: 13 open duty conflicts (4 critical · 9 high), held by 4 people. Question: _What do I fix first?_

## General small business (`general`), dual release on

| Screen and figure                      | Before                         | After                   |
| -------------------------------------- | ------------------------------ | ----------------------- |
| Start here tile: Open duty conflicts   | 8 (2 critical · 6 high)        | 8 (2 critical · 6 high) |
| Duty-conflict tab: Critical open       | 2 (Not closed by dual release) | not shown               |
| Duty-conflict tab: High open           | 6 (Not closed by dual release) | not shown               |
| Duty-conflict tab: Open duty conflicts | not shown                      | 8 (2 critical · 6 high) |
| Duty-conflict tab: Duty conflicts (N)  | 13                             | 8                       |
| Duty-conflict tab: All locations (N)   | not shown                      | not shown               |
| Report summary: open duty conflicts    | 8                              | 8                       |

Start here, exposure sentence:

- Before: 10 gaps across 13 duty conflicts, worst first. 2 of them your dual-release policy narrows rather than closes. 3 are covered by dual release at every amount.
- After: 8 open duty conflicts, grouped by pair of duties, worst first. 2 of them your dual-release policy narrows rather than closes. Dual release covers 5 more duty conflicts at every amount, so they are not counted.

Start here, concentration line:

- Before: none
- After: none (nobody holds half or more of the open duty conflicts)

First step (Start here's "Do these first" and the report's list of steps):

- Before: Move any single duty out of the concentrated role — even just the bank reconciliation
- After: Move one duty of a conflicting pair to someone who holds neither duty

Report summary, first-step line:

- Before: First step: move one duty of a conflicting pair to someone who holds neither duty — even just the bank reconciliation.
- After: First step: move one duty of a conflicting pair to someone who holds neither duty.

Coach (the brief built from the team's conflicts), situation line:

- Before: **Sample**: 3 people hold an open duty conflict. Question: _What do I fix first?_
- After: **Sample**: 8 open duty conflicts (2 critical · 6 high), held by 3 people. Question: _What do I fix first?_
