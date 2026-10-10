# Golden evaluation dataset

`cases.ts` holds 24 fixed team configurations, three for each of the eight
lines of business, with the outcomes a CPA agrees with: which duty pairs are
open, which are not (the owner's own pairs, pairs nobody holds), which pair
the first step answers, which written procedures the Procedures tab ranks
as fitting, and what the local brief's lead move says. `golden.test.ts`
runs every case through the real engine (the setup grid, the detector, the
first-step ranking, the procedure ranking and the local brief, which runs
`runLocalAgentLoop`) and asserts every expectation.

The dataset is data only and test-only: no screen or engine module imports
`cases.ts`, so it never reaches the client bundle. Keep it that way.

## Adding a case

1. Start from published control guidance and prosecuted cases (for example
   the GAO Green Book, the Washington State Auditor's segregation-of-duties
   guide, the ADA, U.S. Attorney's Office releases), not from what the
   engine prints. Each case's `basis` summarises those sources and names
   the bodies; the research notes the lines condense live outside the
   repository. Write the team as rows of the setup grid (`name`, `role`,
   `duties`), with a realistic small-team shape.
2. Name the duty pairs at issue and the guidance or cases behind them in `basis`.
3. Expect sets and orderings that follow from rule severity: `expectOpenRuleIds`,
   `expectClosedRuleIds`, `expectOpenPairs` for a pair the guidance names
   that has no rule id yet, `expectFirstStepRuleId` or `expectFirstStepDutyId`
   only where the guidance makes the priority clear, `expectRecommendedProcedureIds`
   from `RULE_PROCEDURE`, and `expectActionPattern` for the brief. Never a
   numeric score or index.
4. Run `npx vitest run src/lib/precog/golden`. Where the engine disagrees with
   a CPA-defensible expectation, keep the expectation and add `knownGap` with
   the check it fails and what the engine does today; the test reports that
   check as a todo and still runs the case's other checks.
5. Keep every string free of "should" and "e.g." (AGENTS.project.md).

## Changing the engine

An engine change that flips an expectation here (opens a pair that was
closed, moves a first step, changes which procedure fits, rewrites a brief
line, or closes a known gap) updates this dataset in the same commit, and
the commit message says which cases moved and why (AGENTS.project.md,
"Scores and figures"). Closing a known gap means removing its `knownGap`
entry so the check runs again, not weakening the expectation.
