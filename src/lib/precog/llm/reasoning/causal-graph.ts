/**
 * Multi-hop causal paths over this app's risk graph: controls and insurance
 * terms at the roots, the owner's decision at the end. Edge weights are this
 * app's, and one sign convention holds throughout: a positive weight means
 * "more of the source means more exposure or more pressure to act".
 */

export type CausalNodeId =
  | "dual_control"
  | "bank_rec"
  | "cameras"
  | "segregation"
  | "spof"
  | "deductible"
  | "premium"
  | "likelihood"
  | "severity"
  | "detection_lag"
  | "retained_loss"
  | "annual_cor"
  | "residual_portfolio"
  | "timeline_p50"
  | "owner_decision";

export interface CausalPath {
  /** Product of the edge weights along the path. */
  score: number;
  narrative: string;
}

interface CausalEdge {
  from: CausalNodeId;
  to: CausalNodeId;
  /** Signed influence; see the file header for the sign convention. */
  weight: number;
  label: string;
}

/** For each intervention: its strongest paths to the owner's decision and their signed sum. */
export function summarizeCausalInfluence<T extends CausalNodeId>(
  interventions: T[],
): { intervention: T; topPaths: CausalPath[]; netToDecision: number }[] {
  return interventions.map((intervention) => {
    const topPaths = findCausalPaths(intervention, "owner_decision", 4, 5);
    const netToDecision = topPaths.reduce((s, p) => s + p.score, 0);
    return { intervention, topPaths, netToDecision };
  });
}

/**
 * Every path from start to goal of at most maxEdges edges, strongest first
 * (by the magnitude of the product of edge weights), cut to maxPaths.
 */
function findCausalPaths(
  start: CausalNodeId,
  goal: CausalNodeId,
  maxEdges: number,
  maxPaths: number,
): CausalPath[] {
  const paths: CausalPath[] = [];

  function dfs(node: CausalNodeId, trail: CausalNodeId[], edges: CausalEdge[], score: number) {
    if (node === goal && edges.length > 0) {
      const narrative = edges.map((e) => `${e.from}→${e.to} (${e.label})`).join("; ");
      paths.push({ score, narrative });
      return;
    }
    if (edges.length >= maxEdges) return;
    for (const e of neighbors(node)) {
      if (trail.includes(e.to)) continue;
      dfs(e.to, [...trail, e.to], [...edges, e], score * e.weight);
    }
  }

  dfs(start, [start], [], 1);
  return paths.sort((a, b) => Math.abs(b.score) - Math.abs(a.score)).slice(0, maxPaths);
}

function neighbors(from: CausalNodeId): CausalEdge[] {
  return CAUSAL_EDGES.filter((e) => e.from === from);
}

const CAUSAL_EDGES: CausalEdge[] = [
  { from: "dual_control", to: "likelihood", weight: -0.9, label: "cuts fraud opportunity" },
  { from: "dual_control", to: "severity", weight: -0.45, label: "limits scheme size" },
  { from: "dual_control", to: "premium", weight: -0.35, label: "unlocks carrier credit" },
  { from: "bank_rec", to: "detection_lag", weight: -0.85, label: "shortens detection" },
  { from: "bank_rec", to: "severity", weight: -0.4, label: "cuts cumulative loss" },
  { from: "bank_rec", to: "premium", weight: -0.25, label: "unlocks recon credit" },
  { from: "cameras", to: "likelihood", weight: -0.35, label: "deterrence" },
  { from: "cameras", to: "premium", weight: -0.2, label: "camera credit" },
  { from: "segregation", to: "likelihood", weight: -0.5, label: "SoD design" },
  { from: "segregation", to: "residual_portfolio", weight: -0.7, label: "staff residual uplift" },
  { from: "spof", to: "residual_portfolio", weight: 0.75, label: "continuity residual" },
  { from: "spof", to: "detection_lag", weight: 0.3, label: "process thrash hides issues" },
  { from: "likelihood", to: "retained_loss", weight: 0.6, label: "more events → more retained" },
  { from: "severity", to: "retained_loss", weight: 0.85, label: "gross severity feeds retained" },
  { from: "detection_lag", to: "severity", weight: 0.55, label: "longer lag → larger schemes" },
  {
    from: "detection_lag",
    to: "timeline_p50",
    weight: 0.5,
    label: "longer lag stretches the days until found",
  },
  {
    from: "deductible",
    to: "retained_loss",
    weight: 0.7,
    label: "higher deductible floors retained",
  },
  { from: "premium", to: "annual_cor", weight: 0.65, label: "premium is CoR component" },
  { from: "retained_loss", to: "annual_cor", weight: 0.8, label: "annualized retained in CoR" },
  {
    from: "retained_loss",
    to: "residual_portfolio",
    weight: 0.4,
    label: "loss expectation elevates residual",
  },
  {
    from: "residual_portfolio",
    to: "owner_decision",
    weight: 0.9,
    label: "residual drives act/accept",
  },
  { from: "annual_cor", to: "owner_decision", weight: 0.85, label: "CoR prices the decision" },
  { from: "timeline_p50", to: "owner_decision", weight: 0.35, label: "urgency signal" },
];
