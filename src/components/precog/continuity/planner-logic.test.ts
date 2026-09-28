import { describe, expect, it } from "vitest";
import {
  checkInViewFor,
  debriefKey,
  importRegisterPrompt,
  promotionClosesTraining,
  removeItemPrompt,
  resetRegisterPrompt,
  settlesDebrief,
  stepAbsenceId,
  stepCommitment,
  untrackedItems,
  wholeStep,
  whatIfAbsentIds,
} from "./planner-logic";
import { UNHELD_VIEW } from "@/lib/precog/continuity/planner-copy";
import type { CheckInPlan } from "@/lib/precog/continuity/staleness";
import type { DebriefItem, LeaveDebrief } from "@/lib/precog/continuity/leave-debrief";
import { defaultProfile, type DecisionEntry } from "@/lib/precog/practice-profile";
import { continuityCommitments } from "@/lib/precog/decisions/follow-through";
import { getIndustryTemplate } from "@/lib/precog/templates";
import type { KnowledgeItem, KnowledgeRelation, Person } from "@/lib/precog/types";

const item = (id: string, name = id): KnowledgeItem => ({
  id,
  name,
  criticality: "critical",
  category: "process",
  description: "",
  linkedProcessIds: [],
});
const mark = (personId: string, knowledgeId: string): KnowledgeRelation => ({
  personId,
  knowledgeId,
  level: "proficient",
});

describe("register confirmations", () => {
  const register = {
    knowledge: [item("k1", "Payroll"), item("k2")],
    relations: [mark("p1", "k1"), mark("p2", "k1"), mark("p1", "k2")],
  };

  it("says what a reset throws away", () => {
    expect(resetRegisterPrompt(register, "Dental")).toBe(
      "Replace your 2 items and 3 marks with the dental sample list? You lose your items and every mark on them, and you cannot undo this.",
    );
  });

  it("compares the register with the file before an import replaces it", () => {
    const file = { knowledge: [item("k9")], relations: [mark("p1", "k9")] };
    expect(importRegisterPrompt(register, file)).toBe(
      "Replace your 2 items and 3 marks with the 1 item and 1 mark in this file? You lose what the register says now, and you cannot undo this.",
    );
  });

  it("counts only the marks on the item being removed", () => {
    expect(removeItemPrompt(register.knowledge[0], register.relations)).toBe(
      'Remove "Payroll" from the register with the 2 marks on it? This cannot be undone.',
    );
    expect(removeItemPrompt(item("k3", "Alarm"), register.relations)).toBe(
      'Remove "Alarm" from the register? This cannot be undone.',
    );
  });
});

const person = (id: string, active = true): Person => ({ id, name: id, role: "Staff", active });

describe("logging absence steps", () => {
  const knowledge = [item("k1"), item("k2"), item("k3")];
  const action = {
    text: "Hand off",
    step: "handoff" as const,
    knowledgeIds: ["k1", "gone", "k2", "k3"],
  };

  it("skips items already in the Journal and items no longer on the register", () => {
    const tracked = new Set(["k2"]);
    expect(untrackedItems(action, knowledge, (id) => tracked.has(id)).map((k) => k.id)).toEqual([
      "k1",
      "k3",
    ]);
  });

  it("ties only a hand-off to its absence", () => {
    expect(stepAbsenceId("handoff", "a1")).toBe("a1");
    expect(stepAbsenceId("cover", "a1")).toBeUndefined();
    expect(stepAbsenceId("document", "a1")).toBeUndefined();
  });

  it("counts a step as logged only once every item it names is", () => {
    const step = { text: "Cover", step: "cover" as const, knowledgeIds: ["k1", "k2"] };
    expect(wholeStep(step, (id) => (id === "k1" ? "2026-10-26" : undefined))).toBeUndefined();
    expect(wholeStep(step, () => "2026-10-26")).toBe("2026-10-26");
    expect(wholeStep({ ...step, knowledgeIds: [] }, () => "2026-10-26")).toBeUndefined();
  });
});

describe("debrief", () => {
  const entry = (id: string, training: Partial<DecisionEntry> | null = null): DebriefItem => ({
    item: item(id),
    standIn: null,
    standInLevel: undefined,
    handoff: null,
    training: training as DecisionEntry | null,
  });
  const debrief = {
    absence: { id: "a1", personId: "p1", industry: "dental", from: "2026-09-01", to: "2026-09-05" },
    person: person("p1"),
    lengthDays: 5,
    daysSince: 1,
    items: [entry("k1"), entry("k2")],
  } as LeaveDebrief;

  it("settles the leave only with the last open answer", () => {
    expect(settlesDebrief(debrief, debrief.items[0], new Set())).toBe(false);
    expect(settlesDebrief(debrief, debrief.items[0], new Set([debriefKey("a1", "k2")]))).toBe(true);
  });

  it("closes training on promotion only when it was aimed at the stand-in or nobody", () => {
    expect(promotionClosesTraining(entry("k1", { linkedPersonId: "p2" }), person("p2"))).toBe(true);
    expect(promotionClosesTraining(entry("k1", { linkedPersonId: "p3" }), person("p2"))).toBe(
      false,
    );
    expect(promotionClosesTraining(entry("k1", {}), person("p2"))).toBe(true);
    expect(promotionClosesTraining(entry("k1"), person("p2"))).toBe(false);
  });
});

describe("what-if card", () => {
  const people = [person("p1"), person("p2")];
  const report = { people: [{ person: person("p9", false) }, { person: people[1] }] } as never;

  it("starts with the most depended-on active person and says so", () => {
    expect(whatIfAbsentIds(null, people, report)).toEqual({ ids: ["p2"], startedWith: people[1] });
  });

  it("lets the owner untick everyone", () => {
    expect(whatIfAbsentIds([], people, report)).toEqual({ ids: [], startedWith: null });
  });

  it("drops ticked people who left the active team", () => {
    expect(whatIfAbsentIds(["p1", "p9"], people, report).ids).toEqual(["p1"]);
  });
});

describe("check-in view", () => {
  const checkIn = (id: string) => ({ person: person(id), items: [], soleCount: 0 });
  const plan = { checkIns: [checkIn("p1"), checkIn("p2")], unheld: [] } as CheckInPlan;

  it("shows the chosen person, else the first with stale items", () => {
    expect(checkInViewFor("p2", plan)).toBe("p2");
    expect(checkInViewFor("gone", plan)).toBe("p1");
  });

  it("shows the unheld list only when it has items", () => {
    expect(checkInViewFor(UNHELD_VIEW, plan)).toBe("p1");
    expect(checkInViewFor(null, { checkIns: [], unheld: [] })).toBe(UNHELD_VIEW);
  });
});

describe("stepCommitment", () => {
  const tpl = getIndustryTemplate(defaultProfile().industry);
  const itemId = tpl.knowledge[0].id;
  const entry = (id: string, createdAt: string, reviewBy: string): DecisionEntry => ({
    id,
    createdAt,
    subject: tpl.knowledge[0].name,
    kind: "remediate",
    note: "",
    reviewBy,
    linkedTab: "knowledge",
    linkedId: itemId,
    linkedStep: "cover",
  });

  it("names the first entry logged, as the leaver report does, when two are open", () => {
    // The log keeps the newest entry first.
    const decisions = [
      entry("manual", "2026-10-03T09:00:00.000Z", "2026-12-01"),
      entry("planner", "2026-09-26T09:00:00.000Z", "2026-10-26"),
    ];
    const commitments = continuityCommitments(decisions, tpl, "2026-10-05");
    expect(stepCommitment(commitments, itemId, "cover")?.decision.id).toBe("planner");
    expect(stepCommitment(commitments, itemId, "cover")?.reviewBy).toBe("2026-10-26");
  });

  it("finds a hand-off logged for this absence before an older unkeyed one", () => {
    const handoff = (id: string, absenceId?: string): DecisionEntry => ({
      ...entry(id, "2026-09-26T09:00:00.000Z", "2026-10-01"),
      linkedStep: "handoff",
      linkedAbsenceId: absenceId,
    });
    const commitments = continuityCommitments(
      [handoff("keyed", "a1"), handoff("old")],
      tpl,
      "2026-09-27",
    );
    expect(stepCommitment(commitments, itemId, "handoff", "a1")?.decision.id).toBe("keyed");
    expect(stepCommitment(commitments, itemId, "handoff", "a2")?.decision.id).toBe("old");
  });
});
