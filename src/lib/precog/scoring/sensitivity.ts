import type { IndustryTemplate } from "../templates";
import type { StaffComposition } from "../types";
import { bandForScore, DEFAULT_WEIGHTS, type ActionBand, type ScoringWeights } from "./weights";
import { scoreAllResidualRisks, type ResidualScope } from "./residual-engine";

export interface WeightPerturbation {
  group: keyof ScoringWeights;
  key: string;
  direction: "up" | "down";
  averageResidual: number;
  delta: number;
}

export interface ItemSensitivity {
  id: string;
  name: string;
  residual: number;
  band: ActionBand;
  low: number;
  high: number;
  bandStable: boolean;
}

export interface SensitivityReport {
  perturbation: number;
  baseAverage: number;
  averageLow: number;
  averageHigh: number;
  topOrderStable: boolean;
  items: ItemSensitivity[];
  perturbations: WeightPerturbation[];
  mostSensitive: WeightPerturbation[];
}

type WeightGroup = keyof ScoringWeights;

const WEIGHT_GROUPS: WeightGroup[] = ["inherent", "control", "staff", "scenario", "knowledge"];

function cloneDefaultWeights(): ScoringWeights {
  return {
    inherent: { ...DEFAULT_WEIGHTS.inherent },
    control: { ...DEFAULT_WEIGHTS.control },
    staff: { ...DEFAULT_WEIGHTS.staff },
    scenario: { ...DEFAULT_WEIGHTS.scenario },
    knowledge: { ...DEFAULT_WEIGHTS.knowledge },
  };
}

function averageResidual(scores: ReturnType<typeof scoreAllResidualRisks>): number {
  return Math.round(
    scores.reduce((sum, score) => sum + score.residual, 0) / Math.max(1, scores.length),
  );
}

function normalize(values: Record<string, number>, keys: string[]) {
  const total = keys.reduce((sum, key) => sum + values[key], 0);
  if (total === 0) return;
  for (const key of keys) values[key] /= total;
}

function trialWeights(
  group: WeightGroup,
  key: string,
  direction: "up" | "down",
  perturbation: number,
): ScoringWeights {
  const trial = cloneDefaultWeights();
  if (perturbation === 0) return trial;

  const values = trial[group] as Record<string, number>;
  const factor = direction === "up" ? 1 + perturbation : 1 - perturbation;
  values[key] *= factor;

  if (group === "inherent" || group === "control") {
    normalize(values, Object.keys(values));
  } else if (group === "scenario" && (key === "lossShare" || key === "timeShare")) {
    normalize(values, ["lossShare", "timeShare"]);
  }
  return trial;
}

export function weightSensitivity(
  tpl: IndustryTemplate,
  staff: StaffComposition,
  perturbation = 0.2,
  scope: ResidualScope = {},
): SensitivityReport {
  const baseScores = scoreAllResidualRisks(tpl, staff, DEFAULT_WEIGHTS, scope);
  const baseAverage = averageResidual(baseScores);
  const trials: {
    scores: ReturnType<typeof scoreAllResidualRisks>;
    perturbation?: WeightPerturbation;
  }[] = [{ scores: baseScores }];

  for (const group of WEIGHT_GROUPS) {
    for (const key of Object.keys(DEFAULT_WEIGHTS[group])) {
      for (const direction of ["up", "down"] as const) {
        const scores = scoreAllResidualRisks(
          tpl,
          staff,
          trialWeights(group, key, direction, perturbation),
          scope,
        );
        const average = averageResidual(scores);
        trials.push({
          scores,
          perturbation: {
            group,
            key,
            direction,
            averageResidual: average,
            delta: average - baseAverage,
          },
        });
      }
    }
  }

  const itemTrials = new Map<string, ReturnType<typeof scoreAllResidualRisks>>();
  for (const score of baseScores) itemTrials.set(score.id, []);
  for (const trial of trials) {
    for (const score of trial.scores) {
      itemTrials.get(score.id)?.push(score);
    }
  }

  const items = baseScores.map((base) => {
    const scores = itemTrials.get(base.id) ?? [base];
    const residuals = scores.map((score) => score.residual);
    const baseBand = bandForScore(base.residual).band;
    return {
      id: base.id,
      name: base.name,
      residual: base.residual,
      band: baseBand,
      low: Math.min(...residuals),
      high: Math.max(...residuals),
      bandStable: scores.every((score) => bandForScore(score.residual).band === baseBand),
    };
  });

  const topIds = baseScores.slice(0, 3).map((score) => score.id);
  const topOrderStable = trials.every((trial) =>
    trial.scores.slice(0, 3).every((score, index) => score.id === topIds[index]),
  );
  const perturbations = trials.flatMap((trial) => (trial.perturbation ? [trial.perturbation] : []));
  const averages = trials.map((trial) => averageResidual(trial.scores));

  return {
    perturbation,
    baseAverage,
    averageLow: Math.min(...averages),
    averageHigh: Math.max(...averages),
    topOrderStable,
    items,
    perturbations,
    mostSensitive: perturbations.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta)).slice(0, 6),
  };
}
