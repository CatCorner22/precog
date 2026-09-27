import { resolveTemplate } from "../active-template";
import { decisionsDue } from "../decisions/follow-through";
import { absencesNeedingAttention, plannedAbsenceReport } from "../continuity/planned-absence";
import { handoverDeadline, leavers } from "../continuity/leavers";
import { latestReview, monthKey, monthlyReviewTasks, reviewDueOn } from "../firm/reviews";
import { isOwnTeam } from "../firm/engagement";
import type { PracticeProfile } from "../practice-profile";
import { daysBetween, formatDay } from "../dates";
import { count, verb } from "../text";

/**
 * What is due on one business, read from the saved profile the same way the
 * screens read it, so a reminder never names something the app would not
 * show. Each item carries a stable key and due date; the reminder log keeps
 * one row per (announcement key, due date, recipient), so an item is
 * announced when it comes due and again every four weeks while it stays
 * overdue.
 *
 * Named ReminderItem, not DueItem: builder/due.ts's DueItem is the control
 * calendar's entry, a different shape.
 */
export interface ReminderItem {
  /** Stable for the item's life. */
  key: string;
  /** What the reminder log records: the key, plus how many four-week periods it has been overdue. */
  announceKey: string;
  title: string;
  /** For the advisor's digest. */
  detail: string;
  /** For the client's owner: never the advisor's own notes. */
  ownerDetail: string;
  dueOn: string;
  overdue: boolean;
  /** Overdue for at least four weeks and announced before. */
  stillOpen: boolean;
  /** Only the advisor hears about it (the monthly review). */
  advisorOnly: boolean;
}

export function dueItemsFor(profile: PracticeProfile, today: string): ReminderItem[] {
  if (!isOwnTeam(profile)) return [];
  const items: ReminderItem[] = [];
  const add = (item: Omit<ReminderItem, "announceKey" | "stillOpen">) =>
    items.push(withAnnouncement(item, today));
  const tpl = resolveTemplate(profile);

  const { overdue, dueSoon } = decisionsDue(profile.decisions, today, 7);
  for (const decision of [...overdue, ...dueSoon]) {
    const reviewBy = decision.reviewBy ?? today;
    add({
      key: `decision:${decision.id}`,
      title: `Review the decision on ${decision.subject}`,
      detail: decision.note ? decision.note.slice(0, 160) : `Review due ${formatDay(reviewBy)}.`,
      ownerDetail: `Your advisor set ${formatDay(reviewBy)} to review this decision.`,
      dueOn: reviewBy,
      overdue: overdue.includes(decision),
      advisorOnly: false,
    });
  }

  for (const check of profile.leaverAccessChecks ?? []) {
    if (check.confirmedOn || check.industry !== profile.industry) continue;
    const detail = `${check.name} was recorded as left on ${formatDay(check.notedOn)}. A login that still works lets a former employee move money after they leave.`;
    add({
      key: `leaver:${check.id}`,
      title: `Confirm ${check.name} is off payroll and their logins are removed`,
      detail,
      ownerDetail: detail,
      dueOn: check.notedOn,
      overdue: (daysBetween(check.notedOn, today) ?? 0) > 0,
      advisorOnly: false,
    });
  }

  const absences = plannedAbsenceReport(
    tpl,
    profile.plannedAbsences ?? [],
    profile.industry,
    today,
  );
  for (const window of absencesNeedingAttention(absences.windows)) {
    const stops = window.impact.stops;
    if (stops.length === 0) continue;
    const hasHandoff = profile.decisions.some(
      (d) => d.linkedAbsenceId === window.absence.id && d.status !== "closed",
    );
    if (hasHandoff) continue;
    const detail = `${count(stops.length, "task")} ${verb(stops.length, "stops", "stop")} while they are out, and no one is named to cover ${verb(stops.length, "it", "them")}.`;
    add({
      key: `absence:${window.absence.id}`,
      title: `${window.person.name} is away from ${formatDay(window.absence.from)}: name who covers`,
      detail,
      ownerDetail: detail,
      dueOn: window.absence.from,
      overdue: window.daysUntil <= 0,
      advisorOnly: false,
    });
  }

  for (const leaver of leavers(tpl, profile.decisions, today)) {
    const deadline = handoverDeadline(leaver, today);
    if ((daysBetween(today, deadline) ?? 0) > LEAVER_LEAD_DAYS) continue;
    const open = leaver.handover.filter((item) => !item.training && !item.documenting);
    if (open.length === 0) continue;
    const detail = open
      .slice(0, 3)
      .map((item) => item.item.name)
      .join(", ");
    add({
      key: `handover:${leaver.person.id}:${leaver.lastDay}`,
      title: `${leaver.person.name} leaves on ${formatDay(leaver.lastDay)}: ${count(open.length, "task")} still to hand over`,
      detail,
      ownerDetail: detail,
      dueOn: deadline,
      overdue: deadline <= today,
      advisorOnly: false,
    });
  }

  // The monthly review is the advisor's: it is due once the month has
  // started and stays due until every item has a result for the period.
  const period = monthKey(today);
  const day = Number(today.slice(8, 10));
  if (day >= MONTHLY_REVIEW_GRACE_DAY) {
    const tasks = monthlyReviewTasks(today, tpl.people, tpl.roleTemplates);
    const open = tasks.filter(
      (task) => !latestReview(profile.monthlyReviews ?? [], task.key, period),
    );
    if (open.length > 0) {
      const dueOn = reviewDueOn(period);
      const detail = open.map((task) => task.title).join(", ");
      add({
        key: `monthly:${period}`,
        title: `Monthly review for ${period}: ${open.length} of ${count(tasks.length, "task")} not yet recorded`,
        detail,
        ownerDetail: detail,
        dueOn,
        overdue: dueOn < today,
        advisorOnly: true,
      });
    }
  }

  return items.sort(
    (a, b) => Number(b.overdue) - Number(a.overdue) || a.dueOn.localeCompare(b.dueOn),
  );
}

/** The items each audience hears about: the client's owner never gets advisor-only ones. */
export function forAudience(
  items: readonly ReminderItem[],
  audience: "advisor" | "owner",
): ReminderItem[] {
  return audience === "advisor" ? [...items] : items.filter((item) => !item.advisorOnly);
}

const MONTHLY_REVIEW_GRACE_DAY = 5;
const LEAVER_LEAD_DAYS = 7;
/** An overdue item is announced again after this many days while it stays open. */
const REANNOUNCE_DAYS = 28;

function withAnnouncement(
  item: Omit<ReminderItem, "announceKey" | "stillOpen">,
  today: string,
): ReminderItem {
  if (!item.overdue) return { ...item, announceKey: item.key, stillOpen: false };
  const period = Math.floor(Math.max(0, daysBetween(item.dueOn, today) ?? 0) / REANNOUNCE_DAYS);
  return { ...item, announceKey: `${item.key}#overdue-${period}`, stillOpen: period > 0 };
}
