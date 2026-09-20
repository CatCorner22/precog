import { describe, expect, it } from "vitest";
import { getBaseTemplate, resolveTemplate } from "../active-template";
import type { IndustryTemplate } from "../templates/types";
import type { KnowledgeItem, KnowledgeRelation, Person } from "../types";
import {
  absenceImpact,
  contingencyCards,
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

describe("absenceImpact", () => {
  const t = tpl(
    [
      item("payroll", { documented: true }),
      item("bank-rec"),
      item("ordering", { criticality: "important" }),
      item("filing", { criticality: "nice-to-have" }),
    ],
    [
      { personId: "a", knowledgeId: "payroll", level: "expert" },
      { personId: "c", knowledgeId: "payroll", level: "basic" },
      { personId: "a", knowledgeId: "bank-rec", level: "expert" },
      { personId: "a", knowledgeId: "ordering", level: "proficient" },
      { personId: "b", knowledgeId: "ordering", level: "proficient" },
      { personId: "d", knowledgeId: "bank-rec", level: "expert" },
    ],
  );

  it("separates what stops from what continues and names a stand-in per stopped item", () => {
    const a = absenceImpact(t, "a")!;
    expect(a.stops.map((s) => s.item.id)).toEqual(["bank-rec", "payroll"]);
    expect(a.continues.map((k) => k.id)).toEqual(["ordering"]);
    const payroll = a.stops.find((s) => s.item.id === "payroll")!;
    expect(payroll.standIn?.id).toBe("c");
    expect(payroll.note).toMatch(/written procedure/);
    const bankRec = a.stops.find((s) => s.item.id === "bank-rec")!;
    expect(bankRec.standIn).not.toBeNull();
    expect(bankRec.standIn?.id).not.toBe("d");
    expect(a.dependence).toBe(
      coverageReport(t).people.find((l) => l.person.id === "a")!.dependence,
    );
    expect(a.actions[0].text).toMatch(/^Today: hand/);
    expect(a.actions[0].knowledgeIds).toContain("bank-rec");
    expect(a.actions.some((x) => x.text.startsWith("Before the next absence"))).toBe(true);
    expect(
      a.actions.find((x) => x.text.startsWith("Before the next absence"))!.knowledgeIds,
    ).toEqual(a.stops.filter((s) => !s.item.documented).map((s) => s.item.id));
  });

  it("reports nothing stopping for a fully backed-up person and flags sole-owned processes", () => {
    const b = absenceImpact(t, "b")!;
    expect(b.stops).toEqual([]);
    expect(b.continues.map((k) => k.id)).toEqual(["ordering"]);
    expect(b.actions).toEqual([
      { text: "Nothing stops if Ben is out. Keep it that way as duties change.", knowledgeIds: [] },
    ]);

    const solo = { ...t, processes: [{ ...t.processes[0], ownerPersonIds: ["b", "d"] }] };
    expect(absenceImpact(solo, "b")!.orphanedProcesses).toEqual(["Payroll run"]);
  });

  it("returns null for an unknown person and says so when nobody else is left", () => {
    expect(absenceImpact(t, "zz")).toBeNull();
    const alone = { ...t, people: [people[0]] };
    const a = absenceImpact(alone, "a")!;
    expect(a.stops.every((s) => s.standIn === null)).toBe(true);
    expect(a.stops[0].note).toBe("Nobody else is on the team.");
  });

  it("tells the stand-in where the written procedure lives, or asks for it to be recorded", () => {
    const a = absenceImpact(t, "a")!;
    expect(a.stops.find((s) => s.item.id === "payroll")!.note).not.toMatch(/procedure:/);
    expect(
      a.actions.some((x) => x.text.startsWith('Record where the written procedure for "payroll"')),
    ).toBe(true);

    const located = {
      ...t,
      knowledge: t.knowledge.map((k) =>
        k.id === "payroll" ? { ...k, procedureLocation: " Binder B, front desk " } : k,
      ),
    };
    const b = absenceImpact(located, "a")!;
    expect(b.stops.find((s) => s.item.id === "payroll")!.note).toMatch(
      /written procedure to follow \(procedure: Binder B, front desk\)\./,
    );
    expect(b.actions.some((x) => x.text.startsWith("Record where"))).toBe(false);

    const undocumentedWithLocation = {
      ...t,
      knowledge: t.knowledge.map((k) =>
        k.id === "bank-rec" ? { ...k, documented: false, procedureLocation: "Drive" } : k,
      ),
    };
    const c = absenceImpact(undocumentedWithLocation, "a")!;
    expect(c.stops.find((s) => s.item.id === "bank-rec")!.note).not.toMatch(/procedure:/);
  });
});

describe("contingencyCards", () => {
  it("lists active people whose absence stops work, most depended-on first", () => {
    const t = tpl(
      [item("payroll"), item("bank-rec"), item("ordering", { criticality: "important" })],
      [
        { personId: "a", knowledgeId: "payroll", level: "expert" },
        { personId: "a", knowledgeId: "bank-rec", level: "expert" },
        { personId: "b", knowledgeId: "ordering", level: "proficient" },
        { personId: "d", knowledgeId: "ordering", level: "expert" },
      ],
    );
    const cards = contingencyCards(t);
    expect(cards.map((c) => c.person.id)).toEqual(["a", "b"]);
    expect(cards[0].stops.map((s) => s.item.id)).toEqual(["bank-rec", "payroll"]);
    expect(cards[1].stops.map((s) => s.item.id)).toEqual(["ordering"]);
  });

  it("includes a person who is the sole process owner even if nothing they know stops", () => {
    const t = tpl(
      [item("payroll")],
      [
        { personId: "a", knowledgeId: "payroll", level: "expert" },
        { personId: "b", knowledgeId: "payroll", level: "expert" },
      ],
    );
    expect(contingencyCards(t)).toEqual([]);
    const solo = { ...t, processes: [{ ...t.processes[0], ownerPersonIds: ["c"] }] };
    const cards = contingencyCards(solo);
    expect(cards.map((c) => c.person.id)).toEqual(["c"]);
    expect(cards[0].orphanedProcesses).toEqual(["Payroll run"]);
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
