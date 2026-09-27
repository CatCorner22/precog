/**
 * Beam search over control and insurance lever sequences.
 * Utility = 1.1·(residual drop) + 1.0·(cost-of-risk drop) − 0.45·(effort), each
 * drop normalised against the starting point. A sequence of any length up to
 * `depth` can win, and every lever in it must add utility over the one before.
 */
import type { StaffComposition } from "../../types";
import type { IndustryTemplate } from "../../templates";
import type { RiskVariableState } from "../../scoring/dynamic-variables";
import {
  CASCADE_LEVERS,
  simulateCascadeLever,
  type CascadeLeverId,
} from "../../scoring/variable-cascade";

export interface BeamNode {
  sequence: CascadeLeverId[];
  labels: string[];
  staff: StaffComposition;
  vars: RiskVariableState;
  utility: number;
  /** Utility this node's last lever added over its parent. */
  marginalUtility: number;
}

export interface BeamSearchResult {
  /** The best sequence found; empty when no lever adds utility. */
  best: BeamNode;
  /** Distinct lever sets considered, best first. */
  frontier: { sequence: string }[];
}

export function beamSearchLevers(
  tpl: IndustryTemplate,
  staff: StaffComposition,
  vars: RiskVariableState,
  opts: { beamWidth?: number; depth?: number } = {},
): BeamSearchResult {
  const beamWidth = opts.beamWidth ?? 4;
  const depth = opts.depth ?? 3;

  const root: BeamNode = {
    sequence: [],
    labels: [],
    staff: { ...staff },
    vars: { ...vars },
    utility: 0,
    marginalUtility: 0,
  };
  let baseline: { residual: number; annualCor: number } | null = null;
  /** Every node kept at any depth, so a short sequence competes with a long one. */
  const pool: BeamNode[] = [];
  let beam: BeamNode[] = [root];

  for (let d = 0; d < depth && beam.length; d++) {
    const candidates: BeamNode[] = [];
    for (const node of beam) {
      for (const id of BEAM_LEVERS) {
        if (node.sequence.includes(id) || alreadyOn(id, node.vars)) continue;
        const sim = simulateCascadeLever(tpl, id, node.vars, node.staff);
        // The first simulation's "before" is the untouched starting point.
        baseline ??= {
          residual: sim.before.residualAverage,
          annualCor: sim.before.expectedAnnualCostOfRisk,
        };
        const effort = [...node.sequence, id].reduce((s, x) => s + effortCost(x), 0);
        const utility = nodeUtility(
          sim.after.residualAverage,
          sim.after.expectedAnnualCostOfRisk,
          effort,
          baseline,
        );
        const marginalUtility = utility - node.utility;
        // A lever that adds nothing never extends a sequence.
        if (marginalUtility <= 0) continue;
        candidates.push({
          sequence: [...node.sequence, id],
          labels: [...node.labels, sim.lever.label],
          staff: sim.staffAfter,
          vars: sim.variablesAfter,
          utility,
          marginalUtility,
        });
      }
    }
    candidates.sort((a, b) => b.utility - a.utility);
    beam = pickDiverse(candidates, beamWidth);
    pool.push(...candidates);
  }

  const ranked = distinctLeverSets(pool.sort((a, b) => b.utility - a.utility));
  return {
    best: ranked[0] ?? root,
    frontier: ranked.slice(0, beamWidth).map((b) => ({ sequence: b.labels.join(" → ") })),
  };
}

/**
 * The levers the search may pull. Raising the segregation score is left out:
 * it is the owner's own rating of how duties are split, not an action.
 */
const BEAM_LEVERS: CascadeLeverId[] = CASCADE_LEVERS.map((l) => l.id).filter(
  (id) => id !== "raise_segregation_75",
);

function alreadyOn(id: CascadeLeverId, vars: RiskVariableState): boolean {
  if (id === "enable_dual_control") return vars.hasDualControl;
  if (id === "enable_independent_bank_rec") return vars.hasIndependentBankRec;
  if (id === "enable_cameras") return vars.hasSecurityCameras;
  return false;
}

function effortCost(id: CascadeLeverId): number {
  if (id.includes("stack")) return 0.35;
  if (id.includes("deductible") || id.includes("limit") || id.includes("claims")) return 0.15;
  if (id.includes("cash")) return 0.2;
  return 0.25;
}

function nodeUtility(
  residual: number,
  annualCor: number,
  totalEffort: number,
  baseline: { residual: number; annualCor: number },
): number {
  const dRes = (baseline.residual - residual) / Math.max(20, baseline.residual);
  const dCor = (baseline.annualCor - annualCor) / Math.max(2000, baseline.annualCor);
  return 1.1 * dRes + 1.0 * dCor - 0.45 * totalEffort;
}

/** The best candidates, at most two ending on the same lever until half the beam is filled. */
function pickDiverse(candidates: BeamNode[], beamWidth: number): BeamNode[] {
  const picked: BeamNode[] = [];
  const seenLast = new Set<string>();
  for (const c of candidates) {
    const last = c.sequence[c.sequence.length - 1];
    if (seenLast.has(last) && picked.length >= beamWidth / 2) continue;
    seenLast.add(last);
    picked.push(c);
    if (picked.length >= beamWidth) break;
  }
  return picked;
}

/** Keeps the first (best) ordering of each set of levers; the same levers in another order add nothing. */
function distinctLeverSets(nodes: BeamNode[]): BeamNode[] {
  const seen = new Set<string>();
  return nodes.filter((n) => {
    const key = [...n.sequence].sort().join("+");
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
