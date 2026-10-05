import type { DualReleasePolicy } from "../controls/dual-release";
import { casesForControl, casesForSodRules, isOwnSector, type CaseStudy } from "../evidence";
import { runPrecogScenario } from "../engine";
import { CONFLICT_RULES } from "../sod/conflict-rules";
import { detectSodConflicts, sodDetectionOptions } from "../sod/detect";
import type { IndustryTemplate } from "../templates";
import type { ProcessNode, StaffComposition } from "../types";
import { formatUsd } from "@/lib/utils";
import { mergeStaffIntoVariables, type RiskVariableState } from "./dynamic-variables";
import { portfolioSummary } from "./residual-engine";
import { scenariosInScope } from "./scope";
import { DEFAULT_WEIGHTS } from "./weights";

export type SafeguardId = "dual_release" | "bank_rec" | "cameras" | "alarm" | "bonded_handlers";
export type FailureTarget =
  { kind: "safeguard"; id: SafeguardId } | { kind: "control"; id: string };

export interface FailureInputs {
  staff: StaffComposition;
  riskVariables: RiskVariableState;
  dualRelease: DualReleasePolicy;
  confirmedScenarioIds?: ReadonlySet<string>;
}

interface Figures {
  grossExpected: number;
  retainedExpected: number;
  expectedAnnualCostOfRisk: number;
  p50Days: number;
}

export interface ControlFailureReport {
  target: FailureTarget;
  label: string;
  mode: "failure" | "gap";
  scored: boolean;
  headline: string;
  scenarios: { id: string; title: string; withIt: Figures; withoutIt: Figures }[];
  linkedScenarios: {
    id: string;
    title: string;
    retainedExpected: number;
    p50Days: number;
  }[];
  residual: {
    withIt: number;
    withoutIt: number;
    rows: { id: string; name: string; withIt: number; withoutIt: number }[];
  };
  findings: {
    id: string;
    title: string;
    personName: string;
    severity: string;
    lostInPlace: string[];
  }[];
  processes: { id: string; name: string; via: "control" | "depends" }[];
  cases: { count: number; examples: CaseStudy[] };
  stillInPlace: string[];
  notes: string[];
}

export const SAFEGUARDS: { id: SafeguardId; label: string }[] = [
  { id: "dual_release", label: "Dual release for payments and deposits" },
  { id: "bank_rec", label: "Independent bank reconciliation" },
  { id: "cameras", label: "Security cameras" },
  { id: "alarm", label: "Monitored alarm and access control" },
  { id: "bonded_handlers", label: "Bonded cash handlers" },
];

interface EvaluationState {
  tpl: IndustryTemplate;
  staff: StaffComposition;
  riskVariables: RiskVariableState;
  dualRelease: DualReleasePolicy;
}

const DUAL_RELEASE_LOST = "Dual-release policy active on related channel";

export function evaluateControlFailure(
  tpl: IndustryTemplate,
  target: FailureTarget,
  inputs: FailureInputs,
): ControlFailureReport {
  const control = target.kind === "control" ? tpl.controls.find((c) => c.id === target.id) : null;
  if (target.kind === "control" && !control) {
    throw new Error(`Unknown control ${target.id}`);
  }
  const safeguard = target.kind === "safeguard" ? SAFEGUARDS.find((s) => s.id === target.id) : null;
  if (target.kind === "safeguard" && !safeguard) {
    throw new Error(`Unknown safeguard ${target.id}`);
  }

  const label = control?.name ?? safeguard!.label;
  const mode =
    target.kind === "control"
      ? control!.segregated
        ? "failure"
        : "gap"
      : safeguardIsOn(target.id, inputs.staff, inputs.riskVariables)
        ? "failure"
        : "gap";
  const scored = !control?.starter;
  const withIt =
    target.kind === "control"
      ? stateWithControl(tpl, target.id, true, inputs)
      : stateWithSafeguard(tpl, target.id, true, inputs);
  const withoutIt =
    target.kind === "control"
      ? stateWithControl(tpl, target.id, false, inputs)
      : stateWithSafeguard(tpl, target.id, false, inputs);
  const inScope = scenariosInScope(tpl, inputs.confirmedScenarioIds);
  const scenarios = scored
    ? inScope
        .map((scenario) => ({
          id: scenario.id,
          title: scenario.title,
          withIt: scenarioFigures(withIt, scenario.id),
          withoutIt: scenarioFigures(withoutIt, scenario.id),
        }))
        .filter((scenario) => figuresDiffer(scenario.withIt, scenario.withoutIt))
        .sort(
          (a, b) =>
            b.withoutIt.retainedExpected -
            b.withIt.retainedExpected -
            (a.withoutIt.retainedExpected - a.withIt.retainedExpected),
        )
    : [];
  const withPortfolio = scored ? portfolioFor(withIt, inputs.confirmedScenarioIds) : null;
  const withoutPortfolio = scored ? portfolioFor(withoutIt, inputs.confirmedScenarioIds) : null;
  const residual =
    withPortfolio && withoutPortfolio
      ? {
          withIt: withPortfolio.averageResidual,
          withoutIt: withoutPortfolio.averageResidual,
          rows: withPortfolio.all
            .flatMap((row) => {
              const without = withoutPortfolio.all.find((candidate) => candidate.id === row.id);
              return without && without.residual !== row.residual
                ? [
                    {
                      id: row.id,
                      name: row.name,
                      withIt: row.residual,
                      withoutIt: without.residual,
                    },
                  ]
                : [];
            })
            .sort((a, b) => Math.abs(b.withoutIt - b.withIt) - Math.abs(a.withoutIt - a.withIt))
            .slice(0, 8),
        }
      : { withIt: 0, withoutIt: 0, rows: [] };
  const findings = scored ? findingsLosingControls(withIt, withoutIt) : [];
  const linkedScenarios =
    target.kind === "control" ? linkedScenarioFigures(tpl, target.id, inScope, inputs) : [];
  const processes = target.kind === "control" ? exposedProcesses(tpl.processes, target.id) : [];
  const cases = casesForTarget(tpl, target);
  const stillInPlace = SAFEGUARDS.filter(
    (item) => item.id !== (target.kind === "safeguard" ? target.id : undefined),
  )
    .filter((item) =>
      safeguardIsOn(item.id, withoutIt.staff, withoutIt.riskVariables, withoutIt.dualRelease),
    )
    .map((item) => item.label);
  const notes: string[] = [];
  if (inScope.length === 0) {
    notes.push("No scenario is confirmed for this business yet, so no loss figure moves.");
  }
  if (control?.starter) {
    notes.push(
      'This control comes from the industry sample. Nobody has confirmed it runs here, so Precog does not count it yet. Confirm it with "This runs here" in Controls.',
    );
  }

  return {
    target,
    label,
    mode,
    scored,
    headline: buildHeadline(label, mode, scenarios[0], residual, findings),
    scenarios,
    linkedScenarios,
    residual,
    findings,
    processes,
    cases,
    stillInPlace,
    notes,
  };
}

function stateWithSafeguard(
  tpl: IndustryTemplate,
  id: SafeguardId,
  enabled: boolean,
  inputs: FailureInputs,
): EvaluationState {
  const staff = { ...inputs.staff };
  const riskVariables = { ...inputs.riskVariables };
  const dualRelease = { ...inputs.dualRelease };
  switch (id) {
    case "dual_release":
      staff.dualControlPayments = enabled;
      dualRelease.enabled = enabled;
      break;
    case "bank_rec":
      staff.independentBankRec = enabled;
      break;
    case "cameras":
      riskVariables.hasSecurityCameras = enabled;
      break;
    case "alarm":
      riskVariables.hasAlarmAccess = enabled;
      break;
    case "bonded_handlers":
      riskVariables.hasBondedCashHandlers = enabled;
      break;
  }
  return {
    tpl,
    staff,
    riskVariables: mergeStaffIntoVariables(riskVariables, staff),
    dualRelease,
  };
}

function stateWithControl(
  tpl: IndustryTemplate,
  id: string,
  enabled: boolean,
  inputs: FailureInputs,
): EvaluationState {
  return {
    tpl: {
      ...tpl,
      controls: tpl.controls.map((control) =>
        control.id === id
          ? {
              ...control,
              segregated: enabled,
              compensatingControls: enabled ? [...control.compensatingControls] : [],
            }
          : control,
      ),
    },
    staff: { ...inputs.staff },
    riskVariables: mergeStaffIntoVariables({ ...inputs.riskVariables }, inputs.staff),
    dualRelease: { ...inputs.dualRelease },
  };
}

function safeguardIsOn(
  id: SafeguardId,
  staff: StaffComposition,
  variables: RiskVariableState,
  dualRelease?: DualReleasePolicy,
): boolean {
  switch (id) {
    case "dual_release":
      return staff.dualControlPayments && (dualRelease?.enabled ?? true);
    case "bank_rec":
      return staff.independentBankRec;
    case "cameras":
      return variables.hasSecurityCameras;
    case "alarm":
      return variables.hasAlarmAccess;
    case "bonded_handlers":
      return variables.hasBondedCashHandlers;
  }
}

function scenarioFigures(state: EvaluationState, scenarioId: string): Figures {
  const result = runPrecogScenario(state.tpl, scenarioId, {
    staff: state.staff,
    riskVariables: state.riskVariables,
  });
  if (!result?.dynamic) throw new Error(`Unknown scenario ${scenarioId}`);
  return {
    grossExpected: result.dynamic.grossExpected,
    retainedExpected: result.dynamic.retainedExpected,
    expectedAnnualCostOfRisk: result.dynamic.expectedAnnualCostOfRisk,
    p50Days: result.timelineDays.p50,
  };
}

function figuresDiffer(a: Figures, b: Figures): boolean {
  return (
    Math.abs(a.grossExpected - b.grossExpected) >= 1 ||
    Math.abs(a.retainedExpected - b.retainedExpected) >= 1 ||
    Math.abs(a.expectedAnnualCostOfRisk - b.expectedAnnualCostOfRisk) >= 1 ||
    Math.abs(a.p50Days - b.p50Days) >= 1
  );
}

function portfolioFor(state: EvaluationState, confirmedScenarioIds?: ReadonlySet<string>) {
  return portfolioSummary(state.tpl, state.staff, DEFAULT_WEIGHTS, {
    confirmedScenarioIds,
    riskVariables: state.riskVariables,
  });
}

function findingsLosingControls(
  withIt: EvaluationState,
  withoutIt: EvaluationState,
): ControlFailureReport["findings"] {
  const withFindings = detectSodConflicts(
    withIt.tpl,
    withIt.staff,
    sodDetectionOptions(withIt.tpl, withIt.dualRelease),
  ).conflicts;
  const withoutFindings = detectSodConflicts(
    withoutIt.tpl,
    withoutIt.staff,
    sodDetectionOptions(withoutIt.tpl, withoutIt.dualRelease),
  ).conflicts;
  const withoutById = new Map(withoutFindings.map((finding) => [finding.id, finding]));
  return withFindings.flatMap((finding) => {
    const without = withoutById.get(finding.id);
    if (!without) return [];
    const lostInPlace = finding.controlsInPlace.filter(
      (control) => !without.controlsInPlace.includes(control),
    );
    if (finding.dualReleaseMitigated && !without.dualReleaseMitigated) {
      lostInPlace.push(DUAL_RELEASE_LOST);
    }
    return lostInPlace.length
      ? [
          {
            id: finding.id,
            title: finding.title,
            personName: finding.personName,
            severity: finding.severity,
            lostInPlace: Array.from(new Set(lostInPlace)),
          },
        ]
      : [];
  });
}

function linkedScenarioFigures(
  tpl: IndustryTemplate,
  controlId: string,
  inScope: IndustryTemplate["scenarios"],
  inputs: FailureInputs,
): ControlFailureReport["linkedScenarios"] {
  const linkedRuleIds = new Set(
    CONFLICT_RULES.filter((rule) => rule.linkedControlId === controlId).map((rule) => rule.id),
  );
  const current: EvaluationState = {
    tpl,
    staff: { ...inputs.staff },
    riskVariables: mergeStaffIntoVariables({ ...inputs.riskVariables }, inputs.staff),
    dualRelease: { ...inputs.dualRelease },
  };
  return inScope.flatMap((scenario) => {
    if (
      scenario.controlId !== controlId &&
      !scenario.sodRuleIds?.some((ruleId) => linkedRuleIds.has(ruleId))
    ) {
      return [];
    }
    const figures = scenarioFigures(current, scenario.id);
    return [
      {
        id: scenario.id,
        title: scenario.title,
        retainedExpected: figures.retainedExpected,
        p50Days: figures.p50Days,
      },
    ];
  });
}

function exposedProcesses(
  processes: ProcessNode[],
  controlId: string,
): ControlFailureReport["processes"] {
  const exposed = new Map<string, "control" | "depends">();
  let frontier = processes.filter((process) => process.controlIds.includes(controlId));
  frontier.forEach((process) => exposed.set(process.id, "control"));
  while (frontier.length > 0) {
    const frontierIds = new Set(frontier.map((process) => process.id));
    frontier = processes.filter(
      (process) =>
        !exposed.has(process.id) &&
        process.dependencies.some((dependency) => frontierIds.has(dependency)),
    );
    frontier.forEach((process) => exposed.set(process.id, "depends"));
  }
  return processes.flatMap((process) => {
    const via = exposed.get(process.id);
    return via ? [{ id: process.id, name: process.name, via }] : [];
  });
}

function casesForTarget(
  tpl: IndustryTemplate,
  target: FailureTarget,
): ControlFailureReport["cases"] {
  const cases =
    target.kind === "control"
      ? casesForSodRules(
          CONFLICT_RULES.filter((rule) => rule.linkedControlId === target.id).map(
            (rule) => rule.id,
          ),
        )
      : target.id === "cameras" || target.id === "alarm"
        ? []
        : casesForControl(
            target.id === "dual_release"
              ? "dual-release-above-threshold"
              : target.id === "bank_rec"
                ? "independent-bank-reconciliation"
                : "background-check-money-handlers",
          );
  const ordered = cases
    .slice()
    .sort(
      (a, b) =>
        Number(isOwnSector(b, tpl.id)) - Number(isOwnSector(a, tpl.id)) || b.lossUsd - a.lossUsd,
    );
  return { count: ordered.length, examples: ordered.slice(0, 3) };
}

function buildHeadline(
  label: string,
  mode: ControlFailureReport["mode"],
  worstScenario: ControlFailureReport["scenarios"][number] | undefined,
  residual: ControlFailureReport["residual"],
  findings: ControlFailureReport["findings"],
): string {
  const opening = mode === "failure" ? `If ${label} stops` : `Without ${label} today`;
  const clauses: string[] = [];
  if (worstScenario) {
    const retainedDelta =
      worstScenario.withoutIt.retainedExpected - worstScenario.withIt.retainedExpected;
    if (Math.abs(retainedDelta) >= 1) {
      clauses.push(
        `about ${formatUsd(Math.abs(retainedDelta))} ${retainedDelta > 0 ? "more" : "less"} retained loss on ${worstScenario.title}`,
      );
    }
    const daysDelta = worstScenario.withoutIt.p50Days - worstScenario.withIt.p50Days;
    if (Math.abs(daysDelta) >= 1) {
      clauses.push(`found about ${Math.abs(daysDelta)} days ${daysDelta > 0 ? "later" : "sooner"}`);
    }
    const costDelta =
      worstScenario.withoutIt.expectedAnnualCostOfRisk -
      worstScenario.withIt.expectedAnnualCostOfRisk;
    if (Math.abs(costDelta) >= 1) {
      clauses.push(
        `annual cost of risk ${costDelta > 0 ? "rises" : "falls"} about ${formatUsd(Math.abs(costDelta))}`,
      );
    }
  }
  if (residual.withoutIt !== residual.withIt) {
    clauses.push(`average residual ${residual.withIt} → ${residual.withoutIt}`);
  }
  if (findings.length > 0) {
    clauses.push(
      `${findings.length} duty ${findings.length === 1 ? "conflict loses" : "conflicts lose"} a control in place`,
    );
  }
  return clauses.length
    ? `${opening}: ${clauses.join("; ")}.`
    : `${opening}: no modeled loss, residual or duty-conflict figures move.`;
}
