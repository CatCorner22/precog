/**
 * Continuity register tools: single points of failure, planned absences, and check-ins.
 */
import { registerAssessed, trackRegisterFreshness } from "../continuity/register-state";
import { CONFIRMATION_MAX_AGE_DAYS, checkInPlan, staleItems } from "../continuity/staleness";
import { coverageReport } from "../continuity/coverage";
import { documentationDebt } from "../continuity/documentation";
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
import { findKnowledgeRisks } from "../engine";
import type { IndustryTemplate } from "../templates/types";
import type { PracticeProfile } from "../practice-profile";
import type { ToolName, ToolResult } from "./types";

export interface ContinuityToolInput {
  tool: ToolName;
  profile: PracticeProfile;
  tpl: IndustryTemplate;
  /** Owner's local calendar day (YYYY-MM-DD). */
  today: string;
}

export function knowledgeSpofs({ tool, profile, tpl, today }: ContinuityToolInput): ToolResult {
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
  const freshness = trackFreshness ? staleItems(tpl, today) : null;
  const staleIds = new Set(freshness?.stale.map((s) => s.item.id) ?? []);
  const moveByItem = new Map(continuity.plan.map((m) => [m.item.id, m]));
  const leanedOn = continuity.people.find((l) => l.person.active);
  const freshnessSummary =
    freshness && freshness.stale.length > 0
      ? `; ${freshness.stale.length} item(s) not confirmed in ${CONFIRMATION_MAX_AGE_DAYS} days (${freshness.confirmedIndex}% confirmed)`
      : "";
  const committed = continuityCommitments(profile.decisions, tpl, today);
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

export function plannedAbsences({ tool, profile, tpl, today }: ContinuityToolInput): ToolResult {
  const report = plannedAbsenceReport(tpl, profile.plannedAbsences ?? [], profile.industry, today);
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
        procedureLocation: s.item.documented ? s.item.procedureLocation?.trim() || null : null,
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

export function registerCheckins({ tool, profile, tpl, today }: ContinuityToolInput): ToolResult {
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
  const plan = checkInPlan(tpl, today);
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
