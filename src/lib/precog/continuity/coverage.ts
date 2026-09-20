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

export const DOCUMENTATION_RANK: Record<DocumentationState, number> = {
  none: 0,
  unlocated: 1,
  located: 2,
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

export const CONFIRMATION_MAX_AGE_DAYS = 90;

export interface StaleItem {
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

function utcDay(value: string): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const [year, month, day] = value.split("-").map(Number);
  const time = Date.UTC(year, month - 1, day);
  return Number.isNaN(time) ? null : time;
}

function ageInDays(confirmedAt: string, today: string): number | null {
  const confirmed = utcDay(confirmedAt);
  const current = utcDay(today);
  if (confirmed === null || current === null) return null;
  return Math.floor((current - confirmed) / 86_400_000);
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
    const confirmedAt = row.item.confirmedAt ?? null;
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
  actions: AbsenceAction[];
}

/**
 * What a continuity step asks the owner to do. One register item can carry
 * several open steps at once (hand it off today, write it down, cross-train a
 * backup), so the Journal tracks them per item *and* step.
 */
export type ContinuityStep = "cover" | "handoff" | "document" | "locate";

export interface AbsenceAction {
  text: string;
  step: ContinuityStep;
  /** Register items the action is about; empty when it concerns processes or nothing at all. */
  knowledgeIds: string[];
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

  const where = (item: KnowledgeItem) =>
    item.documented && item.procedureLocation?.trim()
      ? ` (procedure: ${item.procedureLocation.trim()})`
      : "";

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
            ? `${learner.name} has the basics and there is a written procedure to follow${where(i.item)}.`
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
          ? `${candidate.person.name} has never done it but could follow the written procedure${where(i.item)} (${candidate.reasons[0]}).`
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
  const actions: AbsenceAction[] = [];
  const ids = (list: AbsenceStop[]) => list.map((s) => s.item.id);
  const critical = stops.filter((s) => s.item.criticality === "critical");
  if (critical.length) {
    const named = critical.filter((s) => s.standIn);
    if (named.length)
      actions.push({
        text: `Today: hand ${named
          .slice(0, 3)
          .map((s) => `"${s.item.name}" to ${s.standIn?.name}`)
          .join(", ")}${named.length > 3 ? ` and ${named.length - 3} more` : ""}.`,
        step: "handoff",
        knowledgeIds: ids(named),
      });
    const cold = critical.filter((s) => !s.standIn);
    if (cold.length)
      actions.push({
        text: `No one can cover ${cold
          .slice(0, 2)
          .map((s) => `"${s.item.name}"`)
          .join(" or ")} — line up an outside provider or accept that it stops.`,
        step: "cover",
        knowledgeIds: ids(cold),
      });
  }
  const undocumented = stops.filter((s) => !s.item.documented);
  if (undocumented.length)
    actions.push({
      text: `Before the next absence: have ${first} write down ${undocumented
        .slice(0, 3)
        .map((s) => `"${s.item.name}"`)
        .join(", ")}${undocumented.length > 3 ? ` and ${undocumented.length - 3} more` : ""}.`,
      step: "document",
      knowledgeIds: ids(undocumented),
    });
  const unlocated = stops.filter((s) => s.item.documented && !s.item.procedureLocation?.trim());
  if (unlocated.length)
    actions.push({
      text: `Record where the written procedure for ${unlocated
        .slice(0, 3)
        .map((s) => `"${s.item.name}"`)
        .join(", ")} lives so a stand-in can find it without ${first}.`,
      step: "locate",
      knowledgeIds: ids(unlocated),
    });
  const trainable = stops.filter((s) => s.standIn).slice(0, 3);
  if (trainable.length)
    actions.push({
      text: `Cross-train so ${first} is not the only one: ${trainable
        .map((s) => `${s.standIn?.name} on "${s.item.name}"`)
        .join(", ")}.`,
      step: "cover",
      knowledgeIds: ids(trainable),
    });
  if (orphanedProcesses.length)
    actions.push({
      text: `Name a second owner on ${orphanedProcesses
        .slice(0, 3)
        .map((n) => `"${n}"`)
        .join(
          ", ",
        )}${orphanedProcesses.length > 3 ? ` and ${orphanedProcesses.length - 3} more` : ""}.`,
      step: "cover",
      knowledgeIds: [],
    });
  if (!actions.length)
    actions.push({
      text: `Nothing stops if ${first} is out. Keep it that way as duties change.`,
      step: "cover",
      knowledgeIds: [],
    });

  return {
    person,
    stops,
    continues,
    orphanedProcesses,
    dependence: load?.dependence ?? 0,
    actions,
  };
}

/**
 * One contingency card per active person whose absence stops work or leaves a
 * process without an owner, most-depended-on first. Feeds the printed report.
 */
export function contingencyCards(tpl: IndustryTemplate): AbsenceImpact[] {
  return tpl.people
    .filter((p) => p.active)
    .map((p) => absenceImpact(tpl, p.id))
    .filter((c): c is AbsenceImpact => Boolean(c))
    .filter((c) => c.stops.length > 0 || c.orphanedProcesses.length > 0)
    .sort(
      (a, b) =>
        b.dependence - a.dependence ||
        b.stops.length - a.stops.length ||
        a.person.name.localeCompare(b.person.name),
    );
}

/**
 * How far an item's know-how is written down: nothing, a procedure that exists
 * but nobody has said where it is, or a procedure a stand-in can actually find.
 */
export type DocumentationState = "none" | "unlocated" | "located";

export const DOCUMENTATION_LABEL: Record<DocumentationState, string> = {
  none: "Nothing written down",
  unlocated: "Written, location not recorded",
  located: "Written and findable",
};

export function documentationState(item: KnowledgeItem): DocumentationState {
  if (!item.documented) return "none";
  return item.procedureLocation?.trim() ? "located" : "unlocated";
}

const DOCUMENTATION_URGENCY: Record<DocumentationState, number> = {
  none: 2,
  unlocated: 1,
  located: 0,
};

export interface DocumentationGap {
  item: KnowledgeItem;
  state: Exclude<DocumentationState, "located">;
  step: Extract<ContinuityStep, "document" | "locate">;
  coverage: CoverageStatus;
  /** Who should write it: the person who can do it alone, else whoever has the basics. */
  author: Person | null;
  action: string;
  priority: number;
}

export interface DocumentationReport {
  /** Items with something missing, most urgent first. */
  gaps: DocumentationGap[];
  counts: Record<DocumentationState, number>;
  /** 0–100 share of criticality weight that is written and findable. */
  documentedIndex: number;
}

/**
 * Documentation debt — where the business's know-how lives only in someone's
 * head, or is written down somewhere nobody has recorded. Critical items come
 * first; within a criticality, unwritten items that stop in one absence come
 * before written-but-unlocated ones on well-covered items. A documented
 * procedure is what turns a thin backup into a usable one.
 */
export function documentationDebt(tpl: IndustryTemplate): DocumentationReport {
  const report = coverageReport(tpl);
  const counts: Record<DocumentationState, number> = { none: 0, unlocated: 0, located: 0 };
  let total = 0;
  let located = 0;
  const gaps: DocumentationGap[] = [];
  for (const i of report.items) {
    const state = documentationState(i.item);
    counts[state] += 1;
    const weight = CRITICALITY_WEIGHT[i.item.criticality];
    total += weight;
    if (state === "located") {
      located += weight;
      continue;
    }
    const author = i.primaries[0] ?? i.learners[0] ?? null;
    const priority = weight * (STATUS_URGENCY[i.status] + 1) * DOCUMENTATION_URGENCY[state];
    let action: string;
    if (state === "none") {
      if (!author) {
        action = `Nobody can run "${i.item.name}" and nothing is written down — find the last person who did it, or an outside provider, and get the steps on paper.`;
      } else if (i.status === "single" || i.status === "uncovered") {
        action = `Have ${author.name} write down "${i.item.name}" — it lives only in ${author.name.split(" ")[0]}'s head today.`;
      } else {
        action = `Have ${author.name} write down "${i.item.name}" so the backup follows the same steps.`;
      }
    } else {
      action = `Record where the written procedure for "${i.item.name}" lives (drive path, binder, link) so a stand-in can find it without ${author ? author.name : "asking around"}.`;
    }
    gaps.push({
      item: i.item,
      state,
      step: state === "none" ? "document" : "locate",
      coverage: i.status,
      author,
      action,
      priority,
    });
  }
  gaps.sort(
    (a, b) =>
      CRITICALITY_WEIGHT[b.item.criticality] - CRITICALITY_WEIGHT[a.item.criticality] ||
      b.priority - a.priority ||
      a.item.name.localeCompare(b.item.name),
  );
  return {
    gaps,
    counts,
    documentedIndex: total === 0 ? 100 : Math.round((located / total) * 100),
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
