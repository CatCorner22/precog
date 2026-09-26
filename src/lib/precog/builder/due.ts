/**
 * Upcoming control work: evidence reviews, decision re-reviews, and hygiene nudges,
 * normalized to dated items so the digest and calendar share one source.
 */
import { FREQUENCY_DAYS, FREQUENCY_LABEL, evidenceStatus } from "./evidence";
import type { PracticeProfile } from "../practice-profile";
import type { EvidenceItem, Person, ProcessNode } from "../types";
import { DAY_MS, localDateKey, localDaysBetween } from "../dates";

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

function nextDueDate(item: EvidenceItem): Date | null {
  if (!item.lastDoneAt) return null;
  return new Date(new Date(item.lastDoneAt).getTime() + FREQUENCY_DAYS[item.frequency] * DAY_MS);
}

function classify(daysLeft: number | null): DueItem["status"] {
  if (daysLeft === null) return "unscheduled";
  if (daysLeft < 0) return "overdue";
  if (daysLeft === 0) return "today";
  if (daysLeft <= 7) return "this_week";
  return "later";
}

export function collectDueItems(
  processes: ProcessNode[],
  people: Person[],
  profile: PracticeProfile,
  now = new Date(),
): DueItem[] {
  const items: DueItem[] = [];
  const dayDiff = (d: Date) => localDaysBetween(now, d);

  for (const p of processes) {
    for (const e of p.evidence ?? []) {
      const due = nextDueDate(e);
      const daysLeft = due ? dayDiff(due) : null;
      const { status } = evidenceStatus(e, now.getTime());
      const reviewer = e.reviewerPersonId
        ? people.find((x) => x.id === e.reviewerPersonId)?.name
        : undefined;
      items.push({
        id: `ev-${p.id}-${e.id}`,
        kind: "evidence",
        title: e.label,
        detail: `${p.name} · ${FREQUENCY_LABEL[e.frequency]}${reviewer ? ` · ${reviewer}` : ""}`,
        dueAt: due,
        daysLeft,
        status: status === "never" ? "unscheduled" : classify(daysLeft),
        processId: p.id,
        evidenceId: e.id,
        frequencyLabel: FREQUENCY_LABEL[e.frequency],
        reviewer,
      });
    }
  }

  for (const d of profile.decisions) {
    if (!d.reviewBy) continue;
    const due = new Date(d.reviewBy);
    const daysLeft = dayDiff(due);
    if (daysLeft > 60) continue;
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
