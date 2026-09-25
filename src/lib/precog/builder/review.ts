/**
 * Whole-map review: plain-English critique of the value stream.
 * Shared input shape + deterministic fallback used when Grok isn't available.
 */
import { HEAT_BANDS } from "../process-graph";
import { HEALTH_SCALE } from "../scoring/bands";
import { personLabel } from "../person-label";
import type { GrokAccess } from "../llm/types";

interface ReviewProcessInput {
  id: string;
  name: string;
  stage: number;
  owners: string[];
  controls: string[];
  riskTitles: string[];
  fraudRisks: number;
  heat: number;
  dependencyCount: number;
  openSodGaps: number;
}

export interface ReviewInput {
  businessName: string;
  industryLabel: string;
  teamSize: number;
  health: {
    score: number;
    band: string;
    dimensions: { label: string; score: number; hint: string }[];
  };
  processes: ReviewProcessInput[];
  issues: string[];
  overburdened: { name: string; role: string; flags: string[] }[];
  unownedProcesses: string[];
}

interface ReviewSection {
  heading: string;
  points: string[];
}

export interface MapReview {
  source: "grok" | "local";
  model?: string;
  grokStatus?: GrokAccess;
  headline: string;
  grade: "A" | "B" | "C" | "F";
  sections: ReviewSection[];
  nextMove: string;
  /** Process ids referenced so the UI can deep-link. */
  focusProcessIds: string[];
}

export function gradeFromScore(score: number): MapReview["grade"] {
  // Same cutoffs as every other health index in the app.
  if (score >= HEALTH_SCALE.strong) return "A";
  if (score >= HEALTH_SCALE.adequate) return "B";
  if (score >= HEALTH_SCALE.weak) return "C";
  return "F";
}

export function reviewLocally(input: ReviewInput): MapReview {
  const grade = gradeFromScore(input.health.score);
  const weakest = [...input.health.dimensions].sort((a, b) => a.score - b.score)[0];
  const hot = [...input.processes]
    .filter((p) => p.heat >= HEAT_BANDS.hot)
    .sort((a, b) => b.heat - a.heat);
  const unowned = input.processes.filter((p) => !p.owners.length);
  const noControls = input.processes.filter((p) => !p.controls.length && p.fraudRisks > 0);
  const stages = new Set(input.processes.map((p) => p.stage));
  const focus = new Set<string>();

  const strengths: string[] = [];
  const owned = input.processes.length - unowned.length;
  if (owned === input.processes.length && input.processes.length)
    strengths.push("Every process has a named owner — accountability is clear.");
  else if (owned / Math.max(1, input.processes.length) >= 0.75)
    strengths.push(`${owned} of ${input.processes.length} processes have owners.`);
  const controlled = input.processes.filter((p) => p.controls.length).length;
  if (controlled / Math.max(1, input.processes.length) >= 0.75)
    strengths.push(`Controls are mapped on ${controlled} of ${input.processes.length} processes.`);
  if (stages.size >= 3)
    strengths.push(
      `The map reads left-to-right across ${stages.size} stages — a real value stream, not a list.`,
    );
  if (!input.issues.length)
    strengths.push("No structural issues: no cycles, dangling links, or broken references.");
  if (!strengths.length)
    strengths.push(
      "You have a starting map, which is what every other check in this tool works from.",
    );

  const gaps: string[] = [];
  for (const p of hot.slice(0, 3)) {
    focus.add(p.id);
    gaps.push(
      `"${p.name}" runs hot (${p.heat})${p.openSodGaps ? ` with ${p.openSodGaps} open SoD gap(s)` : ""}${
        p.riskTitles[0] ? ` — top risk: ${p.riskTitles[0]}` : ""
      }.`,
    );
  }
  for (const p of unowned.slice(0, 3)) {
    focus.add(p.id);
    gaps.push(`"${p.name}" has no owner, so nobody is accountable when it fails.`);
  }
  for (const p of noControls.slice(0, 2)) {
    focus.add(p.id);
    gaps.push(`"${p.name}" lists fraud risk but no control — the risk is described, not managed.`);
  }
  for (const issue of input.issues.slice(0, 2)) gaps.push(issue);
  if (!gaps.length)
    gaps.push(
      "No glaring gaps. The remaining work is tightening evidence: who reviews what, and how often.",
    );

  const people: string[] = [];
  for (const o of input.overburdened.slice(0, 2)) {
    people.push(
      `${personLabel(o.name, o.role)} is carrying too much: ${o.flags.slice(0, 2).join("; ")}.`,
    );
  }
  if (input.teamSize <= 6)
    people.push(
      "With a team this small, perfect segregation isn't realistic — lean on owner review, dual release on payments, and an independent bank reconciliation as compensating controls.",
    );
  if (!people.length)
    people.push("Workload looks balanced; no single person concentrates the risk.");

  const moves: string[] = [];
  if (unowned.length)
    moves.push(`Assign owners to ${unowned.length} unowned process(es) — use Validate → Fix.`);
  if (noControls.length)
    moves.push(
      `Map at least one control to each fraud-exposed process (${noControls.length} today).`,
    );
  if (hot[0])
    moves.push(
      `Open "${hot[0].name}" and decide: remediate, compensate, or accept the residual — then log it in the Journal.`,
    );
  if (input.overburdened[0])
    moves.push(
      `Reassign one process away from ${input.overburdened[0].name} using Workload → Reassign.`,
    );
  if (weakest)
    moves.push(
      `Your weakest dimension is ${weakest.label} (${weakest.score}) — ${weakest.hint.toLowerCase()}.`,
    );
  if (!moves.length)
    moves.push("Snapshot this version, then revisit monthly as the team and processes change.");

  const nextMove = unowned.length
    ? `Assign an owner to "${unowned[0].name}" this week.`
    : hot[0]
      ? `Decide how you'll treat the risk on "${hot[0].name}" — remediate, compensate, or accept — and journal it.`
      : input.overburdened[0]
        ? `Move one process off ${input.overburdened[0].name} to spread the load.`
        : "Save a snapshot and schedule a 15-minute review in 30 days.";

  const headline =
    grade === "A"
      ? `Strong map — ${input.health.score}/100. Keep it current.`
      : grade === "B"
        ? `Solid foundation at ${input.health.score}/100; ${weakest?.label.toLowerCase() ?? "a few areas"} needs attention.`
        : grade === "C"
          ? `Workable but exposed — ${input.health.score}/100. Ownership and controls need tightening.`
          : `Significant gaps at ${input.health.score}/100 — act on the next move before adding detail.`;

  return {
    source: "local",
    headline,
    grade,
    sections: [
      { heading: "What's working", points: strengths.slice(0, 4) },
      { heading: "Biggest gaps", points: gaps.slice(0, 5) },
      { heading: "People and load", points: people.slice(0, 3) },
      { heading: "Recommended moves", points: moves.slice(0, 5) },
    ],
    nextMove,
    focusProcessIds: [...focus].slice(0, 6),
  };
}
