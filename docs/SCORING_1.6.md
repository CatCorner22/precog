# Scoring 1.6.0 (2 October 2026)

Scoring 1.6.0 (`precog-residual-v1.6.0`) gives one set of figures a CPA can sign: every screen and the printed report count the same things the same way, and no figure reads as reassuring when Precog has nothing to base it on.

## What changed and why

- **One rule for open duty conflicts.** Every screen, the report, the coach and the pilot metrics count open duty conflicts with one rule. Before, each counted its own way, so the same business showed different totals.
- **Accepted risk stays open.** Accepting a duty conflict records a decision; it no longer closes the conflict. The report lists it as "Open, risk accepted".
- **Partly covered pairs read "Reduced, not closed".** When dual release covers a pair only above a threshold, one person still acts alone below it. The report counts the pair as open once and marks it "Reduced, not closed".
- **One band table, and "Fix first" means only residual 80+.** Every band cutoff (health, risk, priority) lives in one table. "Fix first" now names only residual risks at 80 or more, not the top priority band as well.
- **COSO shows Gap, In place or Not assessed.** Each of the 17 principles reads Gap, In place or Not assessed. Precog no longer averages them into an overall or component score, because an average hid the principles it had no record for.
- **The priority headline is a count.** The priority list leads with the number of top-priority items (priority 88 or more, counted over every item), not an averaged priority index.
- **Duty-conflict cards show their factors.** A card lists who holds the pair, dual release (with its threshold) and staffing, instead of "Rank N of 100".
- **Stand-in cover leaves out keep-few duties.** Bulk export, granting access, system administration, backups and reading access logs belong with as few people as possible, so a second holder no longer raises stand-in cover.
- **Early warning is a list of dated records.** It lists overdue items, readings from the books or the access export, and items falling due, each with its date, or "No early-warning sources connected". The early-warning pressure index is gone.
  - _3 October 2026:_ the list was removed. No screen showed it after the Phase 5 streamline (the Dashboard that held it was retired), and the owner chose to delete it rather than give it a new home. The pressure index stays gone. The table below keeps the 1.6.0 figures as recorded.
- **Each control answer counts once.** Dual release, bank reconciliation and the segregation score no longer add a second credit to a residual row.
- **An own team's figures come from its duties.** An own team's segregation score and bank reconciliation answer come only from who does what. Confirmed sample controls no longer copy the sample's "segregated" flag.
- **Placeholder scenario dollars stay out of the ranking.** Scenario rows and the danger list rank on likelihood and severity levels. The sample dollars and days are illustrative and no longer move a row up or down.
- **Map health became map completeness.** The map score counts how far the map is filled in, in four equal parts. Process heat no longer feeds it.
- **Unverified case records are marked.** Every case card, the setup preview and the report appendix mark a case record "Unverified" until a person checks it.

## Before and after on the eight samples

Before is `main` at 96c7e44 (scoring 1.5.0); after is scoring 1.6.0. Each figure comes from the default sample profile for the industry, built the way the screens and the printed report build it (`buildReportModelForProfile`, `assessCoso`, `analyzeDutyCoverage`, `earlyWarning` and `pilotMetrics`), on 2 October 2026.

### Duty conflicts (report KPI)

| Sample                        | Segregation health index | Band word            | Open critical | Open high |
| ----------------------------- | ------------------------ | -------------------- | ------------- | --------- |
| Dental office                 | 5 (no change)            | critical (no change) | 3 → 4         | 10 → 15   |
| Retail / e-commerce           | 9 (no change)            | critical (no change) | 4 → 6         | 5 → 10    |
| Professional services         | 8 (no change)            | critical (no change) | 4 → 6         | 4 → 8     |
| Restaurant / hospitality      | 14 (no change)           | critical (no change) | 2 → 3         | 6 → 11    |
| Construction / trades         | 11 (no change)           | critical (no change) | 3 → 5         | 4 → 5     |
| Auto dealership / repair shop | 2 (no change)            | critical (no change) | 3 → 7         | 11 → 14   |
| Nonprofit organization        | 1 (no change)            | critical (no change) | 4 → 8         | 9 → 11    |
| General small business        | 12 (no change)           | critical (no change) | 3 → 4         | 5 → 9     |

The index does not move. The open counts rise because a conflict the sample marks as accepted now counts as open.

### Residual risk

| Sample                        | Average residual | Fix first (80+) | Fix soon (60 to 79) | Worth doing (40 to 59) | Watch (under 40) |
| ----------------------------- | ---------------- | --------------- | ------------------- | ---------------------- | ---------------- |
| Dental office                 | 57 → 58          | 3 → 4           | 11 → 8              | 5 → 7                  | 6 → 6            |
| Retail / e-commerce           | 67 → 67          | 5 → 6           | 9 → 6               | 3 → 5                  | 1 → 1            |
| Professional services         | 66 → 65          | 6 → 7           | 10 → 6              | 5 → 8                  | 1 → 1            |
| Restaurant / hospitality      | 66 → 65          | 3 → 4           | 14 → 10             | 3 → 6                  | 1 → 1            |
| Construction / trades         | 55 → 55          | 2 → 3           | 12 → 10             | 9 → 10                 | 5 → 5            |
| Auto dealership / repair shop | 54 → 56          | 2 → 4           | 14 → 11             | 8 → 9                  | 6 → 6            |
| Nonprofit organization        | 55 → 56          | 1 → 3           | 10 → 8              | 10 → 10                | 4 → 4            |
| General small business        | 61 → 61          | 3 → 4           | 8 → 5               | 5 → 7                  | 2 → 2            |

The report's residual tile showed the average before; it now shows the band counts. The average still appears in the decision journal.

### Priority list, stand-in cover, map and early warning

| Sample                        | Priority index | Top-priority items (88+) | Stand-in cover | Map health (before) | Map completeness (after) | Early warning                       |
| ----------------------------- | -------------- | ------------------------ | -------------- | ------------------- | ------------------------ | ----------------------------------- |
| Dental office                 | 87 → removed   | 2 → 3                    | 41 → 45        | 70, Fair            | 75%, Mostly complete     | pressure index 80, High → list of 0 |
| Retail / e-commerce           | 88 → removed   | 2 → 4                    | 39 → 47        | 64, Fair            | 70%, Mostly complete     | pressure index 86, High → list of 0 |
| Professional services         | 89 → removed   | 3 → 4                    | 39 → 46        | 65, Fair            | 72%, Mostly complete     | pressure index 86, High → list of 0 |
| Restaurant / hospitality      | 88 → removed   | 2 → 3                    | 37 → 44        | 59, At risk         | 63%, Mostly complete     | pressure index 86, High → list of 0 |
| Construction / trades         | 87 → removed   | 3 → 4                    | 40 → 47        | 66, Fair            | 70%, Mostly complete     | pressure index 80, High → list of 0 |
| Auto dealership / repair shop | 87 → removed   | 3 → 4                    | 49 → 56        | 70, Fair            | 75%, Mostly complete     | pressure index 80, High → list of 0 |
| Nonprofit organization        | 89 → removed   | 4 → 4                    | 54 → 63        | 64, Fair            | 70%, Mostly complete     | pressure index 80, High → list of 0 |
| General small business        | 87 → removed   | 2 → 3                    | 41 → 49        | 66, Fair            | 71%, Mostly complete     | pressure index 80, High → list of 0 |

Before, Precog had no top-priority count; the before figure counts the items at priority 88 or more in the ten-row list the screen showed. After, the count covers every item. The early-warning list is empty on every sample because a sample connects no books and no access export and has nothing due; it reads "No early-warning sources connected".

### COSO

| Sample                        | Overall score (before)  | Component scores (before): Environment / Risk / Activities / Info & Comm / Monitoring | Component status (after) | Principles not assessed |
| ----------------------------- | ----------------------- | ------------------------------------------------------------------------------------- | ------------------------ | ----------------------- |
| Dental office                 | 31 (critical) → removed | 50 / 38 / 15 / 25 / 25 → removed                                                      | Gap on all five          | 5 of 17 → 6 of 17       |
| Retail / e-commerce           | 30 (critical) → removed | 50 / 38 / 15 / 25 / 20 → removed                                                      | Gap on all five          | 5 of 17 → 6 of 17       |
| Professional services         | 28 (critical) → removed | 50 / 30 / 15 / 25 / 20 → removed                                                      | Gap on all five          | 5 of 17 → 6 of 17       |
| Restaurant / hospitality      | 28 (critical) → removed | 50 / 30 / 15 / 25 / 20 → removed                                                      | Gap on all five          | 5 of 17 → 6 of 17       |
| Construction / trades         | 32 (critical) → removed | 50 / 46 / 15 / 30 / 20 → removed                                                      | Gap on all five          | 5 of 17 → 6 of 17       |
| Auto dealership / repair shop | 36 (critical) → removed | 50 / 54 / 15 / 40 / 20 → removed                                                      | Gap on all five          | 5 of 17 → 6 of 17       |
| Nonprofit organization        | 32 (critical) → removed | 50 / 46 / 15 / 30 / 20 → removed                                                      | Gap on all five          | 5 of 17 → 6 of 17       |
| General small business        | 34 (critical) → removed | 50 / 46 / 15 / 30 / 31 → removed                                                      | Gap on all five          | 5 of 17 → 6 of 17       |

Principle 1 (integrity and ethical values) now reads Not assessed: Precog records no code of conduct, and before it borrowed a status from the segregation figures. That is the sixth. Principle 11 reads the imported user access export when there is one; no sample has one.

### Pilot metrics

| Sample                        | Findings | Open    | Accepted | Acted on |
| ----------------------------- | -------- | ------- | -------- | -------- |
| Dental office                 | 20       | 14 → 20 | 6 → 0    | new: 0   |
| Retail / e-commerce           | 16       | 9 → 16  | 7 → 0    | new: 0   |
| Professional services         | 14       | 8 → 14  | 6 → 0    | new: 0   |
| Restaurant / hospitality      | 14       | 8 → 14  | 6 → 0    | new: 0   |
| Construction / trades         | 10       | 7 → 10  | 3 → 0    | new: 0   |
| Auto dealership / repair shop | 22       | 15 → 22 | 7 → 0    | new: 0   |
| Nonprofit organization        | 19       | 13 → 19 | 6 → 0    | new: 0   |
| General small business        | 13       | 8 → 13  | 5 → 0    | new: 0   |

The firm page shows pilot metrics only for an own team, so these figures pass each sample's duty conflicts to `pilotMetrics` directly. The samples log no decisions. Before, a conflict the sample marked as accepted counted as accepted and dropped out of the open count; now only an "accept residual" decision counts as accepted, the finding stays open, and "acted on" counts the rest that dual release closes or a remediate, monitor or insure decision answers.

## Locked reports

Since Phase 1, locking a report version stores the figures it printed. A version locked before this release keeps the figures it was locked with, and prints them under its own labels: a version stored under report layout 1 still reads "Map health score" and "Average residual risk score". Scoring 1.6.0 does not reach back into it. Only a version locked before Precog stored figures, or one whose figures were too large to store, is recalculated, and it says so: "Figures recalculated with scoring precog-residual-v1.6.0 on" the day it is opened.

## What is not in this release

New duty-conflict rules and changes to rule severities wait for a CPA's sign-off. Scoring 1.6.0 changes how Precog counts, bands and shows the existing rules; it adds no rule and moves no severity.

## Notes after release

- _6 October 2026:_ #207 changed which measures the control-failure view lists; no figure moved (`residual-engine.ts` adds no compensating credit). The follow-up fix moves the dual-release what-if as listed in its commit: with the staff flag on and no payment rule able to run, the "with it" residual now equals the one the report prints, and "N duty conflicts rely on it" counts only open conflicts, as every other screen does.
