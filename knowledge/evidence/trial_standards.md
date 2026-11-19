# U.S. trial design: standards, controls, and defensible judgments

## Contents

- 1. Judge a specified claim, not an entire paper by reputation
- 2. Keep law, guidance, and reporting standards separate
- 3. Require an explicit baseline/placebo/sham comparator audit
- 4. Translate the clinical question into an estimand
- 5. Design and analysis decisions that need explicit justification
- 6. Flaw → mechanism → consequence → repair
- 7. Minimum decision-ready output


Research checked: 2026-11-13. This module is an original appraisal framework informed by the primary sources below. Its four design labels are interpretive judgments, not FDA certifications or a validated numerical score. Refer to the companion source ledger for publication status, retrieved depth, and locators.

## 1. Judge a specified claim, not an entire paper by reputation

Write the claim first: **In which people, does which treatment strategy, compared with what, change which outcome, by when, under what handling of treatment changes?** Distinguish efficacy, effectiveness, comparative benefit, mechanism, feasibility, tolerability, and rare or delayed harms. A study can be appropriate for feasibility and inadequate for a causal efficacy claim. Funding, prestigious publication, a large sample, or randomization does not settle every domain.

Use these labels separately for comparator validity, allocation, measurement, analysis, precision, reporting, ethics, and applicability:

| Label | Operational meaning | Reporting requirement |
|---|---|---|
| Optimal for the question | The strongest feasible and ethical design for this question addresses its dominant threats and produces decision-relevant precision. | State the feasible alternatives and why this design answers the question better. “Optimal” is contextual, not perfection. |
| Acceptable with limitations | The design supports the specified, bounded inference; remaining weaknesses are explicit and unlikely to reverse that inference under plausible assumptions. | State limitations and the assumptions needed. Distinguish a defensible estimate from adequate precision for a decision. |
| Inadequate for the stated claim | A material flaw prevents identification, trustworthy estimation, or the claimed interpretation. | Name the unsupported claim and the narrower conclusion still justified. Do not call all collected observations worthless. |
| Unassessable from available information | Necessary methods or data are missing or inaccessible. | Request or retrieve the protocol, statistical analysis plan, supplements, registry history, or data. Do not silently convert “not reported” to “not done.” |

Do not average these labels into a numerical quality score. A fatal comparator problem cannot be compensated by excellent formatting. State result-level risk of bias separately from imprecision and generalizability. A study can be at low risk of bias but too imprecise to guide practice. [TS-E8; TS-ROB]

## 2. Keep law, guidance, and reporting standards separate

**21 CFR 314.126** addresses adequate and well-controlled studies for drug-effectiveness claims. It describes clear objectives, a valid control comparison, appropriate participant selection and assignment, bias reduction, reliable measurement, and adequate analysis. It recognizes placebo, dose-comparison, no-treatment, active-treatment, and historical controls, with conditions. Uncontrolled evidence is not an acceptable sole basis for approval of effectiveness claims under this provision, although it may contribute other information. Apply its scope accurately; it is not a universal legal checklist for every psychotherapy or behavioral experiment. [TS-CFR]

FDA guidance generally gives nonbinding recommendations unless it cites a binding legal requirement. Do not label departure from guidance “illegal.” ICH Step 4 publication and FDA adoption can occur on different dates. Record both where relevant. [TS-GUIDANCE]

| Document | FDA page status verified on research date | Principal use |
|---|---|---|
| E6(R3) | Final, September 2025 | Good clinical practice, quality by design, proportionate oversight, data reliability, participant protection |
| E6(R3), Annex 2 | FDA page lists draft, December 2024 | Additional considerations for decentralized/pragmatic elements and real-world data; do not describe this FDA draft as implemented final guidance |
| E8(R1) | Final, April 2022 | Fit-for-purpose clinical development and critical-to-quality factors |
| E9 | Final, September 1998 | Statistical design and analysis foundations |
| E9(R1) | Final, May 2021 | Estimands, intercurrent events, and sensitivity analysis |
| E10 | Final, May 2001 | What different controls can establish |
| Non-Inferiority Clinical Trials | Final, November 2016 | Assay sensitivity, historical evidence, margin justification |
| Adaptive Design Clinical Trials | Final, December 2019 | Prespecified adaptations, operating characteristics, simulation |
| Multiple Endpoints | Final, October 2022 | Multiplicity and endpoint hierarchy |
| Covariate Adjustment | Final, May 2023 | Prognostic baseline adjustment in randomized trials |
| Externally Controlled Trials | FDA page lists draft, February 2023 | External comparator construction and its biases |
| Enrichment Strategies | Final, March 2019 | Selected populations and limits on applicability |

Recheck status before consequential regulatory advice; this table is a dated snapshot. CONSORT 2025 concerns trial reporting and SPIRIT 2025 concerns protocols. Complete reporting makes appraisal possible; checklist compliance alone does not prove sound execution. [TS-CONSORT]

## 3. Require an explicit baseline/placebo/sham comparator audit

Always include a comparator table, even when no such arm exists. Record **available, absent, ethically inappropriate, or not applicable**, with reasons. Never invent a comparison or imply a missing arm was measured.

| Comparison | What it can answer | Main limitation |
|---|---|---|
| Each arm against its own baseline | How observed participants changed over time | Change can reflect natural history, regression to the mean, co-treatment, expectancy, or measurement; it is not by itself the causal treatment effect. |
| Concurrent randomized placebo | Incremental effect of assignment to the treatment package beyond its placebo comparator | Depends on credibility, masking, adherence, measurement, and what co-interventions are shared. |
| Concurrent randomized sham procedure | Effect beyond the procedure elements reproduced by sham | A sham may have biological activity, unequal burden, or recognizable differences; its design defines the contrast. |
| Active treatment or usual care | Comparative benefit against a relevant clinical option | Superiority, noninferiority, and equivalence require different hypotheses. “No difference” does not show effectiveness. |
| No treatment / waitlist | Effect of offering the package compared with that context | Attention, contact, and expectancy can differ; it does not isolate a specific ingredient. |
| External/historical comparator | A comparison when a concurrent arm is unavailable | Selection, time trends, measurement differences, and unmeasured confounding can dominate. |

The baseline and external-control cautions draw on FDA's Bayesian device guidance; the sham row reflects NIMH's discussion of sensory matching and biological activity. [TS-BAYES; TS-SHAM]

The control should fit the question and participant protections. Placebo or sham is not automatically optimal when withholding effective care is harmful. Consider add-on treatment with shared standard care, rescue treatment, active comparison, or other ethically justified designs. FDA's device-specific urinary-incontinence guidance illustrates why sham risks require particular justification; its disease-specific recommendations are not universal rules for all procedures. [TS-SHAMFDA]

Present all available arms, their baseline values, follow-up values, and between-arm contrasts. A statistically significant pre–post change in one arm and a nonsignificant change in another does **not** establish a significant treatment difference. Do not compare unrelated trial arms as if randomized head to head.

## 4. Translate the clinical question into an estimand

Specify treatment conditions, population, outcome variable, handling of intercurrent events, and population summary. Events such as rescue medication, discontinuation, switching, or death can change what the outcome means. Treatment discontinuation and missing outcome data are distinct. [TS-E9R1]

Possible strategies include treatment policy, a hypothetical scenario, a composite outcome, assessment while on treatment, or a principal stratum. The question determines the choice. For example, “effect of assignment including rescue treatment” differs from “effect if no rescue occurred.” Principal strata concern potential events under alternative assignments; selecting observed adherers is not equivalent.

Align data collection and estimation with this target. Sensitivity analyses probe assumptions for the **same estimand**; different questions are supplementary. “Intention-to-treat” does not repair missing outcomes. [TS-E9R1]

## 5. Design and analysis decisions that need explicit justification

**Allocation.** Verify chance-based sequence generation, concealment until irreversible enrollment, implementation, and who had sequence access. Alternation or date of birth is not random allocation. Concealment prevents selection before assignment; masking addresses influences afterward. Chance baseline imbalances can occur in valid randomization. Baseline balance does not prove concealment. [TS-E9; TS-ROB]

**Outcome validity.** Prefer prespecified outcomes meaningful to patients, measured reliably at relevant times. A surrogate may answer a biological question without establishing improved function, survival, or wellbeing. Describe scale range, direction, measurement reliability, and the basis of meaningful-change thresholds. A responder threshold loses information and needs a prespecified rationale. [TS-E8]

**Covariates and baseline.** Prespecified prognostic baseline adjustment can improve precision. FDA also regards unadjusted primary analyses as acceptable. Avoid choosing covariates because they make the result favorable or adjusting indiscriminately for variables changed by treatment. An adjusted conditional odds ratio can differ from a marginal effect without indicating confounding. Describe the effect actually estimated. [TS-COV]

**Multiplicity.** Inventory outcomes, doses, subgroups, time points, interim looks, and model choices. Prespecify the confirmatory family and an appropriate error-control strategy, such as gatekeeping or hierarchical testing. Exploratory findings can remain useful if labeled and not promoted to confirmatory proof. A failed primary endpoint cannot simply be replaced by a favorable secondary result. [TS-MULT]

**Noninferiority and equivalence.** Set the margin before examining comparative outcomes. Justify the active control's effect historically, whether it should persist in the present setting, and the clinically acceptable loss. A loose margin can admit a clinically inferior treatment. Show the interval against the margin, not just a p-value. Noninferiority excludes a prespecified degree of inferiority; equivalence requires excluding unacceptable differences in both directions. Failure to show superiority proves neither. [TS-NI]

**Assay sensitivity.** A trial must be capable of detecting a treatment difference if one exists. Poor adherence or treatment contamination may shrink differences and misleadingly favor noninferiority; added noise may instead widen intervals. The direction depends on the mechanism. A three-arm active-control/placebo/test-treatment study can help when ethical, but a failed active-control comparison requires careful interpretation. [TS-E10]

**Adaptive designs.** Adaptation is not inherently a flaw. Inspect prospective rules, interim access safeguards, stopping criteria, control of false-positive risk, effect-estimate bias, and interval coverage. Simulations should cover plausible nuisance parameters and null/alternative scenarios, report Monte Carlo precision, and preserve reproducibility. Unplanned choices driven by emerging favorable comparisons compromise inference. [TS-ADAPT]

**External controls.** Align eligibility, treatment initiation/time zero, outcome definitions, assessment schedules, calendar period, follow-up, and access to care. Matching and weighting address measured differences under assumptions; they cannot prove absence of unmeasured confounding. Distinguish poor overlap from a modeling inconvenience. Report the target population actually retained after exclusions or weighting. FDA's retrieved external-control document remains draft guidance. [TS-EXTERNAL]

**Enrichment.** Restricting enrollment to likely responders or high-risk patients can answer a useful targeted question and improve efficiency. It narrows applicability. Run-in exclusions may remove intolerant or nonadherent people. Preserve the selection process in every benefit and harm interpretation. [TS-ENRICH]

## 6. Flaw → mechanism → consequence → repair

These are causal appraisal prompts, not automatic verdicts. State evidence that the flaw occurred, its plausible impact, and what remains unknown.

| Flaw | Mechanism and likely direction | Consequence | Repair and residual limitation |
|---|---|---|---|
| Predictable allocation | Recruiters can steer enrollment; direction depends on whom they select | Groups differ before treatment | Concealed central assignment prospectively; adjustment afterward may leave unknown imbalance. [TS-ROB] |
| Treating pre–post improvement as efficacy | Disease fluctuation and regression to the mean accompany treatment; often exaggerates improvement if entry requires a symptom peak | Improvement is incorrectly attributed to treatment | Use concurrent randomization; retrospective baseline comparison cannot reconstruct the missing counterfactual. [TS-CFR] |
| Inadequate comparator activity or context matching | Treatment and comparator differ in more than the intended ingredient; direction is context-dependent | Narrow mechanistic claims exceed the contrast | Describe the total-package effect; redesign controls to isolate the requested component. [TS-E10] |
| Arbitrary exclusion of nonadherers | Post-randomization selection can correlate with prognosis and tolerability; either direction | Randomized groups are no longer preserved | Align analysis to estimand, retain follow-up, and use justified causal methods/sensitivity analyses. [TS-E9R1] |
| Outcome or analysis selected after seeing results | Favorable chance results are preferentially retained; commonly exaggerates apparent benefit | Nominal uncertainty and confirmation claims mislead | Compare dated protocol/SAP with report; label exploratory; independent replication. [TS-MULT] |
| Small sample interpreted as proof of no effect | Wide uncertainty includes important effects | A null result is overstated | Report interval and compatible meaningful effects; improve planned precision. [TS-E9] |
| Broad noninferiority margin or weak control effect | Unacceptable efficacy loss can pass, or both treatments may be ineffective | “As good as” becomes unsupported | Justify margin and assay sensitivity; investigate both full-analysis and per-protocol perspectives. [TS-NI] |
| Unplanned favorable interim stopping | Selection on random highs can exaggerate estimates and inflate errors | Effect magnitude and significance are unreliable | Prespecify boundaries and adjusted inference; disclose deviations. [TS-ADAPT] |
| Many noisy exploratory subgroup claims | Repeated searches find chance patterns | Unsupported personalized-treatment recommendations | Prespecify credible modifiers, test interactions, adjust appropriately, and replicate. [TS-MULT] |
| External controls from a different care era | Diagnostic and treatment changes alter prognosis; either direction | Apparent treatment effect includes era effects | Concurrent comparable data and explicit sensitivity analyses; residual confounding may remain. [TS-EXTERNAL] |
| Overly selected responder/tolerator population | Study omits people likely to benefit less or experience harms | Results overgeneralized to routine patients | Report selection and analyze the intended use population; new evidence may be needed. [TS-ENRICH] |
| Poor reporting treated as proven misconduct | Lack of accessible detail is mistaken for demonstrated behavior | Appraisal becomes unjustifiably accusatory | Classify unassessable, retrieve records, separate error from intent. [TS-CONSORT] |

## 7. Minimum decision-ready output

Return the exact claim, design and control map, domain judgments with supporting observations, absolute and relative estimates with uncertainty, and an explicit list of unanswered questions. For each major defect, explain why it matters, likely direction if defensible, whether its magnitude can be bounded, and the strongest conclusion still justified. Separate the published result, your recomputation, and a hypothetical sensitivity scenario. Report ethics and compliance concerns separately from what the data can statistically establish. Never assert regulatory approval, legal noncompliance, clinical safety, or deception merely from a design label.

### Source key

- TS-CFR: [21 CFR 314.126](https://www.ecfr.gov/current/title-21/chapter-I/subchapter-D/part-314/subpart-D/section-314.126).
- TS-GUIDANCE: [FDA Clinical Trials Guidance Documents](https://www.fda.gov/science-research/clinical-trials-and-human-subject-protection/clinical-trials-guidance-documents).
- TS-E6: [FDA E6(R3)](https://www.fda.gov/regulatory-information/search-fda-guidance-documents/e6r3-good-clinical-practice-gcp).
- TS-E6A2: [FDA E6(R3), Annex 2](https://www.fda.gov/regulatory-information/search-fda-guidance-documents/e6r3-good-clinical-practice-annex-2).
- TS-E8: [FDA E8(R1)](https://www.fda.gov/media/157560/download).
- TS-E9: [FDA/HHS E9](https://www.hhs.gov/guidance/sites/default/files/hhs-guidance-documents/FDA/E9-Statistical-Principles-for-Clinical-Trials.pdf).
- TS-E9R1: [FDA E9(R1)](https://www.fda.gov/media/148473/download).
- TS-E10: [FDA E10](https://www.fda.gov/media/71349/download).
- TS-NI: [FDA Non-Inferiority Clinical Trials to Establish Effectiveness](https://www.fda.gov/media/78504/download).
- TS-ADAPT: [FDA Adaptive Designs](https://www.fda.gov/media/78495/download).
- TS-MULT: [FDA Multiple Endpoints](https://www.fda.gov/regulatory-information/search-fda-guidance-documents/multiple-endpoints-clinical-trials).
- TS-COV: [FDA Covariate Adjustment](https://www.fda.gov/media/148910/download).
- TS-EXTERNAL: [FDA External Controls draft](https://www.fda.gov/media/164960/download).
- TS-ENRICH: [FDA Enrichment Strategies](https://www.fda.gov/media/121320/download).
- TS-ROB: [Cochrane Handbook, Chapter 8](https://www.cochrane.org/authors/handbooks-and-manuals/handbook/current/chapter-08).
- TS-CONSORT: [CONSORT–SPIRIT 2025 published statements](https://www.consort-spirit.org/published-statements).
- TS-BAYES: [FDA Bayesian Statistics in Device Trials](https://www.fda.gov/regulatory-information/search-fda-guidance-documents/guidance-use-bayesian-statistics-medical-device-clinical-trials), section 4.4.
- TS-SHAM: [NIMH Placebo Workshop meeting summary](https://www.nimh.nih.gov/news/events/2024/meeting-summary-placebo-workshop-translational-research-domains-and-key-questions), sham-device sections. Expert discussion, not binding guidance.
- TS-SHAMFDA: [FDA Urinary Incontinence Device Investigations](https://www.fda.gov/regulatory-information/search-fda-guidance-documents/clinical-investigations-devices-indicated-treatment-urinary-incontinence-guidance-industry-and-fda), control considerations; disease-specific illustration.
