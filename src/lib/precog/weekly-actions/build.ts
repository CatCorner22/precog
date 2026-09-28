import { portfolioSummary, tornadoSensitivity } from "@/lib/precog/scoring/residual-engine";
import { DEFAULT_WEIGHTS } from "@/lib/precog/scoring/weights";
import { confirmedScenarioIds } from "@/lib/precog/scoring/scope";
import { detectSodConflicts, sodDetectionOptions } from "@/lib/precog/sod/detect";
import { soleOwnerId } from "@/lib/precog/sod/owner-role";
import type { DualReleasePolicy } from "@/lib/precog/controls/dual-release";
import { checkInPlan, CONFIRMATION_MAX_AGE_DAYS } from "@/lib/precog/continuity/staleness";
import {
  coverageReport,
  STATUS_LABEL,
  type CoverageReport,
} from "@/lib/precog/continuity/coverage";
import {
  documentationDebt,
  DOCUMENTATION_LABEL,
  isWritten,
  procedurePointer,
} from "@/lib/precog/continuity/documentation";
import { ownerlessProcesses } from "@/lib/precog/continuity/absence-impact";
import { registerAssessed } from "@/lib/precog/continuity/register-state";
import { industryMeta } from "@/lib/precog/industry";
import {
  continuityCommitments,
  continuityStepKey,
  handoffCommitment,
  type ContinuityCommitment,
} from "@/lib/precog/decisions/follow-through";
import {
  absencesNeedingAttention,
  handoffDeadline,
  leadLabel,
  outPhrase,
  plannedAbsenceReport,
} from "@/lib/precog/continuity/planned-absence";
import {
  describeDebriefItem,
  leaveDebriefs,
  type LeaveDebrief,
} from "@/lib/precog/continuity/leave-debrief";
import {
  HANDOVER_URGENT_DAYS,
  handoverDeadline,
  leaverLead,
  leavers,
  type Leaver,
} from "@/lib/precog/continuity/leavers";
import type { DecisionEntry, PlannedAbsence } from "@/lib/precog/practice-profile";
import type { IndustryTemplate } from "@/lib/precog/templates/types";
import { HEAT_BANDS } from "@/lib/precog/scoring/bands";
import { type ProcessMapSnapshot } from "@/lib/precog/process-graph";
import {
  casesForControl,
  casesForSodRules,
  type CaseStudy,
  type ControlId,
} from "@/lib/precog/evidence";
import type { StaffComposition } from "@/lib/precog/types";
import { localDateKey, formatDay, formatDayNear, formatDayRange } from "../dates";
import { joinWithAnd, verb, firstName, count } from "../text";

interface WeeklyAction {
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

interface ActionEvidence {
  caseCount: number;
  /** The largest recorded loss among those cases. */
  worst: { title: string; lossUsd: number; lossIsFloor: boolean } | null;
}

interface WeeklyActionsInput {
  tpl: IndustryTemplate;
  staff: StaffComposition;
  dualRelease: DualReleasePolicy;
  mapSnapshots?: ProcessMapSnapshot[];
  today?: string;
  trackFreshness?: boolean;
  /**
   * Whether the process map's figures describe a map the owner has worked on
   * (see mapAssessed in builder/map-state). Off, the map-derived actions give
   * way to one action: assign owners to the starter map, or add processes.
   */
  mapAssessed?: boolean;
  /** The Journal, so steps already logged are reported as in progress rather than recommended again. */
  decisions?: readonly DecisionEntry[];
  /** Known leave, so hand-offs are advised ahead of time. */
  plannedAbsences?: readonly PlannedAbsence[];
}

/**
 * How the weekly plan ranks each kind of action: higher comes first, and the
 * plan shows the top five. Top residual risk, the best lever and hot
 * processes rank by their own scores (see those sources).
 */
const PRIORITY = {
  /** Nobody outside the books reads the bank statement. */
  bankRec: 95,
  /** A leaver's last day has passed and they still count as cover. */
  leaverGone: 93,
  /** Someone is out today and work they alone run stops. */
  leaveCurrent: 92,
  /** A leaver's last day is within HANDOVER_URGENT_DAYS. */
  leaverUrgent: 91,
  /** Payments go out on one person's say. */
  dualControl: 90,
  /** Leave starts within a week. */
  leaveThisWeek: 89,
  /** A critical duty pair held by one employee. */
  sodSplit: 88,
  /** A leaver's last day is within 30 days. */
  leaverThisMonth: 87,
  /** A critical register entry nobody can run alone. */
  crossTrainUncovered: 86,
  /** A process whose every listed owner has left. */
  ownerlessProcess: 86,
  /** The starter register lists entries with nobody marked. */
  registerStartListed: 86,
  /** Leave starts within the lead time, more than a week out. */
  leaveLater: 85,
  /** A critical, unwritten entry one absence would stop. */
  docsSinglePoint: 84,
  /** The starter map has no owners, or the map is empty. */
  mapStart: 84,
  /** A critical register entry only one person can run alone. */
  crossTrainSingle: 82,
  /** A critical register entry one person runs alone while someone learns it. */
  crossTrainThin: 76,
  /** One active person carries half the critical work alone. */
  dependence: 80,
  /** A leaver's last day is more than 30 days out. */
  leaverLater: 80,
  /** The register is empty. */
  registerStartEmpty: 80,
  /** A critical debrief after leave. */
  debriefCritical: 78,
  /** A critical, unwritten entry someone else can also run. */
  docsCovered: 78,
  /** A process on the map with no owner. */
  unownedProcess: 75,
  /** A critical, written entry whose procedure nobody can find. */
  docsUnlocated: 72,
  /** Leave with nothing stopping but a process without an owner. */
  leaveOrphanedProcess: 70,
  /** The best lever's floor; its delta (up to 20 points) is added. */
  leverBase: 70,
  /** A debrief after leave on work that is not critical. */
  debriefOther: 68,
  /** A check-in with someone who holds stale work alone. */
  checkInSole: 64,
  /** A check-in on stale register entries. */
  checkIn: 60,
  /** Stale entries nobody active holds. */
  confirmRegister: 60,
  /** A logged step whose review date has not come yet. */
  inProgress: 40,
} as const;

/** Leave or a leaver's hand-off about work that is not critical ranks this much lower. */
const NOT_CRITICAL_DISCOUNT = 10;
/** A leaver who leaves only processes, no register entries, ranks this much lower. */
const PROCESSES_ONLY_DISCOUNT = 15;
/** Per gap kind (coverage, documentation): how many fresh recommendations and how many Journal reminders make the list. */
const MAX_FRESH_PER_GAP_KIND = 2;
const MAX_REMINDERS_PER_GAP_KIND = 2;
/** How many leave windows, leavers, ownerless processes, debriefs and SoD splits each source raises. */
const MAX_PER_SOURCE = 2;
/** How many actions the plan shows. */
const PLAN_SIZE = 5;

/**
 * The week's top actions across controls, continuity and the process map,
 * most pressing first. Each source below adds its own actions; this ranks
 * them and keeps the top five.
 */
export function buildWeeklyActions(input: WeeklyActionsInput): WeeklyAction[] {
  const ctx = weeklyContext(input);
  const crossTraining = crossTrainingActions(ctx);
  const actions = [
    ...bankRecActions(ctx),
    ...dualControlActions(ctx),
    ...sodSplitActions(ctx),
    ...crossTraining,
    ...leaveActions(ctx),
    ...leaverActions(ctx),
    ...ownerlessProcessActions(ctx),
    ...debriefActions(ctx),
    ...documentationActions(ctx),
    ...registerStartActions(ctx),
    ...checkInActions(ctx),
    ...dependenceActions(ctx),
    ...residualActions(
      ctx,
      crossTraining.some((a) => a.id.startsWith("spof-")),
    ),
    ...mapActions(ctx),
  ];
  // Each source keys its ids by the item, absence or person it is about, so
  // the id alone says whether two actions are the same advice.
  const seen = new Set<string>();
  return actions
    .filter((a) => {
      if (seen.has(a.id)) return false;
      seen.add(a.id);
      return true;
    })
    .sort((a, b) => b.priority - a.priority)
    .slice(0, PLAN_SIZE);
}

/** What every source reads, worked out once. */
interface WeeklyContext {
  input: WeeklyActionsInput;
  tpl: IndustryTemplate;
  today: string;
  decisions: readonly DecisionEntry[];
  /** Steps already open in the Journal, keyed by continuityStepKey. */
  committed: Map<string, ContinuityCommitment>;
  /** Starter scenarios count only once the owner confirms them, as on the Dashboard and the residual register. */
  scope: { confirmedScenarioIds: Set<string> };
  continuity: CoverageReport;
  /**
   * A register nobody has filled in cannot say what stops when someone is
   * out: a starter list with nobody marked is not a set of single points, and
   * an empty list is not full coverage. Until it is filled in, the one
   * continuity action is to fill it in.
   */
  registerReady: boolean;
  /**
   * The starter map with nobody assigned is not a set of unowned hot
   * processes, and an empty map has nothing to score. Until the owner assigns
   * an owner or builds their own map, the one map action is to do that.
   */
  mapReady: boolean;
  debriefs: LeaveDebrief[];
  departing: Leaver[];
  /** Entries someone just covered during leave: asked about as a debrief, not recommended as fresh cross-training on top. */
  debriefing: Set<string>;
  /** Entries a leaver must hand off: advised as part of their hand-off, not as ordinary cross-training on top. */
  handingOver: Set<string>;
}

function weeklyContext(input: WeeklyActionsInput): WeeklyContext {
  const { tpl } = input;
  const today = input.today ?? localDateKey(new Date());
  const decisions = input.decisions ?? [];
  const debriefs = leaveDebriefs(tpl, input.plannedAbsences ?? [], decisions, tpl.id, today);
  const departing = leavers(tpl, decisions, today);
  return {
    input,
    tpl,
    today,
    decisions,
    committed: continuityCommitments(decisions, tpl, today),
    scope: { confirmedScenarioIds: confirmedScenarioIds(decisions, tpl.id) },
    continuity: coverageReport(tpl),
    registerReady: registerAssessed(tpl),
    mapReady: input.mapAssessed ?? true,
    debriefs,
    departing,
    debriefing: new Set(debriefs.flatMap((d) => d.items.map((e) => e.item.id))),
    handingOver: new Set(
      departing
        .filter((l) => l.status === "notice")
        .flatMap((l) => l.handover.map((h) => h.item.id)),
    ),
  };
}

function bankRecActions({ tpl, input }: WeeklyContext): WeeklyAction[] {
  if (input.staff.independentBankRec) return [];
  // An owner who already reconciles, but also takes or records the money,
  // is not told to start: the missing piece is a reader outside the books.
  const activePeople = tpl.people.filter((p) => p.active);
  const ownerId = soleOwnerId(activePeople);
  const ownerReconciles = activePeople.some(
    (p) => p.id === ownerId && (p.entitlements ?? []).includes("bank_reconcile"),
  );
  return [
    ownerReconciles
      ? {
          id: "bank-rec",
          title: "Have someone outside the books read the bank statement each month",
          why: "You reconcile the bank yourself, but you also take or record the money, so nobody else ever compares the books with the bank. An outside bookkeeper or accountant reading the statement and the payroll register each month closes that.",
          effort: "low",
          tab: "sod",
          priority: PRIORITY.bankRec,
          evidence: evidenceFor(casesForControls(["independent-bank-reconciliation"])),
        }
      : {
          id: "bank-rec",
          title: "Start owner weekly bank reconciliation",
          why: "Owner sees the bank's record without going through the person who posts payments — catches errors and diverted payments early.",
          effort: "low",
          tab: "sod",
          priority: PRIORITY.bankRec,
          evidence: evidenceFor(
            casesForControls(["owner-opens-bank-statement", "independent-bank-reconciliation"]),
          ),
        },
  ];
}

/**
 * Dual control needs a second person; a one-person business is advised to
 * have an outside reader instead (the bank-reconciliation action).
 */
function dualControlActions({ tpl, input }: WeeklyContext): WeeklyAction[] {
  const activeCount = tpl.people.filter((p) => p.active).length;
  if (input.staff.dualControlPayments || activeCount < 2) return [];
  return [
    {
      id: "dual-control",
      title: "Turn on dual release for payments",
      why: "Separates payment release from vendor setup, so an invented supplier needs a second person to get paid. Narrows the path above the threshold; does not close it below.",
      effort: "medium",
      tab: "sod",
      priority: PRIORITY.dualControl,
      evidence: evidenceFor(
        casesForControls(["dual-release-above-threshold", "new-payee-second-approval"]),
      ),
    },
  ];
}

/**
 * Split only what an employee holds, once per gap: the owner's own pairs
 * have no one to move to and are handled by the outside-reader step.
 */
function sodSplitActions({ tpl, input }: WeeklyContext): WeeklyAction[] {
  const sod = detectSodConflicts(tpl, input.staff, sodDetectionOptions(tpl, input.dualRelease));
  return sod.conflicts
    .filter((x) => x.severity === "critical" && !x.ownerHeld)
    .filter((x, i, all) => all.findIndex((o) => o.ruleId === x.ruleId) === i)
    .slice(0, MAX_PER_SOURCE)
    .map((c) => ({
      id: `sod-${c.ruleId}`,
      title: `Split ${c.labelA.toLowerCase()} from ${c.labelB.toLowerCase()}`,
      why: c.why || "Incompatible duties are concentrated on one role.",
      effort: "medium",
      tab: "sod",
      priority: PRIORITY.sodSplit,
      evidence: evidenceFor(casesForSodRules([c.ruleId])),
    }));
}

/**
 * Critical entries one absence would stop. Steps already in the Journal do
 * not use up the fresh-advice slots, so the next uncommitted gap still gets
 * recommended.
 */
function crossTrainingActions(ctx: WeeklyContext): WeeklyAction[] {
  const { continuity, committed, debriefing, handingOver } = ctx;
  if (!ctx.registerReady) return [];
  const actions: WeeklyAction[] = [];
  let freshLeft = MAX_FRESH_PER_GAP_KIND;
  let remindersLeft = MAX_REMINDERS_PER_GAP_KIND;
  for (const m of continuity.plan.filter(
    (x) =>
      x.item.criticality === "critical" &&
      !debriefing.has(x.item.id) &&
      !handingOver.has(x.item.id),
  )) {
    if (freshLeft === 0 && remindersLeft === 0) break;
    const priority =
      m.status === "uncovered"
        ? PRIORITY.crossTrainUncovered
        : m.status === "single"
          ? PRIORITY.crossTrainSingle
          : PRIORITY.crossTrainThin;
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
            ? `${m.status === "thin" ? "Finish training" : "Cross-train"} ${firstName(m.trainee.name)} on ${m.item.name}`
            : `Cross-train a stand-in for ${m.item.name}`,
      why: `${m.action} While one person holds critical work alone, nobody can cover it when they are out, and nobody else can compare what they do with what should be done.`,
      effort: isWritten(m.item) ? "low" : "medium",
      tab: "knowledge",
      priority,
    });
  }
  return actions;
}

/** Known leave that stops work, soonest first; covered leave adds nothing, so it does not use up a slot. */
function leaveActions({ tpl, input, today, committed }: WeeklyContext): WeeklyAction[] {
  const leave = plannedAbsenceReport(tpl, input.plannedAbsences ?? [], tpl.id, today);
  const worthRaising = absencesNeedingAttention(leave.windows).filter(
    (w) => w.impact.stops.length > 0 || w.impact.orphanedProcesses.length > 0,
  );
  const actions: WeeklyAction[] = [];
  for (const w of worthRaising.slice(0, MAX_PER_SOURCE)) {
    const first = firstName(w.person.name);
    const out = outPhrase(w.absence);
    const when = `${formatDayRange(w.absence.from, w.absence.to)}, ${leadLabel(w.daysUntil)}`;
    const also = w.overlaps.length
      ? ` ${joinWithAnd(w.overlaps.map((o) => firstName(o.person.name)))} ${verb(w.overlaps.length, "is", "are")} also out for part of it.`
      : "";
    const stops = w.impact.stops;
    if (stops.length === 0) {
      const orphaned = w.impact.orphanedProcesses;
      actions.push({
        id: `leave-${w.absence.id}`,
        title: `${first} ${out} ${when}: ${count(orphaned.length, "process", "processes")} without an owner`,
        why: `Nothing on the register stops, but nobody left owns ${orphaned.slice(0, 3).join(", ")}.${also} ${w.status === "current" ? "Name a stand-in owner today." : "Name a stand-in owner before the leave starts."}`,
        effort: "low",
        tab: "knowledge",
        priority: PRIORITY.leaveOrphanedProcess,
      });
      continue;
    }
    const open = stops.filter((s) => !handoffCommitment(committed, s.item.id, w.absence.id));
    const critical = open.filter((s) => s.item.criticality === "critical");
    const lead = critical[0] ?? open[0];
    const urgency =
      w.status === "current"
        ? PRIORITY.leaveCurrent
        : w.daysUntil <= 7
          ? PRIORITY.leaveThisWeek
          : PRIORITY.leaveLater;
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
        ? ` ${formatDayRange(w.peak.from, w.peak.to)}, while ${joinWithAnd(othersAway.map((p) => firstName(p.name)))} ${verb(othersAway.length, "is", "are")} also out`
        : " for the whole absence";
    const standInFirst = lead.standIn ? firstName(lead.standIn.name) : "";
    const coverToday =
      w.status === "current" && lead.standIn
        ? ` Tell ${standInFirst} today that ${lead.item.name} is theirs while ${first} is out (${procedurePointer(lead.item)}).`
        : "";
    actions.push({
      id: `leave-${w.absence.id}`,
      title: lead.standIn
        ? w.status === "current"
          ? `${first} ${out} ${when}: ${standInFirst} covers ${lead.item.name}${others > 0 ? ` and ${others} more` : ""}`
          : `${first} ${out} ${when}: hand off ${lead.item.name} to ${standInFirst}${others > 0 ? ` and ${others} more` : ""}`
        : `${first} ${out} ${when}: ${lead.item.name} has no one${others > 0 ? ` (${others} more stop)` : ""}`,
      why: `${open.length === 1 ? `${lead.item.name} stops` : `${open.length} register entries stop`}${during}${noOne.length ? `; ${noOne.map((s) => s.item.name).join(", ")} ${verb(noOne.length, "has", "have")} nobody who can run ${verb(noOne.length, "it", "them")} alone` : ""}.${also}${
        w.status === "upcoming"
          ? ` Hand off by ${formatDayNear(handoffDeadline(w, today), today)}.`
          : coverToday
      }${w.impact.remaining.length ? ` Still in the business: ${w.impact.remaining.map((p) => firstName(p.name)).join(", ")}.` : " Nobody else remains in the business."}`,
      effort: lead.standIn ? "low" : "medium",
      tab: "knowledge",
      priority: lead.item.criticality === "critical" ? urgency : urgency - NOT_CRITICAL_DISCOUNT,
    });
  }
  return actions;
}

/**
 * Someone working their notice: the hand-off is the week's continuity work,
 * with a hard deadline. Once the last day has passed the only step left is to
 * take them out of the coverage figures.
 */
function leaverActions({ departing, today, committed }: WeeklyContext): WeeklyAction[] {
  const actions: WeeklyAction[] = [];
  for (const l of departing.slice(0, MAX_PER_SOURCE)) {
    const first = firstName(l.person.name);
    const lead = `${first} ${leaverLead(l.daysLeft)}`;
    if (l.status === "gone") {
      actions.push({
        id: `leaver-${l.person.id}`,
        title: `${lead}: mark ${first} as left`,
        why: `${first}'s last day was ${formatDayNear(l.lastDay, today)} but ${first} still counts as a stand-in${l.handover.length > 0 ? ` for ${count(l.handover.length, "register entry", "register entries")} nobody else can run alone` : ""}. Mark ${first} as left on the register so the coverage figures show the real gap; the record stays in the history.`,
        effort: "low",
        tab: "knowledge",
        priority: PRIORITY.leaverGone,
      });
      continue;
    }
    if (l.handover.length === 0 && l.orphanedProcesses.length === 0) continue;
    const urgency =
      l.daysLeft <= HANDOVER_URGENT_DAYS
        ? PRIORITY.leaverUrgent
        : l.daysLeft <= 30
          ? PRIORITY.leaverThisMonth
          : PRIORITY.leaverLater;
    const deadline = formatDayNear(handoverDeadline(l, today), today);
    const remaining = l.remaining.length
      ? ` Still in the business after ${formatDayNear(l.lastDay, today)}: ${l.remaining.map((p) => firstName(p.name)).join(", ")}.`
      : " Nobody else remains in the business.";
    if (l.handover.length === 0) {
      const orphaned = l.orphanedProcesses;
      actions.push({
        id: `leaver-${l.person.id}`,
        title: `${lead}: ${count(orphaned.length, "process", "processes")} without an owner`,
        why: `Nothing on the register depends on ${first} alone, but nobody else owns ${orphaned.slice(0, 3).join(", ")}. Name the new owner by ${deadline}.${remaining}`,
        effort: "low",
        tab: "knowledge",
        priority: urgency - PROCESSES_ONLY_DISCOUNT,
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
    const unwritten = l.handover.filter((h) => !isWritten(h.item));
    const others = open.length - 1;
    const successor = top.successor ? firstName(top.successor.name) : "";
    actions.push({
      id: `leaver-${l.person.id}`,
      title: top.successor
        ? `${lead}: train ${successor} on ${top.item.name}${others > 0 ? ` and ${others} more` : ""}`
        : `${lead}: ${top.item.name} has no one to take it${others > 0 ? ` (${others} more to hand off)` : ""}`,
      why: `${l.handover.length === 1 ? `${top.item.name} is` : `${l.handover.length} register entries are`} run by ${first} alone${noOne.length ? `; ${noOne.map((h) => h.item.name).join(", ")} ${verb(noOne.length, "has", "have")} nobody to take ${verb(noOne.length, "it", "them")}` : ""}${unwritten.length ? `; ${unwritten.length} ${verb(unwritten.length, "has", "have")} nothing written down` : ""}. Hand off by ${deadline}${l.unlogged < l.handover.length ? ` (${l.handover.length - l.unlogged} of ${l.handover.length} already in the Decisions log)` : ""}.${remaining}`,
      effort: top.successor ? "medium" : "high",
      tab: "knowledge",
      priority: top.item.criticality === "critical" ? urgency : urgency - NOT_CRITICAL_DISCOUNT,
    });
  }
  return actions;
}

/**
 * A process whose every listed owner has been marked as left still looks
 * owned on the map; the owner slot is the leaver's last unfinished hand-off.
 */
function ownerlessProcessActions({ tpl, mapReady }: WeeklyContext): WeeklyAction[] {
  if (!mapReady) return [];
  return ownerlessProcesses(tpl)
    .slice(0, MAX_PER_SOURCE)
    .map((o) => {
      const former = o.formerOwners.map((p) => firstName(p.name));
      return {
        id: `map-owner-left-${o.id}`,
        title: `Name a new owner for ${o.name}`,
        why: `${joinWithAnd(former)} ${verb(former.length, "was", "were")} the only listed ${verb(former.length, "owner", "owners")} and ${verb(former.length, "has", "have")} left. Until someone on the team owns it, nobody is accountable for its controls and it drops out of the segregation and continuity figures.`,
        effort: "low",
        tab: "map",
        processId: o.id,
        priority: PRIORITY.ownerlessProcess,
      };
    });
}

/**
 * Leave that just ended is a cross-training result waiting to be recorded:
 * the stand-in ran the work for real, so ask while it is fresh.
 */
function debriefActions({ debriefs }: WeeklyContext): WeeklyAction[] {
  return debriefs.slice(0, MAX_PER_SOURCE).map((d) => {
    const first = firstName(d.person.name);
    const lead = d.items[0];
    const more = d.items.length - 1;
    const standIn = lead.standIn ? firstName(lead.standIn.name) : undefined;
    return {
      id: `debrief-${d.absence.id}`,
      title: standIn
        ? `${first}'s back: can ${standIn} run ${lead.item.name} alone now?${more > 0 ? ` (+${more} more)` : ""}`
        : `${first}'s back: who covered ${lead.item.name}?${more > 0 ? ` (+${more} more)` : ""}`,
      why: `${describeDebriefItem(d, lead)} On the register, one click moves the stand-in to "can do" and closes the hand-off; "Not yet" turns it into a tracked cross-training step.`,
      effort: "low",
      tab: "knowledge",
      priority:
        lead.item.criticality === "critical" ? PRIORITY.debriefCritical : PRIORITY.debriefOther,
    };
  });
}

/** Critical entries with nothing written down, or written somewhere nobody recorded. */
function documentationActions({ tpl, registerReady, committed }: WeeklyContext): WeeklyAction[] {
  if (!registerReady) return [];
  const actions: WeeklyAction[] = [];
  let freshLeft = MAX_FRESH_PER_GAP_KIND;
  let remindersLeft = MAX_REMINDERS_PER_GAP_KIND;
  for (const g of documentationDebt(tpl).gaps.filter((x) => x.item.criticality === "critical")) {
    if (freshLeft === 0 && remindersLeft === 0) break;
    const priority =
      g.state === "none"
        ? g.coverage === "single" || g.coverage === "uncovered"
          ? PRIORITY.docsSinglePoint
          : PRIORITY.docsCovered
        : PRIORITY.docsUnlocated;
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
      why: `${g.action} A stand-in cannot follow steps that exist only in someone's head, and nobody else can compare unwritten steps with what was done.`,
      effort: g.state === "none" ? "medium" : "low",
      tab: "knowledge",
      priority,
    });
  }
  return actions;
}

/** Until the register is filled in, the one continuity action is to fill it in. */
function registerStartActions({ tpl, registerReady }: WeeklyContext): WeeklyAction[] {
  if (registerReady) return [];
  return [
    tpl.knowledge.length === 0
      ? {
          id: "register-start",
          title: "List the duties and know-how the business runs on",
          why: "The register is empty. Until it lists what the business runs on and who can do each, the app cannot say what stops when someone is out or who holds work alone.",
          effort: "low",
          tab: "knowledge",
          priority: PRIORITY.registerStartEmpty,
        }
      : {
          id: "register-start",
          title: `Mark who can do each of the ${tpl.knowledge.length} things the business runs on`,
          why: `The register lists ${tpl.knowledge.length} duties and pieces of know-how a business like yours usually runs on, with nobody marked yet. Until someone is marked, the app cannot say what stops when a person is out or who holds work alone. Remove what does not apply.`,
          effort: "low",
          tab: "knowledge",
          priority: PRIORITY.registerStartListed,
        },
  ];
}

/** Register entries nobody has confirmed lately, as one conversation with the person who holds most of them. */
function checkInActions({ tpl, input, today, registerReady }: WeeklyContext): WeeklyAction[] {
  if (!input.trackFreshness || !registerReady) return [];
  const plan = checkInPlan(tpl, today);
  const first = plan.checkIns[0];
  if (first) {
    const others = plan.checkIns.length - 1;
    const soleNote =
      first.soleCount > 0 ? `${first.soleCount} of them nobody else can run alone. ` : "";
    return [
      {
        id: `check-in-${first.person.id}`,
        title: `Check in with ${firstName(first.person.name)}: ${count(first.items.length, "register entry", "register entries")}`,
        why: `The register says ${first.person.name} can do ${joinWithAnd(
          first.items.map((entry) => entry.item.name),
          3,
        )}, but nobody has confirmed it in ${CONFIRMATION_MAX_AGE_DAYS}+ days. ${soleNote}Ask, then mark each still does it / level changed / no longer.${
          others > 0
            ? ` ${others} more ${verb(others, "person", "people")} to check in with after that.`
            : ""
        }${plan.unheld.length > 0 ? ` ${count(plan.unheld.length, "stale entry", "stale entries")} nobody active holds.` : ""}`,
        effort: "low",
        tab: "knowledge",
        priority: first.soleCount > 0 ? PRIORITY.checkInSole : PRIORITY.checkIn,
      },
    ];
  }
  if (plan.unheld.length === 0) return [];
  return [
    {
      id: "confirm-register",
      title: `Re-confirm ${count(plan.unheld.length, "register entry", "register entries")} nobody holds`,
      why: `${plan.unheld[0].action} ${
        plan.unheld.length > 1
          ? `${count(plan.unheld.length - 1, "more entry", "more entries")} also ${verb(plan.unheld.length - 1, "needs", "need")} a check.`
          : ""
      }`.trim(),
      effort: "low",
      tab: "knowledge",
      priority: PRIORITY.confirmRegister,
    },
  ];
}

/** The active person the most critical work stops without, when that is half of it or more. */
function dependenceActions({ continuity }: WeeklyContext): WeeklyAction[] {
  const leanedOn = continuity.people.find((l) => l.person.active);
  if (!leanedOn || leanedOn.dependence < 50 || leanedOn.soleItems.length < 2) return [];
  return [
    {
      id: `dependence-${leanedOn.person.id}`,
      title: `Spread ${firstName(leanedOn.person.name)}'s sole duties`,
      why: `${leanedOn.dependence}% of critical work stops if ${leanedOn.person.name} is out — ${leanedOn.soleItems.length} items nobody else can run. Run the absence check on the Who knows what tab.`,
      effort: "medium",
      tab: "knowledge",
      priority: PRIORITY.dependence,
    },
  ];
}

/** The top residual risk (ranked by its own score) and the control lever that would lower the average most. */
function residualActions(
  { tpl, input, scope }: WeeklyContext,
  crossTrainingListed: boolean,
): WeeklyAction[] {
  const actions: WeeklyAction[] = [];
  const topRisk = portfolioSummary(tpl, input.staff, DEFAULT_WEIGHTS, scope).top[0];
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
  // The cross-training lever repeats the per-item cross-training actions in
  // one line; when those are listed, the plan offers the next lever instead.
  const bestLever = tornadoSensitivity(tpl, input.staff, scope).levers.find(
    (l) => !(l.id === "spof" && crossTrainingListed),
  );
  if (bestLever && bestLever.delta >= 3) {
    actions.push({
      id: `tornado-${bestLever.id}`,
      title: bestLever.label,
      why: `Could lower average residual by ~${Math.round(bestLever.delta)} points.`,
      effort: bestLever.id === "bank" || bestLever.id === "dual" ? "low" : "medium",
      tab: "residual",
      priority: PRIORITY.leverBase + Math.min(20, bestLever.delta),
    });
  }
  return actions;
}

/** Until the map is the owner's, one action to make it so; after that, hot and unowned processes. */
function mapActions({ tpl, input, mapReady }: WeeklyContext): WeeklyAction[] {
  if (!mapReady) {
    const starterCount = tpl.processes.length;
    return [
      starterCount === 0
        ? {
            id: "map-start",
            title: "Add the processes your business runs to the map",
            why: "The map is empty. Until it lists the processes your business runs and who owns each, the app cannot score ownership, controls, documentation or heat.",
            effort: "low",
            tab: "map",
            priority: PRIORITY.mapStart,
          }
        : {
            id: "map-start",
            title: `Assign an owner to each of the ${starterCount} sample processes`,
            why: `Your map holds ${starterCount} sample processes from the ${industryMeta(tpl.id).label.toLowerCase()} sample and none has an owner yet. Until each has an owner, the app cannot score ownership, controls, documentation or heat as facts about your business. Remove what does not apply.`,
            effort: "low",
            tab: "map",
            priority: PRIORITY.mapStart,
          },
    ];
  }
  const snapshots = input.mapSnapshots ?? [];
  const hot: WeeklyAction[] = snapshots
    .filter((s) => s.heat >= HEAT_BANDS.hot)
    .slice(0, MAX_PER_SOURCE)
    .map((snap) => {
      const gaps = snap.controlGaps.filter((c) => !c.segregated).length;
      return {
        id: `map-heat-${snap.process.id}`,
        title: `Review hot process: ${snap.process.name}`,
        why: `Heat ${snap.heat} — ${count(snap.risks.length, "risk")}${gaps ? `, ${count(gaps, "duty-conflict gap")}` : ""}. Open the map builder to assign owners and controls.`,
        effort: gaps > 0 ? "medium" : "low",
        tab: "map",
        processId: snap.process.id,
        priority: Math.min(92, snap.heat + 5),
      };
    });
  const unowned: WeeklyAction[] = snapshots
    .filter((s) => !s.owners.length)
    .slice(0, 1)
    .map((snap) => ({
      id: `map-owner-${snap.process.id}`,
      title: `Assign owner: ${snap.process.name}`,
      why: "Processes without owners don't get duty-conflict or continuity scoring — assign someone on your team.",
      effort: "low",
      tab: "map",
      processId: snap.process.id,
      priority: PRIORITY.unownedProcess,
    }));
  return [...hot, ...unowned];
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
  const logged = `You logged "${c.decision.subject}" on ${formatDay(c.decision.createdAt)}${c.reviewBy ? ` with a review on ${formatDay(c.reviewBy)}` : ""}; the register still says ${stillSays}.`;
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
      why: `${logged} Close it in the Decisions log as done, which updates the register, or push the review date if it is still in progress.`,
      effort: "low",
      tab: "journal",
      priority,
    };
  }
  return {
    id: `commit-${c.decision.id}`,
    title: `In progress: ${what}${c.reviewBy ? ` — review ${formatDay(c.reviewBy)}` : ""}`,
    why: `${logged} Nothing new to start; if it has already happened, close it as done in the Decisions log.`,
    effort: "low",
    tab: "journal",
    priority: PRIORITY.inProgress,
  };
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

function casesForControls(ids: readonly ControlId[]): CaseStudy[] {
  const seen = new Map<string, CaseStudy>();
  for (const id of ids) for (const c of casesForControl(id)) seen.set(c.id, c);
  return [...seen.values()];
}
