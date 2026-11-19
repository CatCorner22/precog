# Benchmark study survey

Initial purposive selection, reviewed November 13, 2026. Seven primary benchmarks plus citation-source study records. These are exemplars of specific strengths, not an exhaustive ranking. Grades are provisional and claim-specific.

# Medical benchmark seed review

Reviewed 2026-11-13. The accompanying JSON is the importable record, including seven study/source records, four directed citation edges, nine sources, numeric inputs, calculations, grading rationales, and outstanding checks. This is a purposive teaching survey, not an exhaustive ranking or a current treatment guideline.

| Benchmark | Dimension worth emulating | Provisional design / results / conclusion |
|---|---|---|
| DPP 2002 | Compare multiple plausible intervention strategies concurrently; display benefits with a time horizon. | B / B / B |
| ALLHAT 2002 | Ask a meaningful active-treatment question with clinical endpoints. | A / B / B |
| WHI estrogen–progestin 2002 | Measure clinical benefits and harms instead of inferring net benefit from biomarkers. | A / B / B |

These grades are reviewer judgments under the project rubric, not published validated scale scores. An A for a reported design feature does not certify trial execution. A paper can be excellent for one question and insufficient for another. Missing access is recorded separately from demonstrated bad design.

The arithmetic checks intentionally preserve distinct quantities: differences in estimated cumulative risks, rates per person-time, and hazard ratios. The JSON identifies the original inputs and labels every recomputation. It does not manufacture confidence intervals from aggregate survival percentages or treat a hazard ratio as a fixed-horizon risk ratio. No participant data were available for independent survival, missingness, or adherence model fitting.

The verified two-level source chain is WHI → HERS → PEPI. It illustrates why reviewing a citation's actual population and endpoint matters: a secondary-prevention result does not answer every primary-prevention question, and a favorable HDL effect is not itself clinical benefit. ALLHAT → its original design publication is also verified. DPP → the Finnish prevention study is retained as a partially verified edge because the citing text and original target abstract were available, but the precise bibliography entry was not directly recovered. PEPI's listed erratum remains pending. ALLHAT's 2003 correction was opened and linked to its record.

Access depth is deliberately explicit. ALLHAT and WHI relevant full-text sections were read; DPP access comprised initial PMC content, its original abstract, and publisher-indexed results. Linked sources checked only for a narrow citation claim retain U grades until complete appraisal. Protocols, statistical analysis plans, registry identifiers, and comprehensive current correction/retraction checks remain outstanding.

Original reports:

- [DPP](https://www.nejm.org/doi/full/10.1056/NEJMoa012512)
- [ALLHAT](https://jamanetwork.com/journals/jama/fullarticle/195626) and [correction](https://jamanetwork.com/journals/jama/fullarticle/195720)
- [WHI](https://jamanetwork.com/journals/jama/fullarticle/195120)
- [HERS](https://jamanetwork.com/journals/jama/fullarticle/187879)
- [PEPI abstract and metadata](https://pubmed.ncbi.nlm.nih.gov/7807658/)
- [ALLHAT design abstract](https://pubmed.ncbi.nlm.nih.gov/8722437/)
- [Finnish prevention study abstract](https://pubmed.ncbi.nlm.nih.gov/11333990/)

Persistence handoff: these are seed artifacts awaiting import into the parent's durable database. The JSON records this distinction so writing a local file cannot be misrepresented as a successful permanent database transaction.


# Psychiatric and psychological benchmark research

Reviewed 2026-11-13. The accompanying `benchmarks_psych.json` contains nine study records, nine original-source records, and five verified citation edges. Four major trials are selected as methodological exemplars; five cited originals document backward citation review. This is a purposive teaching survey, not an exhaustive systematic ranking of all American research. The selection identifies useful design dimensions rather than awarding blanket “gold standard” status.

| Benchmark | Design dimension worth learning | Design | Results | Conclusion |
|---|---|---|---|---|
| CATIE | Clinically meaningful comparative effectiveness and explicit benefit–harm tradeoffs | B | B | B |
| TADS | Medication and psychotherapy comparisons with a placebo anchor | B | B | C for overextended claims; B for bounded acute efficacy |
| COMBINE | Factorial intervention combinations and interpretation of interactions | B | B | B |
| MTA | Sustained, multimodal strategy comparisons | B | B | B |

These are provisional analyst grades, not official ratings or completed RoB 2 judgments. B identifies useful evidence with limitations; it does not mean an ineffective intervention or unimportant research. A/B/C/D/U respectively mean strong, adequate with limitations, substantial limitations, inadequate for the specific claim, and insufficient inspected evidence. The evidence supporting each rationale is located in the structured record. The design grade must follow the causal question, comparator and outcome; a design can answer a package-effectiveness question while leaving a component-mechanism question unresolved.

Full original methods/results were inspected for the four benchmarks and O’Malley 2003. Four other cited originals were inspected at abstract depth. Their U grades expressly prevent upgrading abstract access into a claimed full-paper audit. The main MTA trial includes a Canadian site; Gillberg is Swedish background evidence. Neither is mislabeled exclusively American.

The verified graph is CATIE → Kane 1988; TADS → Emslie 1997; MTA → Gillberg 1997; and COMBINE → O’Malley 2003 → Volpicelli 1992. Each edge records an actual numbered reference, the claim context, review depth and whether support is narrower than the citing claim. The last path demonstrates two citation levels. It is a starting graph, not a claim that every reference was reviewed.

The quantitative checks deliberately preserve the kind of measurement. Adjusted response probabilities are not integer event counts. A mean percentage of abstinent days is not a person's probability of abstinence. Hazard reductions cannot be relabeled risk reductions. Unadjusted endpoint intervals are not substitutes for adjusted longitudinal models. Changing baseline/end sample sizes preclude treating summary differences as paired individual changes. Small subgroup contrasts need intervals and interaction tests, not a comparison of whether two P values cross .05.

Numerical checks use direct arithmetic; independent binary risk-difference intervals use Newcombe-Wilson, risk-ratio intervals use log-Wald, and the illustrative independent continuous comparison uses Welch-Satterthwaite. These computations were executed against the shared statistics implementation. None resolves missingness, treatment expectancy, incomplete masking, post-randomization selection, or selective reporting. When the inspected source lacks sufficient inputs, the record identifies the unavailable analysis instead of supplying fabricated estimates.

The next audit should compare protocols, analysis plans, registrations and amendments; check corrections/retractions and follow-up publications; obtain the four abstract-only originals; and inspect table images wherever extracted cells look inconsistent. Main benchmark grades remain provisional until that work is complete. The JSON includes explicit coverage flags and a follow-up queue so the database can resume rather than silently treating these tasks as finished.

Original-source URLs and section/table/reference locators are stored once in the JSON `sources` array. Sources should be reopened when a new clinical question changes the required outcome, time horizon or causal claim.


