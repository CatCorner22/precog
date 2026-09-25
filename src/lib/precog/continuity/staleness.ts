import type { IndustryTemplate } from "../templates/types";
import type { KnowledgeItem, KnowledgeLevel, Person } from "../types";
import { daysBetween, isCalendarDate } from "../dates";
import {
  coverageReport,
  CRITICALITY_WEIGHT,
  STATUS_URGENCY,
  STRONG_LEVELS,
  type CoverageStatus,
} from "./coverage";

/**
 * Register freshness: which confirmations have aged past the limit, and who
 * should check in with whom to renew them.
 */
export const CONFIRMATION_MAX_AGE_DAYS = 90;

interface StaleItem {
  item: KnowledgeItem;
  coverage: CoverageStatus;
  confirmedAt: string | null;
  ageDays: number | null;
  action: string;
}

export interface StalenessReport {
  stale: StaleItem[];
  /** Criticality-weighted percentage of items confirmed within the freshness window. */
  confirmedIndex: number;
}

function ageInDays(confirmedAt: string, today: string): number | null {
  return daysBetween(confirmedAt, today);
}

export function staleItems(
  tpl: IndustryTemplate,
  today: string,
  maxAgeDays = CONFIRMATION_MAX_AGE_DAYS,
): StalenessReport {
  const report = coverageReport(tpl);
  const stale: StaleItem[] = [];
  let confirmedWeight = 0;
  let totalWeight = 0;

  for (const row of report.items) {
    const confirmedAt =
      row.item.confirmedAt && isCalendarDate(row.item.confirmedAt, today)
        ? row.item.confirmedAt
        : null;
    const ageDays = confirmedAt ? ageInDays(confirmedAt, today) : null;
    const fresh = ageDays !== null && ageDays <= maxAgeDays;
    const weight = CRITICALITY_WEIGHT[row.item.criticality];
    totalWeight += weight;
    if (fresh) {
      confirmedWeight += weight;
      continue;
    }
    stale.push({
      item: row.item,
      coverage: row.status,
      confirmedAt,
      ageDays,
      action:
        ageDays === null
          ? `Confirm who can run ${row.item.name} today and whether the written procedure is still current.`
          : `Re-confirm ${row.item.name} — last checked ${ageDays} days ago; people and procedures drift.`,
    });
  }

  stale.sort(
    (a, b) =>
      CRITICALITY_WEIGHT[b.item.criticality] - CRITICALITY_WEIGHT[a.item.criticality] ||
      STATUS_URGENCY[b.coverage] - STATUS_URGENCY[a.coverage] ||
      a.item.name.localeCompare(b.item.name),
  );
  return {
    stale,
    confirmedIndex: totalWeight ? Math.round((confirmedWeight / totalWeight) * 100) : 100,
  };
}

interface CheckInItem extends StaleItem {
  /** What the register currently says this person can do. */
  level: KnowledgeLevel;
}

interface PersonCheckIn {
  person: Person;
  /** Stale items this person holds at any level, most critical first. */
  items: CheckInItem[];
  /** How many of those nobody else can run alone. */
  soleCount: number;
}

export interface CheckInPlan {
  /** Active people with at least one stale item, most items first. */
  checkIns: PersonCheckIn[];
  /** Stale items nobody active holds — the owner confirms these directly. */
  unheld: StaleItem[];
}

/**
 * Re-confirmation as a conversation: the stale register grouped by the person
 * to sit down with, so one check-in covers everything they hold instead of
 * one click per item. A shared item appears under every holder.
 */
export function checkInPlan(tpl: IndustryTemplate, today: string): CheckInPlan {
  const { stale } = staleItems(tpl, today);
  const rank = new Map(stale.map((entry, i) => [entry.item.id, i]));
  const byPerson = new Map<string, PersonCheckIn>();
  const held = new Set<string>();

  for (const person of tpl.people.filter((p) => p.active)) {
    const items: CheckInItem[] = [];
    for (const relation of tpl.relations) {
      if (relation.personId !== person.id) continue;
      const index = rank.get(relation.knowledgeId);
      if (index === undefined) continue;
      items.push({ ...stale[index], level: relation.level });
      held.add(relation.knowledgeId);
    }
    if (items.length === 0) continue;
    items.sort((a, b) => (rank.get(a.item.id) ?? 0) - (rank.get(b.item.id) ?? 0));
    byPerson.set(person.id, {
      person,
      items,
      soleCount: items.filter(
        (entry) =>
          (entry.coverage === "single" || entry.coverage === "thin") &&
          STRONG_LEVELS.has(entry.level),
      ).length,
    });
  }

  const checkIns = [...byPerson.values()].sort(
    (a, b) =>
      b.items.length - a.items.length ||
      b.soleCount - a.soleCount ||
      a.person.name.localeCompare(b.person.name),
  );
  return { checkIns, unheld: stale.filter((entry) => !held.has(entry.item.id)) };
}
