import { HEALTH_SCALE, healthLevel, RISK_SCALE, type HealthLevel } from "./scoring/bands";
import { findKnowledgeRisks, rankDangerousScenarios } from "./engine";
import { registerAssessed } from "./continuity/register-state";
import type { RiskVariableState } from "./scoring/dynamic-variables";
import {
  REGISTER_NOT_ASSESSED,
  starterScenarioLabel,
  starterScenariosLeftOut,
  MAKE_SCENARIO_YOURS,
} from "./scoring/scope";
import type { IndustryTemplate } from "./templates";
import type { StaffComposition } from "./types";
import type { DualReleasePolicy } from "./controls/dual-release";
import { CONFLICT_RULES } from "./sod/conflict-rules";
import { withLiveThreshold } from "./controls/dual-release-wording";
import { formatUsd } from "../utils";
import { count, joinWithAnd } from "./text";
import { clamp } from "./number";
import { tabLabel } from "./navigation";

export type CosoComponentId =
  | "control_environment"
  | "risk_assessment"
  | "control_activities"
  | "information_communication"
  | "monitoring";

export type DeepLinkTarget =
  | { type: "sod" }
  | { type: "knowledge"; knowledgeId?: string }
  | { type: "precog"; scenarioId?: string }
  | { type: "layers"; layer?: string };

interface CosoFinding {
  id: string;
  label: string;
  detail: string;
  severity: HealthLevel;
  link: DeepLinkTarget;
}

interface CosoPrincipleScore {
  number: number;
  name: string;
  status: HealthLevel;
  note: string;
  /** The inputs this principle reads are not in yet; show "not assessed" instead of a status. */
  notAssessed?: boolean;
}

export interface CosoComponentAssessment {
  id: CosoComponentId;
  name: string;
  shortName: string;
  description: string;
  score: number; // 0-100
  status: HealthLevel;
  principles: CosoPrincipleScore[];
  findings: CosoFinding[];
  primaryActions: { label: string; link: DeepLinkTarget }[];
}

/**
 * The COSO index for this business.
 *
 * `staff` is the profile's staff composition (the owner's team, derived or
 * edited). It is required: the template's own staff composition describes
 * the industry sample, not the owner's team.
 * Knowledge and scenario inputs count only when they describe the business: a
 * register nobody has marked contributes nothing (and the principles it feeds
 * say "not assessed"), and an owner's starter scenarios count only once
 * confirmed (`confirmedScenarioIds`, see scoring/scope).
 */
export function assessCoso(
  tpl: IndustryTemplate,
  staff: StaffComposition,
  opts: {
    riskVariables?: RiskVariableState;
    confirmedScenarioIds?: ReadonlySet<string>;
    /** The live dual-release policy, so a recorded control never quotes its own threshold. */
    dualRelease?: DualReleasePolicy;
  } = {},
): {
  overall: number;
  overallStatus: HealthLevel;
  components: CosoComponentAssessment[];
  priorityFindings: CosoFinding[];
} {
  const { controls } = tpl;
  const knowledgeAssessed = registerAssessed(tpl);
  const risks = findKnowledgeRisks(tpl);
  const ranked = rankDangerousScenarios(tpl, {
    staff,
    riskVariables: opts.riskVariables,
    confirmedScenarioIds: opts.confirmedScenarioIds,
  });
  const scenariosLeftOut = starterScenariosLeftOut(tpl, opts.confirmedScenarioIds).length;
  const spofs = risks.filter((r) => r.soleOwner && r.riskScore >= RISK_SCALE.actNow);
  // A starter control carries the industry example's segregated flag, not a
  // fact about this business, so it counts once the owner confirms it runs
  // here, as in the residual register.
  const ownControls = controls.filter((c) => !c.starter);
  const startersLeftOut = controls.length - ownControls.length;
  const sodGaps = ownControls.filter((c) => !c.segregated);
  const residualAccepted = sodGaps.filter((c) => c.residualRiskAccepted);
  const unaddressedGaps = sodGaps.filter((c) => !c.residualRiskAccepted);
  const topScenario = ranked[0];
  const fraudDrivers = [
    ...(sodGaps.length > 0 ? [count(sodGaps.length, "open duty conflict")] : []),
    ...(staff.dualControlPayments ? [] : ["no dual payment control"]),
    ...(staff.independentBankRec ? [] : ["no independent bank reconciliation"]),
  ];
  const fraudSeverity: HealthLevel =
    sodGaps.length > 0 && fraudDrivers.length >= 2
      ? "critical"
      : fraudDrivers.length > 0
        ? "weak"
        : "adequate";

  // --- Component scores derived from live demo state ---
  const controlEnvScore = Math.max(
    25,
    72 - (staff.segregationScore < 50 ? 12 : 0) - (unaddressedGaps.length > 2 ? 10 : 0),
  );

  // No penalty for a short time until found: a detective control shortens
  // it, and turning one on must never lower a component.
  const riskAssessmentScore = Math.max(20, 78 - spofs.length * 8);

  // On the same 0 to 100 scale as every other component.
  const controlActivitiesScore = clamp(
    staff.segregationScore -
      (staff.dualControlPayments ? 0 : 12) -
      (staff.independentBankRec ? 0 : 10) +
      (sodGaps.length === 0 ? 15 : 0),
    15,
    100,
  );

  const infoCommScore = Math.max(
    25,
    70 - spofs.length * 10 - risks.filter((r) => r.ownerCount === 0).length * 15,
  );

  const monitoringScore = Math.max(
    20,
    55 +
      (staff.independentBankRec ? 15 : 0) +
      // Every duty conflict answered, whether accepted or closed: closing
      // the last one must not score below accepting it.
      (unaddressedGaps.length === 0 ? 10 : 0) -
      unaddressedGaps.length * 6,
  );

  const components: CosoComponentAssessment[] = [
    {
      id: "control_environment",
      name: "Control Environment",
      shortName: "Environment",
      description: "Tone at the top, integrity, structure, competence, and accountability.",
      score: controlEnvScore,
      status: healthLevel(controlEnvScore),
      principles: [
        {
          number: 1,
          name: "Integrity and ethical values",
          status: controlEnvScore >= HEALTH_SCALE.adequate ? "adequate" : "weak",
          note: "Precog reads this from segregation and open duty conflicts; it does not record a written code of conduct.",
        },
        {
          number: 2,
          name: "Oversight responsibility",
          status: staff.independentBankRec ? "adequate" : "weak",
          note: staff.independentBankRec
            ? "Independent bank oversight in place."
            : "Oversight of the cash path by the owner or manager is incomplete.",
        },
        {
          number: 3,
          name: "Structure, authority, responsibility",
          status: unaddressedGaps.length > 2 ? "weak" : "adequate",
          note:
            unaddressedGaps.length > 0
              ? `${count(unaddressedGaps.length, "duty conflict")} without a recorded residual-risk decision.`
              : "Every duty conflict has a recorded residual-risk decision.",
        },
        {
          number: 4,
          name: "Competence",
          status: spofs.length > 0 ? "weak" : "strong",
          note: !knowledgeAssessed
            ? REGISTER_NOT_ASSESSED
            : spofs.length > 0
              ? `${count(spofs.length, "critical knowledge item")} that only one person holds.`
              : "Critical skills have redundancy.",
          ...(knowledgeAssessed ? {} : { notAssessed: true }),
        },
        {
          number: 5,
          name: "Accountability",
          status: sodGaps.length === 0 ? "adequate" : "weak",
          note:
            sodGaps.length === 0
              ? "No open duty conflict needs a residual-risk decision."
              : residualAccepted.length > 0
                ? "A residual-risk decision is recorded. A recorded decision is not a test of the control."
                : "The business has not recorded a residual-risk decision on any duty conflict.",
        },
      ],
      findings:
        spofs.length > 0
          ? [
              {
                id: "ce-spof",
                label: "Key-person concentration weakens accountability",
                detail: `${count(spofs.length, "critical knowledge item")} that only one person holds, which puts competence and succession under pressure.`,
                severity: spofs.length >= 2 ? "critical" : "weak",
                link: { type: "knowledge", knowledgeId: spofs[0]?.knowledgeId },
              },
            ]
          : [],
      primaryActions: [
        { label: "Review items only one person holds", link: { type: "knowledge" } },
        { label: "Review duty conflicts", link: { type: "sod" } },
      ],
    },
    {
      id: "risk_assessment",
      name: "Risk Assessment",
      shortName: "Risk",
      description: "Objectives, risk analysis, fraud risk, and response to change.",
      score: riskAssessmentScore,
      status: healthLevel(riskAssessmentScore),
      principles: [
        {
          number: 6,
          name: "Suitable objectives",
          status: "adequate",
          note: "Not assessed: Precog does not record the business's objectives.",
          notAssessed: true,
        },
        {
          number: 7,
          name: "Identify and analyze risks",
          status: ranked.length > 0 ? "adequate" : "weak",
          note:
            ranked.length > 0
              ? `Precog ranks the scenarios on ${tabLabel("precog")} that describe this business, by operational and control risk.`
              : scenariosLeftOut > 0
                ? `Precog does not count ${starterScenarioLabel(tpl.id).toLowerCase()} yet. ${MAKE_SCENARIO_YOURS}`
                : "No scenario describes this business yet.",
          ...(ranked.length === 0 && scenariosLeftOut > 0 ? { notAssessed: true } : {}),
        },
        {
          number: 8,
          name: "Fraud risk",
          status: !staff.dualControlPayments || !staff.independentBankRec ? "weak" : "adequate",
          note: fraudDrivers.length
            ? `Fraud opportunity from ${joinWithAnd(fraudDrivers)}.`
            : "No open duty conflict; dual payment control and independent bank reconciliation are on.",
        },
        {
          number: 9,
          name: "Assess change",
          status: "weak",
          note: `Not assessed: this check does not score changes to the business. Record anyone leaving the team on ${tabLabel("knowledge")}.`,
          notAssessed: true,
        },
      ],
      findings: [
        ...(topScenario
          ? [
              {
                id: "ra-top",
                label: `Top residual scenario: ${topScenario.scenario.title}`,
                detail: `Scenario assumes a loss of ${formatUsd(topScenario.result.financialImpact.expected)} and about ${topScenario.result.timelineDays.p50} assumed days until found (assumed range ${topScenario.result.timelineDays.p95Low}–${topScenario.result.timelineDays.p95High} days). An assumption written into the scenario, not a forecast.`,
                severity: "critical" as HealthLevel,
                link: {
                  type: "precog" as const,
                  scenarioId: topScenario.scenario.id,
                },
              },
            ]
          : []),
        {
          id: "ra-fraud",
          label: fraudDrivers.length ? "Fraud risk drivers active" : "No fraud risk driver active",
          detail: `${count(sodGaps.length, "open duty conflict")}; dual payment control ${staff.dualControlPayments ? "on" : "off"}; independent bank reconciliation ${staff.independentBankRec ? "on" : "off"}.`,
          severity: fraudSeverity,
          link: { type: "sod" },
        },
      ],
      primaryActions: [
        {
          label: "Run the top scenario",
          link: { type: "precog", scenarioId: topScenario?.scenario.id },
        },
        { label: "Review duty conflicts", link: { type: "sod" } },
      ],
    },
    {
      id: "control_activities",
      name: "Control Activities",
      shortName: "Activities",
      description:
        "Authorizations, segregation of duties, reconciliations, access, and technology controls.",
      score: controlActivitiesScore,
      status: healthLevel(controlActivitiesScore),
      principles: [
        {
          number: 10,
          name: "Select control activities",
          status: healthLevel(controlActivitiesScore),
          note: `Segregation score ${staff.segregationScore}/100 with ${count(sodGaps.length, "open duty conflict")}.${startersLeftOut ? ` Precog leaves out ${count(startersLeftOut, "sample control")} until you confirm ${startersLeftOut === 1 ? "it runs" : "they run"} here.` : ""}`,
        },
        {
          number: 11,
          name: "Technology general controls",
          status: "adequate",
          note: "Not assessed: Precog does not record who has which system access. Re-check access when someone joins or leaves.",
          notAssessed: true,
        },
        {
          number: 12,
          name: "Policies and procedures",
          status: unaddressedGaps.length === 0 ? "adequate" : "weak",
          note:
            unaddressedGaps.length === 0
              ? "No open duty conflict."
              : "A sentence or a recorded residual-risk decision is not a tested control. Open duty conflicts remain untested.",
        },
      ],
      findings: sodGaps.map((g) => ({
        id: `ca-${g.id}`,
        label: g.name,
        detail: g.residualRiskAccepted
          ? "Decision recorded, not tested."
          : g.compensatingControls.length > 0
            ? `A sentence is written down, not a tested control: ${g.compensatingControls
                .map((c) =>
                  withLiveThreshold(c, opts.dualRelease, RULE_IDS_BY_CONTROL.get(g.id) ?? []),
                )
                .join("; ")}`
            : "Nobody has written down a compensating control.",
        severity: g.residualRiskAccepted ? "weak" : "critical",
        link: { type: "sod" as const },
      })),
      primaryActions: [
        { label: "Address duty conflicts", link: { type: "sod" } },
        {
          label: "Model cash control failure",
          link: { type: "precog", scenarioId: "sc-cash-sod-failure" },
        },
      ],
    },
    {
      id: "information_communication",
      name: "Information and Communication",
      shortName: "Info & Comm",
      description: "Quality information and clear communication of control responsibilities.",
      score: infoCommScore,
      status: healthLevel(infoCommScore),
      principles: [
        {
          number: 13,
          name: "Relevant quality information",
          status: "adequate",
          note: "Not assessed: Precog does not record which reports the owner reviews (aging, adjustments, deposits).",
          notAssessed: true,
        },
        {
          number: 14,
          name: "Internal communication",
          status: spofs.length > 0 ? "weak" : "adequate",
          note: knowledgeAssessed
            ? "Tribal knowledge without cross-training blocks reliable internal communication of how controls work."
            : REGISTER_NOT_ASSESSED,
          ...(knowledgeAssessed ? {} : { notAssessed: true }),
        },
        {
          number: 15,
          name: "External communication",
          status: "adequate",
          note: "Not assessed: Precog does not record how customers and vendors raise problems.",
          notAssessed: true,
        },
      ],
      findings: knowledgeAssessed
        ? spofs.slice(0, 3).map((s) => ({
            id: `ic-${s.knowledgeId}`,
            label: `Only one person holds: ${s.name}`,
            detail: `Sole strong owner: ${s.owners[0]?.name ?? "unknown"}. This puts continuity and internal know-how at risk.`,
            severity: "critical" as HealthLevel,
            link: { type: "knowledge" as const, knowledgeId: s.knowledgeId },
          }))
        : [
            {
              id: "ic-register",
              label: "Register not assessed yet",
              detail:
                "Mark who can do each item on Who knows what. Until then, this check does not score key-person concentration.",
              severity: "weak" as HealthLevel,
              link: { type: "knowledge" as const },
            },
          ],
      primaryActions: [
        {
          label: `Open ${tabLabel("knowledge")}`,
          link: {
            type: "knowledge",
            knowledgeId: spofs[0]?.knowledgeId,
          },
        },
        {
          label: "Key-person exit scenario",
          link: {
            type: "precog",
            scenarioId: tpl.scenarios.find((sc) => sc.knowledgeId)?.id,
          },
        },
      ],
    },
    {
      id: "monitoring",
      name: "Monitoring Activities",
      shortName: "Monitoring",
      description: "Ongoing evaluations and timely remediation of deficiencies.",
      score: monitoringScore,
      status: healthLevel(monitoringScore),
      principles: [
        {
          number: 16,
          name: "Ongoing and separate evaluations",
          status: staff.independentBankRec ? "adequate" : "weak",
          note: "Bank and adjustment reviews are the main detective check in a small business.",
        },
        {
          number: 17,
          name: "Communicate deficiencies",
          status: unaddressedGaps.length > 0 ? "weak" : "adequate",
          note:
            unaddressedGaps.length > 0
              ? `${count(unaddressedGaps.length, "duty conflict")} without a recorded residual-risk decision.`
              : "Every duty conflict has a recorded residual-risk decision.",
        },
      ],
      findings: [
        {
          id: "mon-rec",
          label: staff.independentBankRec
            ? "Independent bank reconciliation on"
            : "Independent bank reconciliation off",
          detail: staff.independentBankRec
            ? "This detective control shortens the time before someone finds a problem."
            : "Without an independent bank reconciliation, fraud and errors go unnoticed longer, which lengthens the scenario timelines.",
          severity: staff.independentBankRec ? "adequate" : "critical",
          link: { type: "precog", scenarioId: "sc-cash-sod-failure" },
        },
        {
          id: "mon-residual",
          label: `${count(unaddressedGaps.length, "duty conflict")} without a residual-risk decision`,
          detail:
            "COSO expects the business to evaluate each duty conflict and then either fix it or accept it with a compensating design.",
          severity: unaddressedGaps.length > 0 ? "weak" : "strong",
          link: { type: "sod" },
        },
      ],
      primaryActions: [
        { label: "Record a residual-risk decision on each duty conflict", link: { type: "sod" } },
        {
          label: "Re-run the cash scenario after a control change",
          link: { type: "precog", scenarioId: "sc-cash-sod-failure" },
        },
      ],
    },
  ];

  const overall = Math.round(components.reduce((s, c) => s + c.score, 0) / components.length);

  // Most severe first; within a severity, component order.
  const priorityFindings = components
    .flatMap((c) => c.findings)
    .filter((f) => f.severity === "critical" || f.severity === "weak")
    .sort((a, b) => PRIORITY_RANK[a.severity] - PRIORITY_RANK[b.severity])
    .slice(0, 8);

  return {
    overall,
    overallStatus: healthLevel(overall),
    components,
    priorityFindings,
  };
}

const PRIORITY_RANK: Record<HealthLevel, number> = {
  critical: 0,
  weak: 1,
  adequate: 2,
  strong: 3,
};

/** The conflict rules each control is linked to, looked up once rather than per compensating control. */
const RULE_IDS_BY_CONTROL = CONFLICT_RULES.reduce((byControl, r) => {
  if (r.linkedControlId) {
    byControl.set(r.linkedControlId, [...(byControl.get(r.linkedControlId) ?? []), r.id]);
  }
  return byControl;
}, new Map<string, string[]>());
