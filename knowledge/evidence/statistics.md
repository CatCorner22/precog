# Statistical analysis and interpretation

## Contents

- 1. Define the question before selecting an analysis
- 2. Minimum quantitative evidence record
- 3. Binary outcomes: absolute and relative effects together
- 4. Rates, survival, and hazards
- 5. Continuous outcomes, averages, and baseline adjustment
- 6. Correlated and nonstandard designs
- 7. Missingness, intercurrent events, and sensitivity
- 8. Multiplicity, selective analysis, and subgroup claims
- 9. Uncertainty, power, and clinical importance
- 10. Bayesian and adaptive analysis
- 11. Evidence synthesis
- 12. Software capability boundary
- 13. Required analysis output


Evidence checked: 13 November 2026. This module contains methodological guidance, original mathematical examples, and an analysis workflow. Source IDs resolve in the source register. Guidance status matters: a draft is not a final FDA recommendation, and guidance is not itself a statute. Recheck status before regulatory reliance.

## 1. Define the question before selecting an analysis

Write a one-sentence target: **For which patients, which treatment versus which comparator, which outcome, at what time, and under what handling of treatment discontinuation, rescue treatment, switching, and death?** Record the analysis population and population summary. An estimand is the treatment effect being sought; the estimator is the method; the estimate is its numerical result. These are distinct. Sensitivity analyses examine assumptions while targeting the same estimand; analyses answering a different question are supplementary. [ST01, E9(R1) A.2–A.5]

For every outcome, keep a comparator matrix containing baseline, sham, placebo, active comparator, and usual care where relevant. Mark each **observed, unavailable, inapplicable, or ethically infeasible**, with reasons. Baseline describes change within a person or group. It does not, by itself, identify the counterfactual outcome without treatment.

Use this order, even when the request says “always run sophisticated analysis”:

1. Identify data level, design, estimand, and independent unit.
2. Audit extraction and denominators; reproduce reported arithmetic.
3. Estimate supported absolute and relative contrasts and uncertainty.
4. Examine bias, clinical meaning, and realistic sensitivity scenarios.
5. Fit more complex models only when identifiable data and assumptions support them.
6. State unavailable analyses and the exact additional inputs needed.

A sophisticated analysis may conclude that a causal effect is unidentified. Do not produce elaborate numerical output to disguise missing information.

## 2. Minimum quantitative evidence record

For each endpoint record its definition and direction of benefit; prespecified hierarchy; assessment time; treatment and control events and denominators; exclusions; missing observations; follow-up; scale range; source table/page; reported model; adjusted versus raw estimate; standard error or interval; and whether values are observed, reconstructed, imputed, or simulated. Preserve integer counts. Never back-calculate a unique count from a rounded percentage when several counts fit.

Reconcile randomized, treated, safety, intention-to-treat, modified intention-to-treat, per-protocol, and completer populations. “Intention-to-treat” is not a missing-data method. Report exclusions by arm and reason. Avoid mixing the primary efficacy denominator with a smaller safety denominator without explanation.

## 3. Binary outcomes: absolute and relative effects together

Let treatment have `a` events among `nT`, and control `c` among `nC`. At the same follow-up time:

| Quantity | Formula | Interpretation and restrictions |
| --- | --- | --- |
| Risks | `pT=a/nT`; `pC=c/nC` | Event probabilities over a specified period, if follow-up supports these denominators. |
| Risk difference | `RD=pT−pC` | Signed difference; multiply by 100 for percentage points or 1,000 for events per 1,000. |
| Risk ratio | `RR=pT/pC` | Relative risk against the named reference arm; undefined if `pC=0`. |
| Relative risk reduction | `1−RR` | Appropriate wording only if a reduction in this event is favorable. |
| Odds ratio | `OR=[pT/(1−pT)]/[pC/(1−pC)]` | Odds differ from probabilities; endpoint probabilities 0 or 1 require special handling. |
| Absolute risk reduction | `ARR=pC−pT` | Positive for fewer adverse outcomes under treatment. |
| NNT for benefit | `1/ARR` when `ARR>0` | Expected additional benefit compared with this control over this period. |
| NNT for harm / NNH | `1/(pT−pC)` when `pT>pC` for adverse events | State “one additional harmful outcome”; not the number who experience any harm. |

Risk, odds, and person-time rates are different quantities. Ordinary case-control sampling does not provide population risks merely from the sample's case proportion. [ST02, sections 6.1, 6.4; ST03, measures of association]

**Original synthetic example.** At 12 weeks, relapse occurs in 20/200 treated people and 30/200 controls. Risks are 10% versus 15%; RD is −5 percentage points, or 50 fewer relapses per 1,000; RR is 0.667; relative reduction is 33.3%; point NNT for benefit is 20. “33% fewer relapses” is incomplete without the absolute contrast, comparator, time, and uncertainty. If remission is the outcome, label increased remission as benefit; do not reuse the relapse interpretation automatically.

**Original synthetic odds example.** Response occurs in 60% versus 40%. RR is 1.5, but OR is 2.25. “More than twice as likely to respond” misstates the OR. For a compatible baseline risk, `pT = OR*pC / (1−pC+OR*pC)`; an adjusted conditional OR and an external population risk do not automatically form a valid marginal prediction.

NNT is comparator-, population-, endpoint-, and time-specific, not an intrinsic drug characteristic. Display the underlying risk difference even when giving NNT. Round an NNT point estimate upward for conventional whole-person communication, retaining unrounded values for calculation. If ARR's interval is `[L,U]` with both positive, the benefit-NNT interval is `[1/U,1/L]`. If it crosses zero, report separate benefit and harm ranges extending to infinity; never present a misleading finite continuous interval through zero. [ST04, sections 15.4.2–15.4.4]

**Original synthetic interval example.** ARR estimate 0.02, interval −0.01 to 0.05: point NNTB 50; compatible results span NNTB 20 to infinity and NNTH 100 to infinity. This is uncertainty in direction, not evidence of a guaranteed benefit to one in 50.

### Uncertainty and sparse events

Choose intervals compatible with sampling and design. For independent binomial arms, score-based risk intervals and an appropriate two-proportion difference interval are often preferable to an unqualified Wald interval. A simple large-sample log-RR standard error is `sqrt(1/a−1/nT+1/c−1/nC)` when both event counts are positive; exponentiate log-scale endpoints. Sparse data, separation, zero cells, clustered allocation, matching, repeated events, or adjusted estimates require methods fitted to those structures. Do not silently add 0.5 to every table or replace undefined ratios with zero. Record the actual software, method, correction, assumptions, and sensitivity to alternatives. [ST02; ST05, sections 10.4 and 10.12]

Zero observed events do not establish zero risk. For zero events in `n` independent participants with complete equal-window ascertainment, the exact one-sided 95% binomial upper bound solves `(1−p)^n=0.05`, giving `p=1−0.05^(1/n)`; `3/n` is an approximation. With `n=100`, the exact bound is about 2.95%. This is not a treatment-versus-control effect, and does not address delayed harms, dropout, or nonindependent exposure. [ST06]

## 4. Rates, survival, and hazards

Rate = events/person-time; rate ratio divides comparable rates. Report person-time units and whether events can repeat. A hazard ratio compares instantaneous event hazards among those still event-free; it is neither a cumulative RR nor a ratio of median survival times. Inspect censoring, numbers at risk, event ascertainment, competing events, proportional-hazards assumptions, and time-varying effects. Report absolute survival or cumulative-incidence contrasts at clinically useful times when estimable. Restricted mean survival time can provide a time-based contrast at a justified horizon; do not derive it from an HR alone. Reconstructing event times from digitized survival curves yields approximations, not recovered original participant data. [ST02, sections 6.7–6.8; ST03]

## 5. Continuous outcomes, averages, and baseline adjustment

Mean is the sum divided by count; median is the middle ordered value (mean of the two middle values for even count); mode is the most frequent value and may not be unique. A continuous distribution's displayed mode depends on smoothing or bins. Report appropriate spread and inspect skew, floor/ceiling effects, outliers, and mixtures. A mean treatment effect does not establish benefit for every participant. [ST07]

SD describes variation among observations. SE describes uncertainty of an estimator; `SD/sqrt(n)` applies to a simple independent-sample mean under its assumptions, not every weighted, clustered, or model-adjusted mean. IQR is the 75th minus 25th percentile. An SE bar must not be described as showing the range of individual responses. [ST08, ST09]

In randomized parallel trials, prespecified adjustment for prognostic baseline covariates can improve precision. Covariates should be selected from knowledge established before examining treatment effects, rather than by hunting for favorable p-values. Covariate adjustment in randomized studies and confounding adjustment in observational studies have different purposes. [ST10, recommendations]

For baseline and follow-up scales, an ANCOVA model such as `followup = intercept + treatment + baseline + prespecified covariates` estimates a baseline-adjusted between-arm contrast under model assumptions. Compare the model to the estimand, missingness, residuals, and possible interactions. A valid change-score contrast remains useful; “ANCOVA is always correct” is too strong. Percentage change can become unstable near zero and depends on scale properties. [ST11; ST12]

**Original synthetic example.** Both arms start with mean symptom score 24. Treatment ends at 14, placebo at 17. Changes are −10 and −7, so the unadjusted difference in changes is −3 points. A claim of “42% improvement due to treatment” attributes the whole treatment-arm change to treatment. The observed randomized contrast is 3 points beyond placebo, subject to uncertainty and bias. If baseline scores differ, change contrasts and endpoint contrasts differ; use the prespecified valid adjusted model rather than selecting whichever looks larger.

A paired change variance requires covariance: `Var(post−pre)=Var(post)+Var(pre)−2*Cov(post,pre)`. Without covariance or a reported SD of change, a precise paired SE is unavailable. Show a labeled sensitivity range for plausible correlations if useful. Standardized mean differences require a stated standardizer and direction; a large standardized value can result from a small within-study SD. Do not treat `d=0.5` as a universal clinical threshold.

## 6. Correlated and nonstandard designs

Match inference to allocation and correlation. For cluster trials or therapist/group delivery, account for clustering even if individuals were randomized. Repeated visits are not new independent people. Mixed models, GEE, cluster-level methods, or randomization-based procedures may be appropriate depending on design and number of clusters. Small cluster counts need small-sample reasoning. In a simple equal-cluster approximation, design effect is `1+(m−1)*ICC`; with `m=20` and `ICC=.05`, it is 1.95. This illustrates lost information, not a license to fabricate an ICC. Crossover analyses must handle pairing, sequence, period, carryover, withdrawal, and suitability of washout. Never count a shared control twice in synthesis. [ST13, sections 23.1–23.3]

## 7. Missingness, intercurrent events, and sensitivity

Classify observed reasons and patterns by arm, time, and outcome. MCAR means missingness does not depend on observed or unobserved values; MAR permits dependence on observed information but not the missing outcome conditional on modeled information; MNAR retains dependence on missing values after conditioning. These are assumptions about a model and data process, not labels established merely because a missingness test is nonsignificant.

For relevant missing outcomes, examine clinically plausible departures through delta-adjusted multiple imputation, pattern-mixture or selection models, reference-based approaches, tipping points, or defensible bounds. Report assumptions and do not call one method universally conservative. Death may make a symptom outcome undefined rather than simply missing. Last observation carried forward can impose unrealistic trajectories; complete-case analysis may select responders or tolerators. Missingness bias can favor either arm. [ST01, A.4–A.5; ST05, 10.12]

**Original synthetic bounds.** Treatment: 60 responders among 80 assessed of 100 randomized. Control: 50 among 90 assessed of 100. Completer response is 75% versus 55.6%. Without assumptions about missing outcomes, randomized-denominator treatment response is 60%–80%; control 50%–60%; RD lies from 0 to 30 percentage points. Equal assumptions for missing participants may narrow that range, but assumptions are not observations. Do not label everyone missing a nonresponder unless the endpoint and analysis justify that strategy.

## 8. Multiplicity, selective analysis, and subgroup claims

List tested outcomes, scales, timepoints, subgroups, interim looks, model variants, and cutoffs. Separate confirmatory from exploratory findings. Prespecified testing families and suitable control—such as hierarchical testing, Holm procedures, gatekeeping, or alpha spending—protect the intended error criterion. FDR control and familywise error control answer different questions; a method acceptable for discovery may not support a confirmatory claim. Do not demand multiplicity adjustments to conceal safety signals. [ST14, sections II–V]

**Original synthetic calculation.** With 20 independent true-null tests at .05, chance of at least one false rejection is `1−.95^20≈64.2%`. Correlated tests change that calculation. This is a property of the testing procedure, not a 64.2% probability that a particular positive finding is false.

“Significant in one subgroup but not another” does not establish a subgroup difference. Examine the treatment-by-subgroup interaction, uncertainty, prespecification, sample sizes, multiplicity, and biological or clinical rationale. Report continuous modifiers without opportunistic cutoffs when feasible. [ST15]

## 9. Uncertainty, power, and clinical importance

A p-value concerns results at least as incompatible with a specified null model, conditional on that model and its assumptions. It is not the probability that the null is true, that the result occurred “by chance,” or that the effect matters clinically. Report the effect and uncertainty rather than using .05 as a truth switch. [ST16]

A 95% confidence procedure covers its fixed target in 95% of repeated samples under its assumptions; the realized interval is not automatically a 95% posterior probability statement. Confidence intervals do not include all bias or model uncertainty. Prespecified noninferiority/equivalence margins need clinical justification and a design capable of testing those hypotheses; failure to reject superiority does not establish equivalence. [ST04; ST17]

Plan sample size from meaningful effects, variability or event rates, allocation, clustering, anticipated attrition, multiplicity, and operating characteristics. After completion, use the interval and clinically relevant bounds, not “observed power” computed from the observed effect, to interpret a result. [ST18, section 2.1 and discussion]

Separate a meaningful within-person change threshold from a meaningful difference between group means. Thresholds depend on context, instrument, population, anchor, and patient preferences. Report their evidentiary basis and uncertainty, benefit duration, functioning, adverse effects, discontinuation, and burden. A responder cutoff should be prespecified or clearly exploratory. FDA's PFDD endpoint guidance retrieved for this module remains a draft; use it as methodological context, not a binding rule. [ST19, ST20]

## 10. Bayesian and adaptive analysis

State likelihood, prior, estimand, posterior summary, decision threshold, and computational diagnostics. A credible interval is conditional on the prior and model. Examine prior-predictive plausibility, prior-data conflict, borrowing/exchangeability, sensitivity to reasonable priors, and design operating characteristics. Reusing the same evidence in both prior and likelihood can double-count information. A diffuse prior is not automatically harmless. The January 2026 FDA drug/biologics Bayesian document was still labeled **draft, not for implementation** when checked. [ST21, sections IV–VI]

For adaptations, inspect prespecified rules, interim access, stopping boundaries, allocation updates, simulations, and estimation after selection or early stopping. Flexible design can be valid; undisclosed outcome-driven flexibility can bias estimates and error rates. [ST22]

## 11. Evidence synthesis

Pool only compatible questions and retain control-type strata; sham, waitlist, and active treatment need not estimate the same effect. Deduplicate publications from the same trial. State fixed/common-effect versus random-effects assumptions, weighting, effect metric, and heterogeneity estimator. Report between-study variance and, when supportable, a prediction interval; I² alone is neither a quality score nor proof of identical effects when small. Inspect influential studies and justify sensitivity exclusions. Random effects do not cure biased studies or incompatible endpoints. [ST05, 10.3, 10.10–10.14]

Search registries, protocols, analysis plans, supplements, and regulatory reports for missing studies/results. Funnel asymmetry can reflect several mechanisms; a symmetric plot does not prove no publication bias. Cochrane's rule of thumb reserves asymmetry tests for at least ten studies because power is poor below that. Selection-model or trim-and-fill outputs depend on assumptions and do not reveal a unique corrected truth. [ST23]

## 12. Software capability boundary

This knowledge base describes methods an analyst may need; it does not claim that every method is implemented in the plugin. Discover the currently exposed calculator tools and inspect their documented input requirements, output methods, and limits. Use a supported, verified runtime for ANCOVA, mixed models, multiple imputation, Bayesian estimation, survival analysis, or meta-analysis when data and dependencies permit. Otherwise assess the published analysis, compute supported summaries, and identify what remains unavailable. Never describe a methodological checklist as an executed analysis.

## 13. Required analysis output

Deliver: target question; comparator matrix; data audit; reproduced calculations; absolute and relative effects with time/denominators; uncertainty; clinical meaning; bias mechanisms; sensitivity analyses actually run; misleading-presentation audit; and what changes the conclusion. Label all synthetic scenarios. Report code/version, seed if stochastic, preprocessing, and numerical checks. Never claim participant-level reanalysis from aggregate tables. Retrieve missing sources before declaring an analysis impossible; preserve a specific limitation when access remains unavailable.


### Linked source key

- ST01: [E9(R1) Statistical Principles for Clinical Trials: Addendum: Estimands and Sensitivity Analysis in Clinical Trials](https://www.fda.gov/media/148473/download).
- ST02: [Cochrane Handbook Chapter 6: Choosing effect measures and computing estimates of effect](https://www.cochrane.org/authors/handbooks-and-manuals/handbook/current/chapter-06).
- ST03: [Principles of Epidemiology: Lesson 3, Section 5—Measures of Association](https://archive.cdc.gov/www_cdc_gov/csels/dsepd/ss1978/lesson3/section5.html).
- ST04: [Cochrane Handbook Chapter 15: Interpreting results and drawing conclusions](https://www.cochrane.org/authors/handbooks-and-manuals/handbook/current/chapter-15).
- ST05: [Cochrane Handbook Chapter 10: Analysing data and undertaking meta-analyses](https://www.cochrane.org/authors/handbooks-and-manuals/handbook/current/chapter-10).
- ST06: [A Look at the Rule of Three](https://doi.org/10.1080/00031305.1997.10473947).
- ST07: [NIST/SEMATECH e-Handbook: Measures of Location](https://www.itl.nist.gov/div898/handbook/eda/section3/eda351.htm).
- ST08: [NIST/SEMATECH e-Handbook: Measures of Scale](https://itl.nist.gov/div898/handbook/eda/section3/eda356.htm).
- ST09: [Statistical Techniques, Section 8](https://www.nist.gov/system/files/documents/2019/05/13/section-8-statistics-techniques-20190506.pdf).
- ST10: [Adjusting for Covariates in Randomized Clinical Trials for Drugs and Biological Products](https://www.fda.gov/media/148910/download).
- ST11: [Analysing controlled trials with baseline and follow up measurements](https://doi.org/10.1136/bmj.323.7321.1123).
- ST12: [The use of percentage change from baseline as an outcome in a controlled trial is statistically inefficient: a simulation study](https://pubmed.ncbi.nlm.nih.gov/11459516/).
- ST13: [Cochrane Handbook Chapter 23: Including variants on randomized trials](https://www.cochrane.org/authors/handbooks-and-manuals/handbook/current/chapter-23).
- ST14: [Multiple Endpoints in Clinical Trials](https://www.fda.gov/media/162416/download).
- ST15: [The Difference Between Significant and Not Significant is not Itself Statistically Significant](https://sites.stat.columbia.edu/gelman/research/published/signif4.pdf).
- ST16: [ASA Releases Statement on Statistical Significance and P-Values](https://www.amstat.org/asa/files/pdfs/p-valuestatement.pdf).
- ST17: [Absence of evidence is not evidence of absence](https://www.bmj.com/content/311/7003/485.full.pdf%2Bhtml).
- ST18: [The Abuse of Power: The Pervasive Fallacy of Power Calculations for Data Analysis](https://doi.org/10.1198/000313001300339897).
- ST19: [Clinician-Reported Outcome Assessments of Treatment Benefit: Report of the ISPOR Clinical Outcome Assessment Emerging Good Practices Task Force](https://www.fda.gov/media/116285/download).
- ST20: [Patient-Focused Drug Development: Incorporating Clinical Outcome Assessments Into Endpoints for Regulatory Decision-Making](https://www.fda.gov/media/166830/download).
- ST21: [Use of Bayesian Methodology in Clinical Trials of Drug and Biological Products](https://www.fda.gov/media/190505/download).
- ST22: [Adaptive Design Clinical Trials for Drugs and Biologics](https://www.fda.gov/regulatory-information/search-fda-guidance-documents/adaptive-design-clinical-trials-drugs-and-biologics-guidance-industry).
- ST23: [Cochrane Handbook Chapter 13: Assessing risk of bias due to missing evidence in a meta-analysis](https://www.cochrane.org/authors/handbooks-and-manuals/handbook/current/chapter-13).
