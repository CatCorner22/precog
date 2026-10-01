import { describe, expect, it } from "vitest";
import { ITEM_NODE, knowledgeMapLayout, PERSON_NODE } from "./knowledge-map-layout";
import type { KnowledgeItem, KnowledgeRelation, Person } from "@/lib/precog/types";

const person = (i: number): Person => ({
  id: `p${i}`,
  name: `Person ${i}`,
  role: "Staff",
  active: true,
});
const item = (i: number): KnowledgeItem => ({
  id: `k${i}`,
  name: `Item ${i}`,
  criticality: "critical",
  category: "process",
  description: "",
  linkedProcessIds: [],
});

describe("knowledgeMapLayout", () => {
  it("fits twelve people and twelve items inside the canvas", () => {
    const people = Array.from({ length: 12 }, (_, i) => person(i));
    const items = Array.from({ length: 12 }, (_, i) => item(i));
    const layout = knowledgeMapLayout(people, items, []);
    for (const p of layout.people)
      expect(p.y + PERSON_NODE.height).toBeLessThanOrEqual(layout.height);
    for (const k of layout.items) expect(k.y + ITEM_NODE.height).toBeLessThanOrEqual(layout.height);
    expect(layout.height).toBeGreaterThan(520);
  });

  it("fits an eighth register item that the old 520-unit canvas cut off", () => {
    const layout = knowledgeMapLayout(
      [person(0)],
      Array.from({ length: 8 }, (_, i) => item(i)),
      [],
    );
    const last = layout.items[7];
    expect(last.y + ITEM_NODE.height).toBeGreaterThan(520);
    expect(last.y + ITEM_NODE.height).toBeLessThanOrEqual(layout.height);
  });

  it("draws an edge only between nodes on the map", () => {
    const relations: KnowledgeRelation[] = [
      { personId: "p0", knowledgeId: "k0", level: "expert" },
      { personId: "gone", knowledgeId: "k0", level: "expert" },
    ];
    const layout = knowledgeMapLayout([person(0)], [item(0)], relations);
    expect(layout.edges.map((e) => [e.from.id, e.to.id])).toEqual([["p0", "k0"]]);
  });

  it("draws no one marked as left, and no line from them to what they used to hold", () => {
    const left = { ...person(1), active: false };
    const relations: KnowledgeRelation[] = [
      { personId: "p0", knowledgeId: "k0", level: "expert" },
      { personId: "p1", knowledgeId: "k1", level: "expert" },
    ];
    const layout = knowledgeMapLayout([person(0), left], [item(0), item(1)], relations);
    expect(layout.people.map((p) => p.id)).toEqual(["p0"]);
    expect(layout.edges.map((e) => [e.from.id, e.to.id])).toEqual([["p0", "k0"]]);
  });
});
