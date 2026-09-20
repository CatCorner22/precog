import { describe, expect, it } from "vitest";
import { getBaseTemplate, resolveTemplate } from "../active-template";
import type { IndustryTemplate } from "../templates/types";
import type { KnowledgeItem, KnowledgeRelation, Person } from "../types";
import {
  coverageReport,
  coverageStatus,
  setRelationLevel,
  soleOwnerCriticalCount,
  suggestBackups,
} from "./coverage";

const people: Person[] = [
  { id: "a", name: "Ana", role: "Owner", active: true },
  { id: "b", name: "Ben", role: "Office manager", active: true },
  { id: "c", name: "Cy", role: "Assistant", active: true },
  { id: "d", name: "Dee", role: "Former staff", active: false },
];

function item(id: string, extra: Partial<KnowledgeItem> = {}): KnowledgeItem {
  return {
    id,
    name: id,
    criticality: "critical",
    category: "process",
    description: "",
    linkedProcessIds: [],
    ...extra,
  };
}

function tpl(knowledge: KnowledgeItem[], relations: KnowledgeRelation[]): IndustryTemplate {
  return {
    ...getBaseTemplate("general"),
    people,
    knowledge,
    relations,
    processes: [
      {
        id: "proc-pay",
        name: "Payroll run",
        layer: "process",
        description: "",
        dependencies: [],
        controlIds: [],
        ownerPersonIds: ["b", "c"],
      },
    ],
  };
}

describe("coverageStatus", () => {
  it("maps holder counts to the four statuses", () => {
    expect(coverageStatus(0, 0)).toBe("uncovered");
    expect(coverageStatus(0, 2)).toBe("uncovered");
    expect(coverageStatus(1, 0)).toBe("single");
    expect(coverageStatus(1, 1)).toBe("thin");
    expect(coverageStatus(2, 0)).toBe("covered");
  });
});

describe("coverageReport", () => {
  it("lets one person hold many items and many people hold one item", () => {
    const t = tpl(
      [item("payroll"), item("bank-rec"), item("ordering", { criticality: "important" })],
      [
        { personId: "a", knowledgeId: "payroll", level: "expert" },
        { personId: "b", knowledgeId: "payroll", level: "proficient" },
        { personId: "c", knowledgeId: "payroll", level: "basic" },
        { personId: "a", knowledgeId: "bank-rec", level: "expert" },
        { personId: "a", knowledgeId: "ordering", level: "proficient" },
      ],
    );
    const r = coverageReport(t);
    const payroll = r.items.find((i) => i.item.id === "payroll")!;
    expect(payroll.status).toBe("covered");
    expect(payroll.primaries.map((p) => p.id)).toEqual(["a", "b"]);
    expect(payroll.learners.map((p) => p.id)).toEqual(["c"]);
    expect(payroll.suggestedBackups).toEqual([]);

    const ana = r.people.find((p) => p.person.id === "a")!;
    expect(ana.soleItems.map((k) => k.id).sort()).toEqual(["bank-rec", "ordering"]);
    expect(ana.sharedItems.map((k) => k.id)).toEqual(["payroll"]);
    expect(ana.dependence).toBe(Math.round((5 / 8) * 100));
    expect(r.people[0].person.id).toBe("a");
  });

  it("does not count basic or aware holders as backups", () => {
    const t = tpl(
      [item("k")],
      [
        { personId: "a", knowledgeId: "k", level: "expert" },
        { personId: "b", knowledgeId: "k", level: "aware" },
      ],
    );
    const r = coverageReport(t);
    expect(r.items[0].status).toBe("single");
    expect(r.counts.single).toBe(1);
    expect(r.singlePoints.map((i) => i.item.id)).toEqual(["k"]);
  });

  it("flags uncovered items and ignores relations to people who are not on the team", () => {
    const t = tpl([item("k")], [{ personId: "ghost", knowledgeId: "k", level: "expert" }]);
    const r = coverageReport(t);
    expect(r.items[0].status).toBe("uncovered");
    expect(r.items[0].primaries).toEqual([]);
    expect(r.coverageIndex).toBe(0);
  });

  it("weights the coverage index by criticality and ignores nice-to-have single points", () => {
    const t = tpl(
      [item("crit"), item("nice", { criticality: "nice-to-have" })],
      [
        { personId: "a", knowledgeId: "crit", level: "expert" },
        { personId: "b", knowledgeId: "crit", level: "expert" },
        { personId: "a", knowledgeId: "nice", level: "expert" },
      ],
    );
    const r = coverageReport(t);
    expect(r.coverageIndex).toBe(75);
    expect(r.singlePoints).toEqual([]);
    expect(r.plan.map((m) => m.item.id)).toEqual(["nice"]);
  });

  it("orders the cross-training plan by criticality × urgency and names trainer and trainee", () => {
    const t = tpl(
      [item("crit-single"), item("imp-uncovered", { criticality: "important" }), item("crit-thin")],
      [
        { personId: "a", knowledgeId: "crit-single", level: "expert" },
        { personId: "a", knowledgeId: "crit-thin", level: "expert" },
        { personId: "b", knowledgeId: "crit-thin", level: "basic" },
      ],
    );
    const r = coverageReport(t);
    expect(r.plan.map((m) => m.item.id)).toEqual(["crit-single", "imp-uncovered", "crit-thin"]);
    const thin = r.plan[2];
    expect(thin.trainer?.id).toBe("a");
    expect(thin.trainee?.id).toBe("b");
    expect(thin.action).toContain("Finish training Ben");
    expect(thin.action).toContain("with Ana");
    expect(thin.action).toContain("Write the steps down");
  });
});

describe("suggestBackups", () => {
  it("prefers learners, linked-process owners, and people who are not already single points", () => {
    const t = tpl(
      [item("payroll", { linkedProcessIds: ["proc-pay"] })],
      [
        { personId: "a", knowledgeId: "payroll", level: "expert" },
        { personId: "c", knowledgeId: "payroll", level: "basic" },
      ],
    );
    const sole = new Map([["a", 3]]);
    const ranked = suggestBackups(t, t.knowledge[0], sole);
    expect(ranked.map((s) => s.person.id)).toEqual(["c", "b"]);
    expect(ranked[0].reasons).toContain("already has the basics");
    expect(ranked[0].reasons).toContain("already works the linked process");
    expect(ranked.some((s) => s.person.id === "d")).toBe(false);
    expect(ranked.some((s) => s.person.id === "a")).toBe(false);
  });
});

describe("setRelationLevel", () => {
  it("adds, replaces, and removes a single person×item cell", () => {
    let rel: KnowledgeRelation[] = [];
    rel = setRelationLevel(rel, "a", "k", "basic");
    rel = setRelationLevel(rel, "b", "k", "expert");
    expect(rel).toHaveLength(2);
    rel = setRelationLevel(rel, "a", "k", "expert");
    expect(rel.filter((r) => r.personId === "a")).toEqual([
      { personId: "a", knowledgeId: "k", level: "expert" },
    ]);
    rel = setRelationLevel(rel, "b", "k", undefined);
    expect(rel).toHaveLength(1);
  });
});

describe("soleOwnerCriticalCount", () => {
  it("matches the template figure for the default industries where relations are consistent", () => {
    for (const id of ["dental", "retail", "professional_services", "general"] as const) {
      const base = getBaseTemplate(id);
      expect(soleOwnerCriticalCount(base)).toBe(base.staffComposition.soleOwnerKnowledgeCount);
    }
  });
});

describe("resolveTemplate with a custom register", () => {
  it("uses custom knowledge and relations and drops relations to missing people or items", () => {
    const base = getBaseTemplate("dental");
    const knowledge = [item("custom-1")];
    const relations: KnowledgeRelation[] = [
      { personId: base.people[0].id, knowledgeId: "custom-1", level: "expert" },
      { personId: "nobody", knowledgeId: "custom-1", level: "expert" },
      { personId: base.people[1].id, knowledgeId: base.knowledge[0].id, level: "expert" },
    ];
    const t = resolveTemplate({
      industry: "dental",
      customKnowledge: knowledge,
      customRelations: relations,
    });
    expect(t.knowledge).toBe(knowledge);
    expect(t.relations).toEqual([relations[0]]);
    expect(t.people).toBe(base.people);
  });

  it("leaves the default template untouched when no register is supplied", () => {
    const base = getBaseTemplate("retail");
    const t = resolveTemplate({ industry: "retail" });
    expect(t.knowledge).toBe(base.knowledge);
    expect(t.relations).toBe(base.relations);
  });
});
