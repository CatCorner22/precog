import { describe, expect, it } from "vitest";
import { getBaseTemplate } from "../active-template";
import type { DecisionEntry, PlannedAbsence } from "../practice-profile";
import type { IndustryTemplate } from "../templates/types";
import type { KnowledgeItem, KnowledgeRelation, Person } from "../types";
import { LEAVING_SOON_DAYS, SOON_DAYS, todayBrief } from "./today";

const people: Person[] = [
  { id: "maya", name: "Dr. Maya Chen", role: "Office manager", active: true },
  { id: "chris", name: "Chris Diaz", role: "Assistant", active: true },
  { id: "sam", name: "Sam Roy", role: "Hygienist", active: true },
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

function tpl(relations: KnowledgeRelation[], knowledge: KnowledgeItem[]): IndustryTemplate {
  return { ...getBaseTemplate("general"), people, knowledge, relations, processes: [] };
}

// pms: Maya alone, Chris learning, written at Drive. payroll: Maya alone, nothing written.
// billing: Maya and Sam, so Sam covers it.
const register = tpl(
  [
    { personId: "maya", knowledgeId: "pms", level: "expert" },
    { personId: "chris", knowledgeId: "pms", level: "basic" },
    { personId: "maya", knowledgeId: "payroll", level: "expert" },
    { personId: "maya", knowledgeId: "billing", level: "proficient" },
    { personId: "sam", knowledgeId: "billing", level: "proficient" },
  ],
  [
    item("pms", { documented: true, procedureLocation: "Drive/PMS" }),
    item("payroll"),
    item("billing", { documented: true }),
  ],
);

const TODAY = "2025-11-05";

function absence(overrides: Partial<PlannedAbsence> = {}): PlannedAbsence {
  return {
    id: "abs-1",
    personId: "maya",
    industry: "general",
    from: TODAY,
    to: TODAY,
    unplanned: true,
    ...overrides,
  };
}

function handoff(overrides: Partial<DecisionEntry> = {}): DecisionEntry {
  return {
    id: "d-handoff",
    createdAt: "2025-11-05T09:00:00.000Z",
    subject: "pms",
    kind: "remediate",
    note: "Chris covers PMS today",
    reviewBy: "2025-11-12",
    linkedTab: "knowledge",
    linkedId: "pms",
    linkedIndustry: "general",
    linkedStep: "handoff",
    linkedAbsenceId: "abs-1",
    status: "open",
    ...overrides,
  };
}

describe("todayBrief", () => {
  it("says nothing when nobody is out, nothing is due and no debrief waits", () => {
    const brief = todayBrief(register, [], [], "general", TODAY);
    expect(brief.out).toEqual([]);
    expect(brief.startingSoon).toEqual([]);
    expect(brief.debriefs).toBe(0);
    expect(brief.headline).toBeNull();
  });

  it("lists who is out today with what stops, who covers, the procedure and the hand-off state", () => {
    const brief = todayBrief(register, [absence()], [handoff()], "general", TODAY);
    expect(brief.out).toHaveLength(1);
    const out = brief.out[0];
    expect(out.person.id).toBe("maya");
    expect(out.unplanned).toBe(true);
    const byId = Object.fromEntries(out.stops.map((s) => [s.item.id, s]));
    expect(Object.keys(byId).sort()).toEqual(["payroll", "pms"]);
    expect(byId.pms).toMatchObject({
      cold: false,
      procedure: "procedure at Drive/PMS",
      handoffLogged: true,
    });
    expect(byId.pms.standIn?.id).toBe("chris");
    expect(byId.payroll).toMatchObject({
      cold: true,
      procedure: "nothing written down",
      handoffLogged: false,
    });
    expect(brief.cold).toBe(1);
    expect(brief.unwritten).toBe(1);
    expect(brief.unlogged).toBe(1);
    expect(brief.headline).toBe(
      "Maya is out unexpectedly today — 2 register entries stop, 1 that nobody left has done before, 1 with nothing written down.",
    );
  });

  it("speaks of planned leave as out, not unexpectedly, and names everyone out", () => {
    const brief = todayBrief(
      register,
      [
        absence({ unplanned: undefined, from: "2025-11-03", to: "2025-11-10" }),
        absence({ id: "abs-2", personId: "sam", unplanned: true }),
      ],
      [],
      "general",
      TODAY,
    );
    expect(brief.out.map((o) => o.person.id)).toEqual(["maya", "sam"]);
    expect(brief.headline).toMatch(/^Maya and Sam are out \(one unexpectedly\) today — /);
  });

  it("counts how many are out unexpectedly when more than one is", () => {
    const brief = todayBrief(
      register,
      [
        absence({ unplanned: undefined, from: "2025-11-03", to: "2025-11-10" }),
        absence({ id: "abs-2", personId: "sam", unplanned: true }),
        absence({ id: "abs-3", personId: "chris", unplanned: true }),
      ],
      [],
      "general",
      TODAY,
    );
    expect(brief.headline).toMatch(/^Maya, Chris and Sam are out \(2 unexpectedly\) today — /);
  });

  it("lists only what stops today when the worst stretch of a current window is still ahead", () => {
    // Maya is out now; Sam joins her later. Billing stops only once both are away.
    const brief = todayBrief(
      register,
      [
        absence({ unplanned: undefined, from: "2025-11-03", to: "2025-11-14" }),
        absence({
          id: "abs-2",
          personId: "sam",
          unplanned: undefined,
          from: "2025-11-10",
          to: "2025-11-12",
        }),
      ],
      [],
      "general",
      TODAY,
    );
    expect(brief.out).toHaveLength(1);
    expect(brief.out[0].stops.map((s) => s.item.id).sort()).toEqual(["payroll", "pms"]);
    expect(brief.out[0].window.impact.stops.map((s) => s.item.id).sort()).toEqual([
      "billing",
      "payroll",
      "pms",
    ]);
  });

  it("does not count a stand-in as unlogged when a window-less hand-off exists", () => {
    const brief = todayBrief(
      register,
      [absence()],
      [handoff({ linkedAbsenceId: undefined })],
      "general",
      TODAY,
    );
    expect(brief.out[0].stops.find((s) => s.item.id === "pms")?.handoffLogged).toBe(true);
  });

  it("flags leave starting within a week with the hand-offs not yet logged", () => {
    const soon = absence({ unplanned: undefined, from: "2025-11-07", to: "2025-11-14" });
    const later = absence({
      id: "abs-far",
      personId: "sam",
      unplanned: undefined,
      from: "2025-11-20",
      to: "2025-11-21",
    });
    const brief = todayBrief(register, [soon, later], [handoff()], "general", TODAY);
    expect(brief.out).toEqual([]);
    expect(brief.startingSoon).toHaveLength(1);
    expect(brief.startingSoon[0]).toMatchObject({ daysUntil: 2, unlogged: 1 });
    expect(brief.headline).toBe("Maya is out 7–14 Nov, in 2 days — 1 hand-off not yet logged.");
  });

  it("treats the SOON_DAYS boundary as inclusive", () => {
    const edge = absence({ unplanned: undefined, from: "2025-11-12", to: "2025-11-12" });
    const brief = todayBrief(register, [edge], [], "general", TODAY);
    expect(brief.startingSoon[0]?.daysUntil).toBe(SOON_DAYS);
  });

  it("falls back to pending debriefs when nobody is out", () => {
    const ended = absence({ from: "2025-11-03", to: "2025-11-04" });
    const brief = todayBrief(register, [ended], [], "general", TODAY);
    expect(brief.out).toEqual([]);
    expect(brief.debriefs).toBe(1);
    expect(brief.headline).toBe("1 absence just ended — debrief the stand-ins.");
  });

  it("counts down to a leaver's last day with the hand-over and what is not yet in the Journal", () => {
    const leaving = {
      ...register,
      people: people.map((p) => (p.id === "maya" ? { ...p, lastDay: "2025-11-17" } : p)),
    };
    const brief = todayBrief(leaving, [], [], "general", TODAY);
    expect(brief.leaving).toHaveLength(1);
    expect(brief.leaving[0]).toMatchObject({ daysLeft: 12, status: "notice", unlogged: 2 });
    expect(brief.leaving[0].handover.map((h) => h.item.id).sort()).toEqual(["payroll", "pms"]);
    expect(brief.gone).toEqual([]);
    expect(brief.headline).toBe(
      "Maya leaves in 12 days — 2 entries to hand over, 2 not yet in the Journal.",
    );
  });

  it("only counts down within LEAVING_SOON_DAYS, but leave starting soon outranks the countdown", () => {
    const far = {
      ...register,
      people: people.map((p) => (p.id === "maya" ? { ...p, lastDay: "2025-12-10" } : p)),
    };
    expect(todayBrief(far, [], [], "general", TODAY).leaving).toEqual([]);
    const edge = {
      ...register,
      people: people.map((p) => (p.id === "maya" ? { ...p, lastDay: "2025-12-05" } : p)),
    };
    expect(todayBrief(edge, [], [], "general", TODAY).leaving[0]?.daysLeft).toBe(LEAVING_SOON_DAYS);

    const near = {
      ...register,
      people: people.map((p) => (p.id === "maya" ? { ...p, lastDay: "2025-11-17" } : p)),
    };
    const soon = absence({
      personId: "sam",
      unplanned: undefined,
      from: "2025-11-07",
      to: "2025-11-08",
    });
    const brief = todayBrief(near, [soon], [], "general", TODAY);
    expect(brief.leaving).toHaveLength(1);
    expect(brief.headline).toMatch(/^Sam is out 7–8 Nov, in 2 days/);
  });

  it("puts someone whose last day has passed but is still active ahead of everything but today's absences", () => {
    const overdue = {
      ...register,
      people: people.map((p) => (p.id === "maya" ? { ...p, lastDay: "2025-11-03" } : p)),
    };
    const brief = todayBrief(overdue, [], [], "general", TODAY);
    expect(brief.gone).toHaveLength(1);
    expect(brief.gone[0]).toMatchObject({ daysLeft: -2, status: "gone" });
    expect(brief.headline).toBe(
      "Maya left 2 days ago but still counts as cover — mark Maya as left (2 entries only Maya could run alone).",
    );

    const withSick = todayBrief(
      overdue,
      [absence({ id: "abs-sam", personId: "sam" })],
      [],
      "general",
      TODAY,
    );
    expect(withSick.gone).toHaveLength(1);
    expect(withSick.headline).toMatch(/^Sam is out unexpectedly today/);
  });

  it("drops a leaver from the countdown once marked as left", () => {
    const left = {
      ...register,
      people: people.map((p) =>
        p.id === "maya" ? { ...p, lastDay: "2025-11-03", active: false } : p,
      ),
    };
    const brief = todayBrief(left, [], [], "general", TODAY);
    expect(brief.gone).toEqual([]);
    expect(brief.leaving).toEqual([]);
    expect(brief.headline).toBeNull();
  });

  it("ignores another industry's absences", () => {
    const brief = todayBrief(register, [absence({ industry: "dental" })], [], "general", TODAY);
    expect(brief.out).toEqual([]);
    expect(brief.headline).toBeNull();
  });
});

describe("today's brief over a starter register nobody has marked", () => {
  it("says it cannot tell what stops when someone calls in sick", () => {
    const starter: IndustryTemplate = {
      ...getBaseTemplate("general"),
      people,
      relations: [],
      processes: [],
    };
    const brief = todayBrief(starter, [absence()], [], "general", TODAY);
    expect(brief.assessed).toBe(false);
    expect(brief.headline).toBe(
      "Maya is out unexpectedly today — nobody is marked on the register yet, so the app cannot tell what stops.",
    );
  });
});

describe("today's brief when register items wait on nobody", () => {
  it("does not say nothing stops while must-do items have nobody who can run them", () => {
    const gaps = tpl(
      [{ personId: "sam", knowledgeId: "payroll", level: "expert" }],
      [item("payroll"), item("deposit")],
    );
    const brief = todayBrief(gaps, [absence()], [], "general", TODAY);
    expect(brief.headline).toBe(
      "Maya is out unexpectedly today — nothing more on the register stops, but 1 entry nobody can run alone already waits.",
    );
  });
});
