/**
 * Control effectiveness — the auditor's two questions, scored 0–100:
 *   Design:    is the control built to catch the risk? (segregation, compensating controls,
 *              accepted residual, and whether it's mapped to the processes it should cover)
 *   Operating: does it actually run? (evidence items on the processes it covers — current,
 *              overdue, never recorded — and how recently they were completed)
 * "No evidence yet" is neutral (operating unknown) so untouched maps aren't penalised.
 */
import { evidenceStatus } from "./evidence";
import type { ControlItem, EvidenceItem, ProcessNode } from "../types";

export interface ControlEffectiveness {
  control: ControlItem;
  design: number;
  /** null when no evidence exists on any covered process. */
  operating: number | null;
  overall: number;
  band: "strong" | "adequate" | "weak" | "failing";
  coveredProcesses: ProcessNode[];
  evidence: { process: ProcessNode; item: EvidenceItem; status: ReturnType<typeof evidenceStatus>["status"] }[];
  evidenceCurrent: number;
  evidenceOverdue: number;
  evidenceNever: number;
  notes: string[];
}

export interface EffectivenessSummary {
  controls: ControlEffectiveness[];
  avgDesign: number;
  /** null when nothing has evidence. */
  avgOperating: number | null;
  avgOverall: number;
  weakest: ControlEffectiveness | null;
  unmapped: ControlItem[];
}

function band(score: number): ControlEffectiveness["band"] {
  if (score >= 80) return "strong";
  if (score >= 60) return "adequate";
  if (score >= 40) return "weak";
  return "failing";
}

export function scoreControl(control: ControlItem, processes: ProcessNode[], now = Date.now()): ControlEffectiveness {
  const covered = processes.filter((p) => p.controlIds.includes(control.id));
  const notes: string[] = [];

  // Design: start from segregation, credit compensating controls, debit accepted residual, debit unmapped.
  let design = control.segregated ? 85 : 45;
  if (!control.segregated && control.compensatingControls.length) {
    design += Math.min(20, control.compensatingControls.length * 10);
    notes.push(`${control.compensatingControls.length} compensating control(s) offset the SoD gap`);
  }
  if (control.residualRiskAccepted) {
    design -= 10;
    notes.push("Residual risk formally accepted — keep the acceptance under review");
  }
  if (!covered.length) {
    design -= 25;
    notes.push("Not mapped to any process — it can't be evidenced");
  } else if (covered.some((p) => !(p.ownerPersonIds ?? []).length)) {
    design -= 8;
    notes.push("A covered process has no owner");
  }
  design = Math.max(0, Math.min(100, design));

  // Operating: evidence on covered processes.
  const evidence: ControlEffectiveness["evidence"] = [];
  for (const p of covered) {
    for (const item of p.evidence ?? []) {
      evidence.push({ process: p, item, status: evidenceStatus(item, now).status });
    }
  }
  const current = evidence.filter((e) => e.status === "current" || e.status === "due_soon").length;
  const overdue = evidence.filter((e) => e.status === "overdue").length;
  const never = evidence.filter((e) => e.status === "never").length;

  let operating: number | null = null;
  if (evidence.length) {
    // Current = full credit, overdue = partial (it did run once), never = none.
    const raw = (current * 1 + overdue * 0.35) / evidence.length;
    operating = Math.round(raw * 100);
    // Recency bonus: something completed in the last 30 days shows the control is alive.
    const recent = evidence.some(
      (e) => e.item.lastDoneAt && now - new Date(e.item.lastDoneAt).getTime() < 30 * 86_400_000,
    );
    if (recent) operating = Math.min(100, operating + 5);
    if (overdue) notes.push(`${overdue} review(s) overdue`);
    if (never) notes.push(`${never} review(s) never recorded`);
  } else if (covered.length) {
    notes.push("No evidence items yet — add a review so operation can be proven");
  }

  // Overall: design-only when operating is unknown; otherwise weight operation more —
  // a well-designed control nobody runs is the classic audit finding.
  const overall = operating === null ? Math.round(design * 0.9) : Math.round(design * 0.4 + operating * 0.6);

  return {
    control,
    design,
    operating,
    overall,
    band: band(overall),
    coveredProcesses: covered,
    evidence,
    evidenceCurrent: current,
    evidenceOverdue: overdue,
    evidenceNever: never,
    notes,
  };
}

export function summarizeEffectiveness(controls: ControlItem[], processes: ProcessNode[], now = Date.now()): EffectivenessSummary {
  const scored = controls.map((c) => scoreControl(c, processes, now)).sort((a, b) => a.overall - b.overall);
  const withOp = scored.filter((s) => s.operating !== null);
  const avg = (xs: number[]) => (xs.length ? Math.round(xs.reduce((a, b) => a + b, 0) / xs.length) : 0);
  return {
    controls: scored,
    avgDesign: avg(scored.map((s) => s.design)),
    avgOperating: withOp.length ? avg(withOp.map((s) => s.operating as number)) : null,
    avgOverall: avg(scored.map((s) => s.overall)),
    weakest: scored[0] ?? null,
    unmapped: scored.filter((s) => !s.coveredProcesses.length).map((s) => s.control),
  };
}
