/**
 * Continuity coverage — who can do each duty, task, or piece of know-how,
 * where the business is one absence away from a stoppage, and who is the
 * most sensible person to train as a backup.
 *
 * Pure functions over the resolved template. Nothing here is a measurement:
 * the status labels order attention, and the backup ranking is a heuristic
 * described in `suggestBackups`.
 */
import type { IndustryTemplate } from "../templates/types";
import { registerAssessed } from "./register-state";
import type {
  Criticality,
  KnowledgeItem,
  KnowledgeLevel,
  KnowledgeRelation,
  Person,
} from "../types";

/** Short form of a name for advice wording: the first given name, skipping an honorific such as "Dr.". */
export function firstName(name: string): string {
  const parts = name.trim().split(/\s+/);
  const given = parts.find((p) => !/^(dr|mr|mrs|ms|mx|prof|rev)\.?$/i.test(p));
  return given ?? parts[0] ?? "";
}

export const LEVEL_ORDER: KnowledgeLevel[] = ["aware", "basic", "proficient", "expert"];
export const STRONG_LEVELS = new Set<KnowledgeLevel>(["expert", "proficient"]);

export const LEVEL_LABEL: Record<KnowledgeLevel, string> = {
  expert: "Can do it alone and teach it",
  proficient: "Can do it alone",
  basic: "Can do it with notes or help",
  aware: "Knows it exists",
};

/**
 * uncovered: nobody can run it alone.
 * single:    exactly one person can run it alone and nobody else has started learning.
 * thin:      one person can run it alone; at least one other has basic familiarity.
 * covered:   two or more people can run it alone.
 */
export type CoverageStatus = "uncovered" | "single" | "thin" | "covered";

export const STATUS_LABEL: Record<CoverageStatus, string> = {
  uncovered: "Nobody can do this alone",
  single: "Only one person",
  thin: "One person plus a learner",
  covered: "Two or more can do this",
};

export interface ItemCoverage {
  item: KnowledgeItem;
  status: CoverageStatus;
  /** People who can run it alone (expert or proficient). */
  primaries: Person[];
  /** People with basic familiarity — a head start for cross-training. */
  learners: Person[];
  /** People who only know it exists. */
  aware: Person[];
  /** Ranked people to train next; empty when already covered. */
  suggestedBackups: BackupSuggestion[];
}

export interface BackupSuggestion {
  person: Person;
  /** Higher = better candidate. */
  score: number;
  reasons: string[];
}

export interface PersonLoad {
  person: Person;
  /** Items where this person is the only one who can run it alone. */
  soleItems: KnowledgeItem[];
  /** Items this person can run alone that someone else also can. */
  sharedItems: KnowledgeItem[];
  /** Items this person is learning (basic). */
  learningItems: KnowledgeItem[];
  /** 0–100 index: share of must-do work that stops if this person is out (critical weighs 3, important 2). */
  dependence: number;
}

export interface CoverageReport {
  items: ItemCoverage[];
  people: PersonLoad[];
  counts: Record<CoverageStatus, number>;
  /** Critical or important items with status single/uncovered. */
  singlePoints: ItemCoverage[];
  /** 0–100: share of items (criticality-weighted) with at least two people who can run them alone. */
  coverageIndex: number;
  /** Cross-training moves in priority order. */
  plan: CrossTrainingMove[];
}

export interface CrossTrainingMove {
  item: KnowledgeItem;
  status: CoverageStatus;
  trainee: Person | null;
  trainer: Person | null;
  action: string;
  priority: number;
}

export const CRITICALITY_WEIGHT: Record<Criticality, number> = {
  critical: 3,
  important: 2,
  "nice-to-have": 1,
};

/** How pressing each coverage status is; a slip is a move to a more urgent one. */
export const STATUS_URGENCY: Record<CoverageStatus, number> = {
  uncovered: 3,
  single: 2,
  thin: 1,
  covered: 0,
};

export function dependenceFor(
  items: readonly KnowledgeItem[],
  stopped: readonly KnowledgeItem[],
): number {
  const total = items
    .filter((item) => item.criticality !== "nice-to-have")
    .reduce((sum, item) => sum + CRITICALITY_WEIGHT[item.criticality], 0);
  const stoppedWeight = stopped
    .filter((item) => item.criticality !== "nice-to-have")
    .reduce((sum, item) => sum + CRITICALITY_WEIGHT[item.criticality], 0);
  return total === 0 ? 0 : Math.round((stoppedWeight / total) * 100);
}

/**
 * One lookup index per relations array. Reports call relationLevel inside a
 * people-by-items loop, so a linear scan per cell cost people × items ×
 * relations comparisons per report; the index makes each lookup constant.
 * Keyed on array identity, so any edit (a new array) rebuilds it.
 */
const relationIndexCache = new WeakMap<KnowledgeRelation[], Map<string, KnowledgeLevel>>();

function relationIndex(relations: KnowledgeRelation[]): Map<string, KnowledgeLevel> {
  let index = relationIndexCache.get(relations);
  if (!index) {
    index = new Map();
    for (const r of relations) index.set(`${r.personId}\u0000${r.knowledgeId}`, r.level);
    relationIndexCache.set(relations, index);
  }
  return index;
}

export function relationLevel(
  relations: KnowledgeRelation[],
  personId: string,
  knowledgeId: string,
): KnowledgeLevel | undefined {
  return relationIndex(relations).get(`${personId}\u0000${knowledgeId}`);
}

/** Replace, add, or (when level is undefined) remove one person's level on one item. */
export function setRelationLevel(
  relations: KnowledgeRelation[],
  personId: string,
  knowledgeId: string,
  level: KnowledgeLevel | undefined,
): KnowledgeRelation[] {
  const rest = relations.filter((r) => !(r.personId === personId && r.knowledgeId === knowledgeId));
  return level ? [...rest, { personId, knowledgeId, level }] : rest;
}

export function coverageStatus(primaries: number, learners: number): CoverageStatus {
  if (primaries === 0) return "uncovered";
  if (primaries >= 2) return "covered";
  return learners > 0 ? "thin" : "single";
}

/**
 * Rank who should learn an item next. Reasons, in order of weight:
 * already has basic familiarity; already owns a process this item is linked
 * to; carries few sole-holder items (so the backup does not create a new
 * single point); is active. Primaries are excluded.
 */
export function suggestBackups(
  tpl: IndustryTemplate,
  item: KnowledgeItem,
  soleCountByPerson: Map<string, number>,
): BackupSuggestion[] {
  const { people, relations, processes } = tpl;
  const linkedOwners = new Set(
    processes
      .filter((p) => item.linkedProcessIds.includes(p.id))
      .flatMap((p) => p.ownerPersonIds ?? []),
  );
  const maxSole = Math.max(0, ...people.map((p) => soleCountByPerson.get(p.id) ?? 0));
  return people
    .filter((p) => p.active)
    .filter((p) => !STRONG_LEVELS.has(relationLevel(relations, p.id, item.id) ?? "aware"))
    .map((p) => {
      const level = relationLevel(relations, p.id, item.id);
      const reasons: string[] = [];
      let score = 0;
      if (level === "basic") {
        score += 4;
        reasons.push("already has the basics");
      } else if (level === "aware") {
        score += 1;
        reasons.push("knows it exists");
      }
      if (linkedOwners.has(p.id)) {
        score += 3;
        reasons.push("already works the linked process");
      }
      const sole = soleCountByPerson.get(p.id) ?? 0;
      if (sole === 0) {
        score += 2;
        reasons.push("not a single point anywhere yet");
      } else if (maxSole > 0 && sole < maxSole) {
        score += 1;
        reasons.push(`carries fewer sole duties (${sole})`);
      } else {
        reasons.push(`already sole holder of ${sole}`);
      }
      return { person: p, score, reasons };
    })
    .sort((a, b) => b.score - a.score || a.person.name.localeCompare(b.person.name));
}

export function coverageReport(tpl: IndustryTemplate): CoverageReport {
  const { knowledge, people, relations } = tpl;
  const byId = new Map(people.map((p) => [p.id, p]));

  const holders = (knowledgeId: string) =>
    relations
      .filter((r) => r.knowledgeId === knowledgeId)
      .map((r) => ({ person: byId.get(r.personId), level: r.level }))
      .filter((h): h is { person: Person; level: KnowledgeLevel } => Boolean(h.person?.active));

  const soleCountByPerson = new Map<string, number>();
  const base = knowledge.map((item) => {
    const h = holders(item.id);
    const primaries = h.filter((x) => STRONG_LEVELS.has(x.level)).map((x) => x.person);
    const learners = h.filter((x) => x.level === "basic").map((x) => x.person);
    const aware = h.filter((x) => x.level === "aware").map((x) => x.person);
    if (primaries.length === 1) {
      const id = primaries[0].id;
      soleCountByPerson.set(id, (soleCountByPerson.get(id) ?? 0) + 1);
    }
    return {
      item,
      primaries,
      learners,
      aware,
      status: coverageStatus(primaries.length, learners.length),
    };
  });

  const items: ItemCoverage[] = base.map((b) => ({
    ...b,
    suggestedBackups: b.status === "covered" ? [] : suggestBackups(tpl, b.item, soleCountByPerson),
  }));

  const counts: Record<CoverageStatus, number> = { uncovered: 0, single: 0, thin: 0, covered: 0 };
  for (const i of items) counts[i.status] += 1;

  const totalWeight = items.reduce((s, i) => s + CRITICALITY_WEIGHT[i.item.criticality], 0);
  const coveredWeight = items
    .filter((i) => i.status === "covered")
    .reduce((s, i) => s + CRITICALITY_WEIGHT[i.item.criticality], 0);
  const coverageIndex = totalWeight === 0 ? 100 : Math.round((coveredWeight / totalWeight) * 100);

  const peopleLoad: PersonLoad[] = people
    .map((person) => {
      const soleItems = items
        .filter((i) => i.primaries.length === 1 && i.primaries[0].id === person.id)
        .map((i) => i.item);
      const sharedItems = items
        .filter((i) => i.primaries.length >= 2 && i.primaries.some((p) => p.id === person.id))
        .map((i) => i.item);
      const learningItems = items
        .filter((i) => i.learners.some((p) => p.id === person.id))
        .map((i) => i.item);
      const dependence = dependenceFor(
        items.map((i) => i.item),
        soleItems,
      );
      return { person, soleItems, sharedItems, learningItems, dependence };
    })
    .sort((a, b) => b.dependence - a.dependence || b.soleItems.length - a.soleItems.length);

  const singlePoints = items
    .filter((i) => i.item.criticality !== "nice-to-have")
    .filter((i) => i.status === "single" || i.status === "uncovered")
    .sort(
      (a, b) =>
        CRITICALITY_WEIGHT[b.item.criticality] * STATUS_URGENCY[b.status] -
        CRITICALITY_WEIGHT[a.item.criticality] * STATUS_URGENCY[a.status],
    );

  const plan: CrossTrainingMove[] = items
    .filter((i) => i.status !== "covered")
    .map((i) => {
      // With nobody marked on an item at any level, every candidate ties on
      // generic reasons and the pick would come down to the alphabet, so the
      // plan names nobody until the owner marks someone on it.
      const marked = i.primaries.length + i.learners.length + i.aware.length > 0;
      const trainee = marked ? (i.suggestedBackups[0]?.person ?? null) : null;
      const trainer = i.primaries[0] ?? null;
      const priority = CRITICALITY_WEIGHT[i.item.criticality] * STATUS_URGENCY[i.status];
      const doc = i.item.documented
        ? ""
        : " Write the steps down first so the backup has something to follow.";
      let action: string;
      if (i.status === "uncovered" && !marked) {
        action = `Nobody is marked on "${i.item.name}" yet. Mark who can do it; if nobody can, choose who should learn it and write the steps down.`;
      } else if (i.status === "uncovered") {
        action = trainee
          ? `Nobody can run "${i.item.name}" alone. Pick ${trainee.name} to own it and get it documented.`
          : `Nobody can run "${i.item.name}" alone and there is no one free to learn it. Consider an outside provider or a written procedure.`;
      } else if (trainee && trainer) {
        const verb = i.status === "thin" ? "Finish training" : "Start training";
        action = `${verb} ${trainee.name} on "${i.item.name}" with ${trainer.name}.${doc}`;
      } else if (trainer) {
        action = `"${i.item.name}" depends on ${trainer.name} alone and nobody else is available to learn it.${doc}`;
      } else {
        action = `Assign someone to "${i.item.name}".`;
      }
      return { item: i.item, status: i.status, trainee, trainer, action, priority };
    })
    .sort((a, b) => b.priority - a.priority || a.item.name.localeCompare(b.item.name));

  return { items, people: peopleLoad, counts, singlePoints, coverageIndex, plan };
}

export interface CoverageDrop {
  item: KnowledgeItem;
  from: CoverageStatus;
  to: CoverageStatus;
  /** Who can still run it alone after the change. */
  remaining: Person[];
  /** The cross-training move that would repair it, when there is one. */
  move: CrossTrainingMove | null;
}

/**
 * Items whose coverage got worse between two registers — e.g. after a check-in
 * removed someone, or lowered them below "can do it alone". Items only in one
 * register are ignored; the register being edited decides what exists.
 */
export function coverageDrops(before: CoverageReport, after: CoverageReport): CoverageDrop[] {
  const was = new Map(before.items.map((i) => [i.item.id, i.status]));
  return after.items
    .flatMap((i) => {
      const from = was.get(i.item.id);
      if (from === undefined || STATUS_URGENCY[i.status] <= STATUS_URGENCY[from]) return [];
      return [
        {
          item: i.item,
          from,
          to: i.status,
          remaining: i.primaries,
          move: after.plan.find((m) => m.item.id === i.item.id) ?? null,
        },
      ];
    })
    .sort(
      (a, b) =>
        CRITICALITY_WEIGHT[b.item.criticality] * STATUS_URGENCY[b.to] -
        CRITICALITY_WEIGHT[a.item.criticality] * STATUS_URGENCY[a.to],
    );
}

export interface CriticalSinglePoints {
  /** Critical items one absence would stop: nobody, or one person, can run them alone. */
  count: number;
  /** Of those, items nobody can run alone. */
  nobody: number;
  /** Of those, items exactly one person can run alone (with or without a learner). */
  onePerson: number;
}

/**
 * The business's critical single points: items the business stops without
 * that nobody, or only one person, can run alone. A learner does not count as
 * cover (they cannot run it alone yet), and an item nobody can run is at
 * least as exposed as one that rests on one person, so marking the first
 * person on it never raises the count. Who knows what, the Dashboard and the
 * sole-owner figure in the business profile all read this one count.
 */
export function criticalSinglePoints(tpl: IndustryTemplate): CriticalSinglePoints {
  const critical = coverageReport(tpl).items.filter(
    (i) => i.item.criticality === "critical" && i.primaries.length <= 1,
  );
  const nobody = critical.filter((i) => i.primaries.length === 0).length;
  return { count: critical.length, nobody, onePerson: critical.length - nobody };
}

/**
 * The sole-owner figure the residual index uses: the critical single points
 * of a register someone has assessed, and 0 for the starter list with nobody
 * marked, which is not a fact about the business.
 */
export function soleOwnerCriticalCount(tpl: IndustryTemplate): number {
  return registerAssessed(tpl) ? criticalSinglePoints(tpl).count : 0;
}

export function makeKnowledgeId(): string {
  return `k_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}
