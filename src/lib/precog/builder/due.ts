/**
 * The control calendar's items: evidence reviews, decision re-reviews and a
 * snapshot nudge, as dated items. Evidence days come from evidenceStatus and
 * decisions from decisionsDue, so the calendar agrees with the evidence list
 * and the dashboard. The email digest has its own collector
 * (reminders/due-items.ts).
 */
import { decisionsDue } from "../decisions/follow-through";
import type { PracticeProfile } from "../practice-profile";
import type { Person, ProcessNode } from "../types";
import { DAY_MS, daysBetween, localDateKey } from "../dates";
import { FREQUENCY_LABEL, evidenceDueDate, evidenceStatus } from "./evidence";

type DueKind = "evidence" | "decision" | "snapshot";

export interface DueItem {
  id: string;
  kind: DueKind;
  title: string;
  detail: string;
  /** When it's due; past = overdue. Null for "never scheduled" evidence. */
  dueAt: Date | null;
  /** Negative = overdue by N days. */
  daysLeft: number | null;
  status: "overdue" | "today" | "this_week" | "later" | "unscheduled";
  processId?: string;
  evidenceId?: string;
  decisionId?: string;
  frequencyLabel?: string;
  reviewer?: string;
}

export function collectDueItems(
  processes: ProcessNode[],
  people: Person[],
  profile: PracticeProfile,
  now = new Date(),
): DueItem[] {
  const items: DueItem[] = [];

  for (const p of processes) {
    for (const e of p.evidence ?? []) {
      const { daysLeft } = evidenceStatus(e, now.getTime());
      const reviewer = e.reviewerPersonId
        ? people.find((x) => x.id === e.reviewerPersonId)?.name
        : undefined;
      items.push({
        id: `ev-${p.id}-${e.id}`,
        kind: "evidence",
        title: e.label,
        detail: `${p.name} · ${FREQUENCY_LABEL[e.frequency]}${reviewer ? ` · ${reviewer}` : ""}`,
        dueAt: evidenceDueDate(e),
        daysLeft,
        status: classify(daysLeft),
        processId: p.id,
        evidenceId: e.id,
        frequencyLabel: FREQUENCY_LABEL[e.frequency],
        reviewer,
      });
    }
  }

  // Open decisions only, the same set the dashboard counts: a closed
  // decision keeps its reviewBy but has nothing left to re-review.
  const today = localDateKey(now);
  const { overdue, dueSoon } = decisionsDue(profile.decisions, today, DECISION_HORIZON_DAYS);
  for (const d of [...overdue, ...dueSoon]) {
    const daysLeft = d.reviewBy ? daysBetween(today, d.reviewBy) : null;
    if (daysLeft === null) continue;
    // Local midnight of the review day, so the calendar files it under that day.
    const due = new Date(now.getFullYear(), now.getMonth(), now.getDate() + daysLeft);
    items.push({
      id: `dec-${d.id}`,
      kind: "decision",
      title: `Re-review: ${d.subject}`,
      detail: `Journal decision (${d.kind.replace("_", " ")})`,
      dueAt: due,
      daysLeft,
      status: classify(daysLeft),
      decisionId: d.id,
    });
  }

  const lastVersion = profile.mapVersions?.[0];
  const hasCustomMap = Boolean(profile.customProcesses || profile.customPeople);
  if (hasCustomMap) {
    const ageDays = lastVersion
      ? Math.floor((now.getTime() - new Date(lastVersion.createdAt).getTime()) / DAY_MS)
      : null;
    if (ageDays === null || ageDays >= 30) {
      items.push({
        id: "snapshot-nudge",
        kind: "snapshot",
        title: lastVersion ? "Snapshot your map" : "Save a first map snapshot",
        detail: lastVersion
          ? `Last version "${lastVersion.name}" is ${ageDays} days old — snapshot before the next big change.`
          : "Versions let you compare and restore. Save one now as your baseline.",
        dueAt: null,
        daysLeft: null,
        status: "unscheduled",
      });
    }
  }

  const rank: Record<DueItem["status"], number> = {
    overdue: 0,
    today: 1,
    this_week: 2,
    unscheduled: 3,
    later: 4,
  };
  return items.sort(
    (a, b) => rank[a.status] - rank[b.status] || (a.daysLeft ?? 999) - (b.daysLeft ?? 999),
  );
}

export interface DueSummary {
  overdue: number;
  today: number;
  thisWeek: number;
  unscheduled: number;
  later: number;
}

export function summarizeDue(items: DueItem[]): DueSummary {
  return {
    overdue: items.filter((i) => i.status === "overdue").length,
    today: items.filter((i) => i.status === "today").length,
    thisWeek: items.filter((i) => i.status === "this_week").length,
    unscheduled: items.filter((i) => i.status === "unscheduled").length,
    later: items.filter((i) => i.status === "later").length,
  };
}

/** Group dated items by calendar day key (YYYY-MM-DD, local). */
export function groupByDay(items: DueItem[]): Map<string, DueItem[]> {
  const m = new Map<string, DueItem[]>();
  for (const i of items) {
    if (!i.dueAt) continue;
    const k = localDateKey(i.dueAt);
    const list = m.get(k) ?? [];
    list.push(i);
    m.set(k, list);
  }
  return m;
}

function classify(daysLeft: number | null): DueItem["status"] {
  if (daysLeft === null) return "unscheduled";
  if (daysLeft < 0) return "overdue";
  if (daysLeft === 0) return "today";
  if (daysLeft <= 7) return "this_week";
  return "later";
}

/** Decisions due for re-review within this many days show on the calendar. */
const DECISION_HORIZON_DAYS = 60;
