/**
 * Unified threat / priority scoring for the Threat Assessment ops page.
 * Normalizes residual, SoD, SPOF, and scenario signals into PriorityTarget[].
 * Educational decision-support only — not a military system.
 */
import { findKnowledgeRisks, rankDangerousScenarios } from "./engine";
import { portfolioSummary, type ResidualRiskScore } from "./scoring/residual-engine";
import { detectSodConflicts, type DetectedConflict } from "./sod/detect";
import { mitigatedSodRuleIds } from "./controls/dual-release";
import { scoreLeadingIndicators } from "./ml/leading-indicators";
import {
  priorityBand,
  PRIORITY_BAND_LABEL,
  type PriorityBand,
  type PriorityTarget,
} from "./map-vision";
import type { PracticeProfile } from "./practice-profile";

export type ThreatSource = "residual" | "sod" | "spof" | "scenario" | "leading";

export interface ThreatTarget extends PriorityTarget {
  source: ThreatSource;
  callsign: string;
  retainedUsd?: number;
  heat: number;
  roe: string;
  processHint?: string;
}

export interface ThreatAssessmentReport {
  generatedAt: string;
  practiceName: string;
  overallPressure: number;
  overallBand: PriorityBand;
  overallLabel: string;
  targets: ThreatTarget[];
  matrix: { impact: number; likelihood: number; label: string; callsign: string }[];
  leadingPressure: number;
  leadingBand: string;
  sodHealth: number;
  criticalCount: number;
  whiteHotCount: number;
  recommendations: string[];
  classification: string;
  ao: string;
}

function impactBand(n: number): "HIGH" | "MED" | "LOW" {
  if (n >= 70) return "HIGH";
  if (n >= 45) return "MED";
  return "LOW";
}

export function buildThreatAssessment(profile: PracticeProfile): ThreatAssessmentReport {
  const staff = profile.staff;
  const riskVars = profile.riskVariables;
  const practiceName = profile.practiceName;
  const portfolio = portfolioSummary(staff);
  const sod = detectSodConflicts(staff, {
    dualReleaseMitigatedRuleIds: mitigatedSodRuleIds(profile.dualRelease),
  });
  const spofs = findKnowledgeRisks().filter((r) => r.soleOwner && r.riskScore >= 55);
  const ranked = rankDangerousScenarios({ staff, riskVariables: riskVars });
  const leading = scoreLeadingIndicators(staff, riskVars);

  const targets: ThreatTarget[] = [];
  let seq = 1;

  for (const item of portfolio.top.slice(0, 6)) {
    const priority = item.residual;
    targets.push({
      id: `res-${item.id}`,
      kind: item.category,
      label: item.name,
      priority,
      band: priorityBand(priority),
      heat: priority,
      impactHint: item.bandGuidance ?? item.bandLabel,
      reasons: item.drivers.slice(0, 3).map((d) => d.label),
      immediate: priority >= 78,
      source: "residual",
      callsign: `TGT-${String(seq++).padStart(2, "0")}`,
      roe:
        item.category === "control"
          ? "Engage dual-release / owner review this week"
          : "Open residual register · pull highest leverage lever",
    });
  }

  for (const c of sod.conflicts
    .filter((x) => x.severity === "critical" || x.severity === "high")
    .slice(0, 5)) {
    const priority = Math.min(96, c.score);
    targets.push({
      id: `sod-${c.id}`,
      kind: "control",
      label: c.title,
      priority,
      band: priorityBand(priority),
      heat: priority,
      impactHint: c.fraudPath,
      reasons: [
        `${c.personName} · ${c.role}`,
        `${c.labelA} + ${c.labelB}`,
        c.why.slice(0, 90),
      ],
      immediate: priority >= 78,
      source: "sod",
      callsign: `TGT-${String(seq++).padStart(2, "0")}`,
      roe: c.dualReleaseMitigated
        ? "Dual-release already mitigating — verify thresholds still enforced"
        : "Segregate duties or document compensating control + dual release",
    });
  }

  for (const s of spofs.slice(0, 3)) {
    const priority = Math.min(95, s.riskScore);
    targets.push({
      id: `spof-${s.knowledgeId}`,
      kind: "knowledge",
      label: s.name,
      priority,
      band: priorityBand(priority),
      heat: s.riskScore,
      impactHint: "Continuity + control opportunity if sole expert leaves",
      reasons: [
        "Sole knowledge owner",
        ...(s.owners?.slice(0, 1).map((o) => o.name) ?? []),
      ],
      immediate: priority >= 78,
      source: "spof",
      callsign: `TGT-${String(seq++).padStart(2, "0")}`,
      roe: "Cross-train a backup · document the procedure · re-score residual",
    });
  }

  for (const r of ranked.slice(0, 3)) {
    const retained =
      r.result.retainedImpact?.expected ?? r.result.financialImpact.expected;
    const priority = Math.min(
      96,
      Math.round(
        55 +
          Math.min(40, retained / 2500) +
          (r.result.timelineDays.p50 < 90 ? 8 : 0),
      ),
    );
    targets.push({
      id: `scn-${r.scenario.id}`,
      kind: "scenario",
      label: r.scenario.title,
      priority,
      band: priorityBand(priority),
      heat: priority,
      impactHint: `Retained ~$${Math.round(retained).toLocaleString()} · p50 ${r.result.timelineDays.p50}d`,
      reasons: [
        `Retained $${Math.round(retained).toLocaleString()}`,
        `p50 ${r.result.timelineDays.p50}d detection lag`,
      ],
      immediate: priority >= 78,
      source: "scenario",
      callsign: `TGT-${String(seq++).padStart(2, "0")}`,
      retainedUsd: retained,
      roe: "Run Precog scenario compare · select mitigation with best CoR drop",
    });
  }

  if (leading.pressureIndex >= 55) {
    const drivers = leading.indicators
      .filter((i) => i.status !== "ok")
      .slice(0, 3)
      .map((i) => i.label);
    targets.push({
      id: "leading-pressure",
      kind: "leading",
      label: `Leading-indicator pressure (${leading.band})`,
      priority: leading.pressureIndex,
      band: priorityBand(leading.pressureIndex),
      heat: leading.pressureIndex,
      impactHint: "Early-warning composite before loss materializes",
      reasons: drivers.length ? drivers : leading.topActions.slice(0, 3),
      immediate: leading.pressureIndex >= 78,
      source: "leading",
      callsign: `TGT-${String(seq++).padStart(2, "0")}`,
      roe: "Treat as early warning — tighten daily deposit ritual and bank rec",
    });
  }

  // De-dupe by label, keep highest priority
  const byLabel = new Map<string, ThreatTarget>();
  for (const t of targets) {
    const key = t.label.toLowerCase();
    const prev = byLabel.get(key);
    if (!prev || t.priority > prev.priority) byLabel.set(key, t);
  }
  const unique = Array.from(byLabel.values()).sort((a, b) => b.priority - a.priority);

  // Re-number callsigns after sort
  unique.forEach((t, i) => {
    t.callsign = `TGT-${String(i + 1).padStart(2, "0")}`;
  });

  const criticalCount = unique.filter(
    (t) => t.band === "critical" || t.band === "white_hot",
  ).length;
  const whiteHotCount = unique.filter((t) => t.band === "white_hot").length;
  const overallPressure = Math.round(
    unique.slice(0, 5).reduce((s, t) => s + t.priority, 0) /
      Math.max(1, Math.min(5, unique.length)),
  );
  const overallBand = priorityBand(overallPressure);

  const matrix = unique.slice(0, 9).map((t) => ({
    label: t.label,
    callsign: t.callsign,
    impact: Math.min(100, Math.round(t.retainedUsd ? t.retainedUsd / 1500 : t.priority * 0.9)),
    likelihood: Math.min(100, Math.round(t.heat * 0.95)),
  }));

  const recommendations: string[] = [];
  if (whiteHotCount > 0) {
    recommendations.push(
      `${whiteHotCount} WHITE HOT target(s) — owner action inside 7 days.`,
    );
  }
  if (sod.summary.critical > 0) {
    recommendations.push(
      `Close or dual-release-compensate ${sod.summary.critical} critical SoD conflict(s).`,
    );
  }
  if (spofs.length > 0) {
    recommendations.push(
      `Cross-train backups for ${spofs.length} knowledge SPOF(s).`,
    );
  }
  if (leading.pressureIndex >= 60) {
    recommendations.push(
      `Leading-indicator pressure is ${leading.band} — tighten daily deposit ritual.`,
    );
  }
  if (recommendations.length === 0) {
    recommendations.push(
      "No white-hot targets. Maintain weekly owner monitoring and re-scan after staff changes.",
    );
  }

  return {
    generatedAt: new Date().toISOString(),
    practiceName,
    overallPressure,
    overallBand,
    overallLabel: PRIORITY_BAND_LABEL[overallBand],
    targets: unique.slice(0, 12),
    matrix,
    leadingPressure: leading.pressureIndex,
    leadingBand: leading.band,
    sodHealth: sod.summary.segregationHealth,
    criticalCount,
    whiteHotCount,
    recommendations,
    classification: "PRACTICE INTERNAL · EDUCATIONAL",
    ao: practiceName.toUpperCase(),
  };
}

export { PRIORITY_BAND_LABEL };
