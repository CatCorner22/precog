# Wave 3, slice S8: sample figures moved by the fake-employee payroll scenario (October 2026)

Slice S8 ("What this could cost") adds one scenario to every industry sample: "One person adds people to payroll and runs it" (`sc-payroll-ghost`, owner decision OD-2). This page lists every sample figure and every line of the printed report that it moves, before and after. "Before" is `main` at bd26e58; "after" is the S8 branch. Both are the sample business with its saved settings, a live report generated on 2026-10-07, and Start here on 2026-09-26. Versions already locked print their stored figures, as they did.

## What the scenario is

- It is shared by all 8 samples, like the cash, write-off and vendor scenarios, and it names the "Payroll approval" control (`c-payroll`), which every sample already carries.
- Its dollars and days are the cash scenario's example set (`SCENARIO_FIGURES.cash`: about $28,000, from $5,000 to $95,000, found after about 90 days). They are example figures, not from any business's books, and they never set a rank.
- It is a cash scheme (a payment to a payee, like vendor fraud), so it is priced and ranked with the cash failure and vendor fraud.
- It names three duty-conflict rules: change employee records + run payroll, change employee records + release payments, and payroll entry + payment release. In 7 of the 8 samples the open payroll gap is payroll entry + payment release; in construction it is change employee records + run payroll.
- Its page leads with the two library cases that show a fake employee outright. Both are already in the case library with their primary source:
  - `case-restaurant-franchisee-idaho`: an Idaho district manager paid $685,376 to employees who had left (U.S. Attorney's Office, District of Idaho).
  - `case-st-louis-floor-covering`: a St. Louis County warehouse supervisor put a partner who never worked there on payroll (U.S. Attorney's Office, Eastern District of Missouri).
- Its two fixes are assumptions, as every scenario's are: "Someone who does not run payroll reads the payroll register each pay run" and "A second person adds each new employee and approves each bank account change".

## Why figures move, on every sample

1. **A new residual row.** The scenario has its own row on the residual index. On a team of six or fewer it reads 87 / 0 / 87, and on a larger team (construction, automotive and nonprofit) 82 / 0 / 82. These are the same figures as the cash failure and vendor fraud rows, because all three are cash schemes.
2. **Payroll approval rises.** A control's money exposure comes from the scenario that names it. "Payroll approval" now guards a cash fraud scenario, so its inherent risk rises from 53 to 73 in every sample. Its effectiveness does not move.
3. **The average moves with those two rows.** The tornado's levers move with the average, by 1 point at most.
4. **A new ranked scenario.** It ranks third, after vendor fraud. Its row equals the cash failure's on the same sample: $77,411 loss, $5,000 retained, 178 days and $4,910 a year on a small team; $67,314, $5,000, 155 days and $4,910 on a larger one. No other ranked row moves.
5. **The priority stack.** The stack takes the residual index's top 6 rows and the top 3 ranked scenarios. With the payroll scenario in both lists:
   - its card enters every stack at priority 78, or 75 on a larger team, in the "Fix soon" band;
   - the third ranked scenario before (write-offs, or repair-order cash in automotive) leaves the top 3, so its card, or its "Scenario" tag on a duty-conflict row, leaves the stack;
   - the sixth residual row before leaves the top 6. Where that row was a control, its card or its "Control" tag leaves the stack: retail, professional services, construction, automotive and nonprofit.
6. **Report warning signs.** The report prints warning signs for the scenarios at the top of the stack, so in 7 samples the payroll scenario's signs replace the third scenario's signs. The nonprofit is the exception.
7. **Residual bands.** The printed "Residual 80 or more" count rises by 1 everywhere. "Fix soon" rises by 1 and "Worth doing" falls by 1, because the payroll approval row moves up a band.
8. **No other counts move.** The "Fix first" count (priority 88 or more), the COSO results, the duty-conflict counts and every other ranked scenario stay as they were.

## Labels and text that move on every sample

- Every scenario dollar and day figure carried the label "Illustrative example, not sized to your business". It now reads "Example figures, not from your books" (`ILLUSTRATIVE_LABEL`). This label appears on What could happen, the side-by-side comparison and the residual radar. It is not printed on the report.
- Start here's "What these gaps have cost other businesses" now opens with one sentence: "Precog shows three kinds of dollar figure: real cases like yours, the losses in prosecuted cases with the gaps above; the fraud study's median for organizations under 100 employees ($126,000), the typical loss once a fraud is found; and Precog's example scenarios under What could happen, which carry example figures, not from your books, for comparing fixes." All 8 samples have fewer than 100 employees and print the same sentence.
- What could happen lists one more scenario on every sample.
- What could happen has an "In your business right now" box. It changes when nobody holds a pair the scenario needs and one of the pair's duties is ticked for nobody. The box used to say "Nobody on the team holds both duties this needs." It now says, for example, "Nobody on the team is ticked for set up suppliers, so Precog cannot tell whether one person holds both duties this needs. Tick whoever does it on the Team tab.", naming the unticked duties. On the samples this moves one box. On the automotive sample, the write-off scenario now reads "Nobody on the team is ticked for issue invoices or claims, …". The other scenarios with no open gap (restaurant sales tax and tip pool, construction write-offs and change orders) have every duty ticked, so they keep the old sentence.

## Figures on other screens, and pins in other slices' tests

These move with the same change. S8 does not edit these test files; the integrator moves their pins in one named commit.

- **What else moves and Pioneer's variable cascades, dental sample.** The baseline average moves from 58 to 60. Cameras: 58 → 57 becomes 60 → 59, with the same verdict ("average residual risk falls 1 point."). The dual release row "58.00 → 54.00" moves with the baseline (`cascade-panel.test.tsx`, `llm/reasoning/engine.test.ts`).
- **"Sample scenarios … stay out" note.** An own business sees one more sample scenario left out: dental "(5)" → "(6)", restaurant "(6)" → "(7)", and so on, one more on every industry (`scoring/scope.test.ts`, `cascade-panel.test.tsx`, `llm/reasoning/engine.test.ts`).
- **Own businesses.** "Payroll approval" rises from 53 to 73 inherent on an own business too, even before the owner confirms the payroll scenario. A control's money exposure comes from the scenario that names it, whether or not that scenario is confirmed. An own dental business that confirmed only vendor fraud moves from 57 to 59 on What else moves (`llm/reasoning/engine.test.ts`).
- **Pioneer's scenario brief, dental sample.** "risk index 58" → "risk index 60" (`llm/scenario-dollars.test.ts`).
- **Process map, dental sample.** Hot processes: 4 → 5. The payroll process now runs hot because its control rose (`builder/map-state.test.ts`).
- **Threat deck reasons, professional services sample.** The deck no longer holds a card that prints "Retained about $5,000 (Precog default, enter your policy)", because the write-off scenario card left the deck (`threat-scoring.test.ts`).
- **Report cover tiles, dental.** "Fix first on the residual index | 4 | Residual 80 or more · 8 fix soon · 7 worth doing" → "5 | … · 9 fix soon · 6 worth doing". The dental figures stored today and printed under layouts 2 to 4 read "5 fix first | Fix first at 80 or more · 9 fix soon · 6 worth doing" instead of "4 fix first | … · 8 fix soon · 7 worth doing" (`control-report.test.tsx`).

## Dental office (`dental`)

| Figure                                                                                | Before       | After                           |
| ------------------------------------------------------------------------------------- | ------------ | ------------------------------- |
| Average residual (residual index)                                                     | 58           | 60                              |
| Residual row, fake-employee payroll scenario (inherent / effectiveness / residual)    | none         | 87 / 0 / 87                     |
| Residual row, "Payroll approval" control (inherent / effectiveness / residual)        | 53 / 12 / 52 | 73 / 12 / 72                    |
| Printed residual bands (80 or more / fix soon / worth doing)                          | 4 / 8 / 7    | 5 / 9 / 6                       |
| Priority 88 or more ("Fix first")                                                     | 3            | 3                               |
| Ranked scenario: fake-employee payroll (loss / retained / days / yearly cost of risk) | none         | $77,411 / $5,000 / 178 / $4,910 |
| Priority stack rows                                                                   | 8            | 9                               |

Threat deck (card:priority:heat): added `scen-sc-payroll-ghost:78:87`; none removed.

Priority stack as printed (target — type — band, priority), rows that moved or changed:

- Approve + post write-offs: type "Duty conflict · Scenario" → "Duty conflict"
- New row 5: One person adds people to payroll and runs it — Scenario — Fix soon, 78
- Insurance denial appeals: row 5 → 6
- Practice software administration: row 6 → 7
- Controlled-substance records: row 7 → 8
- Vendor invoice approval: row 8 → 9

Warning signs printed on the report, for the scenarios at the top of the priority stack:

- Before: One person posts payments and reconciles the bank; One person sets up vendors and pays them; Write-offs posted without a second approval
- After: One person posts payments and reconciles the bank; One person sets up vendors and pays them; One person adds people to payroll and runs it

## Retail / e-commerce (`retail`)

| Figure                                                                                | Before       | After                           |
| ------------------------------------------------------------------------------------- | ------------ | ------------------------------- |
| Average residual (residual index)                                                     | 67           | 69                              |
| Residual row, fake-employee payroll scenario (inherent / effectiveness / residual)    | none         | 87 / 0 / 87                     |
| Residual row, "Payroll approval" control (inherent / effectiveness / residual)        | 53 / 10 / 53 | 73 / 10 / 73                    |
| Printed residual bands (80 or more / fix soon / worth doing)                          | 6 / 6 / 5    | 7 / 7 / 4                       |
| Priority 88 or more ("Fix first")                                                     | 4            | 4                               |
| Tornado: cross-train every item one person holds lowers the average by                | 16           | 15                              |
| Tornado: dual release lowers the average by                                           | 5            | 6                               |
| Ranked scenario: fake-employee payroll (loss / retained / days / yearly cost of risk) | none         | $77,411 / $5,000 / 178 / $4,910 |
| Priority stack rows                                                                   | 10           | 10                              |

Threat deck (card:priority:heat): added `scen-sc-payroll-ghost:78:87`; removed `ctrl-c-ap:84:80`.

Priority stack as printed (target — type — band, priority), rows that moved or changed:

- Approve + post write-offs: type "Duty conflict · Scenario" → "Duty conflict"
- New row 6: One person adds people to payroll and runs it — Scenario — Fix soon, 78
- Dropped: Invoice matching — Control — Fix soon, 84

Warning signs printed on the report, for the scenarios at the top of the priority stack:

- Before: One person posts payments and reconciles the bank; One person sets up vendors and pays them; Markdowns and adjustments posted without a second approval
- After: One person posts payments and reconciles the bank; One person sets up vendors and pays them; One person adds people to payroll and runs it

## Professional services (`professional_services`)

| Figure                                                                                | Before       | After                           |
| ------------------------------------------------------------------------------------- | ------------ | ------------------------------- |
| Average residual (residual index)                                                     | 65           | 67                              |
| Residual row, fake-employee payroll scenario (inherent / effectiveness / residual)    | none         | 87 / 0 / 87                     |
| Residual row, "Payroll approval" control (inherent / effectiveness / residual)        | 53 / 10 / 53 | 73 / 10 / 73                    |
| Printed residual bands (80 or more / fix soon / worth doing)                          | 7 / 6 / 8    | 8 / 7 / 7                       |
| Priority 88 or more ("Fix first")                                                     | 4            | 4                               |
| Tornado: dual release lowers the average by                                           | 4            | 5                               |
| Tornado: independent bank reconciliation lowers the average by                        | 4            | 5                               |
| Ranked scenario: fake-employee payroll (loss / retained / days / yearly cost of risk) | none         | $77,411 / $5,000 / 178 / $4,910 |
| Priority stack rows                                                                   | 9            | 9                               |

Threat deck (card:priority:heat): added `scen-sc-payroll-ghost:78:87`, `spof-k7:76:85`; removed `ctrl-c-trust-rec:84:80`, `scen-sc-writeoff-abuse:64:61`.

Priority stack as printed (target — type — band, priority), rows that moved or changed:

- New row 5: One person adds people to payroll and runs it — Scenario — Fix soon, 78
- Three-way trust reconciliation: row 5 → 8; type "Control · Know-how only one person holds" → "Know-how only one person holds"; Fix soon, 84 → Fix soon, 76
- Engagement letter workflow: row 8 → 9
- Dropped: Client write-offs without partner approval — Scenario — Worth doing, 64

Warning signs printed on the report, for the scenarios at the top of the priority stack:

- Before: One person posts payments and reconciles the bank; One person sets up vendors and pays them; Client write-offs without partner approval
- After: One person posts payments and reconciles the bank; One person sets up vendors and pays them; One person adds people to payroll and runs it

## Restaurant (`restaurant`)

| Figure                                                                                | Before       | After                           |
| ------------------------------------------------------------------------------------- | ------------ | ------------------------------- |
| Average residual (residual index)                                                     | 65           | 67                              |
| Residual row, fake-employee payroll scenario (inherent / effectiveness / residual)    | none         | 87 / 0 / 87                     |
| Residual row, "Payroll approval" control (inherent / effectiveness / residual)        | 53 / 11 / 53 | 73 / 11 / 73                    |
| Printed residual bands (80 or more / fix soon / worth doing)                          | 4 / 10 / 6   | 5 / 11 / 5                      |
| Priority 88 or more ("Fix first")                                                     | 3            | 3                               |
| Tornado: cross-train every item one person holds lowers the average by                | 15           | 14                              |
| Tornado: dual release lowers the average by                                           | 5            | 6                               |
| Ranked scenario: fake-employee payroll (loss / retained / days / yearly cost of risk) | none         | $77,411 / $5,000 / 178 / $4,910 |
| Priority stack rows                                                                   | 8            | 9                               |

Threat deck (card:priority:heat): added `scen-sc-payroll-ghost:78:87`; none removed.

Priority stack as printed (target — type — band, priority), rows that moved or changed:

- Approve + post write-offs: type "Duty conflict · Scenario" → "Duty conflict"
- New row 5: One person adds people to payroll and runs it — Scenario — Fix soon, 78
- Tip pooling & cash-out: row 5 → 6
- Liquor inventory control: row 6 → 7
- Sales tax returns & remittance: row 7 → 8
- Food vendor ordering: row 8 → 9

Warning signs printed on the report, for the scenarios at the top of the priority stack:

- Before: One person posts payments and reconciles the bank; One person sets up vendors and pays them; Void/comp authority without owner review
- After: One person posts payments and reconciles the bank; One person sets up vendors and pays them; One person adds people to payroll and runs it

## Construction (`construction`)

| Figure                                                                                | Before       | After                           |
| ------------------------------------------------------------------------------------- | ------------ | ------------------------------- |
| Average residual (residual index)                                                     | 55           | 57                              |
| Residual row, fake-employee payroll scenario (inherent / effectiveness / residual)    | none         | 82 / 0 / 82                     |
| Residual row, "Payroll approval" control (inherent / effectiveness / residual)        | 53 / 13 / 46 | 73 / 13 / 63                    |
| Printed residual bands (80 or more / fix soon / worth doing)                          | 3 / 10 / 10  | 4 / 11 / 9                      |
| Priority 88 or more ("Fix first")                                                     | 4            | 4                               |
| Tornado: dual release lowers the average by                                           | 4            | 5                               |
| Tornado: split duties lowers the average by                                           | 3            | 4                               |
| Ranked scenario: fake-employee payroll (loss / retained / days / yearly cost of risk) | none         | $67,314 / $5,000 / 155 / $4,910 |
| Priority stack rows                                                                   | 8            | 9                               |

Threat deck (card:priority:heat): added `scen-sc-payroll-ghost:75:82`; none removed.

Priority stack as printed (target — type — band, priority), rows that moved or changed:

- Cash custody + bank reconciliation: type "Duty conflict · Control" → "Duty conflict"
- New row 8: One person adds people to payroll and runs it — Scenario — Fix soon, 75
- Equipment & small tool tracking: row 8 → 9

Warning signs printed on the report, for the scenarios at the top of the priority stack:

- Before: One person posts payments and reconciles the bank; One person sets up vendors and pays them
- After: One person posts payments and reconciles the bank; One person sets up vendors and pays them; One person adds people to payroll and runs it

## Automotive (`automotive`)

| Figure                                                                                | Before       | After                           |
| ------------------------------------------------------------------------------------- | ------------ | ------------------------------- |
| Average residual (residual index)                                                     | 56           | 57                              |
| Residual row, fake-employee payroll scenario (inherent / effectiveness / residual)    | none         | 82 / 0 / 82                     |
| Residual row, "Payroll approval" control (inherent / effectiveness / residual)        | 53 / 13 / 46 | 73 / 13 / 63                    |
| Printed residual bands (80 or more / fix soon / worth doing)                          | 4 / 11 / 9   | 5 / 12 / 8                      |
| Priority 88 or more ("Fix first")                                                     | 4            | 4                               |
| Ranked scenario: fake-employee payroll (loss / retained / days / yearly cost of risk) | none         | $67,314 / $5,000 / 155 / $4,910 |
| Priority stack rows                                                                   | 9            | 10                              |

Threat deck (card:priority:heat): added `scen-sc-payroll-ghost:75:82`; none removed.

Priority stack as printed (target — type — band, priority), rows that moved or changed:

- Create vendor + release payment: type "Duty conflict · Control · Scenario" → "Duty conflict · Scenario"
- New row 8: One person adds people to payroll and runs it — Scenario — Fix soon, 75
- Customer cash on repair orders kept and the entries edited: row 8 → 9
- Money wired out and the books balanced with journal entries: row 9 → 10

Warning signs printed on the report, for the scenarios at the top of the priority stack:

- Before: One person posts payments and reconciles the bank; One person sets up vendors and pays them; Customer cash on repair orders kept and the entries edited
- After: One person posts payments and reconciles the bank; One person sets up vendors and pays them; One person adds people to payroll and runs it

## Nonprofit (`nonprofit`)

| Figure                                                                                | Before       | After                           |
| ------------------------------------------------------------------------------------- | ------------ | ------------------------------- |
| Average residual (residual index)                                                     | 56           | 58                              |
| Residual row, fake-employee payroll scenario (inherent / effectiveness / residual)    | none         | 82 / 0 / 82                     |
| Residual row, "Payroll approval" control (inherent / effectiveness / residual)        | 53 / 12 / 47 | 73 / 12 / 64                    |
| Printed residual bands (80 or more / fix soon / worth doing)                          | 3 / 8 / 10   | 4 / 9 / 9                       |
| Priority 88 or more ("Fix first")                                                     | 4            | 4                               |
| Tornado: cross-train every item one person holds lowers the average by                | 8            | 9                               |
| Tornado: independent bank reconciliation lowers the average by                        | 4            | 5                               |
| Tornado: split duties lowers the average by                                           | 4            | 5                               |
| Ranked scenario: fake-employee payroll (loss / retained / days / yearly cost of risk) | none         | $67,314 / $5,000 / 155 / $4,910 |
| Priority stack rows                                                                   | 8            | 9                               |

Threat deck (card:priority:heat): added `scen-sc-payroll-ghost:75:82`; none removed.

Priority stack as printed (target — type — band, priority), rows that moved or changed:

- Cash custody + bank reconciliation: type "Duty conflict · Control · Scenario" → "Duty conflict · Scenario"
- New row 7: One person adds people to payroll and runs it — Scenario — Fix soon, 75
- Payroll & time allocation: row 7 → 8
- Program purchasing & participant assistance: row 8 → 9

Warning signs printed on the report: unchanged (Donation checks and event cash kept before anyone logs them; Finance manager posts, pays and reconciles alone; Invented vendor paid on invented invoices).

## General small business (`general`)

| Figure                                                                                | Before       | After                           |
| ------------------------------------------------------------------------------------- | ------------ | ------------------------------- |
| Average residual (residual index)                                                     | 61           | 64                              |
| Residual row, fake-employee payroll scenario (inherent / effectiveness / residual)    | none         | 87 / 0 / 87                     |
| Residual row, "Payroll approval" control (inherent / effectiveness / residual)        | 53 / 12 / 52 | 73 / 12 / 71                    |
| Printed residual bands (80 or more / fix soon / worth doing)                          | 4 / 5 / 7    | 5 / 6 / 6                       |
| Priority 88 or more ("Fix first")                                                     | 3            | 3                               |
| Tornado: dual release lowers the average by                                           | 5            | 6                               |
| Tornado: independent bank reconciliation lowers the average by                        | 4            | 5                               |
| Tornado: split duties lowers the average by                                           | 3            | 4                               |
| Ranked scenario: fake-employee payroll (loss / retained / days / yearly cost of risk) | none         | $77,411 / $5,000 / 178 / $4,910 |
| Priority stack rows                                                                   | 9            | 10                              |

Threat deck (card:priority:heat): added `scen-sc-payroll-ghost:78:87`; none removed.

Priority stack as printed (target — type — band, priority), rows that moved or changed:

- Approve + post write-offs: type "Duty conflict · Scenario" → "Duty conflict"
- New row 6: One person adds people to payroll and runs it — Scenario — Fix soon, 78
- Customer billing workflow: row 6 → 7
- Accounting system admin: row 7 → 8
- Vendor master & onboarding: row 8 → 9
- Sales pipeline & quoting: row 9 → 10

Warning signs printed on the report, for the scenarios at the top of the priority stack:

- Before: One person posts payments and reconciles the bank; One person sets up vendors and pays them; Write-offs posted without a second approval
- After: One person posts payments and reconciles the bank; One person sets up vendors and pays them; One person adds people to payroll and runs it
