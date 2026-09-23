import { portfolioSummary, tornadoSensitivity } from "@/lib/precog/scoring/residual-engine";
import { detectSodConflicts } from "@/lib/precog/sod/detect";
import { mitigatedSodRuleIds, type DualReleasePolicy } from "@/lib/precog/controls/dual-release";
import {
  checkInPlan,
  coverageReport,
  documentationDebt,
  DOCUMENTATION_LABEL,
  firstName,
  ownerlessProcesses,
  STATUS_LABEL,
} from "@/lib/precog/continuity/coverage";
import { registerAssessed } from "@/lib/precog/continuity/register-state";
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
  outPhrase,
  plannedAbsenceReport,
  procedurePointer,
} from "@/lib/precog/continuity/planned-absence";
import { describeDebriefItem, leaveDebriefs } from "@/lib/precog/continuity/leave-debrief";
import {
  HANDOVER_URGENT_DAYS,
  handoverDeadline,
  leaverLead,
  leavers,
} from "@/lib/precog/continuity/leavers";
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
  const first = c.person ? firstName(c.person.name) : undefined;
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
    dualReleaseMitigatedRuleIds: mitigatedSodRuleIds(input.dualRelease, tpl),
  });
  const continuity = coverageReport(tpl);
  // A register nobody has filled in cannot say what stops when someone is out:
  // a starter list with nobody marked is not a set of single points, and an
  // empty list is not full coverage. Until it is filled in, the one continuity
  // action is to fill it in.
  const registerReady = registerAssessed(tpl);
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
  const departing = leavers(tpl, input.decisions ?? [], today);
  // An entry a leaver must hand over is advised as part of their hand-over,
  // not as ordinary cross-training on top.
  const handingOver = new Set(
    departing.filter((l) => l.status === "notice").flatMap((l) => l.handover.map((h) => h.item.id)),
  );

  // Steps already in the Journal do not use up the fresh-advice slots, so the
  // next uncommitted gap still gets recommended.
  let freshLeft = MAX_FRESH_PER_GAP_KIND;
  let remindersLeft = MAX_REMINDERS_PER_GAP_KIND;
  for (const m of (registerReady ? continuity.plan : []).filter(
    (x) =>
      x.item.criticality === "critical" &&
      x.status !== "thin" &&
      !debriefing.has(x.item.id) &&
      !handingOver.has(x.item.id),
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
            ? `Cross-train ${firstName(m.trainee.name)} on ${m.item.name}`
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
    const first = firstName(w.person.name);
    const out = outPhrase(w.absence);
    const when = `${formatDateRange(w.absence.from, w.absence.to)}, ${leadLabel(w.daysUntil)}`;
    const also = w.overlaps.length
      ? ` ${w.overlaps.map((o) => firstName(o.person.name)).join(" and ")} ${w.overlaps.length === 1 ? "is" : "are"} also out for part of it.`
      : "";
    const stops = w.impact.stops;
    if (stops.length === 0) {
      const orphaned = w.impact.orphanedProcesses;
      actions.push({
        id: `leave-${w.absence.id}`,
        title: `${first} ${out} ${when}: ${orphaned.length} process${orphaned.length === 1 ? "" : "es"} without an owner`,
        why: `Nothing on the register stops, but nobody left owns ${orphaned.slice(0, 3).join(", ")}.${also} ${w.status === "current" ? "Name a stand-in owner today." : "Name a stand-in owner before the leave starts."}`,
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
      if (c) actions.push(committedAction(c, urgency, `${first} ${out} ${when}`));
      continue;
    }
    const noOne = open.filter((s) => !s.standIn);
    const others = open.length - 1;
    const othersAway = w.peak.people.filter((p) => p.id !== w.person.id);
    const during =
      w.peak.extraStops.length > 0
        ? ` ${formatDateRange(w.peak.from, w.peak.to)}, while ${othersAway.map((p) => firstName(p.name)).join(" and ")} ${othersAway.length === 1 ? "is" : "are"} also out`
        : " for the whole absence";
    const standInFirst = lead.standIn ? firstName(lead.standIn.name) : "";
    const coverToday =
      w.status === "current" && lead.standIn
        ? ` Tell ${standInFirst} today that ${lead.item.name} is theirs while ${first} is out (${procedurePointer(lead)}).`
        : "";
    actions.push({
      id: `leave-${w.absence.id}`,
      title: lead.standIn
        ? w.status === "current"
          ? `${first} ${out} ${when}: ${standInFirst} covers ${lead.item.name}${others > 0 ? ` and ${others} more` : ""}`
          : `${first} ${out} ${when}: hand off ${lead.item.name} to ${standInFirst}${others > 0 ? ` and ${others} more` : ""}`
        : `${first} ${out} ${when}: ${lead.item.name} has no one${others > 0 ? ` (${others} more stop)` : ""}`,
      why: `${open.length === 1 ? `${lead.item.name} stops` : `${open.length} register entries stop`}${during}${noOne.length ? `; ${noOne.map((s) => s.item.name).join(", ")} ${noOne.length === 1 ? "has" : "have"} nobody who can run ${noOne.length === 1 ? "it" : "them"} alone` : ""}.${also}${
        w.status === "upcoming" ? ` Hand off by ${handoffDeadline(w, today)}.` : coverToday
      }${w.impact.remaining.length ? ` Left in the business: ${w.impact.remaining.map((p) => firstName(p.name)).join(", ")}.` : " Nobody else is left in the business."}`,
      effort: lead.standIn ? "low" : "medium",
      tab: "knowledge",
      priority: lead.item.criticality === "critical" ? urgency : urgency - 10,
    });
  }

  // Someone working their notice: the hand-over is the week's continuity work,
  // with a hard deadline. Once the last day has passed the only step left is to
  // take them out of the coverage figures.
  for (const l of departing.slice(0, 2)) {
    const first = firstName(l.person.name);
    const lead = `${first} ${leaverLead(l.daysLeft)}`;
    if (l.status === "gone") {
      actions.push({
        id: `leaver-${l.person.id}`,
        title: `${lead}: mark ${first} as left`,
        why: `${first}'s last day was ${l.lastDay} but ${first} still counts as cover${l.handover.length > 0 ? ` for ${l.handover.length} register ${l.handover.length === 1 ? "entry" : "entries"} nobody else can run alone` : ""}. Mark ${first} as left on the register so the coverage figures show the real gap; the record stays in the history.`,
        effort: "low",
        tab: "knowledge",
        priority: 93,
      });
      continue;
    }
    if (l.handover.length === 0 && l.orphanedProcesses.length === 0) continue;
    const urgency = l.daysLeft <= HANDOVER_URGENT_DAYS ? 91 : l.daysLeft <= 30 ? 87 : 80;
    const deadline = handoverDeadline(l, today);
    const remaining = l.remaining.length
      ? ` Left in the business after ${l.lastDay}: ${l.remaining.map((p) => firstName(p.name)).join(", ")}.`
      : " Nobody else is left in the business.";
    if (l.handover.length === 0) {
      const orphaned = l.orphanedProcesses;
      actions.push({
        id: `leaver-${l.person.id}`,
        title: `${lead}: ${orphaned.length} process${orphaned.length === 1 ? "" : "es"} without an owner`,
        why: `Nothing on the register depends on ${first} alone, but nobody else owns ${orphaned.slice(0, 3).join(", ")}. Name the new owner by ${deadline}.${remaining}`,
        effort: "low",
        tab: "knowledge",
        priority: urgency - 15,
      });
      continue;
    }
    const open = l.handover.filter((h) => !h.training);
    const critical = open.filter((h) => h.item.criticality === "critical");
    const top = critical[0] ?? open[0];
    if (!top) {
      const c = committed.get(continuityStepKey(l.handover[0].item.id, "cover"));
      if (c) actions.push(committedAction(c, urgency, `only ${first} can run it alone`));
      continue;
    }
    const noOne = open.filter((h) => !h.successor);
    const unwritten = l.handover.filter((h) => !h.item.documented);
    const others = open.length - 1;
    const successor = top.successor ? firstName(top.successor.name) : "";
    actions.push({
      id: `leaver-${l.person.id}`,
      title: top.successor
        ? `${lead}: train ${successor} on ${top.item.name}${others > 0 ? ` and ${others} more` : ""}`
        : `${lead}: ${top.item.name} has no one to take it${others > 0 ? ` (${others} more to hand over)` : ""}`,
      why: `${l.handover.length === 1 ? `${top.item.name} is` : `${l.handover.length} register entries are`} run by ${first} alone${noOne.length ? `; ${noOne.map((h) => h.item.name).join(", ")} ${noOne.length === 1 ? "has" : "have"} nobody to take ${noOne.length === 1 ? "it" : "them"}` : ""}${unwritten.length ? `; ${unwritten.length} ${unwritten.length === 1 ? "has" : "have"} nothing written down` : ""}. Hand over by ${deadline}${l.unlogged < l.handover.length ? ` (${l.handover.length - l.unlogged} of ${l.handover.length} already in the Journal)` : ""}.${remaining}`,
      effort: top.successor ? "medium" : "high",
      tab: "knowledge",
      priority: top.item.criticality === "critical" ? urgency : urgency - 10,
    });
  }

  // A process whose every listed owner has been marked as left still looks
  // owned on the map; the owner slot is the leaver's last unfinished hand-over.
  for (const o of ownerlessProcesses(tpl).slice(0, 2)) {
    const former = o.formerOwners.map((p) => firstName(p.name));
    actions.push({
      id: `map-owner-left-${o.id}`,
      title: `Name a new owner for ${o.name}`,
      why: `${former.join(" and ")} ${former.length === 1 ? "was" : "were"} the only listed owner${former.length === 1 ? "" : "s"} and ${former.length === 1 ? "has" : "have"} left. Until someone on the team owns it, nobody is accountable for its controls and it drops out of the segregation and continuity figures.`,
      effort: "low",
      tab: "map",
      processId: o.id,
      priority: 86,
    });
  }

  // Leave that just ended is a cross-training result waiting to be recorded:
  // the stand-in ran the work for real, so ask while it is fresh.
  for (const d of debriefs.slice(0, 2)) {
    const first = firstName(d.person.name);
    const lead = d.items[0];
    const more = d.items.length - 1;
    const standIn = lead.standIn ? firstName(lead.standIn.name) : undefined;
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
  for (const g of (registerReady ? documentationDebt(tpl).gaps : []).filter(
    (x) => x.item.criticality === "critical",
  )) {
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

  if (!registerReady) {
    actions.push(
      tpl.knowledge.length === 0
        ? {
            id: "register-start",
            title: "List the duties, tasks and know-how the business runs on",
            why: "The register is empty. Until it lists what the business runs on and who can do each, the app cannot say what stops when someone is out or who holds work alone.",
            effort: "low",
            tab: "knowledge",
            priority: 80,
          }
        : {
            id: "register-start",
            title: `Mark who can do each of the ${tpl.knowledge.length} things the business runs on`,
            why: `The register lists ${tpl.knowledge.length} duties, tasks and pieces of know-how a business like yours usually runs on, with nobody marked yet. Until someone is marked, the app cannot say what stops when a person is out or who holds work alone. Remove what does not apply.`,
            effort: "low",
            tab: "knowledge",
            priority: 86,
          },
    );
  }

  if (input.trackFreshness && registerReady) {
    const plan = checkInPlan(tpl, today);
    const first = plan.checkIns[0];
    if (first) {
      const others = plan.checkIns.length - 1;
      const soleNote =
        first.soleCount > 0 ? `${first.soleCount} of them nobody else can run alone. ` : "";
      actions.push({
        id: `check-in-${first.person.id}`,
        title: `Check in with ${firstName(first.person.name)}: ${first.items.length} register ${first.items.length === 1 ? "entry" : "entries"}`,
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
      title: `Spread ${firstName(leanedOn.person.name)}'s sole duties`,
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
        why: `Heat ${snap.heat} — ${snap.risks.length} risk(s)${gaps ? `, ${gaps} duty-conflict gap(s)` : ""}. Open the map builder to assign owners and controls.`,
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
        why: "Processes without owners don't get duty-conflict or continuity scoring — assign someone on your team.",
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
