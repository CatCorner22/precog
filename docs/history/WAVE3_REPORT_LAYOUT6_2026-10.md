# Wave 3: report layout 6, sample text before and after (October 2026)

Every printed figure and sentence that report layout 6 (wave 3, slice S6) moves on the 8 industry samples. "Before" is the report as layout 5 prints it (`main` at bd26e58); "after" is layout 6. Each sample appears twice: with its saved settings, and with dual release for payments turned on. Both are a report generated on 2026-10-07 from the same figures.

A version locked under layouts 1 to 5 with stored figures keeps printing what it printed then. A live report, and a locked one that recalculates, print layout 6.

No score, index or count moves. Layout 6 changes words, and the sentence that counts open duty conflicts now starts from the executive summary's count (`openConflictHeadline`).

What moves:

- **Header.** An own team is sized by its active people on the map ("12-person practice"), not by the size setup recorded, and an own team on the untouched starter map reads "starter process map (not yet edited)" instead of "sample process map". An own team with nobody active reads "<team> with nobody on the map yet". The samples keep their own size, so no sample's header moves.
- **Process map section, starter map only.** "Sample process map from the <industry> sample:" becomes "Starter process map from the <industry> template, not yet edited:". No sample prints it.
- **Residual tile.** "Fix first on the residual index" becomes "Severe on the residual index", and its hint "N fix soon · N worth doing" becomes "N high · N moderate" (owner decision OD-3). The figures are unchanged.
- **Segregation of duties sentence.** It opens with the open count the executive summary prints and lists critical, high, medium and related duties. It names the reduced-but-open pairs as part of that count, the owner's own pairs as left out of it, and the pairs dual release closes as left out of it. On every sample below the open count equals the sum of the old sentence's critical, high and medium counts; the new sentence states it and matches the summary's first sentence.
- **Phone (screen only, every layout).** Below the `sm` width the duty-conflict table shows as stacked rows; the table stays for wider screens and for print. The four continuity tables (leave, debriefs, leavers, cover) scroll inside their own box. Nothing printed changes.

An example own team, not a sample: Dana's 12-person dental office on the untouched starter map, which setup recorded as 3 people.

- Before: Dental office · 3-person practice · sample process map
- After: Dental office · 12-person practice · starter process map (not yet edited)

## Dental office (`dental`), default

- Header: Dental office · 6-person practice · industry template map (unchanged)
- Residual tile before: Fix first on the residual index | 4 | Residual 80 or more · 8 fix soon · 7 worth doing
- Residual tile after: Severe on the residual index | 4 | Residual 80 or more · 8 high · 7 moderate
- Segregation sentence before: 4 critical, 15 high, 1 medium open conflicts across 3 of 6 people. 0 covered by dual release at every amount.
- Segregation sentence after: 20 open duty conflicts: 4 critical, 15 high, 1 medium, 0 related duties, held by 3 of 6 people. 0 covered by dual release at every amount, not counted open.

## Dental office (`dental`), dual release on

- Header: Dental office · 6-person practice · industry template map (unchanged)
- Residual tile before: Fix first on the residual index | 0 | Residual 80 or more · 10 fix soon · 9 worth doing
- Residual tile after: Severe on the residual index | 0 | Residual 80 or more · 10 high · 9 moderate
- Segregation sentence before: 3 critical, 13 high, 1 medium open conflicts across 3 of 6 people. 3 covered by dual release at every amount. 4 more reduced by dual release but not closed, counted open above.
- Segregation sentence after: 17 open duty conflicts: 3 critical, 13 high, 1 medium, 0 related duties, held by 3 of 6 people. 4 of them are reduced by dual release but not closed. 3 covered by dual release at every amount, not counted open.

## Retail / e-commerce (`retail`), default

- Header: Retail / e-commerce · 6-person store · industry template map (unchanged)
- Residual tile before: Fix first on the residual index | 6 | Residual 80 or more · 6 fix soon · 5 worth doing
- Residual tile after: Severe on the residual index | 6 | Residual 80 or more · 6 high · 5 moderate
- Segregation sentence before: 6 critical, 10 high, 0 medium open conflicts across 3 of 6 people. 0 covered by dual release at every amount.
- Segregation sentence after: 16 open duty conflicts: 6 critical, 10 high, 0 medium, 0 related duties, held by 3 of 6 people. 0 covered by dual release at every amount, not counted open.

## Retail / e-commerce (`retail`), dual release on

- Header: Retail / e-commerce · 6-person store · industry template map (unchanged)
- Residual tile before: Fix first on the residual index | 0 | Residual 80 or more · 11 fix soon · 6 worth doing
- Residual tile after: Severe on the residual index | 0 | Residual 80 or more · 11 high · 6 moderate
- Segregation sentence before: 4 critical, 8 high, 0 medium open conflicts across 3 of 6 people. 4 covered by dual release at every amount. 2 more reduced by dual release but not closed, counted open above.
- Segregation sentence after: 12 open duty conflicts: 4 critical, 8 high, 0 medium, 0 related duties, held by 3 of 6 people. 2 of them are reduced by dual release but not closed. 4 covered by dual release at every amount, not counted open.

## Professional services (`professional_services`), default

- Header: Professional services · 6-person firm · industry template map (unchanged)
- Residual tile before: Fix first on the residual index | 7 | Residual 80 or more · 6 fix soon · 8 worth doing
- Residual tile after: Severe on the residual index | 7 | Residual 80 or more · 6 high · 8 moderate
- Segregation sentence before: 6 critical, 8 high, 0 medium open conflicts across 3 of 6 people. 0 covered by dual release at every amount.
- Segregation sentence after: 14 open duty conflicts: 6 critical, 8 high, 0 medium, 0 related duties, held by 3 of 6 people. 0 covered by dual release at every amount, not counted open.

## Professional services (`professional_services`), dual release on

- Header: Professional services · 6-person firm · industry template map (unchanged)
- Residual tile before: Fix first on the residual index | 2 | Residual 80 or more · 9 fix soon · 10 worth doing
- Residual tile after: Severe on the residual index | 2 | Residual 80 or more · 9 high · 10 moderate
- Segregation sentence before: 4 critical, 5 high, 0 medium open conflicts across 3 of 6 people. 5 covered by dual release at every amount. 2 more reduced by dual release but not closed, counted open above.
- Segregation sentence after: 9 open duty conflicts: 4 critical, 5 high, 0 medium, 0 related duties, held by 3 of 6 people. 2 of them are reduced by dual release but not closed. 5 covered by dual release at every amount, not counted open.

## Restaurant / hospitality (`restaurant`), default

- Header: Restaurant / hospitality · 6-person restaurant · industry template map (unchanged)
- Residual tile before: Fix first on the residual index | 4 | Residual 80 or more · 10 fix soon · 6 worth doing
- Residual tile after: Severe on the residual index | 4 | Residual 80 or more · 10 high · 6 moderate
- Segregation sentence before: 3 critical, 11 high, 0 medium open conflicts across 4 of 6 people. 0 covered by dual release at every amount.
- Segregation sentence after: 14 open duty conflicts: 3 critical, 11 high, 0 medium, 0 related duties, held by 4 of 6 people. 0 covered by dual release at every amount, not counted open.

## Restaurant / hospitality (`restaurant`), dual release on

- Header: Restaurant / hospitality · 6-person restaurant · industry template map (unchanged)
- Residual tile before: Fix first on the residual index | 0 | Residual 80 or more · 11 fix soon · 9 worth doing
- Residual tile after: Severe on the residual index | 0 | Residual 80 or more · 11 high · 9 moderate
- Segregation sentence before: 2 critical, 9 high, 0 medium open conflicts across 4 of 6 people. 3 covered by dual release at every amount. 1 more reduced by dual release but not closed, counted open above.
- Segregation sentence after: 11 open duty conflicts: 2 critical, 9 high, 0 medium, 0 related duties, held by 4 of 6 people. 1 of them is reduced by dual release but not closed. 3 covered by dual release at every amount, not counted open.

## Construction / trades (`construction`), default

- Header: Construction / trades · 8-person company · industry template map (unchanged)
- Residual tile before: Fix first on the residual index | 3 | Residual 80 or more · 10 fix soon · 10 worth doing
- Residual tile after: Severe on the residual index | 3 | Residual 80 or more · 10 high · 10 moderate
- Segregation sentence before: 5 critical, 5 high, 0 medium open conflicts across 3 of 8 people. 0 covered by dual release at every amount.
- Segregation sentence after: 10 open duty conflicts: 5 critical, 5 high, 0 medium, 0 related duties, held by 3 of 8 people. 0 covered by dual release at every amount, not counted open.

## Construction / trades (`construction`), dual release on

- Header: Construction / trades · 8-person company · industry template map (unchanged)
- Residual tile before: Fix first on the residual index | 0 | Residual 80 or more · 13 fix soon · 10 worth doing
- Residual tile after: Severe on the residual index | 0 | Residual 80 or more · 13 high · 10 moderate
- Segregation sentence before: 4 critical, 3 high, 0 medium open conflicts across 3 of 8 people. 3 covered by dual release at every amount.
- Segregation sentence after: 7 open duty conflicts: 4 critical, 3 high, 0 medium, 0 related duties, held by 3 of 8 people. 3 covered by dual release at every amount, not counted open.

## Auto dealership / repair shop (`automotive`), default

- Header: Auto dealership / repair shop · 9-person shop · industry template map (unchanged)
- Residual tile before: Fix first on the residual index | 4 | Residual 80 or more · 11 fix soon · 9 worth doing
- Residual tile after: Severe on the residual index | 4 | Residual 80 or more · 11 high · 9 moderate
- Segregation sentence before: 7 critical, 14 high, 1 medium open conflicts across 7 of 9 people. 0 covered by dual release at every amount.
- Segregation sentence after: 22 open duty conflicts: 7 critical, 14 high, 1 medium, 0 related duties, held by 7 of 9 people. 0 covered by dual release at every amount, not counted open.

## Auto dealership / repair shop (`automotive`), dual release on

- Header: Auto dealership / repair shop · 9-person shop · industry template map (unchanged)
- Residual tile before: Fix first on the residual index | 0 | Residual 80 or more · 15 fix soon · 8 worth doing
- Residual tile after: Severe on the residual index | 0 | Residual 80 or more · 15 high · 8 moderate
- Segregation sentence before: 6 critical, 12 high, 1 medium open conflicts across 7 of 9 people. 3 covered by dual release at every amount.
- Segregation sentence after: 19 open duty conflicts: 6 critical, 12 high, 1 medium, 0 related duties, held by 7 of 9 people. 3 covered by dual release at every amount, not counted open.

## Nonprofit organization (`nonprofit`), default

- Header: Nonprofit organization · 8-person organization · industry template map (unchanged)
- Residual tile before: Fix first on the residual index | 3 | Residual 80 or more · 8 fix soon · 10 worth doing
- Residual tile after: Severe on the residual index | 3 | Residual 80 or more · 8 high · 10 moderate
- Segregation sentence before: 8 critical, 11 high, 0 medium open conflicts across 4 of 8 people. 0 covered by dual release at every amount.
- Segregation sentence after: 19 open duty conflicts: 8 critical, 11 high, 0 medium, 0 related duties, held by 4 of 8 people. 0 covered by dual release at every amount, not counted open.

## Nonprofit organization (`nonprofit`), dual release on

- Header: Nonprofit organization · 8-person organization · industry template map (unchanged)
- Residual tile before: Fix first on the residual index | 0 | Residual 80 or more · 11 fix soon · 10 worth doing
- Residual tile after: Severe on the residual index | 0 | Residual 80 or more · 11 high · 10 moderate
- Segregation sentence before: 7 critical, 9 high, 0 medium open conflicts across 4 of 8 people. 3 covered by dual release at every amount. 2 more reduced by dual release but not closed, counted open above.
- Segregation sentence after: 16 open duty conflicts: 7 critical, 9 high, 0 medium, 0 related duties, held by 4 of 8 people. 2 of them are reduced by dual release but not closed. 3 covered by dual release at every amount, not counted open.

## General small business (`general`), default

- Header: General small business · 6-person business · industry template map (unchanged)
- Residual tile before: Fix first on the residual index | 4 | Residual 80 or more · 5 fix soon · 7 worth doing
- Residual tile after: Severe on the residual index | 4 | Residual 80 or more · 5 high · 7 moderate
- Segregation sentence before: 4 critical, 9 high, 0 medium open conflicts across 4 of 6 people. 0 covered by dual release at every amount.
- Segregation sentence after: 13 open duty conflicts: 4 critical, 9 high, 0 medium, 0 related duties, held by 4 of 6 people. 0 covered by dual release at every amount, not counted open.

## General small business (`general`), dual release on

- Header: General small business · 6-person business · industry template map (unchanged)
- Residual tile before: Fix first on the residual index | 0 | Residual 80 or more · 8 fix soon · 8 worth doing
- Residual tile after: Severe on the residual index | 0 | Residual 80 or more · 8 high · 8 moderate
- Segregation sentence before: 2 critical, 6 high, 0 medium open conflicts across 3 of 6 people. 5 covered by dual release at every amount. 2 more reduced by dual release but not closed, counted open above.
- Segregation sentence after: 8 open duty conflicts: 2 critical, 6 high, 0 medium, 0 related duties, held by 3 of 6 people. 2 of them are reduced by dual release but not closed. 5 covered by dual release at every amount, not counted open.
