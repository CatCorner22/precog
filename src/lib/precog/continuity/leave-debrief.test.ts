import { describe, expect, it } from "vitest";
import { getBaseTemplate } from "../active-template";
import {
  normalizePlannedAbsences,
  type DecisionEntry,
  type PlannedAbsence,
} from "../practice-profile";
import type { IndustryTemplate } from "../templates/types";
import type { KnowledgeItem, KnowledgeRelation, Person } from "../types";
import {
  DEBRIEF_WINDOW_DAYS,
  describeDebrief,
  describeDebriefItem,
  leaveDebriefs,
  standInAlreadyStrong,
} from "./leave-debrief";

const people: Person[] = [
  { id: "maya", name: "Maya Chen", role: "Office manager", active: true },
  { id: "chris", name: "Chris Diaz", role: "Assistant", active: true },
  { id: "sam", name: "Sam Roy", role: "Hygienist", active: true },
  { id: "dee", name: "Dee Old", role: "Former staff", active: false },
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

function tpl(relations: KnowledgeRelation[], knowledge = [item("pms"), item("billing")]) {
  const base: IndustryTemplate = {
    ...getBaseTemplate("general"),
    people,
    knowledge,
    relations,
    processes: [],
  };
  return base;
}

// PMS admin: only Maya, Chris is learning. Billing: Maya and Sam both can.
const register = tpl([
  { personId: "maya", knowledgeId: "pms", level: "expert" },
  { personId: "chris", knowledgeId: "pms", level: "basic" },
  { personId: "maya", knowledgeId: "billing", level: "proficient" },
  { personId: "sam", knowledgeId: "billing", level: "proficient" },
]);

function leave(overrides: Partial<PlannedAbsence> = {}): PlannedAbsence {
  return {
    id: "abs-1",
    personId: "maya",
    industry: "general",
    from: "2025-11-03",
    to: "2025-11-10",
    ...overrides,
  };
}

function handoff(overrides: Partial<DecisionEntry> = {}): DecisionEntry {
  return {
    id: "d-handoff",
    createdAt: "2025-10-20T09:00:00.000Z",
    subject: "pms",
    kind: "remediate",
    note: "Hand off before leave",
    reviewBy: "2025-11-02",
    linkedTab: "knowledge",
    linkedId: "pms",
    linkedIndustry: "general",
    linkedStep: "handoff",
    linkedAbsenceId: "abs-1",
    status: "open",
    ...overrides,
  };
}

const today = "2025-11-12";

describe("leaveDebriefs", () => {
  it("asks about ended leave: the entries only the returning person could run, and who stood in", () => {
    const [debrief, ...rest] = leaveDebriefs(register, [leave()], [], "general", today);
    expect(rest).toEqual([]);
    expect(debrief.person.id).toBe("maya");
    expect(debrief.lengthDays).toBe(8);
    expect(debrief.daysSince).toBe(2);
    expect(debrief.items.map((e) => e.item.id)).toEqual(["pms"]);
    expect(debrief.items[0]).toMatchObject({
      standIn: { id: "chris" },
      standInLevel: "basic",
      handoff: null,
      training: null,
    });
    expect(standInAlreadyStrong(debrief.items[0])).toBe(false);
  });

  it("ignores leave still under way, from another industry, for former staff, or already debriefed", () => {
    const debriefs = leaveDebriefs(
      register,
      [
        leave({ id: "current", to: "2025-11-12" }),
        leave({ id: "future", from: "2025-12-01", to: "2025-12-05" }),
        leave({ id: "dental", industry: "dental" }),
        leave({ id: "former", personId: "dee" }),
        leave({ id: "done", debriefedAt: "2025-11-11" }),
        leave({ id: "old", from: "2025-08-01", to: "2025-08-10" }),
      ],
      [],
      "general",
      today,
    );
    expect(debriefs).toEqual([]);
    const edge = leaveDebriefs(
      register,
      [leave({ id: "edge", from: "2025-09-01", to: "2025-09-13" })],
      [],
      "general",
      today,
    );
    expect(edge.map((d) => d.absence.id)).toEqual(["edge"]);
    expect(edge[0].daysSince).toBe(DEBRIEF_WINDOW_DAYS);
  });

  it("says nothing when the leave stopped nothing", () => {
    expect(leaveDebriefs(register, [leave({ personId: "sam" })], [], "general", today)).toEqual([]);
  });

  it("prefers the person the hand-off was logged to and carries the open hand-off and training step", () => {
    const training: DecisionEntry = {
      ...handoff({ id: "d-train", linkedStep: "cover", linkedAbsenceId: undefined }),
      linkedPersonId: "chris",
      reviewBy: "2025-12-01",
    };
    const [debrief] = leaveDebriefs(
      register,
      [leave()],
      [handoff({ linkedPersonId: "sam" }), training],
      "general",
      today,
    );
    expect(debrief.items[0]).toMatchObject({
      standIn: { id: "sam" },
      standInLevel: undefined,
      handoff: { id: "d-handoff" },
      training: { id: "d-train" },
    });
  });

  it("does not let a hand-off logged for another leave, or a closed one, attach to this debrief", () => {
    const [debrief] = leaveDebriefs(
      register,
      [leave()],
      [handoff({ id: "other", linkedAbsenceId: "abs-2" }), handoff({ id: "closed", status: "closed" })],
      "general",
      today,
    );
    expect(debrief.items[0].handoff).toBeNull();
    const [legacy] = leaveDebriefs(
      register,
      [leave()],
      [handoff({ id: "unkeyed", linkedAbsenceId: undefined })],
      "general",
      today,
    );
    expect(legacy.items[0].handoff?.id).toBe("unkeyed");
  });

  it("still lists an entry someone else can already run when its hand-off is open, so it can be closed", () => {
    const [debrief] = leaveDebriefs(
      register,
      [leave()],
      [handoff({ id: "bill", linkedId: "billing", subject: "billing" })],
      "general",
      today,
    );
    expect(debrief.items.map((e) => e.item.id)).toEqual(["pms", "billing"]);
    const billing = debrief.items[1];
    expect(billing).toMatchObject({ standIn: { id: "sam" }, standInLevel: "proficient" });
    expect(standInAlreadyStrong(billing)).toBe(true);
  });

  it("reports several stopped entries and a missing stand-in", () => {
    const lonely = tpl(
      [
        { personId: "maya", knowledgeId: "pms", level: "expert" },
        { personId: "chris", knowledgeId: "pms", level: "basic" },
        { personId: "maya", knowledgeId: "billing", level: "expert" },
      ],
      [item("pms"), item("billing", { criticality: "important" })],
    );
    const [debrief] = leaveDebriefs(lonely, [leave()], [], "general", today);
    expect(debrief.items.map((e) => e.item.id)).toEqual(["pms", "billing"]);
    // Nobody has touched billing, so the register's best candidate stands in on paper.
    expect(debrief.items[1].standIn?.id).toBeDefined();
    expect(debrief.items[1].standInLevel).toBeUndefined();
    const nobody = tpl(
      [{ personId: "maya", knowledgeId: "pms", level: "expert" }],
      [item("pms")],
    );
    const solo = { ...nobody, people: people.filter((p) => p.id === "maya" || p.id === "dee") };
    const [alone] = leaveDebriefs(solo, [leave()], [], "general", today);
    expect(alone.items[0].standIn).toBeNull();
    expect(describeDebriefItem(alone, alone.items[0])).toBe(
      "Nobody was lined up for pms for those 8 days — did someone step in?",
    );
  });

  it("orders the most recently ended leave first", () => {
    const debriefs = leaveDebriefs(
      register,
      [leave({ id: "earlier", from: "2025-10-01", to: "2025-10-05" }), leave()],
      [],
      "general",
      today,
    );
    expect(debriefs.map((d) => d.absence.id)).toEqual(["abs-1", "earlier"]);
  });

  it("words the question the way the owner would ask it", () => {
    const [debrief] = leaveDebriefs(
      register,
      [leave()],
      [handoff({ id: "bill", linkedId: "billing", subject: "billing" })],
      "general",
      today,
    );
    expect(describeDebrief(debrief)).toBe(
      "Maya's back — Chris covered pms for 8 days; can they run it alone now? (and 1 more entry to debrief)",
    );
    expect(describeDebriefItem(debrief, debrief.items[1])).toBe(
      "Sam covered billing for 8 days and the register already says they can run it alone.",
    );
  });

  it("says the cover was at short notice when the absence was unplanned", () => {
    const [debrief] = leaveDebriefs(
      register,
      [leave({ from: "2025-11-04", to: "2025-11-04", unplanned: true })],
      [],
      "general",
      today,
    );
    expect(describeDebrief(debrief)).toBe(
      "Maya's back — Chris covered pms for 1 day at short notice; can they run it alone now?",
    );
  });
});

describe("normalizePlannedAbsences", () => {
  it("keeps a valid debrief date and drops a malformed one", () => {
    const [kept, dropped] = normalizePlannedAbsences([
      { ...leave(), debriefedAt: "2025-11-11" },
      { ...leave({ id: "abs-2" }), debriefedAt: "yesterday" },
    ]);
    expect(kept.debriefedAt).toBe("2025-11-11");
    expect("debriefedAt" in dropped).toBe(false);
  });
});
