/**
 * Threat Assessment scoring — unifies residual, SoD, SPOF, and scenario
 * signals into a special-ops style priority target deck.
 *
 * Educational decision-support for small business owners.
 * "Threat" = control failure / residual risk / continuity exposure — never people.
 *
 * Only what describes this business counts: register items once someone is
 * marked on them, and scenarios in scope (every scenario of the sample
 * business; for an owner's own people only the starter scenarios they
 * confirmed, see scoring/scope).
 */
import { findKnowledgeRisks, rankDangerousScenarios } from "./engine";
import type { IndustryTemplate } from "./templates";
import { industryNoun } from "./industry";
import { controlOptions, detectSodConflicts, sodDetectionOptions } from "./sod/detect";
import { openFindings, partialDualReleaseCoverage } from "./sod/open-findings";
import { portfolioSummary } from "./scoring/residual-engine";
import { DEFAULT_WEIGHTS } from "./scoring/weights";
import { registerAssessed } from "./continuity/register-state";
import {
  MAKE_SCENARIO_YOURS,
  REGISTER_NOT_ASSESSED,
  isOwnBusiness,
  starterScenarioLabel,
  starterScenariosLeftOut,
} from "./scoring/scope";
import { priorityBand, scorePriority, type PriorityTarget } from "./map-vision";
import type { StaffComposition } from "./types";
import {
  DEFAULT_RISK_VARIABLES,
  insuranceFigureNote,
  type RiskVariableState,
} from "./scoring/dynamic-variables";
import type { DualReleasePolicy } from "./controls/dual-release";
import { formatEstimateUsd } from "../utils";
import { count } from "./text";

type ThreatDomain = "control" | "sod" | "knowledge" | "scenario" | "portfolio";

interface ThreatAssessmentReport {
  ao: string;
  targetDeck: ThreatTarget[];
  /** Items in the top band across every target, not only the ten the list shows. */
  fixFirst: number;
  missionBrief: string[];
  roeSummary: string[];
  caveats: string[];
}

interface ThreatTarget extends PriorityTarget {
  domain: ThreatDomain;
  /**
   * The kinds of row grouped into this one, the leading row's first: a duty
   * conflict, the control that splits it and the scenario that plays it out
   * are one weakness, listed once. Absent on a version locked before rows
   * were grouped.
   */
  kinds?: string[];
  /** The ids of the rows grouped into this one, the leading row's first. */
  members?: string[];
  residual?: number;
  /**
   * The scenario's assumed loss after insurance (the retained loss) under the
   * owner's settings, on every row that carries one.
   */
  expectedLoss?: number;
  p50Days?: number;
  roe: string[];
}

/** What the Priority figure is, for any table or card that prints it. */
const THREAT_PRIORITY_BASIS =
  "Priority is this app's ranking index, 0 to 100: it orders what to look at first and measures nothing.";

export function buildThreatAssessment(input: {
  tpl: IndustryTemplate;
  practiceName: string;
  staff: StaffComposition;
  riskVariables?: RiskVariableState;
  dualRelease?: DualReleasePolicy;
  /** Starter scenarios the owner confirmed as their own (see scoring/scope). */
  confirmedScenarioIds?: ReadonlySet<string>;
}): ThreatAssessmentReport {
  const { tpl, practiceName, staff, riskVariables, dualRelease, confirmedScenarioIds } = input;
  const portfolio = portfolioSummary(tpl, staff, DEFAULT_WEIGHTS, {
    confirmedScenarioIds,
    riskVariables,
  });
  // The same reading as every other screen: the business's own control
  // records, and a dual-release channel only when the team can operate it.
  const sod = detectSodConflicts(
    tpl,
    staff,
    dualRelease ? sodDetectionOptions(tpl, dualRelease) : controlOptions(tpl),
  );
  const knowledgeRisks = findKnowledgeRisks(tpl).filter((r) => r.soleOwner || r.ownerCount === 0);
  const ranked = rankDangerousScenarios(tpl, {
    staff,
    riskVariables,
    confirmedScenarioIds,
  });
  const scenariosLeftOut = starterScenariosLeftOut(tpl, confirmedScenarioIds).length;
  const policyNote = insuranceFigureNote(
    { ...DEFAULT_RISK_VARIABLES, ...(riskVariables ?? {}) },
    isOwnBusiness(tpl),
  );
  // One basis for every loss figure in the deck: the ranked scenario's
  // retained loss under the owner's settings.
  const rankedById = new Map(ranked.map((row) => [row.scenario.id, row]));

  const targets: KeyedTarget<ThreatTarget>[] = [];
  const scenarioKeys = (id: string | undefined): string[] => {
    const s = id ? tpl.scenarios.find((x) => x.id === id) : undefined;
    if (!s) return [];
    return [
      `scenario:${s.id}`,
      ...(s.controlId ? [`control:${s.controlId}`] : []),
      ...(s.sodRuleIds ?? []).map((r) => `pair:${r}`),
    ];
  };

  for (const item of portfolio.top.slice(0, 6)) {
    const scenarioRow =
      item.category === "scenario" && item.linkedScenarioId
        ? rankedById.get(item.linkedScenarioId)
        : undefined;
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
    const keys =
      item.category === "scenario"
        ? scenarioKeys(item.linkedScenarioId)
        : item.category === "knowledge"
          ? item.linkedKnowledgeId
            ? [`knowledge:${item.linkedKnowledgeId}`]
            : []
          : [
              ...(item.linkedControlId ? [`control:${item.linkedControlId}`] : []),
              ...(item.linkedScenarioId ? [`scenario:${item.linkedScenarioId}`] : []),
            ];
    targets.push({
      keys,
      target: {
        id: item.id,
        kind: item.category,
        label: item.name,
        processId: scenarioRow?.scenario.id,
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
        expectedLoss: scenarioRow ? retainedLoss(scenarioRow.result) : undefined,
        p50Days: scenarioRow?.result.timelineDays.p50 ?? item.p50Days,
        roe: deriveRoe(item.category, item.name, item.residual),
      },
    });
  }

  // Open findings only, as Start here and the report count them: an owner's
  // own pair is error and tax exposure, not a theft target, and a pair dual
  // release closes at every amount needs no card; an accepted pair stays open.
  // One card per gap: two people holding the same pair are one target.
  const sodTargets = openFindings(
    sod.conflicts,
    dualRelease ? partialDualReleaseCoverage(dualRelease, sod.conflicts) : new Map(),
  ).filter((c, i, all) => all.findIndex((o) => o.ruleId === c.ruleId) === i);
  for (const c of sodTargets.slice(0, 4)) {
    const heat =
      SOD_HEAT[c.severity === "critical" || c.severity === "high" ? c.severity : "other"];
    const scored = scorePriority({
      heat,
      kind: "control",
      controlOpen: true,
    });
    const band = priorityBand(scored.priority);
    targets.push({
      pair: c.ruleId,
      keys: [
        `pair:${c.ruleId}`,
        ...(c.linkedControlId ? [`control:${c.linkedControlId}`] : []),
        ...(c.linkedScenarioId ? [`scenario:${c.linkedScenarioId}`] : []),
      ],
      target: {
        id: `sod-${c.ruleId}`,
        kind: "sod",
        label: c.title || c.ruleId,
        priority: scored.priority,
        band,
        heat,
        impactHint: scored.impactHint,
        reasons: [c.why || "Incompatible duties concentrated", ...scored.reasons].slice(0, 3),
        immediate: scored.immediate || c.severity === "critical",
        domain: "sod",
        residual: heat,
        roe: [
          "Apply dual-release threshold on the conflicting duty pair",
          "Owner weekly sample of the high-risk transaction class",
          "Document compensating control + residual acceptance date",
        ],
      },
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
      keys: [`knowledge:${r.knowledgeId}`],
      target: {
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
        roe: [
          "Cross-train a stand-in within 30 days",
          "Document the procedure in the business playbook",
          "Re-score residual risk once the stand-in can do the work",
        ],
      },
    });
  }

  for (const row of ranked.slice(0, 3)) {
    // The scenario's heat is its own residual-risk row, the labelled index
    // the Residual radar shows for the same scenario. Register and control
    // rows can also link to the scenario (a departure scenario names the item
    // the leaver holds), so the scenario row is found by its id.
    const residualProxy =
      portfolio.all.find((r) => r.category === "scenario" && r.linkedScenarioId === row.scenario.id)
        ?.residual ?? 0;
    const scored = scorePriority({
      heat: residualProxy,
      kind: "process",
      residualScore: residualProxy,
    });
    const band = priorityBand(scored.priority);
    targets.push({
      keys: scenarioKeys(row.scenario.id),
      target: {
        id: `scen-${row.scenario.id}`,
        kind: "scenario",
        label: row.scenario.title,
        processId: row.scenario.id,
        priority: scored.priority,
        band,
        heat: residualProxy,
        impactHint: scored.impactHint,
        reasons: [
          `about ${row.result.timelineDays.p50} assumed days until found`,
          `Retained ${formatEstimateUsd(retainedLoss(row.result))}${policyNote ? ` (${policyNote})` : ""}`,
        ],
        immediate: scored.immediate,
        domain: "scenario",
        residual: residualProxy,
        expectedLoss: retainedLoss(row.result),
        p50Days: row.result.timelineDays.p50,
        roe: [
          "Run Precog scenario compare (do-nothing vs controls)",
          "Pull highest tornado lever for this path",
          "Schedule owner review of linked residual acceptance",
        ],
      },
    });
  }

  const allTargets = groupTargets(targets);
  const deck = allTargets.slice(0, LIST_SIZE);

  const openSod = tpl.controls.filter((c) => !c.segregated).length;
  const soleHeld = knowledgeRisks.filter((r) => r.soleOwner).length;
  const unheld = knowledgeRisks.filter((r) => r.ownerCount === 0).length;

  return {
    ao: practiceName,
    targetDeck: deck,
    fixFirst: fixFirstCount(allTargets),
    missionBrief: [
      `${practiceName}: where money can move without a second person in this ${industryNoun(tpl.id)}, and what to fix first.`,
      `Residual risks by band on Precog's index: ${count(portfolio.criticalPath, "item")} to fix first, ${portfolio.actNow} to fix soon and ${portfolio.mitigate} worth doing.`,
      `Duties: ${count(sod.summary.critical, "critical duty conflict")}; ${count(openSod, "control")} the template lists as not yet separated.`,
      registerAssessed(tpl)
        ? `Know-how: ${count(soleHeld, "item")} only one person can do; ${unheld} nobody can.`
        : `Know-how: ${REGISTER_NOT_ASSESSED}`,
      ...(scenariosLeftOut > 0
        ? [
            `Scenarios: ${starterScenarioLabel(tpl.id)} (${scenariosLeftOut}): Precog leaves them out. ${MAKE_SCENARIO_YOURS}`,
          ]
        : []),
      "This is an educational internal-control screen — not an accusation against any person.",
    ],
    roeSummary: [
      "Work on the highest-priority items first.",
      "Prefer checks that pay off within a week, such as the owner reconciling the bank or a second signer above a set amount.",
      "When a further control is not worth its cost, record that you accept the remaining risk and when you will review it.",
      "Cross-train a stand-in for any duty only one person can do before that person's next absence.",
    ],
    caveats: [
      "This assessment supports decisions about process and control design.",
      "The indices are this app's weightings of your answers; the case figures describe other businesses. Neither is a finding about any person.",
      THREAT_PRIORITY_BASIS,
    ],
  };
}

/**
 * A row before grouping, with the weaknesses it describes: `pair:<rule id>`
 * for a duty pair, `control:<id>` for a control, `scenario:<id>` and
 * `knowledge:<id>`. `pair` is set on a duty-conflict row itself; two duty
 * pairs are two weaknesses even when one control answers both.
 */
interface KeyedTarget<T> {
  target: T;
  keys: readonly string[];
  pair?: string;
}

/** The fields a grouped row adds: its kinds and its rows, the leading row's first. */
interface Grouped {
  kinds: string[];
  members: string[];
}

type Groupable = Pick<PriorityTarget, "label" | "priority"> &
  Partial<Pick<PriorityTarget, "id" | "kind">> & { expectedLoss?: number; p50Days?: number };

/** Rows shown on the list: one per weakness, highest priority first, at most ten. */
export function rankTargets<T extends Groupable>(
  targets: readonly (T | KeyedTarget<T>)[],
): (T & Grouped)[] {
  return groupTargets(targets.map((t) => ("target" in t ? t : { target: t, keys: [] }))).slice(
    0,
    LIST_SIZE,
  );
}

/**
 * Every weakness once, highest priority first. Rows are taken in priority
 * order; a row joins the group it shares the most weaknesses with (the
 * higher one on a tie), else starts its own. A duty conflict, the control
 * that splits it and the scenario that plays it out share a weakness, so
 * they read as one row tagged "Duty conflict · Control · Scenario". Two duty
 * conflicts never share a row. Rows whose labels open with the same 40
 * characters are one weakness too. A group keeps its leading row's figures,
 * and the first loss any of its rows carries.
 */
function groupTargets<T extends Groupable>(rows: readonly KeyedTarget<T>[]): (T & Grouped)[] {
  const sorted = rows
    .map((row, order) => ({ row, order }))
    .sort((a, b) => b.row.target.priority - a.row.target.priority || a.order - b.order)
    .map(({ row }) => row);
  const groups: { keys: Set<string>; pair: boolean; rows: T[] }[] = [];
  for (const row of sorted) {
    const keys = [...row.keys, `label:${row.target.label.toLowerCase().slice(0, 40)}`];
    let best: (typeof groups)[number] | undefined;
    let bestShared = 0;
    for (const group of groups) {
      if (row.pair && group.pair) continue;
      const shared = keys.filter((k) => group.keys.has(k)).length;
      if (shared > bestShared) {
        best = group;
        bestShared = shared;
      }
    }
    if (best) {
      for (const k of keys) best.keys.add(k);
      best.pair ||= row.pair !== undefined;
      best.rows.push(row.target);
    } else {
      groups.push({ keys: new Set(keys), pair: row.pair !== undefined, rows: [row.target] });
    }
  }
  return groups.map(({ rows: [lead, ...rest] }) => {
    const loss =
      lead.expectedLoss === undefined ? rest.find((m) => m.expectedLoss !== undefined) : undefined;
    return {
      ...lead,
      ...(loss ? { expectedLoss: loss.expectedLoss, p50Days: loss.p50Days } : {}),
      kinds: [...new Set([lead, ...rest].flatMap((m) => (m.kind ? [m.kind] : [])))],
      members: [...new Set([lead, ...rest].map((m) => m.id ?? m.label))],
    };
  });
}

/**
 * The list's headline: how many weaknesses sit in its top band ("Fix first",
 * priority 88 or more), each counted once however many rows name it.
 * A count, not an average, so a new item can raise it; it lowers it only by
 * showing that two counted rows are one weakness. Count over every target,
 * not the ten-row list, or a business with more than ten top-band items
 * would read as ten.
 */
export function fixFirstCount(targets: readonly Pick<PriorityTarget, "band">[]): number {
  return targets.filter((t) => t.band === "white_hot").length;
}

/**
 * The headline of a built report. A report version locked before the count
 * was stored has only its ten-row list, so it counts there.
 */
export function fixFirstOf(report: {
  targetDeck: readonly Pick<PriorityTarget, "band">[];
  fixFirst?: number;
}): number {
  return report.fixFirst ?? fixFirstCount(report.targetDeck);
}

/** The most items the list shows. */
const LIST_SIZE = 10;

/** The retained loss (after insurance) of an engine run. */
function retainedLoss(result: { retainedImpact: { expected: number } }): number {
  return result.retainedImpact.expected;
}

/**
 * Next steps for a residual row. Know-how rows get cross-training steps; money
 * rows are matched on whole words of their name, so "appeals" is not accounts
 * payable and "markdown" is not accounts receivable.
 */
function deriveRoe(category: string, name: string, residual: number): string[] {
  const lower = name.toLowerCase();
  if (category === "knowledge") {
    return [
      "Cross-train a stand-in within 30 days",
      "Write the procedure into the business playbook",
      "Re-score residual risk once the stand-in can do the work",
    ];
  }
  if (/\b(cash|deposits?|payments?)\b/.test(lower)) {
    return [
      "Owner independent bank reconciliation this week",
      "Dual release on the deposit bag / day-sheet match",
      "Camera coverage of cash drawer if not already present",
    ];
  }
  if (/\b(write-?offs?|adjust\w*|ar|receivables?)\b/.test(lower)) {
    return [
      "Require reason codes + owner threshold on write-offs",
      "Monthly aging of adjustments report",
      "Separate adjuster from payment poster when staffing allows",
    ];
  }
  if (/\b(vendors?|ap|payables?)\b/.test(lower)) {
    return [
      "Dual approval for new vendor setup",
      "Monthly new-vendor review by owner",
      "Separate vendor master from payment release",
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
    "Check the early-warning list each week",
    "Confirm someone has documented the compensating control",
    "Revisit at next residual acceptance review",
  ];
}

/**
 * Heat of a duty-conflict card by the conflict's severity: this app's
 * weighting, set so a critical conflict ranks with the hottest residual rows.
 */
const SOD_HEAT = { critical: 92, high: 78, other: 55 } as const;
