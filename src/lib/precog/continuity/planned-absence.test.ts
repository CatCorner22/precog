import { describe, expect, it } from "vitest";
import { getBaseTemplate } from "../active-template";
import { normalizePlannedAbsences, type PlannedAbsence } from "../practice-profile";
import type { IndustryTemplate } from "../templates/types";
import type { KnowledgeItem, KnowledgeRelation, Person } from "../types";
import {
  absencesNeedingAttention,
  describeWindow,
  formatDateRange,
  handoffDeadline,
  leadLabel,
  plannedAbsenceReport,
} from "./planned-absence";

const people: Person[] = [
  { id: "a", name: "Ana Ortiz", role: "Owner", active: true },
  { id: "b", name: "Ben Lee", role: "Office manager", active: true },
  { id: "c", name: "Cy Park", role: "Assistant", active: true },
  { id: "d", name: "Dee Old", role: "Former staff", active: false },
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
  return { ...getBaseTemplate("general"), people, knowledge, relations, processes: [] };
}

function absence(id: string, personId: string, from: string, to: string): PlannedAbsence {
  return { id, personId, industry: "general", from, to };
}

// Payroll: only Ben can run it, Cy is learning. Billing: Ben and Cy both can.
const register = tpl(
  [item("payroll"), item("billing")],
  [
    { personId: "b", knowledgeId: "payroll", level: "expert" },
    { personId: "c", knowledgeId: "payroll", level: "basic" },
    { personId: "b", knowledgeId: "billing", level: "proficient" },
    { personId: "c", knowledgeId: "billing", level: "proficient" },
  ],
);

const today = "2025-11-01";

describe("plannedAbsenceReport", () => {
  it("splits past, live and unmatched entries and sorts live ones soonest first", () => {
    const report = plannedAbsenceReport(
      register,
      [
        absence("late", "c", "2025-12-01", "2025-12-05"),
        absence("soon", "b", "2025-11-03", "2025-11-10"),
        absence("gone", "b", "2025-10-01", "2025-10-05"),
        absence("former", "d", "2025-11-03", "2025-11-04"),
        { ...absence("other", "b", "2025-11-03", "2025-11-04"), industry: "dental" },
      ],
      "general",
      today,
    );
    expect(report.windows.map((w) => w.absence.id)).toEqual(["soon", "late"]);
    expect(report.past.map((a) => a.id)).toEqual(["gone"]);
    expect(report.unmatched.map((a) => a.id)).toEqual(["former"]);
  });

  it("computes lead time, length and what stops for the absent person", () => {
    const [w] = plannedAbsenceReport(
      register,
      [absence("soon", "b", "2025-11-13", "2025-11-20")],
      "general",
      today,
    ).windows;
    expect(w.daysUntil).toBe(12);
    expect(w.lengthDays).toBe(8);
    expect(w.status).toBe("upcoming");
    expect(w.impact.stops.map((s) => s.item.id)).toEqual(["payroll"]);
    expect(w.impact.stops[0].standIn?.id).toBe("c");
    expect(w.impact.continues.map((k) => k.id)).toEqual(["billing"]);
    expect(w.impact.remaining.map((p) => p.id)).toEqual(["a", "c"]);
  });

  it("treats leave that has started as current with zero lead", () => {
    const [w] = plannedAbsenceReport(
      register,
      [absence("now", "b", "2025-10-30", "2025-11-02")],
      "general",
      today,
    ).windows;
    expect(w.status).toBe("current");
    expect(w.daysUntil).toBe(0);
    expect(handoffDeadline(w, today)).toBe(today);
  });

  it("flags overlapping leave and computes the impact with everyone away", () => {
    const report = plannedAbsenceReport(
      register,
      [
        absence("ben", "b", "2025-11-03", "2025-11-10"),
        absence("cy", "c", "2025-11-08", "2025-11-12"),
      ],
      "general",
      today,
    );
    const ben = report.windows.find((w) => w.absence.id === "ben");
    const cy = report.windows.find((w) => w.absence.id === "cy");
    expect(ben?.overlaps).toEqual([
      expect.objectContaining({ from: "2025-11-08", to: "2025-11-10", person: people[2] }),
    ]);
    expect(cy?.overlaps[0].person.id).toBe("b");
    expect(ben?.impact.people.map((p) => p.id)).toEqual(["b", "c"]);
    expect(ben?.impact.stops.map((s) => s.item.id).sort()).toEqual(["billing", "payroll"]);
    expect(ben?.impact.remaining.map((p) => p.id)).toEqual(["a"]);
  });

  it("does not count two entries for the same person as overlapping", () => {
    const report = plannedAbsenceReport(
      register,
      [
        absence("one", "b", "2025-11-03", "2025-11-05"),
        absence("two", "b", "2025-11-05", "2025-11-07"),
      ],
      "general",
      today,
    );
    expect(report.windows.every((w) => w.overlaps.length === 0)).toBe(true);
  });

  it("only surfaces windows inside the lead time for advice", () => {
    const { windows } = plannedAbsenceReport(
      register,
      [
        absence("soon", "b", "2025-11-13", "2025-11-20"),
        absence("far", "c", "2026-02-01", "2026-02-03"),
      ],
      "general",
      today,
    );
    expect(absencesNeedingAttention(windows).map((w) => w.absence.id)).toEqual(["soon"]);
    expect(absencesNeedingAttention(windows, 120).map((w) => w.absence.id)).toEqual([
      "soon",
      "far",
    ]);
  });

  it("returns nothing live when today is not a calendar date", () => {
    const report = plannedAbsenceReport(
      register,
      [absence("soon", "b", "2025-11-13", "2025-11-20")],
      "general",
      "not-a-date",
    );
    expect(report.windows).toEqual([]);
    expect(report.past).toEqual([]);
  });
});

describe("describeWindow", () => {
  it("names the person, the dates, the lead time and the hand-off", () => {
    const [w] = plannedAbsenceReport(
      register,
      [absence("soon", "b", "2025-11-13", "2025-11-20")],
      "general",
      today,
    ).windows;
    expect(describeWindow(w)).toBe("Ben is out 13–20 Nov, in 12 days: payroll — hand off to Cy.");
  });

  it("says when nobody is left and mentions overlapping leave", () => {
    const report = plannedAbsenceReport(
      register,
      [
        absence("ben", "b", "2025-11-03", "2025-11-10"),
        absence("cy", "c", "2025-11-08", "2025-11-12"),
      ],
      "general",
      today,
    );
    const ben = report.windows.find((w) => w.absence.id === "ben")!;
    expect(describeWindow(ben)).toBe(
      "Ben is out 3–10 Nov, in 2 days (Cy also out 8–10 Nov): billing has no one; payroll — hand off to Ana.",
    );
  });

  it("reports nothing stopping when the work is covered", () => {
    const [w] = plannedAbsenceReport(
      register,
      [absence("ana", "a", "2025-11-02", "2025-11-02")],
      "general",
      today,
    ).windows;
    expect(describeWindow(w)).toBe("Ana is out 2 Nov, tomorrow: nothing stops.");
  });
});

describe("date helpers", () => {
  it("formats ranges within a month, across months and across years", () => {
    expect(formatDateRange("2025-11-03", "2025-11-10")).toBe("3–10 Nov");
    expect(formatDateRange("2025-10-28", "2025-11-03")).toBe("28 Oct – 3 Nov");
    expect(formatDateRange("2025-12-30", "2026-01-02")).toBe("30 Dec 2025 – 2 Jan 2026");
    expect(formatDateRange("2025-11-03", "2025-11-03")).toBe("3 Nov");
  });

  it("labels lead time", () => {
    expect(leadLabel(0)).toBe("out now");
    expect(leadLabel(1)).toBe("tomorrow");
    expect(leadLabel(12)).toBe("in 12 days");
  });

  it("sets the hand-off deadline to the day before leave starts", () => {
    const [w] = plannedAbsenceReport(
      register,
      [absence("soon", "b", "2025-11-13", "2025-11-20")],
      "general",
      today,
    ).windows;
    expect(handoffDeadline(w, today)).toBe("2025-11-12");
  });
});

describe("normalizePlannedAbsences", () => {
  it("drops malformed, unordered and unknown-industry entries and keeps valid ones", () => {
    const kept = normalizePlannedAbsences([
      { id: "ok", personId: "b", industry: "general", from: "2025-11-03", to: "2025-11-10" },
      {
        id: "note",
        personId: "b",
        industry: "dental",
        from: "2025-11-03",
        to: "2025-11-03",
        note: "  Holiday ",
      },
      { id: "reversed", personId: "b", industry: "general", from: "2025-11-10", to: "2025-11-03" },
      { id: "bad-date", personId: "b", industry: "general", from: "2025-02-30", to: "2025-03-01" },
      { id: "no-industry", personId: "b", from: "2025-11-03", to: "2025-11-10" },
      {
        id: "wrong-industry",
        personId: "b",
        industry: "space",
        from: "2025-11-03",
        to: "2025-11-10",
      },
      { personId: "b", industry: "general", from: "2025-11-03", to: "2025-11-10" },
      null,
      "text",
    ]);
    expect(kept).toEqual([
      { id: "ok", personId: "b", industry: "general", from: "2025-11-03", to: "2025-11-10" },
      {
        id: "note",
        personId: "b",
        industry: "dental",
        from: "2025-11-03",
        to: "2025-11-03",
        note: "Holiday",
      },
    ]);
  });

  it("returns an empty list for anything that is not an array", () => {
    expect(normalizePlannedAbsences(undefined)).toEqual([]);
    expect(normalizePlannedAbsences({})).toEqual([]);
  });
});
