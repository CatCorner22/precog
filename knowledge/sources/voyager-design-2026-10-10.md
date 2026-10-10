# Voyager design (final, 2026-10-10)

- **Source**: Claude Code session 79f4ec77 (session_01Rfson9Y63BcB71DDXYNrVb), working file `scratchpad/voyager/VOYAGER-DESIGN.md` (about 14,000 words), the final version of a draft after two skeptic critiques (a risk partner and counsel; an engineer), plus a code review, a Hugging Face shortlist and the golden dataset absorbed in section 12. The working files are not kept; this entry is the record.
- **Type**: other (design document)
- **Author/Origin**: Claude Code, reading `main` at `5dfcc2f`, `origin/main` at `598ff91`, and the content branch at `f567174`; figures marked measured come from two read-only solver probes on the samples
- **Published**: 2026-10-10
- **Ingested**: 2026-10-10
- **Tags**: precog, voyager, procedures, validation-design, code-review, process

## Summary

Voyager is the planned successor to Precog's coach (Pioneer, renamed in commit `589c201`). Given who holds which money duties, it works out the fewest duty changes that bring open duty conflicts down to a target the owner has chosen and recorded; when nothing within the owner's limits reaches the target, it finds the changes that lower conflicts most and names each remaining conflict. Every count it prints is Precog's existing conflict engine run again, so a CPA can recount it by hand. The plan, the verdict and the procedures come from rules; every plan is stored in a hash-chained trail a reviewer can replay. A language model only ranks rule-written sentences and routes typed questions, and can change no figure, move or verdict. Voyager never says risk is "tolerable"; it reports the distance to the owner's recorded target. The build is 78 working days with slice 0b, of which slices 0 to 4 (about 50 days) are a shippable Voyager.

## Key concepts

### Deterministic, probabilistic, model-assisted

- **Deterministic (version 1)**: the input builder (today's date is an explicit input), the solver, the tolerance judge, the procedure composer, the verifier (V1 rules, V2 feasibility, V3 figures, V4 selection, V6 wording) and the trail. They run with no model call and no key, in the browser by default.
- **Solver**: one lexicographic comparator in `sod/objective.ts`, shared with `chooseDutySplit` so the report's first step and Voyager's first move are the same move: open critical, open high, open medium, segregation pressure, number of moves, effort units (duty move 2, channel move 3, new person 5, a published assumption), stand-in cover, fixed tie-break. Iterative deepening with per-key admissible bounds and a node budget (50,000 in the browser); promise: exhaustive to depth 4 on teams of up to 12. The per-move invariant "closes at least one, opens none" lost nothing at depth 2 on four samples (measured) and prunes 35 to 60 percent of moves.
- **Model-assisted (two jobs only)**: Rank (pick 0 to 3 known ids among up to six rule-written statements) and Intent (one id from a closed list of 11, only when rules return unknown). `grok-4.5`, temperature 0, JSON mode, through `callModel` and the daily budget. The model never proposes or ranks a move, writes a figure, name or procedure step, judges a target, or has its prose stored. Two tests enforce this: `boundaries.test.ts` (import graph) and `forbidden.test.ts`.
- **Probabilistic (specified, gated)**: an expected-loss reader behind `VOYAGER_EXPECTED_LOSS`, off with no screen; a compound frequency-and-severity Monte Carlo model reserved for version 3 behind four gates: a page-cited small-firm fraud base rate (none reachable), 12 months of structured monthly-check outcomes (needs `exceptionKind` and `amountUsd`), a named CPA's soundness review with shadow mode, and an approved Terms sentence.

### Targets and the verdict

- **T1**: zero open critical findings. **T2**: T1, and every open high is closed by dual release at every amount (with its procedure and a monthly check) or carries a dated acceptance with a note and a new `reviewerName`. **T3, "written and proven"**: T2, band at least "adequate", two holders on every critical register item, and a verified procedure with a fresh unaided proof on every touched control. **Custom**: pinned duties, constraints and a ceiling on accepted findings.
- The target is a dated `set_target` decision set only by the owner (a firm may record it on instruction; a preparer never), offered but never pre-selected, stale after 365 days.
- A verdict always prints how many findings were closed by moves, closed by dual release, and accepted; "reached with K findings accepted, not closed". Channel moves never go below template thresholds unless the owner types the figure, and count only with the procedure adopted and a monthly check.
- Dental worked example (measured): today 4 critical, 15 high, 1 medium, pressure 161.76; four duty moves reach 0 critical and 10 high; T1 reached at 4 moves, T2 not reached.

### Build slices

| Slice | What                                                                                                                | Days          |
| ----- | ------------------------------------------------------------------------------------------------------------------- | ------------- |
| 0     | Web Worker spike and solver benchmark at 12, 20 and 30 people                                                       | 2             |
| 0b    | Correctness fixes: 15 code-review findings in four pull requests                                                    | 8             |
| 1     | One comparator, constraints, moves, search, frontier; `chooseDutySplit` rewritten to it                             | 13            |
| 2     | Target menu, `set_target`, verdict with counts, blockers, remainder, second reading                                 | 10            |
| 3     | Verifier V1 to V4 and V6, typed `Figure`, boundaries and forbidden tests                                            | 7             |
| 4     | Trail: migration `0058_voyager_trail.sql`, stored inputs, advisory lock and `seq`, chain check, replay              | 10            |
| 5     | Procedure composer, fit questions, consistency checks, proof fields                                                 | 10            |
| 6     | Intent routing (rules plus model); grounding gate built and not called; grows to 7 days with the in-process encoder | 4             |
| 7     | Plan screen, audit page, report layout 9, decision-journal link                                                     | 8             |
| 8     | Expected-loss reader behind its flag, wording gate, scheduled golden run, docs, Terms sentence                      | 6             |
| R     | Rulebook 1.7: the two proposed rules, landing whenever a CPA signs                                                  | not scheduled |

Total 70 days before slice 0b, 78 with it (16 to 20 weeks with contingency); slices 0 to 4 about 50 days, about 10 weeks.

### Evaluation metrics ("working" versus "amazing")

- Plan optimality: equals brute force at depth 2 or less on eight samples; amazing adds no better non-monotone plan at depth 3.
- Target reach: T1 reached on every sample where the oracle `src/test/change-impact.ts` finds a path.
- Time to plan: p95 at depth 4, 12 people, under 10 s; amazing under 2 s.
- Hand-recount: a reader recomputes three plans from the printed duty lists.
- Determinism: byte-identical hashed `VoyagerRun` across machines and shuffled input; replay matches.
- Intent routing on the 48-question intent set: rules at least 70 percent; rules plus model at least 90 percent, live within 5 points of fixtures. The set is author-labelled until a CPA is named; the live run never gates a merge.
- Honesty: share of "reached" verdicts with accepted findings, and of channel moves marked "operation not tested", printed monthly.
- Procedures, a persona round 4 (under 3 minutes to a first understood plan), and a named CPA marking each sentence defensible.

### Costs

- Build: 78 working days; CPA time outside the estimate.
- Run (estimate; xAI's page could not be opened, grok-4.5's price was not found, so Grok 4.7's third-party $2 and $6 per million tokens stands in): under $5 a month at 10 businesses, under $25 at 100, under $250 at 1,000. The daily ceilings (1,500 global, 500 free pool) hold at 1,000 businesses. Suggested operator cap $50 a month with an alert at $25. Section 12.2 corrects the encoder column: the free Hugging Face tier gives $0.10 a month then refuses; $0 after the encoder moves in-process.

### The 18 owner decisions, with defaults

1. One comparator: rewrite `chooseDutySplit` to Voyager's order in slice 1, changing the first move on some samples on purpose, every pin updated.
2. The objective order, with effort units as a published assumption: yes.
3. Target menu T1, T2, T3, Custom, nothing pre-recorded, acceptance count always printed: yes.
4. Default constraints (current money-duty holders eligible; two new duties per person, one for the owner; no hiring; channel floors at template thresholds): yes.
5. No model drafting of procedure steps in version 1: yes.
6. Name the CPA who labels the intent set and reads three plans: before slice 6.
7. Expected-loss reader behind a flag, no screen; no model-written plan prose: yes.
8. Terms sentence ("a Voyager verdict is the distance ... not an opinion on your controls"): approve.
9. Proven procedures earn no score credit in version 1: yes.
10. The owner sets a target; a firm reviewer may record it on instruction; a preparer never.
11. Server deep runs for signed-in callers only, under 10 seconds: yes.
12. Commit to slices 0 to 4 now; re-estimate after the benchmark: yes.
13. Slice 0b before slice 1 (about 8 days, four pull requests): yes.
14. Approve `rule-payroll-master-approve` (change employee records + approve payroll), high, for the named CPA to sign; until then the two golden checks stay known gaps.
15. Approve `rule-approve-pay` (approve bills + release payments), high, CPA may raise it to critical; same handling.
16. Bring the sentence encoder in-process (`BAAI/bge-small-en-v1.5`, MIT) in slice 6, retire the hosted chat ranker, and change the Privacy sentence so no text leaves Precog for Hugging Face.
17. Defer the three Hugging Face classifiers until notes go to a model.
18. The 24-team engine set is a merge gate; a gap closes only by removing its entry, never by weakening the expectation.

### Section 12: three inputs absorbed

- **Code review (21 findings in `llm/`, `coach/`, `procedures/` at `5dfcc2f`)**: 15 land in slice 0b (for example: move cards drop `evidenceIds`; unbounded `staff` reaches scoring; the Controls lens prints a second conflict total; the absence answer matches "Will" in "Will the deposit…"; the TOKEN mask eats UUIDs; "Unproven" counts from `createdAt`; `hfMayRank` meters as free and address null; `runPioneerRules` skips the heavy gate; dead `runPioneerCoach`; verifications stored without an account id; an unfenced Hugging Face prompt; rate-limit and upload-allowance ordering; serial awaits; three cleanups). Findings 4, 5 and 18 are absorbed by slices 2 and 3; finding 16 (repeated analysis in the brief) stays as a follow-up.
- **Hugging Face shortlist (six items)**: adopt the in-process encoder (server only, about 34 MB q8 or 133 MB fp32 inside Vercel's 250 MB limit; no model ships in the client bundle, which is 909 KB on the content branch); defer the entailment critic and the prompt-injection classifier until notes go to a model; defer a SetFit intent head until agreement is under 90 percent or the CPA set holds about ten questions per intent; reject the GLiNER secret finder for version 1 (349 MB); adopt the $0.10 free-tier correction.
- **Golden engine set (24 teams, three per industry)**: 111 checks pass and 6 are todo (known gaps), 18 of 24 cases pass every check. Three engine causes: (a) `chooseDutySplit` counts conflicts before severity, failing two first-step checks, which slice 1's shared comparator resolves; (b) master-data duties are excluded from the family matrix, so "change employee records + approve payroll" never fires; (c) no rule pairs approving bills with releasing payments. The family catch-all cannot reach (b) or (c) on teams of three or fewer or where the duty is already in a named finding, so only a named rule fixes them, and new rules wait for a CPA's sign-off (`docs/SCORING_1.6.md:108`).
- **The two proposed rules**: `rule-payroll-master-approve` (`edit_payroll_master` + `approve_payroll`, high, linked to `c-payroll`, procedure `lib-payroll`) and `rule-approve-pay` (`approve_invoices` + `release_payment`, high, linked to `c-sod-ap`, procedure `lib-release-payments`, added to the ACH and check channels' `mitigatesRuleIds`). Each lands in one commit as slice R with every moved pin named and `RULEBOOK_VERSION` bumped. Todo count: 6 today, 4 after slice 1, 2 after rule (b), 0 after rule (c).

## Notable quotes and data

> "Voyager never says a business's risk is 'tolerable'; it reports the distance between the business today and the target the owner wrote down." — Section 1

- Solver probe on the dental sample: 38 legal single moves; depth 3 in 6.0 s over 4,360 states; unconstrained depth 4 in 83.9 s over 48,488 states; 0.2 to 0.4 ms a node.
- The rulebook holds 39 rules: 13 critical, 25 high, 1 medium.
- A health range was dropped: recomputing the index at pressure ±20% gives 34 and 17, not the draft's "21 to 27".

## Relationships

- Agrees with: [Commercial viability report (2026-10-10)](precog-commercial-viability-2026-10-10.md), section 7, on what Voyager is, that it is not a pilot blocker, and decision 16 as A16's default.
- Contradicts: that report on timing. Decision 12 here commits to slices 0 to 4 now; the viability report freezes Voyager until the first paid letter (A22) and starts it after the cohort decision or at 3 paying firms (its decision 22), with A12's 1.5-day fix covering the visible defect meanwhile.
- Agrees with: [Intuitiveness evaluation (October 2026)](precog-intuitiveness-evaluation-2026-10.md), which asked for one count and one first step (SC2a, SC3); the shared comparator in slice 1 is the lasting fix for the first step.
- Agrees with: [Validation audit of how wave 2 was verified](precog-validation-audit-wave-2.md) on the cost of one model family: here a named CPA labels the intent set and reads three plans, and the live golden run never gates a merge.
- Agrees with: [Content research notes (2026-10-10)](content-research-2026-10-10.md), whose canon backs the golden dataset's expectations and the two proposed rules.
