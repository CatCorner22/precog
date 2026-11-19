import { expect, test } from "vitest";
import assert from "node:assert/strict";
import { analyzeBinary, analyzeContinuous, analyzePrePost } from "./statistics";

const meta = { outcome: "Prespecified outcome", timeHorizon: "12 weeks", randomized: true };
const near = (value: number, expected: number, tolerance = 1e-9) =>
  assert.ok(Math.abs(value - expected) <= tolerance, `${value} differs from ${expected}`);
const binary = (
  te = 10,
  tn = 100,
  ce = 20,
  cn = 100,
  eventType: "harmful" | "beneficial" = "harmful",
) =>
  analyzeBinary({
    ...meta,
    treatment: { events: te, n: tn },
    control: { events: ce, n: cn },
    eventType,
  });

test("reports absolute risk, percentage points, natural frequencies, and relative risk distinctly", () => {
  const result = binary();
  near(result.treatment.risk, 0.1);
  near(result.control.risk, 0.2);
  near(result.riskDifference.value, -0.1);
  near(result.riskDifference.percentagePoints, -10);
  near(result.riskDifference.eventsPer1000, -100);
  near(result.riskRatio.value!, 0.5);
  near(result.relativeChangePercent!, -50);
  near(result.relativeRiskReductionPercent!, 50);
  near(result.oddsRatio.value!, 4 / 9);
  assert.notEqual(result.riskRatio.value, result.oddsRatio.value);
  assert.equal(result.numberNeeded.direction, "benefit");
  near(result.numberNeeded.value!, 10);
  assert.equal(result.numberNeeded.roundedUp, 10);
});

test("keeps the harmful-outcome example's absolute and relative measures distinct", () => {
  const result = analyzeBinary({
    ...meta,
    treatment: { events: 10, n: 100 },
    control: { events: 20, n: 100 },
    eventType: "harmful",
  });

  expect(result.riskDifference.value).toBe(-0.1);
  expect(result.relativeRiskReductionPercent).toBe(50);
  expect(result.riskRatio.value).toBe(0.5);
  expect(result.oddsRatio.value).toBeCloseTo(0.4444, 4);
  expect(result.numberNeeded.value).toBe(10);
});

test("Newcombe difference intervals agree with independent SciPy Wilson bounds", () => {
  // Gold bounds calculated with scipy.stats.binomtest(...).proportion_ci(method='wilson').
  const examples = [
    [10, 100, 20, 100, -0.19947387007806955, -0.000149025118557633],
    [0, 20, 0, 20, -0.16112515805281935, 0.16112515805281935],
    [10, 50, 5, 100, 0.04285378294599346, 0.2834405309674548],
    [100, 100, 100, 100, -0.03699349820698572, 0.03699349820698572],
  ];
  for (const [a, n, c, m, lo, hi] of examples) {
    const result = binary(a, n, c, m);
    near(result.riskDifference.ci95.lower, lo);
    near(result.riskDifference.ci95.upper, hi);
  }
});

test("NNT flips benefit/harm when outcome desirability flips", () => {
  const harmful = binary(20, 100, 10, 100),
    beneficial = binary(20, 100, 10, 100, "beneficial");
  assert.equal(harmful.numberNeeded.direction, "harm");
  assert.equal(beneficial.numberNeeded.direction, "benefit");
  assert.equal(harmful.numberNeeded.confidenceSet[0].direction, "harm");
  assert.equal(beneficial.numberNeeded.confidenceSet[0].direction, "benefit");
  near(harmful.numberNeeded.value!, beneficial.numberNeeded.value!);
});

test("a CI spanning zero produces a disjoint benefit/harm confidence set through infinity", () => {
  const result = binary(10, 100, 11, 100);
  assert.equal(result.numberNeeded.crossesOrTouchesNoEffect, true);
  assert.deepEqual(
    result.numberNeeded.confidenceSet.map((i) => i.direction),
    ["benefit", "harm"],
  );
  assert.ok(result.numberNeeded.confidenceSet.every((i) => i.upper === null && i.upperUnbounded));
  near(result.numberNeeded.value!, 100);
  assert.doesNotThrow(() => JSON.stringify(result));
  assert.equal(JSON.stringify(result).includes("Infinity"), false);
});

test("equal risks have an infinite point NNT, not zero, while confidence limits remain nonzero", () => {
  const result = binary(10, 100, 20, 200);
  assert.equal(result.numberNeeded.value, null);
  assert.equal(result.numberNeeded.pointIsInfinite, true);
  assert.equal(result.numberNeeded.direction, "no observed difference");
  assert.ok(result.riskDifference.ci95.lower < 0 && result.riskDifference.ci95.upper > 0);
});

test("zero cells preserve absolute intervals without adding pseudo events", () => {
  const bothZero = binary(0, 20, 0, 20);
  assert.equal(bothZero.riskRatio.value, null);
  assert.equal(bothZero.relativeChangePercent, null);
  assert.equal(bothZero.treatment.events, 0);
  assert.equal(bothZero.treatment.risk, 0);
  assert.ok(bothZero.treatment.ci95.upper > 0);
  assert.equal(bothZero.riskRatio.ci95, null);
  assert.equal(bothZero.oddsRatio.ci95, null);
  const oneZero = binary(0, 50, 10, 50);
  assert.equal(oneZero.riskRatio.value, 0);
  assert.equal(oneZero.riskRatio.ci95, null);
  assert.ok(oneZero.riskDifference.ci95.lower < oneZero.riskDifference.ci95.upper);
  assert.equal(binary(10, 50, 0, 50).riskRatio.value, null);
});

test("nonrandomized and unspecified designs explicitly restrict causal claims", () => {
  const input = {
    treatment: { events: 10, n: 100 },
    control: { events: 20, n: 100 },
    eventType: "harmful" as const,
    outcome: "Relapse",
    timeHorizon: "1 year",
  };
  for (const randomized of [undefined, false]) {
    const result = analyzeBinary({ ...input, randomized });
    assert.match(result.causalInterpretation, /do not establish a causal/);
    assert.match(result.numberNeeded.label, /not a causal/);
  }
});

test("invalid binary values are rejected instead of coerced", () => {
  for (const bad of [-1, 1.5, NaN, Infinity, "10", null]) {
    assert.throws(() => binary(bad as number, 100, 10, 100));
  }
  assert.throws(() => binary(101, 100, 10, 100));
  assert.throws(() => binary(0, 0, 0, 100));
  assert.throws(() => binary(10, 100, 10, 100, "bad" as "harmful"));
  assert.throws(() =>
    analyzeBinary({
      ...meta,
      outcome: "",
      treatment: { events: 0, n: 10 },
      control: { events: 0, n: 10 },
      eventType: "harmful",
    }),
  );
});

test("Welch intervals match scipy.stats.t.ppf across fractional, tiny, unequal, and huge df", () => {
  // Independent benchmarks from SciPy, including df=1 (heavy-tailed) and large df.
  const examples = [
    [10, 2, 10, 8, 3, 15, 22.992700729927005, -0.06869394969283693, 4.068693949692837],
    [10, 2, 2, 8, 3, 2, 1.7422680412371134, -10.68134036705792, 14.68134036705792],
    [10, 0, 50, 9, 4, 17, 16, -1.056610227057846, 3.056610227057846],
    [0, 1, 2, 0, 0, 2, 1, -8.984643532093754, 8.984643532093754],
    [0, 1, 100000000, 0, 1, 100000000, 199999998, -0.0002771807665473847, 0.0002771807665473847],
  ];
  for (const [m1, s1, n1, m2, s2, n2, df, lo, hi] of examples) {
    const result = analyzeContinuous({
      ...meta,
      unit: "points",
      treatment: { mean: m1, sd: s1, n: n1 },
      control: { mean: m2, sd: s2, n: n2 },
    });
    near(result.meanDifference.degreesOfFreedom!, df, 1e-6);
    near(result.meanDifference.ci95!.lower, lo, 1e-8);
    near(result.meanDifference.ci95!.upper, hi, 1e-8);
  }
});

test("Welch result retains units, direction, sample sizes, and standardized-effect limits", () => {
  const result = analyzeContinuous({
    ...meta,
    unit: "score points",
    treatment: { mean: 8, sd: 4, n: 30 },
    control: { mean: 10, sd: 5, n: 70 },
    lowerIsBetter: true,
  });
  assert.equal(result.meanDifference.value, -2);
  assert.equal(result.unit, "score points");
  assert.equal(result.treatment.n, 30);
  assert.equal(result.control.n, 70);
  assert.ok(result.standardizedDifference.hedgesGApproximate! < 0);
  assert.equal(result.standardizedDifference.confidenceInterval, null);
});

test("degenerate continuous variance does not masquerade as certainty", () => {
  const result = analyzeContinuous({
    ...meta,
    unit: "points",
    treatment: { mean: 8, sd: 0, n: 30 },
    control: { mean: 10, sd: 0, n: 70 },
  });
  assert.equal(result.meanDifference.value, -2);
  assert.equal(result.meanDifference.ci95, null);
  assert.equal(result.standardizedDifference.hedgesGApproximate, null);
  assert.match(result.warnings.join(" "), /zero-width interval is not reported/);
});

test("continuous validation rejects small samples, SD confusion, and nonfinite values", () => {
  const t = { mean: 8, sd: 4, n: 30 },
    c = { mean: 10, sd: 5, n: 70 };
  for (const patch of [{ n: 1 }, { n: 2.5 }, { sd: -1 }, { sd: NaN }, { mean: Infinity }])
    assert.throws(() =>
      analyzeContinuous({ ...meta, unit: "points", treatment: { ...t, ...patch }, control: c }),
    );
});

test("pre/post without covariance information reports changes but refuses a fabricated interval", () => {
  const result = analyzePrePost({
    ...meta,
    unit: "points",
    treatment: { baselineMean: 20, followupMean: 12, n: 30 },
    control: { baselineMean: 21, followupMean: 16, n: 40 },
  });
  assert.equal(result.treatment.change, -8);
  assert.equal(result.control!.change, -5);
  assert.equal(result.differenceInChanges!.value, -3);
  assert.equal(result.differenceInChanges!.ci95, null);
  assert.match(result.warnings.join(" "), /does not assume independence between repeated/);
});

test("pre/post uses paired covariance for each arm and independent contrast between arms", () => {
  const result = analyzePrePost({
    ...meta,
    unit: "points",
    treatment: {
      baselineMean: 20,
      followupMean: 12,
      n: 30,
      baselineSd: 6,
      followupSd: 6,
      correlation: 0.5,
    },
    control: { baselineMean: 21, followupMean: 16, n: 40, changeSd: 5 },
  });
  near(result.treatment.changeSd!, 6);
  const independent = analyzeContinuous({
    ...meta,
    unit: "points",
    treatment: { mean: -8, sd: 6, n: 30 },
    control: { mean: -5, sd: 5, n: 40 },
  });
  near(result.differenceInChanges!.ci95!.lower, independent.meanDifference.ci95!.lower);
  near(result.differenceInChanges!.ci95!.upper, independent.meanDifference.ci95!.upper);
});

test("single-arm change is not mislabeled a placebo-adjusted treatment effect", () => {
  const result = analyzePrePost({
    ...meta,
    unit: "points",
    treatment: { baselineMean: 20, followupMean: 12, n: 30, changeSd: 6 },
  });
  assert.equal(result.control, null);
  assert.equal(result.differenceInChanges, null);
  assert.match(result.warnings.join(" "), /No concurrent comparator/);
});

test("pre/post rejects conflicting precision inputs and impossible correlation", () => {
  const t = { baselineMean: 20, followupMean: 12, n: 30 };
  assert.throws(() =>
    analyzePrePost({ ...meta, unit: "points", treatment: { ...t, changeSd: 5, correlation: 0.5 } }),
  );
  for (const correlation of [-1.1, 1.1, NaN])
    assert.throws(() =>
      analyzePrePost({
        ...meta,
        unit: "points",
        treatment: { ...t, baselineSd: 6, followupSd: 6, correlation },
      }),
    );
});

test("perfect correlation and zero dispersion are disclosed without a false precision interval", () => {
  const result = analyzePrePost({
    ...meta,
    unit: "points",
    treatment: {
      baselineMean: 20,
      followupMean: 12,
      n: 30,
      baselineSd: 6,
      followupSd: 6,
      correlation: 1,
    },
  });
  assert.equal(result.treatment.changeSd, 0);
  assert.equal(result.treatment.changeCI95, null);
});
