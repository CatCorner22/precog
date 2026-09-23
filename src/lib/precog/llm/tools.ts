/**
 * Grounding tools for the Pioneer LLM — deterministic practice facts + ML/RAG.
 */
import { describeChunkBasis } from "../rag/corpus";
import { registerAssessed, trackRegisterFreshness } from "../continuity/register-state";
import { mapAssessed } from "../builder/map-state";
import { industryMeta } from "../industry";
import { assessCoso } from "../coso";
import { resolveTemplate } from "../active-template";
import { findKnowledgeRisks, rankDangerousScenarios, runPrecogScenario } from "../engine";
import {
  CONFIRMATION_MAX_AGE_DAYS,
  coverageReport,
  documentationDebt,
  checkInPlan,
  staleItems,
} from "../continuity/coverage";
import {
  absencesNeedingAttention,
  describeWindow,
  handoffDeadline,
  plannedAbsenceReport,
} from "../continuity/planned-absence";
import {
  describeDebrief,
  describeDebriefItem,
  leaveDebriefs,
  standInAlreadyStrong,
} from "../continuity/leave-debrief";
import { describeLeaver, handoverDeadline, leavers } from "../continuity/leavers";
import {
  continuityCommitments,
  continuityStepKey,
  handoffCommitment,
} from "../decisions/follow-through";
import { portfolioSummary, tornadoSensitivity } from "../scoring/residual-engine";
import { compareScenarioFutures } from "../scoring/scenario-compare";
import {
  DEFAULT_RISK_VARIABLES,
  evaluateDynamicRisk,
  scenarioFlags,
  type RiskVariableState,
} from "../scoring/dynamic-variables";
import {
  simulateAllCascades,
  simulateCascadeLever,
  type CascadeLeverId,
} from "../scoring/variable-cascade";
import { retrieveKnowledge } from "../rag/retrieve";
import { scoreLeadingIndicators } from "../ml/leading-indicators";
import { casesForSodRules, detectionBreakdown, observedLossRange } from "../evidence";
import { detectSodConflicts, sodDetectionOptions } from "../sod/detect";
import { runAdvancedReasoning } from "./reasoning/engine";
import { runMetaAnalysis } from "./meta-analysis";
import { defaultProfile, type PracticeProfile } from "../practice-profile";
import type { StaffComposition } from "../types";
import { CADENCE_LABEL, processRecordReport } from "../process-record";
import type { ToolName, ToolResult } from "./types";

export interface ToolContext {
  /** The business being advised. Every tool is a pure function of this. */
  profile?: PracticeProfile;
  question?: string;
  /** Owner's local calendar day (YYYY-MM-DD), already validated at the request boundary. */
  today?: string;
}

function profileOf(ctx: ToolContext): PracticeProfile {
  return ctx.profile ?? defaultProfile();
}

function usd(n: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(n);
}

export const TOOL_CATALOG: {
  name: ToolName;
  description: string;
  args: string;
}[] = [
  {
    name: "get_practice_snapshot",
    description: "Practice name, staff, risk variables, crime priors.",
    args: "none",
  },
  {
    name: "get_coso_assessment",
    description: "Five COSO components and priority findings.",
    args: "none",
  },
  {
    name: "get_residual_portfolio",
    description: "Ranked residual risks with drivers.",
    args: "none",
  },
  {
    name: "get_knowledge_spofs",
    description:
      "Duties and know-how only one person can run alone, plus documentation gaps, with the suggested trainee and next step from the owner's continuity register, whether each entry was confirmed in the last 90 days, and whether the owner has already logged that step in the Journal (with its review date) so it is followed up rather than recommended again.",
    args: "none",
  },
  {
    name: "get_register_checkins",
    description:
      "Who the owner should sit down with to re-confirm the continuity register: per active person, the entries not confirmed in 90 days that the register says they can do, and how many of those nobody else can run alone; plus stale entries nobody active holds.",
    args: "none",
  },
  {
    name: "get_planned_absences",
    description:
      "Absences from the owner's register that have started or start within 30 days — planned leave and unplanned ones recorded on the day (sick, emergency; `unplanned: true`, speak of these as unexpected cover, never as leave): who is away and when, days of lead time, which duties stop while they (and anyone whose absence overlaps) are out, the stand-in for each, who is left, and whether a hand-off is already logged in the Journal. Also absences that just ended and await a debrief: who covered which duty for how many days, and whether the register can now promote them. Also `leavers`: people who have given notice (last working day, days left, or already past it and still counted as cover), with the hand-over each must complete before they go — every register entry only they can run alone, the successor to train, what is not written down, processes needing a new owner, and which steps are already in the Journal.",
    args: "none",
  },
  { name: "get_knowledge_graph", description: "Person↔knowledge continuity edges.", args: "none" },
  {
    name: "get_process_records",
    description:
      "The process map's continuity record: for each process, how often it runs, which systems it runs in, its owners, and whether a written procedure exists and where it lives. Lists the processes a stand-in could not run from paper, most urgent first (nothing written before written-but-unlocated, then the ones that stop soonest by cadence, then unowned). Use when the owner asks what is written down, what stops if someone is out, or which SOPs to write first.",
    args: "none",
  },
  {
    name: "run_precog_scenario",
    description: "A scenario's assumed timeline, assumed retained loss, and cost-of-risk figure.",
    args: "{ scenarioId? }",
  },
  {
    name: "compare_scenario_futures",
    description: "Do-nothing vs mitigations.",
    args: "{ scenarioId? }",
  },
  {
    name: "get_tornado_levers",
    description: "Highest residual leverage control changes.",
    args: "none",
  },
  {
    name: "get_insurance_cost_of_risk",
    description: "Premium, discounts, retained, CoR.",
    args: "{ scenarioId? }",
  },
  { name: "get_sod_conflicts", description: "SoD gaps and compensating controls.", args: "none" },
  {
    name: "simulate_variable_cascades",
    description: "Cross-variable ripple effects.",
    args: "{ leverId?, scenarioId? }",
  },
  {
    name: "retrieve_guidance",
    description: "TF-IDF RAG over COSO/SoD/Lean/fraud corpus.",
    args: "{ query? }",
  },
  {
    name: "get_case_evidence",
    description:
      "Prosecuted cases from the evidence library that match this business's open duty conflicts: title, sector, loss, duration, how it was found, what would have caught it, and the government source URL.",
    args: "none",
  },
  {
    name: "get_leading_indicators",
    description: "Conditions this app watches (watch / breach), with the reason for each.",
    args: "none",
  },
  {
    name: "run_advanced_reasoning",
    description:
      "Lever ordering from this app's own model: which control or insurance lever first, and what to verify next. Weights, not measurements.",
    args: "none",
  },
  {
    name: "run_meta_analysis",
    description:
      "What this app measures directly, what it knows it cannot see, and what lies outside its model.",
    args: "none",
  },
];

export function executeTool(
  tool: ToolName,
  args: Record<string, unknown> = {},
  ctx: ToolContext = {},
): ToolResult {
  const profile = profileOf(ctx);
  const tpl = resolveTemplate(profile);
  const { people, knowledge, relations, scenarios, controls, crimeFraudStats } = tpl;
  const staff: StaffComposition = profile.staff;
  const practiceName = profile.practiceName || tpl.businessName;
  const riskVars: RiskVariableState = profile.riskVariables ?? DEFAULT_RISK_VARIABLES;

  try {
    switch (tool) {
      case "get_practice_snapshot":
        return {
          tool,
          ok: true,
          summary: `${practiceName}: team ${staff.teamSize}, segregation ${staff.segregationScore}/100`,
          data: {
            practice: practiceName,
            industry: tpl.id,
            staff,
            riskVariables: {
              basePremiumAnnual: riskVars.basePremiumAnnual,
              deductible: riskVars.deductible,
              policyLimit: riskVars.policyLimit,
              hasDualControl: riskVars.hasDualControl,
              hasIndependentBankRec: riskVars.hasIndependentBankRec,
              hasSecurityCameras: riskVars.hasSecurityCameras,
              claimsLoadFactor: riskVars.claimsLoadFactor,
              dailyCashExposure: riskVars.dailyCashExposure,
            },
            publishedFraudStats: {
              medianLossSmallOrgUsd: crimeFraudStats.medianLossSmallOrgUsd,
              medianDetectionMonths: crimeFraudStats.medianDetectionMonths,
              medianLossAllUsd: crimeFraudStats.medianLossAllUsd,
              statsSource: crimeFraudStats.source,
            },
          },
          links: [{ tab: "command", label: "Command" }],
        };

      case "get_coso_assessment": {
        const coso = assessCoso(tpl);
        return {
          tool,
          ok: true,
          summary: `COSO ${coso.overall}/100 (${coso.overallStatus})`,
          data: {
            overall: coso.overall,
            status: coso.overallStatus,
            components: coso.components.map((c) => ({
              id: c.id,
              name: c.name,
              score: c.score,
              status: c.status,
            })),
            priorityFindings: coso.priorityFindings.slice(0, 6),
          },
          links: [{ tab: "coso", label: "COSO" }],
        };
      }

      case "get_residual_portfolio": {
        const p = portfolioSummary(tpl, staff);
        return {
          tool,
          ok: true,
          summary: `Avg residual ${p.averageResidual}; top ${p.top[0]?.name ?? "—"}`,
          data: {
            scoringVersion: p.scoringVersion,
            averageResidual: p.averageResidual,
            criticalPath: p.criticalPath,
            actNow: p.actNow,
            top: p.top.slice(0, 8).map((t) => ({
              id: t.id,
              name: t.name,
              category: t.category,
              residual: t.residual,
              band: t.bandLabel,
              inherent: t.inherent,
              controlEffectiveness: t.controlEffectiveness,
              drivers: t.drivers.slice(0, 4),
              linkedScenarioId: t.linkedScenarioId,
              linkedKnowledgeId: t.linkedKnowledgeId,
              expectedLoss: t.expectedLoss,
              p50Days: t.p50Days,
            })),
          },
          links: [{ tab: "residual", label: "Residual" }],
        };
      }

      case "get_knowledge_spofs": {
        if (!registerAssessed(tpl)) {
          return {
            tool,
            ok: true,
            summary:
              tpl.knowledge.length === 0
                ? "Continuity is not assessed: the register is empty, so the owner has not listed the duties, tasks and know-how the business runs on. Do not quote coverage figures."
                : `Continuity is not assessed: the register holds ${tpl.knowledge.length} starter item(s) from the industry example with nobody marked on any of them. Do not quote coverage figures; advise the owner to mark who can do each item on Who knows what.`,
            data: {
              assessed: false,
              items: tpl.knowledge.map((k) => ({
                knowledgeId: k.id,
                name: k.name,
                criticality: k.criticality,
              })),
            },
            links: [{ tab: "knowledge", label: "Who knows what" }],
          };
        }
        const risks = findKnowledgeRisks(tpl).filter((r) => r.soleOwner || r.ownerCount === 0);
        const continuity = coverageReport(tpl);
        const docs = documentationDebt(tpl);
        const trackFreshness = trackRegisterFreshness(profile, tpl);
        const freshness = trackFreshness
          ? staleItems(tpl, ctx.today ?? new Date().toISOString().slice(0, 10))
          : null;
        const staleIds = new Set(freshness?.stale.map((s) => s.item.id) ?? []);
        const moveByItem = new Map(continuity.plan.map((m) => [m.item.id, m]));
        const leanedOn = continuity.people.find((l) => l.person.active);
        const freshnessSummary =
          freshness && freshness.stale.length > 0
            ? `; ${freshness.stale.length} item(s) not confirmed in ${CONFIRMATION_MAX_AGE_DAYS} days (${freshness.confirmedIndex}% confirmed)`
            : "";
        const committed = continuityCommitments(
          profile.decisions,
          tpl,
          ctx.today ?? new Date().toISOString().slice(0, 10),
        );
        const committedRows = risks.filter((r) =>
          committed.has(continuityStepKey(r.knowledgeId, "cover")),
        ).length;
        const overdueRows = risks.filter(
          (r) => committed.get(continuityStepKey(r.knowledgeId, "cover"))?.overdue,
        ).length;
        const commitmentSummary =
          committedRows > 0
            ? `; ${committedRows} already being cross-trained per the Journal${overdueRows > 0 ? ` (${overdueRows} past review date)` : ""} — do not recommend those again, ask whether they happened`
            : "";
        return {
          tool,
          ok: true,
          summary: `${risks.length} SPOF/unowned item(s); ${continuity.coverageIndex}% of work backed up${leanedOn ? `; ${leanedOn.person.name} carries ${leanedOn.dependence}% of must-do work alone` : ""}; ${docs.counts.none} item(s) with nothing written down${freshnessSummary}${commitmentSummary}`,
          data: risks.map((r) => {
            const move = moveByItem.get(r.knowledgeId);
            const commitment = committed.get(continuityStepKey(r.knowledgeId, "cover"));
            const docCommitment =
              committed.get(continuityStepKey(r.knowledgeId, "document")) ??
              committed.get(continuityStepKey(r.knowledgeId, "locate"));
            return {
              knowledgeId: r.knowledgeId,
              name: r.name,
              soleOwner: r.soleOwner,
              ownerCount: r.ownerCount,
              owners: r.owners.map((o) => ({ id: o.id, name: o.name, role: o.role })),
              riskScore: r.riskScore,
              coverage: move?.status ?? "covered",
              suggestedTrainee: move?.trainee
                ? { id: move.trainee.id, name: move.trainee.name, role: move.trainee.role }
                : null,
              documented: Boolean(move?.item.documented),
              procedureLocation: move?.item.documented
                ? move.item.procedureLocation?.trim() || null
                : null,
              confirmedAt: move?.item.confirmedAt ?? null,
              stale: staleIds.has(r.knowledgeId),
              nextStep: move?.action ?? null,
              committed: commitment
                ? {
                    subject: commitment.decision.subject,
                    trainee: commitment.person
                      ? { id: commitment.person.id, name: commitment.person.name }
                      : null,
                    loggedOn: commitment.decision.createdAt.slice(0, 10),
                    reviewBy: commitment.reviewBy,
                    overdue: commitment.overdue,
                  }
                : null,
              documentationCommitted: docCommitment
                ? {
                    step: docCommitment.step,
                    subject: docCommitment.decision.subject,
                    reviewBy: docCommitment.reviewBy,
                    overdue: docCommitment.overdue,
                  }
                : null,
            };
          }),
          links: [{ tab: "knowledge", label: "Who knows what" }],
        };
      }

      case "get_planned_absences": {
        const today = ctx.today ?? new Date().toISOString().slice(0, 10);
        const report = plannedAbsenceReport(
          tpl,
          profile.plannedAbsences ?? [],
          profile.industry,
          today,
        );
        const soon = absencesNeedingAttention(report.windows);
        const committed = continuityCommitments(profile.decisions, tpl, today);
        const windows = soon.map((w) => ({
          person: { id: w.person.id, name: w.person.name, role: w.person.role },
          from: w.absence.from,
          to: w.absence.to,
          unplanned: Boolean(w.absence.unplanned),
          daysUntil: w.daysUntil,
          status: w.status,
          handoffBy: handoffDeadline(w, today),
          overlaps: w.overlaps.map((o) => ({
            person: { id: o.person.id, name: o.person.name },
            from: o.from,
            to: o.to,
          })),
          worstStretch: {
            from: w.peak.from,
            to: w.peak.to,
            away: w.peak.people.map((p) => ({ id: p.id, name: p.name })),
            extraStops: w.peak.extraStops.map((k) => k.name),
          },
          dependence: w.impact.dependence,
          stops: w.impact.stops.map((s) => {
            const handoff = handoffCommitment(committed, s.item.id, w.absence.id);
            return {
              knowledgeId: s.item.id,
              name: s.item.name,
              criticality: s.item.criticality,
              standIn: s.standIn ? { id: s.standIn.id, name: s.standIn.name } : null,
              documented: Boolean(s.item.documented),
              procedureLocation: s.item.documented
                ? s.item.procedureLocation?.trim() || null
                : null,
              handoffCommitted: handoff
                ? {
                    subject: handoff.decision.subject,
                    reviewBy: handoff.reviewBy,
                    overdue: handoff.overdue,
                  }
                : null,
            };
          }),
          orphanedProcesses: w.impact.orphanedProcesses,
          remaining: w.impact.remaining.map((p) => ({ id: p.id, name: p.name })),
          summary: describeWindow(w),
        }));
        const debriefs = leaveDebriefs(
          tpl,
          profile.plannedAbsences ?? [],
          profile.decisions,
          profile.industry,
          today,
        ).map((d) => ({
          absenceId: d.absence.id,
          person: { id: d.person.id, name: d.person.name },
          from: d.absence.from,
          to: d.absence.to,
          unplanned: Boolean(d.absence.unplanned),
          lengthDays: d.lengthDays,
          daysSince: d.daysSince,
          items: d.items.map((e) => ({
            knowledgeId: e.item.id,
            name: e.item.name,
            criticality: e.item.criticality,
            standIn: e.standIn ? { id: e.standIn.id, name: e.standIn.name } : null,
            standInLevel: e.standInLevel ?? null,
            canPromote: Boolean(e.standIn) && !standInAlreadyStrong(e),
            handoffOpen: Boolean(e.handoff),
            trainingLogged: Boolean(e.training),
            question: describeDebriefItem(d, e),
          })),
          summary: describeDebrief(d),
        }));
        const departing = leavers(tpl, profile.decisions, today).map((l) => ({
          person: { id: l.person.id, name: l.person.name, role: l.person.role },
          lastDay: l.lastDay,
          daysLeft: l.daysLeft,
          status: l.status,
          handoverBy: handoverDeadline(l, today),
          dependence: l.dependence,
          handover: l.handover.map((h) => ({
            knowledgeId: h.item.id,
            name: h.item.name,
            criticality: h.item.criticality,
            successor: h.successor ? { id: h.successor.id, name: h.successor.name } : null,
            successorLevel: h.successorLevel ?? null,
            documented: Boolean(h.item.documented),
            procedureLocation: h.item.documented ? h.item.procedureLocation?.trim() || null : null,
            trainingLogged: h.training
              ? { subject: h.training.subject, reviewBy: h.training.reviewBy ?? null }
              : null,
            documentingLogged: h.documenting
              ? { subject: h.documenting.subject, reviewBy: h.documenting.reviewBy ?? null }
              : null,
          })),
          shared: l.shared.map((k) => k.name),
          orphanedProcesses: l.orphanedProcesses,
          remaining: l.remaining.map((p) => ({ id: p.id, name: p.name })),
          unlogged: l.unlogged,
          summary: describeLeaver(l),
        }));
        const later = report.windows.length - soon.length;
        const ahead =
          report.windows.length === 0
            ? "Nobody on the register is out or has leave booked"
            : soon.length === 0
              ? `${later} planned absence(s), none within 30 days`
              : `${soon
                  .slice(0, 3)
                  .map((w) => describeWindow(w))
                  .join(" ")}${later > 0 ? ` ${later} more further out.` : ""}`;
        const withDebriefs =
          debriefs.length === 0
            ? ahead
            : `${ahead}${ahead.endsWith(".") ? "" : "."} Debrief due: ${debriefs
                .slice(0, 2)
                .map((d) => d.summary)
                .join(" ")}`;
        const summary =
          departing.length === 0
            ? withDebriefs
            : `${withDebriefs}${withDebriefs.endsWith(".") ? "" : "."} Leaving: ${departing
                .slice(0, 2)
                .map((l) => l.summary)
                .join(" ")}`;
        return {
          tool,
          ok: true,
          summary,
          data: {
            windows,
            later,
            unmatched: report.unmatched.length,
            debriefs,
            leavers: departing,
          },
          links: [{ tab: "knowledge", label: "Who knows what" }],
        };
      }

      case "get_register_checkins": {
        const trackFreshness = trackRegisterFreshness(profile, tpl);
        if (!trackFreshness) {
          return {
            tool,
            ok: true,
            summary: "Freshness is not tracked until the owner enters their own register",
            data: { checkIns: [], unheld: [], tracked: false },
            links: [{ tab: "knowledge", label: "Who knows what" }],
          };
        }
        const plan = checkInPlan(tpl, ctx.today ?? new Date().toISOString().slice(0, 10));
        const checkIns = plan.checkIns.map((c) => ({
          person: { id: c.person.id, name: c.person.name, role: c.person.role },
          soleCount: c.soleCount,
          items: c.items.map((entry) => ({
            knowledgeId: entry.item.id,
            name: entry.item.name,
            criticality: entry.item.criticality,
            level: entry.level,
            coverage: entry.coverage,
            confirmedAt: entry.confirmedAt,
            ageDays: entry.ageDays,
          })),
        }));
        const unheld = plan.unheld.map((entry) => ({
          knowledgeId: entry.item.id,
          name: entry.item.name,
          criticality: entry.item.criticality,
          coverage: entry.coverage,
          confirmedAt: entry.confirmedAt,
        }));
        const summary =
          checkIns.length === 0 && unheld.length === 0
            ? `Every register entry was confirmed in the last ${CONFIRMATION_MAX_AGE_DAYS} days`
            : [
                checkIns.length > 0
                  ? `check in with ${checkIns
                      .slice(0, 3)
                      .map(
                        (c) =>
                          `${c.person.name} (${c.items.length}${c.soleCount > 0 ? `, ${c.soleCount} sole` : ""})`,
                      )
                      .join(", ")}${checkIns.length > 3 ? ` and ${checkIns.length - 3} more` : ""}`
                  : "",
                unheld.length > 0
                  ? `${unheld.length} stale entr${unheld.length === 1 ? "y" : "ies"} nobody active holds`
                  : "",
              ]
                .filter(Boolean)
                .join("; ");
        return {
          tool,
          ok: true,
          summary,
          data: { checkIns, unheld, tracked: true },
          links: [{ tab: "knowledge", label: "Who knows what" }],
        };
      }

      case "get_knowledge_graph": {
        const STRONG = new Set(["expert", "proficient"]);
        const edges = relations
          .filter((r) => STRONG.has(r.level))
          .map((r) => {
            const person = people.find((p) => p.id === r.personId);
            const k = knowledge.find((x) => x.id === r.knowledgeId);
            return {
              personId: r.personId,
              personName: person?.name,
              knowledgeId: r.knowledgeId,
              knowledgeName: k?.name,
              level: r.level,
            };
          });
        return {
          tool,
          ok: true,
          summary: `${edges.length} strong edges`,
          data: { edges, peopleCount: people.length, knowledgeCount: knowledge.length },
          links: [{ tab: "knowledge", label: "Knowledge map" }],
        };
      }

      case "get_process_records": {
        const personName = (id: string) => people.find((p) => p.id === id)?.name ?? id;
        if (!mapAssessed(profile)) {
          return {
            tool,
            ok: true,
            summary:
              tpl.processes.length === 0
                ? "The process map is not assessed: it is empty, so the owner has not yet listed the processes the business runs. Do not quote map figures; advise the owner to add their processes on How work flows."
                : `The process map is not assessed: it holds ${tpl.processes.length} starter processes from the ${industryMeta(tpl.id).label.toLowerCase()} example with no owner assigned. Do not quote map figures; advise the owner to assign an owner to each process on How work flows, or to build their own map.`,
            data: {
              assessed: false,
              processes: tpl.processes.map((p) => ({
                processId: p.id,
                name: p.name,
                cadence: p.cadence ?? null,
                systems: p.systems ?? [],
                owners: (p.ownerPersonIds ?? []).map(personName),
              })),
            },
            links: [{ tab: "map", label: "How work flows" }],
          };
        }
        const report = processRecordReport(tpl.processes);
        return {
          tool,
          ok: true,
          summary: `${report.total} process(es); ${report.documentedIndex}% have a written, findable procedure; ${report.counts.none} with nothing written down, ${report.counts.unlocated} written but unlocated, ${report.cadenceUnknown} with no cadence recorded`,
          data: {
            documentedIndex: report.documentedIndex,
            counts: report.counts,
            cadenceUnknown: report.cadenceUnknown,
            gaps: report.gaps.map((g) => ({
              processId: g.process.id,
              name: g.process.name,
              state: g.state,
              cadence: g.process.cadence ? CADENCE_LABEL[g.process.cadence] : null,
              stopsWithinDays: g.stopsWithinDays,
              systems: g.process.systems ?? [],
              owners: (g.process.ownerPersonIds ?? []).map(personName),
              unowned: g.unowned,
              nextStep: g.nextStep,
            })),
            processes: tpl.processes.map((p) => ({
              processId: p.id,
              name: p.name,
              cadence: p.cadence ?? null,
              systems: p.systems ?? [],
              owners: (p.ownerPersonIds ?? []).map(personName),
              documented: p.documented ?? null,
              procedureLocation: p.procedureLocation ?? null,
            })),
          },
          links: [{ tab: "map", label: "How work flows" }],
        };
      }

      case "run_precog_scenario": {
        const ranked = rankDangerousScenarios(tpl, { staff, riskVariables: riskVars });
        const scenarioId = (args.scenarioId as string) || ranked[0]?.scenario.id || scenarios[0].id;
        const result = runPrecogScenario(tpl, scenarioId, { staff, riskVariables: riskVars });
        const scenario = scenarios.find((s) => s.id === scenarioId);
        if (!result || !scenario) {
          return { tool, args, ok: false, summary: "Scenario not found", data: null };
        }
        return {
          tool,
          args: { scenarioId },
          ok: true,
          summary: `${scenario.title}: retained ${usd(result.retainedImpact.expected)}, CoR ${usd(result.dynamic?.expectedAnnualCostOfRisk ?? 0)}`,
          data: {
            scenarioId,
            title: scenario.title,
            timelineDays: result.timelineDays,
            gross: result.financialImpact,
            retained: result.retainedImpact,
            dynamic: result.dynamic
              ? {
                  likelihoodMultiplier: result.dynamic.likelihoodMultiplier,
                  grossSeverityMultiplier: result.dynamic.grossSeverityMultiplier,
                  detectionLagMultiplier: result.dynamic.detectionLagMultiplier,
                  premiumAnnualNet: result.dynamic.premiumAnnualNet,
                  discountPctApplied: result.dynamic.discountPctApplied,
                  expectedAnnualCostOfRisk: result.dynamic.expectedAnnualCostOfRisk,
                  transferredExpected: result.dynamic.transferredExpected,
                }
              : null,
            cascade: result.cascade,
          },
          links: [{ tab: "precog", id: scenarioId, label: scenario.title }],
        };
      }

      case "compare_scenario_futures": {
        const ranked = rankDangerousScenarios(tpl, { staff, riskVariables: riskVars });
        const scenarioId = (args.scenarioId as string) || ranked[0]?.scenario.id || scenarios[0].id;
        const report = compareScenarioFutures(tpl, scenarioId, staff, [], riskVars);
        return {
          tool,
          args: { scenarioId },
          ok: true,
          summary: `Compared ${report.columns.length} futures`,
          data: {
            scenarioId,
            winnerByRetained: report.winnerByRetained,
            winnerByAnnualCor: report.winnerByAnnualCor,
            columns: report.columns.map((c) => ({
              id: c.id,
              label: c.label,
              retained: c.result.retainedImpact?.expected,
              annualCor: c.result.dynamic?.expectedAnnualCostOfRisk,
            })),
          },
          links: [{ tab: "precog", id: scenarioId, label: "Compare" }],
        };
      }

      case "get_tornado_levers": {
        const t = tornadoSensitivity(tpl, staff);
        return {
          tool,
          ok: true,
          summary: `Top lever: ${t.levers[0]?.label ?? "—"}`,
          data: { baseAverage: t.baseAverage, levers: t.levers },
          links: [{ tab: "residual", label: "Tornado" }],
        };
      }

      case "get_insurance_cost_of_risk": {
        const ranked = rankDangerousScenarios(tpl, { staff, riskVariables: riskVars });
        const scenarioId = (args.scenarioId as string) || ranked[0]?.scenario.id || scenarios[0].id;
        const scenario = scenarios.find((s) => s.id === scenarioId)!;
        const dyn = evaluateDynamicRisk(
          riskVars,
          scenario.baseFinancialImpact,
          scenarioFlags(scenarioId),
        );
        return {
          tool,
          args: { scenarioId },
          ok: true,
          summary: `CoR ${usd(dyn.transfer.expectedAnnualCostOfRisk)}; premium ${usd(dyn.transfer.premiumAnnualNet)}`,
          data: {
            scenarioId,
            variables: riskVars,
            likelihoodSeverity: dyn.likelihoodSeverity,
            transfer: dyn.transfer,
          },
          links: [{ tab: "precog", label: "Insurance" }],
        };
      }

      case "get_sod_conflicts": {
        const gaps = controls.filter((c) => !c.segregated);
        return {
          tool,
          ok: true,
          summary: `${gaps.length} SoD gap(s)`,
          data: gaps.map((g) => ({
            id: g.id,
            name: g.name,
            duties: g.duties,
            compensatingControls: g.compensatingControls,
            residualRiskAccepted: g.residualRiskAccepted,
          })),
          links: [{ tab: "sod", label: "SoD" }],
        };
      }

      case "simulate_variable_cascades": {
        const ranked = rankDangerousScenarios(tpl, { staff, riskVariables: riskVars });
        const scenarioId = (args.scenarioId as string) || ranked[0]?.scenario.id || scenarios[0].id;
        const leverId = args.leverId as CascadeLeverId | undefined;
        if (leverId) {
          const one = simulateCascadeLever(tpl, leverId, riskVars, staff, scenarioId);
          return {
            tool,
            args: { leverId, scenarioId },
            ok: true,
            summary: one.overallVerdict,
            data: {
              mode: "single",
              scenarioId,
              simulation: {
                lever: one.lever,
                verdict: one.overallVerdict,
                secondOrderNotes: one.secondOrderNotes,
                deltas: one.deltas,
                before: one.before,
                after: one.after,
              },
            },
            links: [{ tab: "precog", label: "Cascades" }],
          };
        }
        const all = simulateAllCascades(tpl, riskVars, staff, scenarioId);
        const topCor = all.rankedByCor.slice(0, 5).map((s) => ({
          leverId: s.lever.id,
          label: s.lever.label,
          affects: s.lever.affects,
          verdict: s.overallVerdict,
          secondOrderNotes: s.secondOrderNotes,
          deltaCor: s.after.expectedAnnualCostOfRisk - s.before.expectedAnnualCostOfRisk,
          deltaRetained: s.after.retainedExpected - s.before.retainedExpected,
          deltaPremium: s.after.premiumAnnualNet - s.before.premiumAnnualNet,
          deltaResidual: s.after.residualAverage - s.before.residualAverage,
          deltaP50: s.after.timelineP50 - s.before.timelineP50,
          deltaLikelihood: s.after.likelihoodMultiplier - s.before.likelihoodMultiplier,
          improves: s.deltas.filter((d) => d.direction === "improves").map((d) => d.label),
          worsens: s.deltas.filter((d) => d.direction === "worsens").map((d) => d.label),
        }));
        return {
          tool,
          args: { scenarioId },
          ok: true,
          summary: `Best CoR lever: ${topCor[0]?.label ?? "—"}`,
          data: {
            mode: "portfolio",
            scenarioId,
            baseline: all.baseline,
            dependencyMap: all.dependencyMap,
            topByCostOfRisk: topCor,
          },
          links: [{ tab: "precog", label: "Cascades" }],
        };
      }

      case "retrieve_guidance": {
        const query =
          (args.query as string) ||
          ctx.question ||
          `${tpl.businessName} residual risk segregation of duties bank reconciliation COSO monitoring`;
        const hits = retrieveKnowledge(query, { topK: 4, industry: tpl.id });
        return {
          tool,
          args: { query },
          ok: true,
          summary: hits.length ? `RAG: ${hits.map((h) => h.chunk.id).join(", ")}` : "RAG: no hits",
          data: {
            query,
            hits: hits.map((h) => ({
              id: h.chunk.id,
              title: h.chunk.title,
              domain: h.chunk.domain,
              score: Math.round(h.score * 1000) / 1000,
              text: h.chunk.text,
              basis: describeChunkBasis(h.chunk),
            })),
          },
          links: [{ tab: "intel", label: "Intelligence" }],
        };
      }

      case "get_case_evidence": {
        const sod = detectSodConflicts(
          tpl,
          profile.staff,
          sodDetectionOptions(tpl, profile.dualRelease),
        );
        const openRuleIds = [
          ...new Set(
            sod.conflicts
              .filter((c) => !c.residualRiskAccepted && !c.dualReleaseMitigated)
              .map((c) => c.ruleId),
          ),
        ];
        const cases = casesForSodRules(openRuleIds);
        const range = observedLossRange(cases);
        const found = detectionBreakdown(cases);
        // The case list is ordered by relevance to the open rules, so the
        // largest loss is found separately rather than read off the top.
        const largest = cases.reduce<(typeof cases)[number] | null>(
          (best, c) => (best === null || c.lossUsd > best.lossUsd ? c : best),
          null,
        );
        return {
          tool,
          ok: true,
          summary: cases.length
            ? `${cases.length} prosecuted case(s) match the open duty conflicts; median stated loss ${range ? usd(range.median) : "n/a"}`
            : "No prosecuted case in the library matches the open duty conflicts",
          // Every field here is a fact stated in the cited source, or the
          // library's own tagging of which control would have caught it.
          // Nothing is a rate or a forecast.
          data: {
            matchingCases: cases.length,
            openRuleIds,
            lossRange: range,
            largest: largest
              ? { title: largest.title, lossUsd: largest.lossUsd, lossIsFloor: largest.lossIsFloor }
              : null,
            detection: { known: found.known, unknown: found.unknown, byRoute: found.byRoute },
            cases: cases.slice(0, 8).map((c) => ({
              id: c.id,
              title: c.title,
              sector: c.sector,
              lossUsd: c.lossUsd,
              lossIsFloor: c.lossIsFloor,
              durationMonths: c.durationMonths ?? null,
              detection: c.detection,
              controlGap: c.controlGap,
              wouldHaveCaughtIt: c.wouldHaveCaughtIt.map((w) => w.asApplied),
              source: { publisher: c.source.publisher, url: c.source.url },
            })),
          },
          links: [{ tab: "start", label: "Start here" }],
        };
      }

      case "get_leading_indicators": {
        const report = scoreLeadingIndicators(tpl, staff, riskVars);
        const breached = report.indicators.filter((i) => i.status === "breach").length;
        const watch = report.indicators.filter((i) => i.status === "watch").length;
        return {
          tool,
          ok: true,
          summary: `Leading indicators: ${breached} breached, ${watch} at watch, of ${report.indicators.length}`,
          // The composite index and its band are this app's weighting and are
          // deliberately not passed on; the conditions and their reasons are.
          data: {
            breached,
            watch,
            indicators: report.indicators.map((i) => ({
              id: i.id,
              label: i.label,
              status: i.status,
              why: i.why,
            })),
            topActions: report.topActions,
            basis: "Thresholds set in this app; not benchmarks.",
          },
          links: [{ tab: "intel", label: "Leading indicators" }],
        };
      }

      case "run_advanced_reasoning": {
        const report = runAdvancedReasoning(tpl, staff, riskVars);
        return {
          tool,
          ok: true,
          summary: `Lever ordering: ${report.recommendedSequence.join(" → ") || "status quo"} · verify next: ${report.evoi.topObservation}`,
          // Ordering and reasons only. The probabilities, intervals, expected
          // losses, utilities, and confidence score behind the ordering are
          // this app's weights and are not passed on as if measured.
          data: {
            recommendedSequence: report.recommendedSequence,
            bestSingleLever: report.counterfactual.bestIntervention,
            verifyNext: report.evoi.items.map((i) => ({
              observation: i.observation,
              effort: i.effort,
              rationale: i.rationale,
            })),
            synthesis: report.synthesis,
            basis: "This app's own weights, not measurements of this business.",
          },
          links: [{ tab: "intel", label: "Lever ordering" }],
        };
      }

      case "run_meta_analysis": {
        const report = runMetaAnalysis(profile);
        return {
          tool,
          ok: true,
          summary: `What this app can see: ${report.summary.knownKnowns} measured, ${report.summary.knownUnknowns} known gaps, ${report.summary.unknownUnknowns} outside the model`,
          data: {
            summary: report.summary,
            narrative: report.narrative,
            recommendations: report.recommendations,
            topUnknownUnknowns: report.items
              .filter((i) => i.classification === "unknown_unknown")
              .slice(0, 5)
              .map((i) => ({ id: i.id, title: i.title, severity: i.severity })),
            topKnownUnknowns: report.items
              .filter((i) => i.classification === "known_unknown")
              .slice(0, 5)
              .map((i) => ({ id: i.id, title: i.title, severity: i.severity })),
            coverage: report.coverage,
          },
          links: [{ tab: "intel", label: "Meta-analysis" }],
        };
      }

      default:
        return { tool, ok: false, summary: "Unknown tool", data: null };
    }
  } catch (e) {
    return {
      tool,
      args,
      ok: false,
      summary: e instanceof Error ? e.message : "Tool failed",
      data: null,
    };
  }
}

export function planTools(question: string): ToolName[] {
  const q = question.toLowerCase();
  const tools = new Set<ToolName>([
    "get_practice_snapshot",
    "get_residual_portfolio",
    "get_knowledge_spofs",
    "get_register_checkins",
    "get_planned_absences",
    "get_insurance_cost_of_risk",
    "simulate_variable_cascades",
    "retrieve_guidance",
    "get_leading_indicators",
    "get_case_evidence",
    "run_advanced_reasoning",
    "run_meta_analysis",
    "get_coso_assessment",
    "get_tornado_levers",
    "run_precog_scenario",
  ]);

  if (/sod|segregat|duty|write-?off|vendor|payment/.test(q)) {
    tools.add("get_sod_conflicts");
  }
  if (/knowledge|spof|leave|quit|cross-?train|continuity|document|written|procedure/.test(q)) {
    tools.add("get_knowledge_graph");
  }
  if (
    /process|procedure|sop|document|written|write.?down|cadence|how often|system|software|stand-?in|cover|out sick|vacation|map|workflow/.test(
      q,
    )
  ) {
    tools.add("get_process_records");
  }
  if (/scenario|timeline|impact|loss|embezzl|fraud|cash|compare/.test(q)) {
    tools.add("compare_scenario_futures");
  }
  if (/leading|early|signal|indicator/.test(q)) {
    tools.add("get_leading_indicators");
  }
  if (/coso|guidance|what does|policy|best practice|rag/.test(q)) {
    tools.add("retrieve_guidance");
  }
  if (
    /unknown|epistemic|meta|blind.?spot|rumsfeld|confidence|readiness|gap|what don.t we know/.test(
      q,
    )
  ) {
    tools.add("run_meta_analysis");
  }

  return Array.from(tools);
}
