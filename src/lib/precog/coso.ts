import { healthLevel, RISK_SCALE } from "./scoring/bands";
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
import { withLiveThreshold } from "./coach/first-steps";

export type CosoComponentId =
  | "control_environment"
  | "risk_assessment"
  | "control_activities"
  | "information_communication"
  | "monitoring";

export type HealthStatus = "strong" | "adequate" | "weak" | "critical";

export type DeepLinkTarget =
  | { type: "tab"; tab: "command" | "layers" | "knowledge" | "precog" | "sod" | "coso" }
  | { type: "sod" }
  | { type: "knowledge"; knowledgeId?: string }
  | { type: "precog"; scenarioId?: string }
  | { type: "layers"; layer?: string };

export interface CosoFinding {
  id: string;
  label: string;
  detail: string;
  severity: HealthStatus;
  link: DeepLinkTarget;
}

export interface CosoPrincipleScore {
  number: number;
  name: string;
  status: HealthStatus;
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
  status: HealthStatus;
  principles: CosoPrincipleScore[];
  findings: CosoFinding[];
  primaryActions: { label: string; link: DeepLinkTarget }[];
}

function statusFromScore(score: number): HealthStatus {
  return healthLevel(score);
}

/**
 * The COSO index for this business.
 *
 * `staff` is the profile's staff composition (the owner's team, derived or
 * edited); it defaults to the template's only for callers without a profile.
 * Knowledge and scenario inputs count only when they describe the business: a
 * register nobody has marked contributes nothing (and the principles it feeds
 * say "not assessed"), and an owner's starter scenarios count only once
 * confirmed (`confirmedScenarioIds`, see scoring/scope).
 */
export function assessCoso(
  tpl: IndustryTemplate,
  staff: StaffComposition = tpl.staffComposition,
  opts: {
    riskVariables?: RiskVariableState;
    confirmedScenarioIds?: ReadonlySet<string>;
    /** The live dual-release policy, so a recorded control never quotes its own threshold. */
    dualRelease?: DualReleasePolicy;
  } = {},
): {
  overall: number;
  overallStatus: HealthStatus;
  components: CosoComponentAssessment[];
  priorityFindings: CosoFinding[];
} {
  const { controls } = tpl;
  const staffComposition = staff;
  const knowledgeAssessed = registerAssessed(tpl);
  const risks = findKnowledgeRisks(tpl);
  const ranked = rankDangerousScenarios(tpl, {
    staff,
    riskVariables: opts.riskVariables,
    confirmedScenarioIds: opts.confirmedScenarioIds,
  });
  const scenariosLeftOut = starterScenariosLeftOut(tpl, opts.confirmedScenarioIds).length;
  const spofs = risks.filter((r) => r.soleOwner && r.riskScore >= RISK_SCALE.actNow);
  const sodGaps = controls.filter((c) => !c.segregated);
  const residualAccepted = sodGaps.filter((c) => c.residualRiskAccepted);
  const unaddressedGaps = sodGaps.filter((c) => !c.residualRiskAccepted);
  const topScenario = ranked[0];

  // --- Component scores derived from live demo state ---
  const controlEnvScore = Math.max(
    25,
    72 - (staffComposition.segregationScore < 50 ? 12 : 0) - (unaddressedGaps.length > 2 ? 10 : 0),
  );

  const riskAssessmentScore = Math.max(
    20,
    78 - spofs.length * 8 - (topScenario && topScenario.result.timelineDays.p50 < 60 ? 8 : 0),
  );

  const controlActivitiesScore = Math.max(
    15,
    staffComposition.segregationScore -
      (staffComposition.dualControlPayments ? 0 : 12) -
      (staffComposition.independentBankRec ? 0 : 10) +
      (sodGaps.length === 0 ? 15 : 0),
  );

  const infoCommScore = Math.max(
    25,
    70 - spofs.length * 10 - risks.filter((r) => r.ownerCount === 0).length * 15,
  );

  const monitoringScore = Math.max(
    20,
    55 +
      (staffComposition.independentBankRec ? 15 : 0) +
      (residualAccepted.length > 0 && unaddressedGaps.length === 0 ? 10 : 0) -
      unaddressedGaps.length * 6,
  );

  const components: CosoComponentAssessment[] = [
    {
      id: "control_environment",
      name: "Control Environment",
      shortName: "Environment",
      description: "Tone at the top, integrity, structure, competence, and accountability.",
      score: controlEnvScore,
      status: statusFromScore(controlEnvScore),
      principles: [
        {
          number: 1,
          name: "Integrity & ethical values",
          status: controlEnvScore >= 60 ? "adequate" : "weak",
          note: "Policy language exists; enforcement depends on owner reviews.",
        },
        {
          number: 2,
          name: "Oversight responsibility",
          status: staffComposition.independentBankRec ? "adequate" : "weak",
          note: staffComposition.independentBankRec
            ? "Independent bank oversight in place."
            : "Owner/manager oversight of cash path is incomplete.",
        },
        {
          number: 3,
          name: "Structure, authority, responsibility",
          status: unaddressedGaps.length > 2 ? "weak" : "adequate",
          note: "Approval authority for write-offs and AP needs tighter mapping.",
        },
        {
          number: 4,
          name: "Competence",
          status: spofs.length > 0 ? "weak" : "strong",
          note: !knowledgeAssessed
            ? REGISTER_NOT_ASSESSED
            : spofs.length > 0
              ? `${spofs.length} critical knowledge item(s) concentrated on one person.`
              : "Critical skills have redundancy.",
          ...(knowledgeAssessed ? {} : { notAssessed: true }),
        },
        {
          number: 5,
          name: "Accountability",
          status: residualAccepted.length > 0 ? "adequate" : "weak",
          note:
            residualAccepted.length > 0
              ? "Some residual risk is documented as accepted."
              : "Gaps exist without explicit residual-risk decisions.",
        },
      ],
      findings:
        spofs.length > 0
          ? [
              {
                id: "ce-spof",
                label: "Key-person concentration weakens accountability",
                detail: `${spofs.length} sole-owner critical knowledge area(s) — competence and succession pressure on control environment.`,
                severity: spofs.length >= 2 ? "critical" : "weak",
                link: { type: "knowledge", knowledgeId: spofs[0]?.knowledgeId },
              },
            ]
          : [],
      primaryActions: [
        { label: "Review knowledge SPOFs", link: { type: "knowledge" } },
        { label: "Open SoD conflicts", link: { type: "sod" } },
      ],
    },
    {
      id: "risk_assessment",
      name: "Risk Assessment",
      shortName: "Risk",
      description: "Objectives, risk analysis, fraud risk, and response to change.",
      score: riskAssessmentScore,
      status: statusFromScore(riskAssessmentScore),
      principles: [
        {
          number: 6,
          name: "Suitable objectives",
          status: "adequate",
          note: "Operational and reporting objectives implied by practice goals.",
        },
        {
          number: 7,
          name: "Identify & analyze risks",
          status: ranked.length > 0 ? "adequate" : "weak",
          note:
            ranked.length > 0
              ? "Precog scenarios surface ranked operational and control risks."
              : scenariosLeftOut > 0
                ? `${starterScenarioLabel(tpl.id)} are not counted yet. ${MAKE_SCENARIO_YOURS}`
                : "No scenario describes this business yet.",
          ...(ranked.length === 0 && scenariosLeftOut > 0 ? { notAssessed: true } : {}),
        },
        {
          number: 8,
          name: "Fraud risk",
          status:
            !staffComposition.dualControlPayments || !staffComposition.independentBankRec
              ? "weak"
              : "adequate",
          note: "Cash, write-off, and vendor paths elevate fraud opportunity when SoD is thin.",
        },
        {
          number: 9,
          name: "Assess change",
          status: "weak",
          note: "Staff exits and role changes are not yet monitored as control-change events.",
        },
      ],
      findings: [
        ...(topScenario
          ? [
              {
                id: "ra-top",
                label: `Top residual future: ${topScenario.scenario.title}`,
                detail: `Scenario assumes a loss of ${Math.round(topScenario.result.financialImpact.expected).toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 })} and about ${topScenario.result.timelineDays.p50} assumed days until found (assumed range ${topScenario.result.timelineDays.p95Low}–${topScenario.result.timelineDays.p95High} days). An assumption written into the scenario, not a forecast.`,
                severity: "critical" as HealthStatus,
                link: {
                  type: "precog" as const,
                  scenarioId: topScenario.scenario.id,
                },
              },
            ]
          : []),
        {
          id: "ra-fraud",
          label: "Fraud risk drivers active",
          detail: `${sodGaps.length} SoD gap(s); dual payment control ${staffComposition.dualControlPayments ? "on" : "off"}; independent bank rec ${staffComposition.independentBankRec ? "on" : "off"}.`,
          severity: "weak",
          link: { type: "sod" },
        },
      ],
      primaryActions: [
        {
          label: "Run top Precog scenario",
          link: { type: "precog", scenarioId: topScenario?.scenario.id },
        },
        { label: "Inspect SoD gaps", link: { type: "sod" } },
      ],
    },
    {
      id: "control_activities",
      name: "Control Activities",
      shortName: "Activities",
      description: "Authorizations, SoD, reconciliations, access, and technology controls.",
      score: controlActivitiesScore,
      status: statusFromScore(controlActivitiesScore),
      principles: [
        {
          number: 10,
          name: "Select control activities",
          status: statusFromScore(controlActivitiesScore),
          note: `Segregation score ${staffComposition.segregationScore}/100 with ${sodGaps.length} active conflicts.`,
        },
        {
          number: 11,
          name: "Technology general controls",
          status: "adequate",
          note: "PMS role design assumed; re-check access when staff change.",
        },
        {
          number: 12,
          name: "Policies & procedures",
          status: unaddressedGaps.some((g) => g.compensatingControls.length === 0)
            ? "weak"
            : "adequate",
          note: "Compensating controls exist for some gaps; formalize the rest.",
        },
      ],
      findings: sodGaps.map((g) => ({
        id: `ca-${g.id}`,
        label: g.name,
        detail:
          g.compensatingControls.length > 0
            ? `Compensating: ${g.compensatingControls
                .map((c) =>
                  withLiveThreshold(
                    c,
                    opts.dualRelease,
                    CONFLICT_RULES.filter((r) => r.linkedControlId === g.id).map((r) => r.id),
                  ),
                )
                .join("; ")}`
            : "No compensating control documented.",
        severity: g.residualRiskAccepted ? "adequate" : "critical",
        link: { type: "sod" as const },
      })),
      primaryActions: [
        { label: "Address SoD conflicts", link: { type: "sod" } },
        {
          label: "Model cash control failure",
          link: { type: "precog", scenarioId: "sc-cash-sod-failure" },
        },
      ],
    },
    {
      id: "information_communication",
      name: "Information & Communication",
      shortName: "Info & Comm",
      description: "Quality information and clear communication of control responsibilities.",
      score: infoCommScore,
      status: statusFromScore(infoCommScore),
      principles: [
        {
          number: 13,
          name: "Relevant quality information",
          status: "adequate",
          note: "Aging, adjustments, and deposits must be visible to the owner.",
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
          note: "Payer and vendor channels exist; exception routing is uneven.",
        },
      ],
      findings: knowledgeAssessed
        ? spofs.slice(0, 3).map((s) => ({
            id: `ic-${s.knowledgeId}`,
            label: `SPOF: ${s.name}`,
            detail: `Sole strong owner: ${s.owners[0]?.name ?? "unknown"}. Continuity and internal know-how at risk.`,
            severity: "critical" as HealthStatus,
            link: { type: "knowledge" as const, knowledgeId: s.knowledgeId },
          }))
        : [
            {
              id: "ic-register",
              label: "Register not assessed yet",
              detail:
                "Mark who can do each item on Who knows what. Until then key-person concentration is not scored here.",
              severity: "weak" as HealthStatus,
              link: { type: "knowledge" as const },
            },
          ],
      primaryActions: [
        {
          label: "Open knowledge map",
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
      status: statusFromScore(monitoringScore),
      principles: [
        {
          number: 16,
          name: "Ongoing / separate evaluations",
          status: staffComposition.independentBankRec ? "adequate" : "weak",
          note: "Bank and adjustment reviews are the primary detective layer for small practices.",
        },
        {
          number: 17,
          name: "Communicate deficiencies",
          status: unaddressedGaps.length > 0 ? "weak" : "adequate",
          note:
            unaddressedGaps.length > 0
              ? `${unaddressedGaps.length} control gap(s) lack a clear residual-risk or remediation decision.`
              : "Deficiencies are tagged with residual-risk decisions.",
        },
      ],
      findings: [
        {
          id: "mon-rec",
          label: staffComposition.independentBankRec
            ? "Independent bank rec active"
            : "Independent bank rec missing",
          detail: staffComposition.independentBankRec
            ? "Detective control reduces detection lag."
            : "Without independent rec, fraud and error lag rises — elevates Precog timelines.",
          severity: staffComposition.independentBankRec ? "adequate" : "critical",
          link: { type: "precog", scenarioId: "sc-cash-sod-failure" },
        },
        {
          id: "mon-residual",
          label: `${unaddressedGaps.length} gap(s) without residual decision`,
          detail:
            "COSO expects deficiencies to be evaluated and either fixed or accepted with compensating design.",
          severity: unaddressedGaps.length > 0 ? "weak" : "strong",
          link: { type: "sod" },
        },
      ],
      primaryActions: [
        { label: "Close SoD residual decisions", link: { type: "sod" } },
        {
          label: "Re-run cash Precog after control change",
          link: { type: "precog", scenarioId: "sc-cash-sod-failure" },
        },
      ],
    },
  ];

  const overall = Math.round(components.reduce((s, c) => s + c.score, 0) / components.length);

  const priorityFindings = components
    .flatMap((c) => c.findings)
    .filter((f) => f.severity === "critical" || f.severity === "weak")
    .slice(0, 8);

  return {
    overall,
    overallStatus: statusFromScore(overall),
    components,
    priorityFindings,
  };
}
