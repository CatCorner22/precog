import { describe, expect, it } from "vitest";
import { getBaseTemplate, resolveTemplate } from "../active-template";
import type { IndustryTemplate } from "../templates/types";
import type { KnowledgeItem, KnowledgeRelation, Person } from "../types";
import {
  absenceImpact,
  contingencyCards,
  coverageReport,
  coverageStatus,
  documentationDebt,
  documentationState,
  staleItems,
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

describe("staleItems", () => {
  it("flags never-confirmed items and respects the 90-day boundary", () => {
    const today = "2025-04-01";
    const t = tpl(
      [
        item("never"),
        item("fresh", { confirmedAt: "2025-03-22" }),
        item("stale", { confirmedAt: "2024-12-31" }),
        item("boundary", { confirmedAt: "2025-01-01" }),
      ],
      [],
    );
    const report = staleItems(t, today);
    expect(report.stale.map((entry) => [entry.item.id, entry.ageDays])).toEqual([
      ["never", null],
      ["stale", 91],
    ]);
    expect(report.stale.some((entry) => entry.item.id === "boundary")).toBe(false);
    expect(report.stale.some((entry) => entry.item.id === "fresh")).toBe(false);
  });

  it("orders stale items by criticality before coverage urgency and does not mutate input", () => {
    const knowledge = [
      item("important", { criticality: "important" }),
      item("critical-covered", { name: "A critical" }),
      item("critical-uncovered", { name: "Z critical" }),
    ];
    const relations = [
      { personId: "a", knowledgeId: "critical-covered", level: "expert" as const },
      { personId: "b", knowledgeId: "critical-covered", level: "expert" as const },
    ];
    const t = tpl(knowledge, relations);
    const before = JSON.stringify(t);
    const report = staleItems(t, "2025-04-01");
    expect(report.stale.map((entry) => entry.item.id)).toEqual([
      "critical-uncovered",
      "critical-covered",
      "important",
    ]);
    expect(JSON.stringify(t)).toBe(before);
  });

  it("computes a criticality-weighted confirmed index", () => {
    const t = tpl(
      [
        item("critical", { confirmedAt: "2025-03-01" }),
        item("important", { criticality: "important" }),
        item("nice", { criticality: "nice-to-have", confirmedAt: "2025-03-01" }),
      ],
      [],
    );
    expect(staleItems(t, "2025-04-01").confirmedIndex).toBe(67);
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
    expect(a.actions[0].step).toBe("handoff");
    expect(a.actions[0].knowledgeIds).toContain("bank-rec");
    expect(a.actions.map((x) => x.step)).toEqual(["handoff", "document", "locate", "cover"]);
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
      {
        text: "Nothing stops if Ben is out. Keep it that way as duties change.",
        step: "cover",
        knowledgeIds: [],
      },
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

describe("documentationDebt", () => {
  const t = tpl(
    [
      item("payroll", { documented: true, procedureLocation: "Binder B" }),
      item("bank-rec"),
      item("ordering", { criticality: "important" }),
      item("filing", { criticality: "nice-to-have", documented: true, procedureLocation: "  " }),
      item("deposits", { documented: true }),
    ],
    [
      { personId: "a", knowledgeId: "payroll", level: "expert" },
      { personId: "a", knowledgeId: "bank-rec", level: "expert" },
      { personId: "c", knowledgeId: "bank-rec", level: "aware" },
      { personId: "a", knowledgeId: "ordering", level: "proficient" },
      { personId: "b", knowledgeId: "ordering", level: "proficient" },
      { personId: "b", knowledgeId: "filing", level: "basic" },
      { personId: "a", knowledgeId: "deposits", level: "expert" },
      { personId: "b", knowledgeId: "deposits", level: "expert" },
    ],
  );

  it("classifies each item as nothing written, written but unlocated, or findable", () => {
    expect(documentationState(item("x"))).toBe("none");
    expect(documentationState(item("x", { documented: false, procedureLocation: "Drive" }))).toBe(
      "none",
    );
    expect(documentationState(item("x", { documented: true }))).toBe("unlocated");
    expect(documentationState(item("x", { documented: true, procedureLocation: " " }))).toBe(
      "unlocated",
    );
    expect(documentationState(item("x", { documented: true, procedureLocation: "Drive" }))).toBe(
      "located",
    );
  });

  it("lists only the gaps, most urgent first, and names who should write it", () => {
    const d = documentationDebt(t);
    expect(d.gaps.map((g) => g.item.id)).toEqual(["bank-rec", "deposits", "ordering", "filing"]);
    expect(d.gaps.map((g) => g.state)).toEqual(["none", "unlocated", "none", "unlocated"]);
    expect(d.gaps.map((g) => g.step)).toEqual(["document", "locate", "document", "locate"]);
    expect(d.gaps.map((g) => g.coverage)).toEqual(["single", "covered", "covered", "uncovered"]);
    expect(d.gaps[0].author?.id).toBe("a");
    expect(d.gaps[0].action).toMatch(
      /^Have Ana write down "bank-rec" — it lives only in Ana's head/,
    );
    expect(d.gaps[1].action).toMatch(/^Record where the written procedure for "deposits" lives/);
    expect(d.gaps[2].action).toMatch(/so the backup follows the same steps/);
    expect(d.gaps[3].author?.id).toBe("b");
    expect(d.counts).toEqual({ none: 2, unlocated: 2, located: 1 });
    expect(d.documentedIndex).toBe(25);
  });

  it("ranks a critical single-owner gap above a critical covered gap, and breaks ties by name", () => {
    const d = documentationDebt(
      tpl(
        [item("zeta"), item("alpha"), item("solo")],
        [
          { personId: "a", knowledgeId: "zeta", level: "expert" },
          { personId: "b", knowledgeId: "zeta", level: "expert" },
          { personId: "a", knowledgeId: "alpha", level: "expert" },
          { personId: "b", knowledgeId: "alpha", level: "expert" },
          { personId: "a", knowledgeId: "solo", level: "expert" },
        ],
      ),
    );
    expect(d.gaps.map((g) => g.item.id)).toEqual(["solo", "alpha", "zeta"]);
    expect(d.gaps[0].priority).toBeGreaterThan(d.gaps[1].priority);
    expect(d.gaps[1].priority).toBe(d.gaps[2].priority);
  });

  it("asks for an outside source when nobody can run an unwritten item, and is empty when all is findable", () => {
    const nobody = documentationDebt(tpl([item("orphan")], []));
    expect(nobody.gaps[0].author).toBeNull();
    expect(nobody.gaps[0].action).toMatch(/^Nobody can run "orphan"/);
    expect(nobody.documentedIndex).toBe(0);

    const done = documentationDebt(
      tpl([item("payroll", { documented: true, procedureLocation: "Binder" })], []),
    );
    expect(done.gaps).toEqual([]);
    expect(done.documentedIndex).toBe(100);
    expect(documentationDebt(tpl([], [])).documentedIndex).toBe(100);
  });

  it("does not mutate the register or change who holds what", () => {
    const before = JSON.stringify(t);
    documentationDebt(t);
    expect(JSON.stringify(t)).toBe(before);
    expect(coverageReport(t).items.find((i) => i.item.id === "ordering")!.primaries).toHaveLength(
      2,
    );
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
