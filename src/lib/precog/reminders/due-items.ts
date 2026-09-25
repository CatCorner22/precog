import { resolveTemplate } from "../active-template";
import { decisionsDue } from "../decisions/follow-through";
import { absencesNeedingAttention, plannedAbsenceReport } from "../continuity/planned-absence";
import { handoverDeadline, leavers } from "../continuity/leavers";
import { latestReview, monthKey, monthlyReviewTasks, reviewDueOn } from "../firm/reviews";
import { isOwnTeam } from "../firm/engagement";
import type { PracticeProfile } from "../practice-profile";

/**
 * What is due on one business, read from the saved profile the same way the
 * screens read it, so a reminder never names something the app would not
 * show. Each item carries a stable key and due date; the reminder log keeps
 * one row per (item, due date, recipient), so an item is announced once.
 */
export type DueAudience = "advisor" | "owner" | "both";

export interface DueItem {
  key: string;
  title: string;
  detail: string;
  dueOn: string | null;
  overdue: boolean;
  audience: DueAudience;
}

const MONTHLY_REVIEW_GRACE_DAY = 5;
const ABSENCE_LEAD_DAYS = 14;
const LEAVER_LEAD_DAYS = 7;

function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
}

export function dueItemsFor(profile: PracticeProfile, today: string): DueItem[] {
  if (!isOwnTeam(profile)) return [];
  const items: DueItem[] = [];
  const tpl = resolveTemplate(profile);
  const now = new Date(`${today}T12:00:00Z`);

  const { overdue, dueSoon } = decisionsDue(profile.decisions, now, 7);
  for (const decision of [...overdue, ...dueSoon]) {
    items.push({
      key: `decision:${decision.id}`,
      title: `Review the decision on ${decision.subject}`,
      detail: decision.note
        ? decision.note.slice(0, 160)
        : "A review date was set when it was recorded.",
      dueOn: decision.reviewBy ?? null,
      overdue: overdue.includes(decision),
      audience: "both",
    });
  }

  for (const check of profile.leaverAccessChecks ?? []) {
    if (check.confirmedOn || check.industry !== profile.industry) continue;
    items.push({
      key: `leaver:${check.id}`,
      title: `Confirm ${check.name} is off payroll and their logins are removed`,
      detail: `Noted as left on ${check.notedOn}. A former employee's working login is a documented path to fraud.`,
      dueOn: check.notedOn,
      overdue: daysBetween(check.notedOn, today) > 0,
      audience: "both",
    });
  }

  const absences = plannedAbsenceReport(
    tpl,
    profile.plannedAbsences ?? [],
    profile.industry,
    today,
  );
  for (const window of absencesNeedingAttention(absences.windows, ABSENCE_LEAD_DAYS)) {
    const stops = window.impact.stops;
    if (stops.length === 0) continue;
    const hasHandoff = profile.decisions.some(
      (d) => d.linkedAbsenceId === window.absence.id && d.status !== "closed",
    );
    if (hasHandoff) continue;
    items.push({
      key: `absence:${window.absence.id}`,
      title: `${window.person.name} is away from ${window.absence.from}: name who covers`,
      detail: `${stops.length} item(s) stop while they are out and nobody is named to take them.`,
      dueOn: window.absence.from,
      overdue: window.daysUntil <= 0,
      audience: "both",
    });
  }

  for (const leaver of leavers(tpl, profile.decisions, today)) {
    const deadline = handoverDeadline(leaver, today);
    if (daysBetween(today, deadline) > LEAVER_LEAD_DAYS) continue;
    const open = leaver.handover.filter((item) => !item.training && !item.documenting);
    if (open.length === 0) continue;
    items.push({
      key: `handover:${leaver.person.id}:${leaver.lastDay}`,
      title: `${leaver.person.name} leaves on ${leaver.lastDay}: ${open.length} item(s) still to hand over`,
      detail: open
        .slice(0, 3)
        .map((item) => item.item.name)
        .join(", "),
      dueOn: deadline,
      overdue: deadline <= today,
      audience: "both",
    });
  }

  // The monthly review is the advisor's: it is due once the month has
  // started and stays due until every item has a result for the period.
  const period = monthKey(today);
  const day = Number(today.slice(8, 10));
  if (day >= MONTHLY_REVIEW_GRACE_DAY) {
    const tasks = monthlyReviewTasks(today, tpl.people);
    const open = tasks.filter(
      (task) => !latestReview(profile.monthlyReviews ?? [], task.key, period),
    );
    if (open.length > 0) {
      const dueOn = reviewDueOn(period);
      items.push({
        key: `monthly:${period}`,
        title: `Monthly review for ${period}: ${open.length} of ${tasks.length} items not yet recorded`,
        detail: open.map((task) => task.title).join(", "),
        dueOn,
        overdue: dueOn < today,
        audience: "advisor",
      });
    }
  }

  return items.sort(
    (a, b) => Number(b.overdue) - Number(a.overdue) || (a.dueOn ?? "").localeCompare(b.dueOn ?? ""),
  );
}

export function forAudience(items: readonly DueItem[], audience: "advisor" | "owner"): DueItem[] {
  return items.filter((item) => item.audience === "both" || item.audience === audience);
}
