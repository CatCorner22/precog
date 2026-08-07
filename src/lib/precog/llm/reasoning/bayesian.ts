/**
 * Bayesian residual / loss belief updates.
 * Conjugate Beta-Binomial style priors for control failure probability,
 * and lognormal-ish expected loss updates from scenario retained EL.
 */

export interface BetaBelief {
  /** Successes (control holds / no material loss) */
  alpha: number;
  /** Failures (control fails / material residual event) */
  beta: number;
  mean: number;
  /** 95% credible interval (quantile approx) */
  ci95: { low: number; high: number };
  label: string;
}

export interface BayesianState {
  failureProbability: BetaBelief;
  /** Expected retained loss under failure (point + uncertainty scale) */
  severity: {
    muLog: number;
    sigma: number;
    mean: number;
    p05: number;
    p95: number;
  };
  /** Posterior expected annual cost-ish: p(fail) * severity * annualization */
  expectedAnnualLoss: number;
  updates: string[];
}

function betaMean(a: number, b: number) {
  return a / (a + b);
}

/** Rough Beta quantile via Beasley-Springer-Moro-ish normal approx for CI. */
function betaCi95(a: number, b: number): { low: number; high: number } {
  const m = betaMean(a, b);
  const v = (a * b) / ((a + b) ** 2 * (a + b + 1));
  const s = Math.sqrt(Math.max(v, 1e-9));
  return {
    low: Math.max(0, m - 1.96 * s),
    high: Math.min(1, m + 1.96 * s),
  };
}

function lognormalMoments(mean: number, cv = 0.55) {
  // cv = sigma/mu for underlying; map to lognormal params
  const variance = (mean * cv) ** 2;
  const sigma = Math.sqrt(Math.log(1 + variance / Math.max(mean, 1) ** 2));
  const muLog = Math.log(Math.max(mean, 1)) - 0.5 * sigma * sigma;
  const p05 = Math.exp(muLog - 1.645 * sigma);
  const p95 = Math.exp(muLog + 1.645 * sigma);
  return { muLog, sigma, mean, p05, p95 };
}

export function initBayesianState(opts: {
  industryBaseRate: number;
  retainedExpected: number;
  residualAverage: number;
  leadingPressure: number; // 0-100
  dualControl: boolean;
  independentBankRec: boolean;
}): BayesianState {
  // Prior: industry rate as mean of Beta with strength ~20
  const priorMean = Math.min(0.45, Math.max(0.02, opts.industryBaseRate));
  const strength = 20;
  let alpha = priorMean * strength;
  let beta = (1 - priorMean) * strength;
  const updates: string[] = [
    `Prior failure rate ~${(priorMean * 100).toFixed(1)}% (industry-oriented Beta strength ${strength}).`,
  ];

  // Pseudo-observations from residual / leading pressure
  const residualFailPseudo = (opts.residualAverage / 100) * 8;
  const residualOkPseudo = ((100 - opts.residualAverage) / 100) * 8;
  alpha += residualOkPseudo;
  beta += residualFailPseudo;
  updates.push(
    `Residual ${opts.residualAverage}/100 → +${residualFailPseudo.toFixed(1)} fail / +${residualOkPseudo.toFixed(1)} hold pseudo-counts.`,
  );

  const leadFail = (opts.leadingPressure / 100) * 6;
  const leadOk = ((100 - opts.leadingPressure) / 100) * 6;
  alpha += leadOk;
  beta += leadFail;
  updates.push(
    `Leading pressure ${opts.leadingPressure}/100 → +${leadFail.toFixed(1)} fail pseudo-counts.`,
  );

  // Controls as strong evidence of lower failure
  if (opts.dualControl) {
    alpha += 4;
    updates.push("Dual control on → +4 hold pseudo-counts (opportunity shrinks).");
  } else {
    beta += 3;
    updates.push("Dual control off → +3 fail pseudo-counts.");
  }
  if (opts.independentBankRec) {
    alpha += 3.5;
    updates.push("Independent bank rec on → +3.5 hold (detection improves).");
  } else {
    beta += 3;
    updates.push("Independent bank rec off → +3 fail pseudo-counts.");
  }

  const mean = betaMean(alpha, beta);
  const severity = lognormalMoments(Math.max(1000, opts.retainedExpected));
  const annualization = 0.12; // illustrative frequency weight
  const expectedAnnualLoss = mean * severity.mean * annualization;

  return {
    failureProbability: {
      alpha,
      beta,
      mean,
      ci95: betaCi95(alpha, beta),
      label: "Posterior P(material control failure | evidence)",
    },
    severity,
    expectedAnnualLoss,
    updates,
  };
}

/** Update posterior after a hypothetical lever (soft evidence). */
export function updateBayesianWithLever(
  state: BayesianState,
  effect: {
    likelihoodDrop: number; // e.g. 0.28 for -28%
    severityDrop: number;
    label: string;
  },
): BayesianState {
  let { alpha, beta } = {
    alpha: state.failureProbability.alpha,
    beta: state.failureProbability.beta,
  };
  // Map likelihood drop into hold pseudo-counts
  const holdBoost = effect.likelihoodDrop * 12;
  alpha += holdBoost;
  const updates = [
    ...state.updates,
    `${effect.label}: likelihood drop ${effect.likelihoodDrop.toFixed(2)} → +${holdBoost.toFixed(1)} hold pseudo-counts.`,
  ];
  const mean = betaMean(alpha, beta);
  const newMeanSev = state.severity.mean * (1 - Math.min(0.6, effect.severityDrop));
  const severity = lognormalMoments(newMeanSev);
  const expectedAnnualLoss = mean * severity.mean * 0.12;
  return {
    failureProbability: {
      alpha,
      beta,
      mean,
      ci95: betaCi95(alpha, beta),
      label: state.failureProbability.label,
    },
    severity,
    expectedAnnualLoss,
    updates,
  };
}
