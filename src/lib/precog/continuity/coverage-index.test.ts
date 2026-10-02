import { describe, expect, it } from "vitest";
import { continuityTemplate, knowledgeItem, processNode } from "@/test/fixtures";
import { INDUSTRIES } from "../industry";
import { getIndustryTemplate } from "../templates";
import type { IndustryTemplate } from "../templates/types";
import type {
  Criticality,
  KnowledgeItem,
  KnowledgeLevel,
  KnowledgeRelation,
  Person,
} from "../types";
import {
  coverageReport,
  coverageStatus,
  dependenceFor,
  STRONG_LEVELS,
  suggestBackups,
  type ItemCoverage,
  type PersonLoad,
} from "./coverage";

// The coverage report groups relations by item once and builds every
// person's lists in one pass. These tests hold the item rows and the people
// rows, which every other part of the report is derived from, to the earlier
// implementation: a scan of every relation per item and of every item per
// person, copied here unchanged.

describe("coverageReport matches the earlier scans", () => {
  it("on every sample business", () => {
    for (const { id } of INDUSTRIES) {
      const tpl = { ...getIndustryTemplate(id) };
      const report = coverageReport(tpl);
      expect({ items: report.items, people: report.people }, id).toEqual(legacyRows(tpl));
    }
  });

  it("on a large generated register with repeats, leavers and unknown ids", () => {
    const tpl = generatedTemplate(120, 400, 4_000);
    const report = coverageReport(tpl);
    expect(report.items).toHaveLength(400);
    expect(report.items.some((i) => i.status === "covered")).toBe(true);
    expect(report.items.some((i) => i.status === "thin")).toBe(true);
    expect({ items: report.items, people: report.people }).toEqual(legacyRows(tpl));
  });
});

/** The earlier item and people rows of buildCoverageReport. */
function legacyRows(tpl: IndustryTemplate): { items: ItemCoverage[]; people: PersonLoad[] } {
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

  return { items, people: peopleLoad };
}

/** A seeded register, the same on every run. */
function generatedTemplate(
  peopleCount: number,
  itemCount: number,
  relationCount: number,
): IndustryTemplate {
  let seed = 7;
  const next = () => {
    seed = (seed * 1_103_515_245 + 12_345) % 2_147_483_648;
    return seed / 2_147_483_648;
  };
  const pick = <T>(list: readonly T[]) => list[Math.floor(next() * list.length)];
  const people: Person[] = Array.from({ length: peopleCount }, (_, i) => ({
    id: `p${i}`,
    name: `Person ${String(i).padStart(3, "0")}`,
    role: "Staff",
    active: next() > 0.1,
  }));
  // Two people share an id, as an imported team can.
  people.push({ id: "p1", name: "Second p1", role: "Staff", active: true });
  const criticalities: Criticality[] = ["critical", "important", "nice-to-have"];
  const processes = Array.from({ length: 20 }, (_, i) =>
    processNode(`proc${i}`, { ownerPersonIds: [pick(people).id, pick(people).id] }),
  );
  const knowledge: KnowledgeItem[] = Array.from({ length: itemCount }, (_, i) =>
    knowledgeItem(`k${i}`, {
      name: `Item ${String(i % 50).padStart(2, "0")}`,
      criticality: pick(criticalities),
      linkedProcessIds: next() > 0.5 ? [pick(processes).id] : [],
      documented: next() > 0.7,
    }),
  );
  const levels: KnowledgeLevel[] = ["aware", "basic", "proficient", "expert"];
  const relations: KnowledgeRelation[] = Array.from({ length: relationCount }, () => ({
    personId: next() > 0.02 ? pick(people).id : "nobody",
    knowledgeId: next() > 0.02 ? pick(knowledge).id : "nothing",
    level: pick(levels),
  }));
  // The same person on the same item twice, as an edited register can hold.
  relations.push({ ...relations[0] }, { ...relations[1], level: "expert" });
  return continuityTemplate({ people, knowledge, relations, processes });
}
