import { portfolioSummary, tornadoSensitivity } from "@/lib/precog/scoring/residual-engine";
import { detectSodConflicts } from "@/lib/precog/sod/detect";
import { mitigatedSodRuleIds, type DualReleasePolicy } from "@/lib/precog/controls/dual-release";
import {
  checkInPlan,
  coverageReport,
  documentationDebt,
  DOCUMENTATION_LABEL,
  STATUS_LABEL,
} from "@/lib/precog/continuity/coverage";
import {
  continuityCommitments,
  continuityStepKey,
  handoffCommitment,
  localDateKey,
  type ContinuityCommitment,
} from "@/lib/precog/decisions/follow-through";
import {
  absencesNeedingAttention,
  formatDateRange,
  handoffDeadline,
  leadLabel,
  plannedAbsenceReport,
} from "@/lib/precog/continuity/planned-absence";
import { describeDebriefItem, leaveDebriefs } from "@/lib/precog/continuity/leave-debrief";
import type { DecisionEntry, PlannedAbsence } from "@/lib/precog/practice-profile";
import type { IndustryTemplate } from "@/lib/precog/templates/types";
import { HEAT_BANDS, type ProcessMapSnapshot } from "@/lib/precog/process-graph";
import {
  casesForControl,
  casesForSodRules,
  type CaseStudy,
  type ControlId,
} from "@/lib/precog/evidence";
import type { StaffComposition } from "@/lib/precog/types";

export interface WeeklyAction {
  id: string;
  title: string;
  why: string;
  effort: "low" | "medium" | "high";
  tab: string;
  priority: number;
  /** Deep-link to a process on the map tab. */
  processId?: string;
  /** The prosecuted cases this action rests on, where the library has any. */
  evidence?: ActionEvidence;
}

export interface ActionEvidence {
  caseCount: number;
  /** The largest recorded loss among those cases. */
  worst: { title: string; lossUsd: number; lossIsFloor: boolean } | null;
}

function evidenceFor(cases: readonly CaseStudy[]): ActionEvidence | undefined {
  if (cases.length === 0) return undefined;
  const withLoss = cases.filter((c) => c.lossUsd > 0);
  const worst = withLoss.reduce<CaseStudy | null>(
    (best, c) => (best === null || c.lossUsd > best.lossUsd ? c : best),
    null,
  );
  return {
    caseCount: cases.length,
    worst: worst
      ? { title: worst.title, lossUsd: worst.lossUsd, lossIsFloor: worst.lossIsFloor }
      : null,
  };
}

const STEP_VERB: Record<ContinuityCommitment["step"], string> = {
  cover: "training",
  handoff: "handing off",
  document: "writing down",
  locate: "locating the procedure for",
};

/**
 * A step the owner already logged in the Journal is not fresh advice. Until
 * the review date it is a low-priority "in progress" reminder; once the date
 * passes it becomes the week's question — did it happen? — pointing at the
 * Journal, where closing it as done also updates the register.
 */
function committedAction(
  c: ContinuityCommitment,
  priority: number,
  stillSays: string,
): WeeklyAction {
  const first = c.person?.name.split(" ")[0];
  const what =
    c.step === "cover" && first
      ? `${first} on ${c.item.name}`
      : `${STEP_VERB[c.step]} ${c.item.name}`;
  const logged = `You logged "${c.decision.subject}" on ${c.decision.createdAt.slice(0, 10)}${c.reviewBy ? ` with a review on ${c.reviewBy}` : ""}; the register still says ${stillSays}.`;
  if (c.overdue) {
    return {
      id: `commit-${c.decision.id}`,
      title:
        c.step === "cover"
          ? first
            ? `Review overdue: can ${first} run ${c.item.name} alone yet?`
            : `Review overdue: is ${c.item.name} backed up yet?`
          : c.step === "document"
            ? `Review overdue: is ${c.item.name} written down yet?`
            : c.step === "locate"
              ? `Review overdue: where does the ${c.item.name} procedure live?`
              : `Review overdue: ${c.item.name} hand-off`,
      why: `${logged} Close it in the Journal as done, which updates the register, or push the review date if it is still in progress.`,
      effort: "low",
      tab: "journal",
      priority,
    };
  }
  return {
    id: `commit-${c.decision.id}`,
    title: `In progress: ${what}${c.reviewBy ? ` — review ${c.reviewBy}` : ""}`,
    why: `${logged} Nothing new to start; if it has already happened, close it as done in the Journal.`,
    effort: "low",
    tab: "journal",
    priority: 40,
  };
}

/** Per gap kind (coverage, documentation): how many fresh recommendations and how many Journal reminders make the list. */
const MAX_FRESH_PER_GAP_KIND = 2;
const MAX_REMINDERS_PER_GAP_KIND = 2;

function casesForControls(ids: readonly ControlId[]): CaseStudy[] {
  const seen = new Map<string, CaseStudy>();
  for (const id of ids) for (const c of casesForControl(id)) seen.set(c.id, c);
  return [...seen.values()];
}

export function buildWeeklyActions(input: {
  tpl: IndustryTemplate;
  staff: StaffComposition;
  dualRelease: DualReleasePolicy;
  mapSnapshots?: ProcessMapSnapshot[];
  today?: string;
  trackFreshness?: boolean;
  /** The Journal, so steps already logged are reported as in progress rather than recommended again. */
  decisions?: readonly DecisionEntry[];
  /** Known leave, so hand-offs are advised ahead of time. */
  plannedAbsences?: readonly PlannedAbsence[];
}): WeeklyAction[] {
  const { tpl } = input;
  const today = input.today ?? localDateKey(new Date());
  const committed = continuityCommitments(input.decisions ?? [], tpl, today);
  const portfolio = portfolioSummary(tpl, input.staff);
  const sod = detectSodConflicts(tpl, input.staff, {
    dualReleaseMitigatedRuleIds: mitigatedSodRuleIds(input.dualRelease),
  });
  const continuity = coverageReport(tpl);
  const tornado = tornadoSensitivity(tpl, input.staff);
  const actions: WeeklyAction[] = [];

  if (!input.staff.independentBankRec) {
    actions.push({
      id: "bank-rec",
      title: "Start owner weekly bank reconciliation",
      why: "Owner sees the bank's record without going through the person who posts payments — catches errors and diverted payments early.",
      effort: "low",
      tab: "sod",
      priority: 95,
      evidence: evidenceFor(
        casesForControls(["owner-opens-bank-statement", "independent-bank-reconciliation"]),
      ),
    });
  }

  if (!input.staff.dualControlPayments) {
    actions.push({
      id: "dual-control",
      title: "Enable dual control on payments",
      why: "Separates payment release from vendor setup, so an invented supplier needs a second person to get paid. Narrows the path above the threshold; does not close it below.",
      effort: "medium",
      tab: "sod",
      priority: 90,
      evidence: evidenceFor(
        casesForControls(["dual-release-above-threshold", "new-payee-second-approval"]),
      ),
    });
  }

  for (const c of sod.conflicts.filter((x) => x.severity === "critical").slice(0, 2)) {
    actions.push({
      id: `sod-${c.ruleId}`,
      title: `Split ${c.labelA.toLowerCase()} from ${c.labelB.toLowerCase()}`,
      why: c.why || "Incompatible duties are concentrated on one role.",
      effort: "medium",
      tab: "sod",
      priority: 88,
      evidence: evidenceFor(casesForSodRules([c.ruleId])),
    });
  }

  const debriefs = leaveDebriefs(
    tpl,
    input.plannedAbsences ?? [],
    input.decisions ?? [],
    tpl.id,
    today,
  );
  // An entry someone just covered during leave is asked about as a debrief,
  // not recommended as fresh cross-training on top.
  const debriefing = new Set(debriefs.flatMap((d) => d.items.map((e) => e.item.id)));

  // Steps already in the Journal do not use up the fresh-advice slots, so the
  // next uncommitted gap still gets recommended.
  let freshLeft = MAX_FRESH_PER_GAP_KIND;
  let remindersLeft = MAX_REMINDERS_PER_GAP_KIND;
  for (const m of continuity.plan.filter(
    (x) =>
      x.item.criticality === "critical" && x.status !== "thin" && !debriefing.has(x.item.id),
  )) {
    if (freshLeft === 0 && remindersLeft === 0) break;
    const priority = m.status === "uncovered" ? 86 : 82;
    const c = committed.get(continuityStepKey(m.item.id, "cover"));
    if (c) {
      if (remindersLeft === 0) continue;
      remindersLeft -= 1;
      actions.push(committedAction(c, priority, STATUS_LABEL[m.status].toLowerCase()));
      continue;
    }
    if (freshLeft === 0) continue;
    freshLeft -= 1;
    actions.push({
      id: `spof-${m.item.id}`,
      title:
        m.status === "uncovered"
          ? `Find someone to own ${m.item.name}`
          : m.trainee
            ? `Cross-train ${m.trainee.name.split(" ")[0]} on ${m.item.name}`
            : `Cross-train a backup for ${m.item.name}`,
      why: `${m.action} One person holding critical work is both a continuity gap and a fraud-detection blind spot.`,
      effort: m.item.documented ? "low" : "medium",
      tab: "knowledge",
      priority,
    });
  }

  const leave = plannedAbsenceReport(tpl, input.plannedAbsences ?? [], tpl.id, today);
  // Covered leave adds nothing, so it must not use up the two slots.
  const leaveWorthRaising = absencesNeedingAttention(leave.windows).filter(
    (w) => w.impact.stops.length > 0 || w.impact.orphanedProcesses.length > 0,
  );
  for (const w of leaveWorthRaising.slice(0, 2)) {
    const first = w.person.name.split(" ")[0];
    const when = `${formatDateRange(w.absence.from, w.absence.to)}, ${leadLabel(w.daysUntil)}`;
    const also = w.overlaps.length
      ? ` ${w.overlaps.map((o) => o.person.name.split(" ")[0]).join(" and ")} ${w.overlaps.length === 1 ? "is" : "are"} also out for part of it.`
      : "";
    const stops = w.impact.stops;
    if (stops.length === 0) {
      const orphaned = w.impact.orphanedProcesses;
      actions.push({
        id: `leave-${w.absence.id}`,
        title: `${first} is out ${when}: ${orphaned.length} process${orphaned.length === 1 ? "" : "es"} without an owner`,
        why: `Nothing on the register stops, but nobody left owns ${orphaned.slice(0, 3).join(", ")}.${also} Name a stand-in owner before the leave starts.`,
        effort: "low",
        tab: "knowledge",
        priority: 70,
      });
      continue;
    }
    const open = stops.filter((s) => !handoffCommitment(committed, s.item.id, w.absence.id));
    const critical = open.filter((s) => s.item.criticality === "critical");
    const lead = critical[0] ?? open[0];
    const urgency = w.status === "current" ? 92 : w.daysUntil <= 7 ? 89 : 85;
    if (!lead) {
      const c = handoffCommitment(committed, stops[0].item.id, w.absence.id);
      if (c) actions.push(committedAction(c, urgency, `${first} is out ${when}`));
      continue;
    }
    const noOne = open.filter((s) => !s.standIn);
    const others = open.length - 1;
    const othersAway = w.peak.people.filter((p) => p.id !== w.person.id);
    const during =
      w.peak.extraStops.length > 0
        ? ` ${formatDateRange(w.peak.from, w.peak.to)}, while ${othersAway.map((p) => p.name.split(" ")[0]).join(" and ")} ${othersAway.length === 1 ? "is" : "are"} also out`
        : " for the whole absence";
    actions.push({
      id: `leave-${w.absence.id}`,
      title: lead.standIn
        ? `${first} is out ${when}: hand off ${lead.item.name} to ${lead.standIn.name.split(" ")[0]}${others > 0 ? ` and ${others} more` : ""}`
        : `${first} is out ${when}: ${lead.item.name} has no one${others > 0 ? ` (${others} more stop)` : ""}`,
      why: `${open.length === 1 ? `${lead.item.name} stops` : `${open.length} register entries stop`}${during}${noOne.length ? `; ${noOne.map((s) => s.item.name).join(", ")} ${noOne.length === 1 ? "has" : "have"} nobody who can run ${noOne.length === 1 ? "it" : "them"} alone` : ""}.${also}${
        w.status === "upcoming" ? ` Hand off by ${handoffDeadline(w, today)}.` : ""
      }${w.impact.remaining.length ? ` Left in the business: ${w.impact.remaining.map((p) => p.name.split(" ")[0]).join(", ")}.` : " Nobody else is left in the business."}`,
      effort: lead.standIn ? "low" : "medium",
      tab: "knowledge",
      priority: lead.item.criticality === "critical" ? urgency : urgency - 10,
    });
  }

  // Leave that just ended is a cross-training result waiting to be recorded:
  // the stand-in ran the work for real, so ask while it is fresh.
  for (const d of debriefs.slice(0, 2)) {
    const first = d.person.name.split(" ")[0];
    const lead = d.items[0];
    const more = d.items.length - 1;
    const standIn = lead.standIn?.name.split(" ")[0];
    actions.push({
      id: `debrief-${d.absence.id}`,
      title: standIn
        ? `${first}'s back: can ${standIn} run ${lead.item.name} alone now?${more > 0 ? ` (+${more} more)` : ""}`
        : `${first}'s back: who covered ${lead.item.name}?${more > 0 ? ` (+${more} more)` : ""}`,
      why: `${describeDebriefItem(d, lead)} On the register, one click moves the stand-in to "can do" and closes the hand-off; "Not yet" turns it into a tracked cross-training step.`,
      effort: "low",
      tab: "knowledge",
      priority: lead.item.criticality === "critical" ? 78 : 68,
    });
  }

  freshLeft = MAX_FRESH_PER_GAP_KIND;
  remindersLeft = MAX_REMINDERS_PER_GAP_KIND;
  for (const g of documentationDebt(tpl).gaps.filter((x) => x.item.criticality === "critical")) {
    if (freshLeft === 0 && remindersLeft === 0) break;
    const priority =
      g.state === "none" ? (g.coverage === "single" || g.coverage === "uncovered" ? 84 : 78) : 72;
    const c = committed.get(
      continuityStepKey(g.item.id, g.state === "none" ? "document" : "locate"),
    );
    if (c) {
      if (remindersLeft === 0) continue;
      remindersLeft -= 1;
      actions.push(committedAction(c, priority, DOCUMENTATION_LABEL[g.state].toLowerCase()));
      continue;
    }
    if (freshLeft === 0) continue;
    freshLeft -= 1;
    actions.push({
      id: `docs-${g.item.id}`,
      title:
        g.state === "none"
          ? `Write down ${g.item.name}`
          : `Record where ${g.item.name}'s procedure lives`,
      why: `${g.action} A stand-in cannot follow steps that exist only in someone's head, and an unwritten process is one nobody else can check.`,
      effort: g.state === "none" ? "medium" : "low",
      tab: "knowledge",
      priority,
    });
  }

  if (input.trackFreshness) {
    const plan = checkInPlan(tpl, today);
    const first = plan.checkIns[0];
    if (first) {
      const others = plan.checkIns.length - 1;
      const soleNote =
        first.soleCount > 0 ? `${first.soleCount} of them nobody else can run alone. ` : "";
      actions.push({
        id: `check-in-${first.person.id}`,
        title: `Check in with ${first.person.name.split(" ")[0]}: ${first.items.length} register ${first.items.length === 1 ? "entry" : "entries"}`,
        why: `The register says ${first.person.name} can do ${first.items
          .slice(0, 3)
          .map((entry) => entry.item.name)
          .join(
            ", ",
          )}${first.items.length > 3 ? ` and ${first.items.length - 3} more` : ""}, but nobody has confirmed it in 90+ days. ${soleNote}Ask, then mark each still does it / level changed / no longer.${
          others > 0
            ? ` ${others} more ${others === 1 ? "person" : "people"} to check in with after that.`
            : ""
        }${plan.unheld.length > 0 ? ` ${plan.unheld.length} stale item(s) nobody active holds.` : ""}`,
        effort: "low",
        tab: "knowledge",
        priority: first.soleCount > 0 ? 64 : 60,
      });
    } else if (plan.unheld.length > 0) {
      actions.push({
        id: "confirm-register",
        title: `Re-confirm ${plan.unheld.length} register item(s) nobody holds`,
        why: `${plan.unheld[0].action} ${
          plan.unheld.length > 1 ? `${plan.unheld.length - 1} more item(s) also need a check.` : ""
        }`.trim(),
        effort: "low",
        tab: "knowledge",
        priority: 60,
      });
    }
  }

  const leanedOn = continuity.people.find((l) => l.person.active);
  if (leanedOn && leanedOn.dependence >= 50 && leanedOn.soleItems.length >= 2) {
    actions.push({
      id: `dependence-${leanedOn.person.id}`,
      title: `Spread ${leanedOn.person.name.split(" ")[0]}'s sole duties`,
      why: `${leanedOn.dependence}% of critical work stops if ${leanedOn.person.name} is out — ${leanedOn.soleItems.length} items nobody else can run. Run the absence check on the Who-knows-what tab.`,
      effort: "medium",
      tab: "knowledge",
      priority: 80,
    });
  }

  const topRisk = portfolio.top[0];
  if (topRisk && topRisk.residual >= 60) {
    actions.push({
      id: `residual-${topRisk.id}`,
      title: `Review ${topRisk.name}`,
      why: topRisk.bandGuidance,
      effort: topRisk.band === "critical_path" ? "high" : "medium",
      tab: "residual",
      priority: topRisk.residual,
    });
  }

  const bestLever = tornado.levers[0];
  if (bestLever && bestLever.delta >= 3) {
    actions.push({
      id: `tornado-${bestLever.id}`,
      title: bestLever.label,
      why: `Could lower average residual by ~${Math.round(bestLever.delta)} points.`,
      effort: bestLever.id === "bank" || bestLever.id === "dual" ? "low" : "medium",
      tab: "residual",
      priority: 70 + Math.min(20, bestLever.delta),
    });
  }

  if (input.mapSnapshots?.length) {
    for (const snap of input.mapSnapshots.filter((s) => s.heat >= HEAT_BANDS.hot).slice(0, 2)) {
      const gaps = snap.controlGaps.filter((c) => !c.segregated).length;
      actions.push({
        id: `map-heat-${snap.process.id}`,
        title: `Review hot process: ${snap.process.name}`,
        why: `Heat ${snap.heat} — ${snap.risks.length} risk(s)${gaps ? `, ${gaps} SoD gap(s)` : ""}. Open the map builder to assign owners and controls.`,
        effort: gaps > 0 ? "medium" : "low",
        tab: "map",
        processId: snap.process.id,
        priority: Math.min(92, snap.heat + 5),
      });
    }

    const unowned = input.mapSnapshots.filter((s) => !s.owners.length).slice(0, 1);
    for (const snap of unowned) {
      actions.push({
        id: `map-owner-${snap.process.id}`,
        title: `Assign owner: ${snap.process.name}`,
        why: "Processes without owners don't get SoD or continuity scoring — assign someone on your team.",
        effort: "low",
        tab: "map",
        processId: snap.process.id,
        priority: 75,
      });
    }
  }

  const seen = new Set<string>();
  const unique = actions
    .filter((a) => {
      const key = a.title.toLowerCase().slice(0, 40);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((a, b) => b.priority - a.priority)
    .slice(0, 5);
  return unique;
}
