/**
 * Transparent aggregate-data calculations; NOT an automatic design appraisal.
 * All intervals are two-sided 95%. Nothing is pooled across studies here.
 * Sources: Newcombe (1998), doi:10.1002/(SICI)1097-0258(19980430)17:8<873::AID-SIM779>3.0.CO;2-I;
 * NIST https://www.itl.nist.gov/div898/handbook/eda/section3/eda353.htm;
 * Cochrane Handbook chapters 6 and 15, https://www.cochrane.org/authors/handbooks-and-manuals/handbook/current/chapter-15.
 */

export interface BinaryArm {
  events: number;
  n: number;
}
export interface CommonInput {
  outcome: string;
  timeHorizon: string;
  randomized?: boolean;
}
export interface BinaryInput extends CommonInput {
  treatment: BinaryArm;
  control: BinaryArm;
  eventType: "harmful" | "beneficial";
}
export interface ContinuousArm {
  mean: number;
  sd: number;
  n: number;
}
export interface ContinuousInput extends CommonInput {
  treatment: ContinuousArm;
  control: ContinuousArm;
  unit: string;
  lowerIsBetter?: boolean;
}
export interface PrePostArm {
  baselineMean: number;
  followupMean: number;
  n: number;
  changeSd?: number;
  baselineSd?: number;
  followupSd?: number;
  correlation?: number;
}
export interface PrePostInput extends CommonInput {
  treatment: PrePostArm;
  control?: PrePostArm;
  unit: string;
  lowerIsBetter?: boolean;
}
type Interval = { lower: number; upper: number; level: 0.95; method: string };
const Z = 1.959963984540054;
const SOURCES = {
  riskDifference: "https://pubmed.ncbi.nlm.nih.gov/9595617/",
  welch: "https://www.itl.nist.gov/div898/handbook/eda/section3/eda353.htm",
  effects: "https://www.cochrane.org/authors/handbooks-and-manuals/handbook/current/chapter-06",
  nnt: "https://www.cochrane.org/authors/handbooks-and-manuals/handbook/current/chapter-15",
};

function numeric(x: unknown, label: string, minimum = -1e100, maximum = 1e100): number {
  if (typeof x !== "number" || !Number.isFinite(x) || x < minimum || x > maximum)
    throw new Error(`${label} must be a finite number between ${minimum} and ${maximum}.`);
  return x;
}
function count(x: unknown, label: string, minimum: number): number {
  const value = numeric(x, label, minimum, 1e9);
  if (!Number.isSafeInteger(value)) throw new Error(`${label} must be an integer.`);
  return value;
}
function requiredText(x: unknown, label: string): string {
  if (typeof x !== "string" || !x.trim() || x.length > 1000)
    throw new Error(`${label} must be nonempty text of at most 1,000 characters.`);
  return x.trim();
}
function metadata(input: CommonInput) {
  if (!input || typeof input !== "object") throw new Error("Input must be an object.");
  if (input.randomized !== undefined && typeof input.randomized !== "boolean")
    throw new Error("randomized must be a boolean when supplied.");
  return {
    outcome: requiredText(input.outcome, "outcome"),
    timeHorizon: requiredText(input.timeHorizon, "timeHorizon"),
    confidenceLevel: 0.95,
    randomizedReported: input.randomized ?? null,
    causalInterpretation:
      input.randomized === true
        ? "Randomization is reported by the caller. Causal interpretation still requires valid allocation, appropriate estimand, outcome ascertainment, missing-data handling, and analysis."
        : "These are unadjusted descriptive associations. They do not establish a causal treatment effect; reciprocal risk differences must not be presented as causal NNT/NNH.",
  };
}
function baseAssumptions() {
  return [
    "Independent parallel groups, individual-level observations, and one specified outcome/time point; not paired, crossover, cluster, recurrent-event, or survival data.",
    "The arms measure the same outcome over comparable follow-up. Counts and summaries use the stated analysis population.",
    "No adjustment for covariates, confounding, multiple comparisons, informative missingness, or sequential monitoring is included.",
    "Confidence intervals describe sampling uncertainty under the model; they do not quantify bias or prove clinical importance.",
  ];
}
function validateBinary(arm: BinaryArm, label: string) {
  if (!arm || typeof arm !== "object") throw new Error(`${label} must contain events and n.`);
  const n = count(arm.n, `${label}.n`, 1);
  const events = count(arm.events, `${label}.events`, 0);
  if (events > n) throw new Error(`${label}.events cannot exceed n.`);
  return { events, n, risk: events / n };
}
function wilson(events: number, n: number): Interval {
  const p = events / n,
    z2 = Z * Z,
    denominator = 1 + z2 / n;
  const midpoint = (p + z2 / (2 * n)) / denominator;
  const half = (Z * Math.sqrt((p * (1 - p)) / n + z2 / (4 * n * n))) / denominator;
  return {
    lower: Math.max(0, midpoint - half),
    upper: Math.min(1, midpoint + half),
    level: 0.95,
    method: "Wilson score, no continuity correction",
  };
}
function ratioInterval(value: number, se: number): Interval {
  return {
    lower: Math.exp(Math.log(value) - Z * se),
    upper: Math.exp(Math.log(value) + Z * se),
    level: 0.95,
    method: "Large-sample log-Wald, no continuity correction",
  };
}
function inverseInterval(benefit: number, lower: number, upper: number, randomized: boolean) {
  const direction = benefit > 0 ? "benefit" : benefit < 0 ? "harm" : "no observed difference";
  const intervals: Array<{
    direction: string;
    lower: number;
    upper: number | null;
    upperUnbounded: boolean;
  }> = [];
  if (upper > 0)
    intervals.push({
      direction: "benefit",
      lower: 1 / upper,
      upper: lower > 0 ? 1 / lower : null,
      upperUnbounded: lower <= 0,
    });
  if (lower < 0)
    intervals.push({
      direction: "harm",
      lower: 1 / -lower,
      upper: upper < 0 ? 1 / -upper : null,
      upperUnbounded: upper >= 0,
    });
  const value = benefit === 0 ? null : 1 / Math.abs(benefit);
  return {
    label: randomized
      ? "NNTB / NNTH (conditional on causal validity)"
      : "Reciprocal observed risk difference; not a causal NNT/NNH",
    direction,
    value,
    roundedUp: value === null ? null : Math.ceil(value - 8 * Number.EPSILON * Math.max(1, value)),
    pointIsInfinite: benefit === 0,
    benefitRiskDifference: benefit,
    confidenceSet: intervals,
    crossesOrTouchesNoEffect: lower <= 0 && upper >= 0,
    interpretation:
      lower <= 0 && upper >= 0
        ? "The interval includes no effect. Reciprocal limits extend through infinity and may include both benefit and harm; do not report a single finite NNT interval."
        : "Reciprocals of the risk-difference confidence limits, preserving direction. Values apply only to this outcome, comparator, population, and follow-up.",
  };
}

export function analyzeBinary(input: BinaryInput) {
  const meta = metadata(input);
  if (input.eventType !== "harmful" && input.eventType !== "beneficial")
    throw new Error("eventType must be harmful or beneficial.");
  const t = validateBinary(input.treatment, "treatment"),
    c = validateBinary(input.control, "control");
  const tc = wilson(t.events, t.n),
    cc = wilson(c.events, c.n);
  const difference = t.risk - c.risk;
  const ci: Interval = {
    lower: Math.max(-1, difference - Math.hypot(t.risk - tc.lower, cc.upper - c.risk)),
    upper: Math.min(1, difference + Math.hypot(tc.upper - t.risk, c.risk - cc.lower)),
    level: 0.95,
    method: "Newcombe hybrid Wilson score, independent groups, no continuity correction",
  };
  const rr = c.risk === 0 ? null : t.risk / c.risk;
  const ratioCI =
    t.events > 0 && c.events > 0 && t.events < t.n && c.events < c.n
      ? ratioInterval(rr!, Math.sqrt(1 / t.events - 1 / t.n + 1 / c.events - 1 / c.n))
      : null;
  const a = t.events,
    b = t.n - t.events,
    d = c.n - c.events,
    e = c.events;
  const oddsRatio = b > 0 && e > 0 ? (a * d) / (b * e) : null;
  const oddsCI =
    Math.min(a, b, e, d) > 0
      ? ratioInterval(oddsRatio!, Math.sqrt(1 / a + 1 / b + 1 / e + 1 / d))
      : null;
  const sign = input.eventType === "beneficial" ? 1 : -1;
  const benefitLower = sign > 0 ? ci.lower : -ci.upper;
  const benefitUpper = sign > 0 ? ci.upper : -ci.lower;
  const warnings = [
    "Risk ratios, odds ratios, and hazard ratios are different measures; the computed OR must not be described as a risk ratio.",
    "A confidence interval containing zero difference does not demonstrate equivalence, noninferiority, or absence of a clinically important effect.",
  ];
  if (Math.min(a, b, e, d) < 5)
    warnings.push(
      "Sparse cells: log-Wald ratio intervals can be unreliable. Consider a prespecified score/exact or appropriate model-based method; no arbitrary pseudo-count was added.",
    );
  if (!ratioCI || !oddsCI)
    warnings.push(
      "A boundary or zero cell prevents the implemented regular log-Wald interval. Point estimates and the risk-difference interval remain separately reported where identifiable.",
    );
  if (c.risk === 0)
    warnings.push(
      "Control risk is zero: relative change and the risk ratio are not reported as finite estimates. Zero observed events do not establish zero underlying risk.",
    );
  return {
    analysis: "independent_binary_groups",
    ...meta,
    eventType: input.eventType,
    treatment: { ...t, riskPercent: t.risk * 100, eventsPer1000: t.risk * 1000, ci95: tc },
    control: { ...c, riskPercent: c.risk * 100, eventsPer1000: c.risk * 1000, ci95: cc },
    riskDifference: {
      value: difference,
      percentagePoints: difference * 100,
      eventsPer1000: difference * 1000,
      reference: "treatment minus control",
      ci95: ci,
    },
    riskRatio: {
      value: rr,
      ci95: ratioCI,
      undefinedReason: rr === null ? "Zero control risk" : null,
    },
    relativeChangePercent: c.risk === 0 ? null : (difference / c.risk) * 100,
    relativeRiskReductionPercent:
      c.risk === 0 || input.eventType !== "harmful" ? null : (-difference / c.risk) * 100,
    oddsRatio: {
      value: oddsRatio,
      ci95: oddsCI,
      undefinedReason:
        oddsRatio === null ? "Zero denominator cell; may be infinite or undefined" : null,
    },
    numberNeeded: inverseInterval(
      sign * difference,
      benefitLower,
      benefitUpper,
      input.randomized === true,
    ),
    assumptions: baseAssumptions(),
    warnings,
    sources: SOURCES,
  };
}

// Lanczos log-gamma and regularized incomplete beta support fractional Welch df.
function logGamma(z: number): number {
  const c = [
    676.5203681218851, -1259.1392167224028, 771.3234287776531, -176.6150291621406,
    12.507343278686905, -0.13857109526572012, 9.984369578019572e-6, 1.5056327351493116e-7,
  ];
  if (z < 0.5) return Math.log(Math.PI) - Math.log(Math.sin(Math.PI * z)) - logGamma(1 - z);
  z -= 1;
  let x = 0.9999999999998099;
  for (let i = 0; i < c.length; i++) x += c[i] / (z + i + 1);
  const t = z + 7.5;
  return 0.5 * Math.log(2 * Math.PI) + (z + 0.5) * Math.log(t) - t + Math.log(x);
}
function betaFraction(a: number, b: number, x: number): number {
  const min = 1e-300;
  const safe = (v: number) => (Math.abs(v) < min ? (v < 0 ? -min : min) : v);
  let c = 1,
    d = 1 / safe(1 - ((a + b) * x) / (a + 1)),
    h = d;
  for (let m = 1; m <= 1000; m++) {
    const m2 = 2 * m;
    let aa = (m * (b - m) * x) / ((a + m2 - 1) * (a + m2));
    d = 1 / safe(1 + aa * d);
    c = safe(1 + aa / c);
    h *= d * c;
    aa = (-(a + m) * (a + b + m) * x) / ((a + m2) * (a + m2 + 1));
    d = 1 / safe(1 + aa * d);
    c = safe(1 + aa / c);
    const delta = d * c;
    h *= delta;
    if (Math.abs(delta - 1) < 3e-14) return h;
  }
  throw new Error("Confidence-interval numerical calculation did not converge.");
}
function incompleteBeta(x: number, a: number, b: number): number {
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  const bt = Math.exp(
    logGamma(a + b) - logGamma(a) - logGamma(b) + a * Math.log(x) + b * Math.log1p(-x),
  );
  return x < (a + 1) / (a + b + 2)
    ? (bt * betaFraction(a, b, x)) / a
    : 1 - (bt * betaFraction(b, a, 1 - x)) / b;
}
function tCritical95(df: number): number {
  // Cornish-Fisher is numerically stable at very large df; the omitted term is negligible here.
  if (df > 1e6)
    return Z + (Z ** 3 + Z) / (4 * df) + (5 * Z ** 5 + 16 * Z ** 3 + 3 * Z) / (96 * df * df);
  const cdf = (x: number) => 1 - 0.5 * incompleteBeta(df / (df + x * x), df / 2, 0.5);
  let lo = 0,
    hi = 2;
  while (cdf(hi) < 0.975 && hi < 1e6) hi *= 2;
  for (let i = 0; i < 90; i++) {
    const mid = (lo + hi) / 2;
    if (cdf(mid) < 0.975) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}
function validateContinuous(arm: ContinuousArm, label: string) {
  if (!arm || typeof arm !== "object") throw new Error(`${label} must contain mean, sd, and n.`);
  return {
    mean: numeric(arm.mean, `${label}.mean`),
    sd: numeric(arm.sd, `${label}.sd`, 0),
    n: count(arm.n, `${label}.n`, 2),
  };
}
function welch(t: ContinuousArm, c: ContinuousArm) {
  const difference = t.mean - c.mean;
  const vt = t.sd ** 2 / t.n,
    vc = c.sd ** 2 / c.n;
  const variance = vt + vc;
  if (variance === 0)
    return { value: difference, standardError: 0, degreesOfFreedom: null, ci95: null };
  const se = Math.sqrt(variance);
  // Rescale before squaring to avoid overflow with large but finite measurement units.
  const wt = vt / variance,
    wc = vc / variance;
  const df = 1 / (wt ** 2 / (t.n - 1) + wc ** 2 / (c.n - 1));
  const margin = tCritical95(df) * se;
  return {
    value: difference,
    standardError: se,
    degreesOfFreedom: df,
    ci95: {
      lower: difference - margin,
      upper: difference + margin,
      level: 0.95 as const,
      method: "Welch t interval with Satterthwaite degrees of freedom",
    },
  };
}
function validateDirection(value: unknown) {
  if (value !== undefined && typeof value !== "boolean")
    throw new Error("lowerIsBetter must be a boolean when supplied.");
}
export function analyzeContinuous(input: ContinuousInput) {
  const meta = metadata(input);
  validateDirection(input.lowerIsBetter);
  const unit = requiredText(input.unit, "unit");
  const t = validateContinuous(input.treatment, "treatment"),
    c = validateContinuous(input.control, "control");
  const estimate = welch(t, c);
  const df = t.n + c.n - 2;
  const pooledSd = Math.sqrt(((t.n - 1) / df) * t.sd ** 2 + ((c.n - 1) / df) * c.sd ** 2);
  const g = pooledSd === 0 ? null : ((1 - 3 / (4 * df - 1)) * estimate.value) / pooledSd;
  const warnings = [
    "This is an unadjusted between-arm endpoint comparison, not ANCOVA and not a within-person change analysis.",
    "Summary data cannot diagnose outliers, skewness, scale validity, ceiling effects, or missingness. Small-sample t inference requires approximately normal sampling distributions.",
    "Hedges g uses the pooled within-arm SD and an approximate small-sample correction. It is descriptive here; no g confidence interval or clinical-importance threshold is inferred.",
  ];
  if (!estimate.ci95)
    warnings.push(
      "Both observed SDs are zero; a regular t interval cannot be estimated. A zero-width interval is not reported as evidence of certainty.",
    );
  return {
    analysis: "independent_continuous_groups",
    ...meta,
    unit,
    treatment: t,
    control: c,
    meanDifference: { ...estimate, reference: "treatment minus control", unit },
    standardizedDifference: { hedgesGApproximate: g, pooledSd, confidenceInterval: null },
    lowerIsBetter: input.lowerIsBetter ?? null,
    assumptions: baseAssumptions(),
    warnings,
    sources: SOURCES,
  };
}

function preparePrePost(arm: PrePostArm, label: string) {
  if (!arm || typeof arm !== "object")
    throw new Error(`${label} must contain baselineMean, followupMean, and n.`);
  const baselineMean = numeric(arm.baselineMean, `${label}.baselineMean`);
  const followupMean = numeric(arm.followupMean, `${label}.followupMean`);
  const n = count(arm.n, `${label}.n`, 2);
  if (arm.changeSd !== undefined) numeric(arm.changeSd, `${label}.changeSd`, 0);
  if (arm.baselineSd !== undefined) numeric(arm.baselineSd, `${label}.baselineSd`, 0);
  if (arm.followupSd !== undefined) numeric(arm.followupSd, `${label}.followupSd`, 0);
  if (arm.correlation !== undefined) numeric(arm.correlation, `${label}.correlation`, -1, 1);
  const hasComponents =
    arm.baselineSd !== undefined || arm.followupSd !== undefined || arm.correlation !== undefined;
  if (arm.changeSd !== undefined && hasComponents)
    throw new Error(`${label}: supply changeSd OR baselineSd/followupSd/correlation, not both.`);
  let changeSd: number | null = arm.changeSd ?? null;
  let dispersionSource = changeSd !== null ? "Supplied SD of within-person change" : "Unavailable";
  if (
    arm.baselineSd !== undefined &&
    arm.followupSd !== undefined &&
    arm.correlation !== undefined
  ) {
    const s0 = arm.baselineSd,
      s1 = arm.followupSd,
      r = arm.correlation;
    // Equivalent to s0²+s1²−2rs0s1, with less cancellation near r=1.
    changeSd = Math.sqrt(Math.max(0, (s0 - s1) ** 2 + 2 * (1 - r) * s0 * s1));
    dispersionSource = "Derived from supplied baseline/follow-up SDs and within-person correlation";
  }
  const change = followupMean - baselineMean;
  const se = changeSd === null ? null : changeSd / Math.sqrt(n);
  const margin = se === null || se === 0 ? null : tCritical95(n - 1) * se;
  return {
    baselineMean,
    followupMean,
    n,
    change,
    changeSd,
    dispersionSource,
    changeCI95:
      margin === null
        ? null
        : {
            lower: change - margin,
            upper: change + margin,
            level: 0.95 as const,
            method: "Paired change-score t interval",
          },
  };
}
export function analyzePrePost(input: PrePostInput) {
  const meta = metadata(input);
  validateDirection(input.lowerIsBetter);
  const unit = requiredText(input.unit, "unit");
  const t = preparePrePost(input.treatment, "treatment");
  const c = input.control === undefined ? null : preparePrePost(input.control, "control");
  const differenceInChanges = c === null ? null : t.change - c.change;
  const estimate =
    c && t.changeSd !== null && c.changeSd !== null
      ? welch(
          { mean: t.change, sd: t.changeSd, n: t.n },
          { mean: c.change, sd: c.changeSd, n: c.n },
        )
      : null;
  const warnings = [
    "Within-group improvement is not a treatment effect. Natural history, regression to the mean, expectancy, measurement error, and co-interventions can explain it.",
    "A significant change in one arm and a nonsignificant change in another is not evidence that the arms differ. Use the between-arm contrast and its uncertainty.",
    "Change scores do not recreate prespecified baseline-adjusted ANCOVA. In nonrandomized designs, a difference in changes alone does not establish parallel trends or remove confounding.",
    "The same participants must contribute baseline and follow-up summaries in each arm. Mixing all-baseline and completer-only means invalidates a paired change analysis.",
  ];
  if (!c)
    warnings.push(
      "No concurrent comparator was supplied; no between-arm or placebo-adjusted treatment effect can be calculated.",
    );
  if (t.changeSd === null || (c && c.changeSd === null))
    warnings.push(
      "Change-score precision is unavailable: supply an observed change SD or both marginal SDs and the within-person correlation. The calculator does not assume independence between repeated measurements.",
    );
  if (t.changeSd === 0 || c?.changeSd === 0)
    warnings.push(
      "An arm has zero observed change dispersion; its standalone regular t interval is omitted. Investigate rounding, data errors, or degenerate measurements.",
    );
  return {
    analysis: "pre_post_changes",
    ...meta,
    unit,
    treatment: t,
    control: c,
    differenceInChanges: c
      ? {
          value: differenceInChanges,
          reference: "(treatment follow-up − baseline) − (control follow-up − baseline)",
          ci95: estimate?.ci95 ?? null,
          standardError: estimate?.standardError ?? null,
          degreesOfFreedom: estimate?.degreesOfFreedom ?? null,
        }
      : null,
    lowerIsBetter: input.lowerIsBetter ?? null,
    assumptions: [
      "Repeated measurements are paired within participants; treatment and comparator arms are independent.",
      ...baseAssumptions().slice(1),
    ],
    warnings,
    sources: SOURCES,
  };
}
