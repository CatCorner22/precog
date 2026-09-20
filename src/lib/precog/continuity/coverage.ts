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
import type {
  Criticality,
  KnowledgeItem,
  KnowledgeLevel,
  KnowledgeRelation,
  Person,
} from "../types";

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
  /** 0–100 index: share of critical work that stops if this person is out. */
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

const CRITICALITY_WEIGHT: Record<Criticality, number> = {
  critical: 3,
  important: 2,
  "nice-to-have": 1,
};

const STATUS_URGENCY: Record<CoverageStatus, number> = {
  uncovered: 3,
  single: 2,
  thin: 1,
  covered: 0,
};

export function levelRank(level: KnowledgeLevel | undefined): number {
  return level ? LEVEL_ORDER.indexOf(level) + 1 : 0;
}

export function relationLevel(
  relations: KnowledgeRelation[],
  personId: string,
  knowledgeId: string,
): KnowledgeLevel | undefined {
  return relations.find((r) => r.personId === personId && r.knowledgeId === knowledgeId)?.level;
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

  const criticalWeight = items
    .filter((i) => i.item.criticality !== "nice-to-have")
    .reduce((s, i) => s + CRITICALITY_WEIGHT[i.item.criticality], 0);

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
      const stopped = soleItems
        .filter((k) => k.criticality !== "nice-to-have")
        .reduce((s, k) => s + CRITICALITY_WEIGHT[k.criticality], 0);
      const dependence = criticalWeight === 0 ? 0 : Math.round((stopped / criticalWeight) * 100);
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
      const trainee = i.suggestedBackups[0]?.person ?? null;
      const trainer = i.primaries[0] ?? null;
      const priority = CRITICALITY_WEIGHT[i.item.criticality] * STATUS_URGENCY[i.status];
      const doc = i.item.documented
        ? ""
        : " Write the steps down first so the backup has something to follow.";
      let action: string;
      if (i.status === "uncovered") {
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

export interface AbsenceStop {
  item: KnowledgeItem;
  /** Best person to pick it up while the holder is out, if anyone. */
  standIn: Person | null;
  /** Why the stand-in was chosen, or why nobody is available. */
  note: string;
}

export interface AbsenceImpact {
  person: Person;
  /** Items only this person can run alone — work that stops on day one. */
  stops: AbsenceStop[];
  /** Items this person can run alone that another person can also run. */
  continues: KnowledgeItem[];
  /** Processes where this person is the only listed owner. */
  orphanedProcesses: string[];
  /** 0–100 share of critical work that stops (same figure as PersonLoad.dependence). */
  dependence: number;
  /** What to do now, then what to do before the next absence. */
  actions: string[];
}

/**
 * What happens if one person is unavailable tomorrow — sick, on leave, or
 * gone. Reads the coverage report and names a stand-in per stopped item;
 * "stand-in" here means the best cross-training candidate, not someone who
 * can already do it (if such a person existed the item would not stop).
 */
export function absenceImpact(tpl: IndustryTemplate, personId: string): AbsenceImpact | null {
  const person = tpl.people.find((p) => p.id === personId);
  if (!person) return null;
  const report = coverageReport(tpl);
  const load = report.people.find((l) => l.person.id === personId);
  const remaining = tpl.people.filter((p) => p.active && p.id !== personId);

  const stops: AbsenceStop[] = report.items
    .filter((i) => i.primaries.length === 1 && i.primaries[0].id === personId)
    .sort(
      (a, b) =>
        CRITICALITY_WEIGHT[b.item.criticality] - CRITICALITY_WEIGHT[a.item.criticality] ||
        a.item.name.localeCompare(b.item.name),
    )
    .map((i) => {
      const learner = i.learners.find((p) => p.active) ?? null;
      if (learner) {
        return {
          item: i.item,
          standIn: learner,
          note: i.item.documented
            ? `${learner.name} has the basics and there is a written procedure to follow.`
            : `${learner.name} has the basics but nothing is written down — expect mistakes.`,
        };
      }
      const candidate =
        i.suggestedBackups.find((s) => s.person.id !== personId && s.person.active) ?? null;
      if (!candidate) {
        return {
          item: i.item,
          standIn: null,
          note:
            remaining.length === 0
              ? "Nobody else is on the team."
              : "Nobody else has touched this; it waits or goes to an outside provider.",
        };
      }
      return {
        item: i.item,
        standIn: candidate.person,
        note: i.item.documented
          ? `${candidate.person.name} has never done it but could follow the written procedure (${candidate.reasons[0]}).`
          : `${candidate.person.name} would be starting cold with nothing written down (${candidate.reasons[0]}).`,
      };
    });

  const continues = report.items
    .filter((i) => i.primaries.length >= 2 && i.primaries.some((p) => p.id === personId))
    .map((i) => i.item);

  const orphanedProcesses = tpl.processes
    .filter((p) => {
      const owners = (p.ownerPersonIds ?? []).filter((id) =>
        tpl.people.some((x) => x.id === id && x.active),
      );
      return owners.length === 1 && owners[0] === personId;
    })
    .map((p) => p.name);

  const first = person.name.split(" ")[0];
  const actions: string[] = [];
  const critical = stops.filter((s) => s.item.criticality === "critical");
  if (critical.length) {
    const named = critical.filter((s) => s.standIn);
    if (named.length)
      actions.push(
        `Today: hand ${named
          .slice(0, 3)
          .map((s) => `"${s.item.name}" to ${s.standIn?.name}`)
          .join(", ")}${named.length > 3 ? ` and ${named.length - 3} more` : ""}.`,
      );
    const cold = critical.filter((s) => !s.standIn);
    if (cold.length)
      actions.push(
        `No one can cover ${cold
          .slice(0, 2)
          .map((s) => `"${s.item.name}"`)
          .join(" or ")} — line up an outside provider or accept that it stops.`,
      );
  }
  const undocumented = stops.filter((s) => !s.item.documented);
  if (undocumented.length)
    actions.push(
      `Before the next absence: have ${first} write down ${undocumented
        .slice(0, 3)
        .map((s) => `"${s.item.name}"`)
        .join(", ")}${undocumented.length > 3 ? ` and ${undocumented.length - 3} more` : ""}.`,
    );
  const trainable = stops.filter((s) => s.standIn).slice(0, 3);
  if (trainable.length)
    actions.push(
      `Cross-train so ${first} is not the only one: ${trainable
        .map((s) => `${s.standIn?.name} on "${s.item.name}"`)
        .join(", ")}.`,
    );
  if (orphanedProcesses.length)
    actions.push(
      `Name a second owner on ${orphanedProcesses
        .slice(0, 3)
        .map((n) => `"${n}"`)
        .join(", ")}${orphanedProcesses.length > 3 ? ` and ${orphanedProcesses.length - 3} more` : ""}.`,
    );
  if (!actions.length)
    actions.push(`Nothing stops if ${first} is out. Keep it that way as duties change.`);

  return {
    person,
    stops,
    continues,
    orphanedProcesses,
    dependence: load?.dependence ?? 0,
    actions,
  };
}

/** Critical items with exactly one person who can run them alone — the figure the residual index uses. */
export function soleOwnerCriticalCount(tpl: IndustryTemplate): number {
  return coverageReport(tpl).items.filter(
    (i) => i.item.criticality === "critical" && i.primaries.length === 1,
  ).length;
}

export function makeKnowledgeId(): string {
  return `k_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}
