/**
 * Threat Assessment scoring — unifies residual, SoD, SPOF, and scenario
 * signals into a special-ops style priority target deck.
 *
 * Educational decision-support for dental practice owners.
 * "Threat" = control failure / residual risk / continuity exposure — never people.
 */
import { controls } from "../demo-data";
import { findKnowledgeRisks, rankDangerousScenarios } from "../engine";
import { detectSodConflicts } from "../sod/detect";
import { portfolioSummary } from "../scoring/residual-engine";
import { scoreLeadingIndicators } from "../ml/leading-indicators";
import {
  PRIORITY_BAND_LABEL,
  priorityBand,
  scorePriority,
  type PriorityBand,
  type PriorityTarget,
} from "../map-vision";
import type { StaffComposition } from "../types";
import type { RiskVariableState } from "../scoring/dynamic-variables";
import { mitigatedSodRuleIds } from "../controls/dual-release";
import type { DualReleasePolicy } from "../controls/dual-release";

export type ThreatDomain =
  | "control"
  | "sod"
  | "knowledge"
  | "scenario"
  | "leading"
  | "portfolio";

export interface ThreatTarget extends PriorityTarget {
  domain: ThreatDomain;
  residual?: number;
  expectedLoss?: number;
  p50Days?: number;
  roe: string[];
  classification: "WHITE HOT" | "CRITICAL" | "ELEVATED" | "WATCH" | "COLD";
}

export interface ThreatAssessmentReport {
  generatedAt: string;
  ao: string;
  overallThreatIndex: number;
  overallBand: PriorityBand;
  classificationLabel: string;
  leadingPressure: number;
  leadingBand: string;
  targetDeck: ThreatTarget[];
  matrix: { impact: number; likelihood: number; label: string; id: string }[];
  missionBrief: string[];
  roeSummary: string[];
  caveats: string[];
}

function bandToClassification(band: PriorityBand): ThreatTarget["classification"] {
  return PRIORITY_BAND_LABEL[band] as ThreatTarget["classification"];
}

export function buildThreatAssessment(input: {
  practiceName: string;
  staff: StaffComposition;
  riskVariables?: RiskVariableState;
  dualRelease?: DualReleasePolicy;
}): ThreatAssessmentReport {
  const { practiceName, staff, riskVariables, dualRelease } = input;
  const portfolio = portfolioSummary(staff);
  const sod = detectSodConflicts(staff, {
    dualReleaseMitigatedRuleIds: dualRelease
      ? mitigatedSodRuleIds(dualRelease)
      : undefined,
  });
  const knowledgeRisks = findKnowledgeRisks().filter(
    (r) => r.soleOwner || r.ownerCount === 0,
  );
  const ranked = rankDangerousScenarios({
    staff,
    riskVariables,
  });
  const leading = scoreLeadingIndicators(
    staff,
    riskVariables ?? {
      basePremiumAnnual: 2400,
      deductible: 2500,
      policyLimit: 100000,
      hasDualControl: staff.dualControlPayments,
      hasIndependentBankRec: staff.independentBankRec,
      hasSecurityCameras: false,
      claimsLoadFactor: 1,
      dailyCashExposure: 3500,
    },
  );

  const targets: ThreatTarget[] = [];

  for (const item of portfolio.top.slice(0, 6)) {
    const scored = scorePriority({
      heat: item.residual,
      kind:
        item.category === "knowledge"
          ? "knowledge"
          : item.category === "control"
            ? "control"
            : "process",
      residualScore: item.residual,
      soleOwner: item.category === "knowledge",
      controlOpen: item.category === "control" && item.controlEffectiveness < 50,
    });
    const band = priorityBand(scored.priority);
    targets.push({
      id: item.id,
      kind: item.category,
      label: item.name,
      priority: scored.priority,
      band,
      heat: item.residual,
      impactHint: scored.impactHint,
      reasons: scored.reasons.slice(0, 3),
      immediate: scored.immediate,
      domain:
        item.category === "knowledge"
          ? "knowledge"
          : item.category === "control"
            ? "control"
            : "portfolio",
      residual: item.residual,
      expectedLoss: item.expectedLoss,
      p50Days: item.p50Days,
      classification: bandToClassification(band),
      roe: deriveRoe(item.category, item.name, item.residual),
    });
  }

  for (const c of sod.conflicts.slice(0, 4)) {
    const heat = c.severity === "critical" ? 92 : c.severity === "high" ? 78 : 55;
    const scored = scorePriority({
      heat,
      kind: "control",
      controlOpen: true,
    });
    const band = priorityBand(scored.priority);
    targets.push({
      id: `sod-${c.ruleId}`,
      kind: "sod",
      label: c.title || c.ruleId,
      priority: scored.priority,
      band,
      heat,
      impactHint: scored.impactHint,
      reasons: [
        c.why?.slice(0, 120) || "Incompatible duties concentrated",
        ...scored.reasons,
      ].slice(0, 3),
      immediate: scored.immediate || c.severity === "critical",
      domain: "sod",
      residual: heat,
      classification: bandToClassification(band),
      roe: [
        "Apply dual-release threshold on the conflicting duty pair",
        "Owner weekly sample of the high-risk transaction class",
        "Document compensating control + residual acceptance date",
      ],
    });
  }

  for (const r of knowledgeRisks.slice(0, 4)) {
    const heat = Math.min(95, r.riskScore);
    const scored = scorePriority({
      heat,
      kind: "knowledge",
      soleOwner: r.soleOwner,
      residualScore: heat,
    });
    const band = priorityBand(scored.priority);
    targets.push({
      id: `spof-${r.knowledgeId}`,
      kind: "knowledge",
      label: r.name,
      priority: scored.priority,
      band,
      heat,
      impactHint: scored.impactHint,
      reasons: scored.reasons,
      immediate: scored.immediate,
      domain: "knowledge",
      residual: heat,
      classification: bandToClassification(band),
      roe: [
        "Cross-train a backup within 30 days",
        "Document the procedure in the practice playbook",
        "Re-score residual after backup is proficient",
      ],
    });
  }

  for (const row of ranked.slice(0, 3)) {
    const residualProxy = Math.min(
      95,
      Math.round(
        (row.result.retainedImpact?.expected ??
          row.result.financialImpact.expected) /
          2000 +
          (240 - row.result.timelineDays.p50) / 4,
      ),
    );
    const scored = scorePriority({
      heat: residualProxy,
      kind: "process",
      residualScore: residualProxy,
    });
    const band = priorityBand(scored.priority);
    targets.push({
      id: `scen-${row.scenario.id}`,
      kind: "scenario",
      label: row.scenario.title,
      processId: row.scenario.id,
      priority: scored.priority,
      band,
      heat: residualProxy,
      impactHint: scored.impactHint,
      reasons: [
        `p50 ${row.result.timelineDays.p50}d`,
        `Retained ~$${
          Math.round(
            row.result.retainedImpact?.expected ??
              row.result.financialImpact.expected,
          ).toLocaleString()
        }`,
      ],
      immediate: scored.immediate,
      domain: "scenario",
      residual: residualProxy,
      expectedLoss:
        row.result.retainedImpact?.expected ??
        row.result.financialImpact.expected,
      p50Days: row.result.timelineDays.p50,
      classification: bandToClassification(band),
      roe: [
        "Run Precog scenario compare (do-nothing vs controls)",
        "Pull highest tornado lever for this path",
        "Schedule owner review of linked residual acceptance",
      ],
    });
  }

  const seen = new Set<string>();
  const deck = targets
    .filter((t) => {
      const key = t.label.toLowerCase().slice(0, 40);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((a, b) => b.priority - a.priority)
    .slice(0, 10);

  const overallThreatIndex = Math.round(
    deck.slice(0, 5).reduce((s, t) => s + t.priority, 0) /
      Math.max(1, Math.min(5, deck.length)),
  );
  const overallBand = priorityBand(overallThreatIndex);

  const matrix = deck.slice(0, 8).map((t) => ({
    id: t.id,
    label: t.label,
    impact: Math.min(
      100,
      Math.round(
        t.expectedLoss
          ? Math.min(100, t.expectedLoss / 1500)
          : t.heat * 0.9,
      ),
    ),
    likelihood: Math.min(
      100,
      Math.round(t.heat * 0.85 + (t.immediate ? 10 : 0)),
    ),
  }));

  const openSod = controls.filter((c) => !c.segregated).length;

  return {
    generatedAt: new Date().toISOString(),
    ao: practiceName,
    overallThreatIndex,
    overallBand,
    classificationLabel: bandToClassification(overallBand),
    leadingPressure: leading.pressureIndex,
    leadingBand: leading.band,
    targetDeck: deck,
    matrix,
    missionBrief: [
      `AO: ${practiceName} — small dental practice residual & control assessment.`,
      `Portfolio avg residual ${portfolio.averageResidual} · critical path ${portfolio.criticalPath} · act-now ${portfolio.actNow}.`,
      `SoD: ${sod.summary.critical} critical conflict(s), ${openSod} static segregation gap(s).`,
      `Knowledge SPOFs: ${knowledgeRisks.length} sole-owner / unowned critical item(s).`,
      `Leading pressure ${leading.pressureIndex}/100 (${leading.band}).`,
      "This is an educational internal-control screen — not an accusation against any person.",
    ],
    roeSummary: [
      "Prioritize WHITE HOT / CRITICAL targets first.",
      "Prefer detective controls with same-week ROI (owner bank rec, dual-release thresholds).",
      "Document residual acceptance with review date when further control is not cost-effective.",
      "Cross-train SPOF knowledge before the next key-person absence.",
    ],
    caveats: [
      "Threat Assessment is decision-support for process and control design.",
      "It never labels individuals as threats; targets are control gaps and residual exposures.",
      "Sample sizes, demo priors, and industry statistics are educational — not forensic conclusions.",
    ],
  };
}

function deriveRoe(category: string, name: string, residual: number): string[] {
  const lower = name.toLowerCase();
  if (
    lower.includes("cash") ||
    lower.includes("deposit") ||
    lower.includes("payment")
  ) {
    return [
      "Owner independent bank reconciliation this week",
      "Dual control on deposit bag / day-sheet match",
      "Camera coverage of cash drawer if not already present",
    ];
  }
  if (
    lower.includes("write") ||
    lower.includes("adjust") ||
    lower.includes("ar")
  ) {
    return [
      "Require reason codes + owner threshold on write-offs",
      "Monthly aging of adjustments report",
      "Separate adjuster from payment poster when staffing allows",
    ];
  }
  if (
    lower.includes("vendor") ||
    lower.includes("ap") ||
    lower.includes("payable")
  ) {
    return [
      "Dual approval for new vendor setup",
      "Monthly new-vendor review by owner",
      "Separate vendor master from payment release",
    ];
  }
  if (category === "knowledge") {
    return [
      "Cross-train backup within 30 days",
      "Write the procedure into the practice playbook",
      "Re-score residual after backup proficiency",
    ];
  }
  if (residual >= 70) {
    return [
      "Open Precog scenario for financial timeline",
      "Pull top tornado control lever",
      "Schedule 15-min owner control review",
    ];
  }
  return [
    "Monitor leading indicators weekly",
    "Confirm compensating control is documented",
    "Revisit at next residual acceptance review",
  ];
}
