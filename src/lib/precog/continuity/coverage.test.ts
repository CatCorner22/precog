import { describe, expect, it } from "vitest";
import { getBaseTemplate, resolveTemplate } from "../active-template";
import type { IndustryTemplate } from "../templates/types";
import type { KnowledgeItem, KnowledgeRelation, Person } from "../types";
import { deriveStaffFromTeam } from "../sod/derive-staff";
import {
  absenceImpact,
  checkInPlan,
  contingencyCards,
  coverageDrops,
  coverageReport,
  coverageStatus,
  criticalSinglePoints,
  documentationDebt,
  firstName,
  documentationState,
  ownerlessProcesses,
  resolveClientDate,
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

  it("treats invalid and future confirmation dates as never confirmed", () => {
    const t = tpl(
      [
        item("bad-month", { confirmedAt: "2025-99-99" }),
        item("bad-day", { confirmedAt: "2025-02-30" }),
        item("future", { confirmedAt: "2025-04-02" }),
        item("valid", { confirmedAt: "2025-03-22" }),
      ],
      [],
    );
    const report = staleItems(t, "2025-04-01");
    expect(report.stale.map((entry) => [entry.item.id, entry.confirmedAt, entry.ageDays])).toEqual([
      ["bad-day", null, null],
      ["bad-month", null, null],
      ["future", null, null],
    ]);
    expect(report.stale.some((entry) => entry.item.id === "valid")).toBe(false);
  });
});

describe("coverageDrops", () => {
  const knowledge = [
    item("payroll"),
    item("deposits"),
    item("filing", { criticality: "nice-to-have" }),
  ];
  const relations: KnowledgeRelation[] = [
    { personId: "a", knowledgeId: "payroll", level: "expert" },
    { personId: "b", knowledgeId: "payroll", level: "proficient" },
    { personId: "b", knowledgeId: "deposits", level: "expert" },
    { personId: "a", knowledgeId: "filing", level: "expert" },
    { personId: "c", knowledgeId: "filing", level: "basic" },
  ];
  const before = coverageReport(tpl(knowledge, relations));

  it("lists items whose coverage got worse, most serious first, with who is left and the repair", () => {
    let next = setRelationLevel(relations, "b", "payroll", undefined);
    next = setRelationLevel(next, "b", "deposits", undefined);
    next = setRelationLevel(next, "a", "filing", "basic");
    const drops = coverageDrops(before, coverageReport(tpl(knowledge, next)));

    expect(drops.map((d) => [d.item.id, d.from, d.to])).toEqual([
      ["deposits", "single", "uncovered"],
      ["payroll", "covered", "single"],
      ["filing", "thin", "uncovered"],
    ]);
    expect(drops[1].remaining.map((p) => p.id)).toEqual(["a"]);
    expect(drops[1].move?.action).toMatch(/training .* on "payroll" with Ana/);
    expect(drops[0].remaining).toEqual([]);
  });

  it("ignores unchanged, improved and removed items", () => {
    const improved = setRelationLevel(relations, "c", "deposits", "proficient");
    expect(coverageDrops(before, coverageReport(tpl(knowledge, improved)))).toEqual([]);

    const removed = coverageReport(tpl(knowledge.slice(1), relations));
    expect(coverageDrops(before, removed)).toEqual([]);
    expect(coverageDrops(removed, before)).toEqual([]);
  });
});

describe("checkInPlan", () => {
  const today = "2025-04-01";
  const knowledge = [
    item("fresh", { confirmedAt: "2025-03-30" }),
    item("payroll"),
    item("deposits", { criticality: "important" }),
    item("orphan"),
  ];
  const relations: KnowledgeRelation[] = [
    { personId: "a", knowledgeId: "fresh", level: "expert" },
    { personId: "a", knowledgeId: "payroll", level: "expert" },
    { personId: "a", knowledgeId: "deposits", level: "basic" },
    { personId: "b", knowledgeId: "deposits", level: "proficient" },
    { personId: "d", knowledgeId: "orphan", level: "expert" },
  ];

  it("groups stale items by holder, most items first, and lists unheld items separately", () => {
    const plan = checkInPlan(tpl(knowledge, relations), today);
    expect(
      plan.checkIns.map((c) => [
        c.person.id,
        c.items.map((i) => [i.item.id, i.level]),
        c.soleCount,
      ]),
    ).toEqual([
      [
        "a",
        [
          ["payroll", "expert"],
          ["deposits", "basic"],
        ],
        1,
      ],
      ["b", [["deposits", "proficient"]], 1],
    ]);
    expect(plan.unheld.map((entry) => entry.item.id)).toEqual(["orphan"]);
  });

  it("excludes fresh items and inactive holders", () => {
    const plan = checkInPlan(tpl(knowledge, relations), today);
    const ids = plan.checkIns.flatMap((c) => c.items.map((i) => i.item.id));
    expect(ids).not.toContain("fresh");
    expect(plan.checkIns.some((c) => c.person.id === "d")).toBe(false);
  });

  it("is empty when everything is confirmed", () => {
    const plan = checkInPlan(tpl([item("fresh", { confirmedAt: today })], relations), today);
    expect(plan.checkIns).toEqual([]);
    expect(plan.unheld).toEqual([]);
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

describe("ownerlessProcesses", () => {
  it("names processes whose every listed owner has left, and ignores unknown ids", () => {
    const base = tpl([], []);
    const t: IndustryTemplate = {
      ...base,
      processes: [
        ...base.processes,
        { ...base.processes[0], id: "proc-close", name: "Month-end close", ownerPersonIds: ["d"] },
        { ...base.processes[0], id: "proc-ghost", name: "Ghost", ownerPersonIds: ["zz"] },
        { ...base.processes[0], id: "proc-none", name: "Unowned", ownerPersonIds: [] },
      ],
    };
    expect(ownerlessProcesses(t)).toEqual([
      { id: "proc-close", name: "Month-end close", formerOwners: [people[3]] },
    ]);
    const afterBenLeaves: IndustryTemplate = {
      ...t,
      people: people.map((p) => (p.id === "b" ? { ...p, active: false } : p)),
    };
    expect(ownerlessProcesses(afterBenLeaves).map((o) => o.id)).toEqual(["proc-close"]);
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

  it("reports nothing more stopping for a fully backed-up person and flags sole-owned processes", () => {
    const b = absenceImpact(t, "b")!;
    expect(b.stops).toEqual([]);
    expect(b.continues.map((k) => k.id)).toEqual(["ordering"]);
    expect(b.alreadyStopped.map((k) => k.id)).toEqual(["filing"]);
    expect(b.actions).toEqual([
      {
        text: 'Nothing more stops if Ben is out; "filing" already waits because nobody can run it alone.',
        step: "cover",
        knowledgeIds: [],
      },
    ]);
    const covered = tpl(t.knowledge.slice(0, 3), t.relations);
    expect(absenceImpact(covered, "b")!.actions[0].text).toBe(
      "Nothing stops if Ben is out. Keep it that way as duties change.",
    );

    const solo = { ...t, processes: [{ ...t.processes[0], ownerPersonIds: ["b", "d"] }] };
    expect(absenceImpact(solo, "b")!.orphanedProcesses).toEqual(["Payroll run"]);
  });

  it("names a cold stand-in for a backed-up item when every holder is out at once", () => {
    const both = absenceImpact(t, ["a", "b"])!;
    const ordering = both.stops.find((s) => s.item.id === "ordering")!;
    expect(ordering.standIn?.id).toBe("c");
    expect(ordering.note).toMatch(/starting cold/);
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

  it("handles overlapping absences, shared holders, and natural group wording", () => {
    const group = tpl(
      [item("x"), item("y"), item("z")],
      [
        { personId: "a", knowledgeId: "x", level: "expert" },
        { personId: "b", knowledgeId: "x", level: "proficient" },
        { personId: "c", knowledgeId: "x", level: "basic" },
        { personId: "a", knowledgeId: "y", level: "expert" },
        { personId: "b", knowledgeId: "z", level: "expert" },
      ],
    );
    const both = absenceImpact(group, ["a", "b"])!;
    expect(both.people.map((p) => p.id)).toEqual(["a", "b"]);
    expect(both.stops.map((s) => s.item.id)).toEqual(["x", "y", "z"]);
    expect(both.stops.find((s) => s.item.id === "x")?.standIn?.id).toBe("c");
    expect(both.continues).toEqual([]);
    expect(both.dependence).toBe(100);
    expect(both.actions.some((a) => a.text.includes("are not the only"))).toBe(true);

    const onlyA = absenceImpact(group, ["a"])!;
    expect(onlyA.stops.map((s) => s.item.id)).toEqual(["y"]);
    expect(onlyA.continues.map((k) => k.id)).toEqual(["x"]);
    expect(absenceImpact(group, ["a", "a"])!.stops.map((s) => s.item.id)).toEqual(
      onlyA.stops.map((s) => s.item.id),
    );
    expect(absenceImpact(group, ["nobody"])).toBeNull();
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
    expect(cards.map((c) => c.people[0].id)).toEqual(["a", "b"]);
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
    expect(cards.map((c) => c.people[0].id)).toEqual(["c"]);
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

describe("resolveClientDate", () => {
  const serverNow = new Date("2026-09-20T10:30:00Z");

  it("honours the owner's calendar day when it is within a day of the server clock", () => {
    expect(resolveClientDate("2026-09-21", serverNow)).toBe("2026-09-21");
    expect(resolveClientDate("2026-09-19", serverNow)).toBe("2026-09-19");
    expect(resolveClientDate("2026-09-20", serverNow)).toBe("2026-09-20");
  });

  it("falls back to the server's UTC day for missing, malformed or distant values", () => {
    expect(resolveClientDate(undefined, serverNow)).toBe("2026-09-20");
    expect(resolveClientDate("2026-99-99", serverNow)).toBe("2026-09-20");
    expect(resolveClientDate("2026-09-22", serverNow)).toBe("2026-09-20");
    expect(resolveClientDate("2025-01-01", serverNow)).toBe("2026-09-20");
  });
});

describe("firstName", () => {
  it("uses the first given name and skips an honorific", () => {
    expect(firstName("Maya Chen")).toBe("Maya");
    expect(firstName("Dr. Elena Vargas")).toBe("Elena");
    expect(firstName("Prof Amir Khan")).toBe("Amir");
    expect(firstName("  Chris ")).toBe("Chris");
    expect(firstName("Dr.")).toBe("Dr.");
  });
});

/** An owner's own clinic over the dental starter register: nobody marked on anything yet. */
function ownClinic(relations: KnowledgeRelation[] | null = null): IndustryTemplate {
  return resolveTemplate({
    industry: "dental",
    customPeople: [
      { id: "own-1", name: "Anjali Patel", role: "Medical Assistant", active: true },
      { id: "own-2", name: "Kevin Osei", role: "Billing Specialist", active: true },
      { id: "own-3", name: "Zoe Ward", role: "Practice Manager", active: true },
    ],
    customRelations: relations,
  });
}

describe("starter register nobody has marked", () => {
  it("names nobody to own a starter item, instead of the alphabetically first employee", () => {
    const r = coverageReport(ownClinic());
    expect(r.plan.length).toBe(r.items.length);
    for (const move of r.plan) {
      expect(move.trainee).toBeNull();
      expect(move.action).toBe(
        `Nobody is marked on "${move.item.name}" yet. Mark who can do it; if nobody can, choose who should learn it and write the steps down.`,
      );
      expect(move.action).not.toMatch(/Anjali|Kevin|Zoe/);
    }
  });

  it("still names a trainee on an item once someone is marked on it", () => {
    const writeOff = ownClinic().knowledge.find((k) => k.name.startsWith("Write-off"))!;
    const r = coverageReport(
      ownClinic([{ personId: "own-2", knowledgeId: writeOff.id, level: "basic" }]),
    );
    const move = r.plan.find((m) => m.item.id === writeOff.id)!;
    expect(move.trainee?.id).toBe("own-2");
    expect(move.action).toContain("Pick Kevin Osei to own it");
  });

  it("feeds no sole-owner count into the residual index until someone is marked", () => {
    expect(soleOwnerCriticalCount(ownClinic())).toBe(0);
  });
});

describe("criticalSinglePoints", () => {
  it("never rises when the owner marks the first person who can run an item nobody could", () => {
    const [first, second] = ownClinic().knowledge.filter((k) => k.criticality === "critical");
    const marked = ownClinic([{ personId: "own-2", knowledgeId: first.id, level: "proficient" }]);
    const before = criticalSinglePoints(marked);
    const critical = marked.knowledge.filter((k) => k.criticality === "critical").length;
    expect(before).toEqual({ count: critical, nobody: critical - 1, onePerson: 1 });
    expect(soleOwnerCriticalCount(marked)).toBe(critical);

    const secondMarked = ownClinic([
      ...marked.relations,
      { personId: "own-1", knowledgeId: second.id, level: "proficient" },
    ]);
    expect(criticalSinglePoints(secondMarked)).toEqual({
      count: critical,
      nobody: critical - 2,
      onePerson: 2,
    });

    const backedUp = ownClinic([
      ...secondMarked.relations,
      { personId: "own-3", knowledgeId: first.id, level: "expert" },
    ]);
    expect(criticalSinglePoints(backedUp).count).toBe(critical - 1);
    expect(soleOwnerCriticalCount(backedUp)).toBe(critical - 1);
  });

  it("gives the business profile the count Who knows what shows once someone is marked", () => {
    const [first] = ownClinic().knowledge.filter((k) => k.criticality === "critical");
    const marked = ownClinic([{ personId: "own-2", knowledgeId: first.id, level: "proficient" }]);
    expect(deriveStaffFromTeam(marked, marked.staffComposition).soleOwnerKnowledgeCount).toBe(
      criticalSinglePoints(marked).count,
    );
    expect(
      deriveStaffFromTeam(ownClinic(), ownClinic().staffComposition).soleOwnerKnowledgeCount,
    ).toBe(0);
  });

  it("counts a learner as no cover: one person plus a learner is still a single point", () => {
    const t = tpl(
      [item("thin"), item("covered"), item("imp", { criticality: "important" })],
      [
        { personId: "a", knowledgeId: "thin", level: "expert" },
        { personId: "b", knowledgeId: "thin", level: "basic" },
        { personId: "a", knowledgeId: "covered", level: "expert" },
        { personId: "b", knowledgeId: "covered", level: "proficient" },
      ],
    );
    expect(criticalSinglePoints(t)).toEqual({ count: 1, nobody: 0, onePerson: 1 });
  });
});

describe("absence simulator on a register with gaps", () => {
  const t = tpl(
    [item("payroll"), item("deposit"), item("orders", { criticality: "important" })],
    [{ personId: "a", knowledgeId: "payroll", level: "expert" }],
  );

  it("lists items nobody can run as already stopped and never says nothing stops", () => {
    const c = absenceImpact(t, "c")!;
    expect(c.stops).toEqual([]);
    expect(c.alreadyStopped.map((k) => k.id)).toEqual(["deposit", "orders"]);
    expect(c.actions.map((a) => a.text)).toEqual([
      'Already stopped, whoever is in: nobody can run "deposit" or "orders" alone. Mark who can, or line up an outside provider.',
    ]);
    expect(c.actions[0].knowledgeIds).toEqual(["deposit", "orders"]);
  });

  it("with the whole team out, says nobody is left and that the work stops", () => {
    const all = absenceImpact(t, ["a", "b", "c"])!;
    expect(all.remaining).toEqual([]);
    expect(all.stops.map((s) => s.item.id)).toEqual(["payroll"]);
    expect(all.actions[0].text).toBe(
      "Nobody is left in the business while Ana, Ben and Cy are out. Line up outside cover or close for those days.",
    );
    expect(all.actions.some((a) => /Nothing (more )?stops/.test(a.text))).toBe(false);
  });

  it("with the whole team out and every item backed up, still never says nothing stops", () => {
    const covered = tpl(
      [item("payroll")],
      [
        { personId: "a", knowledgeId: "payroll", level: "expert" },
        { personId: "b", knowledgeId: "payroll", level: "expert" },
      ],
    );
    const all = absenceImpact(covered, ["a", "b", "c"])!;
    expect(all.stops.map((s) => s.item.id)).toEqual(["payroll"]);
    expect(all.actions.some((a) => /Nothing (more )?stops/.test(a.text))).toBe(false);
  });
});
