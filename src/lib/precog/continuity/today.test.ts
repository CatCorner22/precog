import { describe, expect, it } from "vitest";
import { getBaseTemplate } from "../active-template";
import type { DecisionEntry, PlannedAbsence } from "../practice-profile";
import type { IndustryTemplate } from "../templates/types";
import type { KnowledgeItem, KnowledgeRelation, Person } from "../types";
import { SOON_DAYS, todayBrief } from "./today";

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

  it("ignores another industry's absences", () => {
    const brief = todayBrief(register, [absence({ industry: "dental" })], [], "general", TODAY);
    expect(brief.out).toEqual([]);
    expect(brief.headline).toBeNull();
  });
});
