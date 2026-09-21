import { describe, expect, it } from "vitest";
import { getBaseTemplate } from "../active-template";
import { normalizePlannedAbsences, type PlannedAbsence } from "../practice-profile";
import type { IndustryTemplate } from "../templates/types";
import type { KnowledgeItem, KnowledgeRelation, Person } from "../types";
import {
  absencesNeedingAttention,
  describeWindow,
  endAbsence,
  extendAbsence,
  formatDateRange,
  handoffDeadline,
  leadLabel,
  outPhrase,
  plannedAbsenceReport,
  procedurePointer,
  unplannedAbsenceToday,
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

  it("flags overlapping leave and takes the impact from the shared days", () => {
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
    expect(ben?.peak).toEqual({
      from: "2025-11-08",
      to: "2025-11-10",
      people: [people[1], people[2]],
      extraStops: [item("billing")],
    });
    expect(cy?.peak).toEqual({
      from: "2025-11-08",
      to: "2025-11-10",
      people: [people[2], people[1]],
      extraStops: [item("billing"), item("payroll")],
    });
  });

  it("never treats coworkers away on different days as away together", () => {
    // Ana is out all of 1–10 Nov; Ben leaves before Cy arrives, so billing (Ben or Cy) never stops.
    const report = plannedAbsenceReport(
      register,
      [
        absence("ana", "a", "2025-11-01", "2025-11-10"),
        absence("ben", "b", "2025-11-01", "2025-11-03"),
        absence("cy", "c", "2025-11-08", "2025-11-10"),
      ],
      "general",
      today,
    );
    const ana = report.windows.find((w) => w.absence.id === "ana")!;
    expect(ana.overlaps.map((o) => o.person.id)).toEqual(["b", "c"]);
    expect(ana.impact.stops.map((s) => s.item.id)).toEqual(["payroll"]);
    expect(ana.impact.continues.map((k) => k.id)).toEqual(["billing"]);
    expect(ana.peak).toEqual({
      from: "2025-11-01",
      to: "2025-11-03",
      people: [people[0], people[1]],
      extraStops: [item("payroll")],
    });
    expect(ana.impact.remaining.map((p) => p.id)).toEqual(["c"]);
  });

  it("picks the stretch where the most work stops, not the first one", () => {
    // Ana holds nothing; alone she stops nothing. Ben's days stop payroll; Cy's days stop nothing.
    const report = plannedAbsenceReport(
      register,
      [
        absence("ana", "a", "2025-11-01", "2025-11-10"),
        absence("cy", "c", "2025-11-01", "2025-11-02"),
        absence("ben", "b", "2025-11-06", "2025-11-07"),
      ],
      "general",
      today,
    );
    const ana = report.windows.find((w) => w.absence.id === "ana")!;
    expect(ana.peak).toEqual({
      from: "2025-11-06",
      to: "2025-11-07",
      people: [people[0], people[1]],
      extraStops: [item("payroll")],
    });
    expect(ana.impact.stops.map((s) => s.item.id)).toEqual(["payroll"]);
  });

  it("keeps the whole window as the peak when nobody overlaps", () => {
    const [w] = plannedAbsenceReport(
      register,
      [absence("soon", "b", "2025-11-13", "2025-11-20")],
      "general",
      today,
    ).windows;
    expect(w.peak).toEqual({ from: "2025-11-13", to: "2025-11-20", people: [people[1]], extraStops: [] });
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

  it("names the worst stretch only when several overlaps make it ambiguous", () => {
    const report = plannedAbsenceReport(
      register,
      [
        absence("ana", "a", "2025-11-01", "2025-11-10"),
        absence("cy", "c", "2025-11-01", "2025-11-02"),
        absence("ben", "b", "2025-11-06", "2025-11-07"),
      ],
      "general",
      today,
    );
    const ana = report.windows.find((w) => w.absence.id === "ana")!;
    expect(describeWindow(ana)).toBe(
      "Ana is out 1–10 Nov, out now (Cy also out 1–2 Nov; Ben also out 6–7 Nov; worst 6–7 Nov, with Ben also out): payroll — Cy covers (nothing written down).",
    );
  });

  it("says an unplanned absence is unexpected and points the stand-in at the procedure", () => {
    const documented = tpl(
      [item("payroll", { documented: true, procedureLocation: "Drive/SOPs/payroll" })],
      [
        { personId: "b", knowledgeId: "payroll", level: "expert" },
        { personId: "c", knowledgeId: "payroll", level: "basic" },
      ],
    );
    const [w] = plannedAbsenceReport(
      documented,
      [unplannedAbsenceToday("sick", "b", "general", today)],
      "general",
      today,
    ).windows;
    expect(w.status).toBe("current");
    expect(w.lengthDays).toBe(1);
    expect(describeWindow(w)).toBe(
      "Ben is out unexpectedly 1 Nov, out now: payroll — Cy covers (procedure at Drive/SOPs/payroll).",
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

  it("records an unplanned absence as today only, then extends it a day at a time", () => {
    const sick = unplannedAbsenceToday("sick", "b", "general", today);
    expect(sick).toEqual({
      id: "sick",
      personId: "b",
      industry: "general",
      from: today,
      to: today,
      unplanned: true,
    });
    expect(outPhrase(sick)).toBe("is out unexpectedly");
    expect(outPhrase(absence("hol", "b", today, today))).toBe("is out");
    expect(extendAbsence(sick, today).to).toBe("2025-11-02");
    expect(extendAbsence({ ...sick, to: "2025-11-04" }, today).to).toBe("2025-11-05");
    // Fell behind: someone out since last week whose entry was never extended still gets tomorrow.
    expect(extendAbsence({ ...sick, from: "2025-10-28", to: "2025-10-29" }, today).to).toBe(
      "2025-11-02",
    );
  });

  it("ends an absence yesterday when the person is back, or drops one that never started", () => {
    expect(endAbsence(absence("long", "b", "2025-10-28", "2025-11-10"), today)).toEqual(
      absence("long", "b", "2025-10-28", "2025-10-31"),
    );
    expect(endAbsence(absence("done", "b", "2025-10-20", "2025-10-25"), today)).toEqual(
      absence("done", "b", "2025-10-20", "2025-10-25"),
    );
    expect(endAbsence(unplannedAbsenceToday("sick", "b", "general", today), today)).toBeNull();
    expect(endAbsence(absence("future", "b", "2025-11-05", "2025-11-06"), today)).toBeNull();
  });

  it("tells the stand-in where the procedure lives", () => {
    const stop = (extra: Partial<KnowledgeItem>) => ({
      item: item("payroll", extra),
      standIn: null,
      note: "",
    });
    expect(procedurePointer(stop({}))).toBe("nothing written down");
    expect(procedurePointer(stop({ documented: true }))).toBe(
      "written down, location not recorded",
    );
    expect(procedurePointer(stop({ documented: true, procedureLocation: " Drive/SOPs " }))).toBe(
      "procedure at Drive/SOPs",
    );
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
      {
        id: "sick",
        personId: "b",
        industry: "general",
        from: "2025-11-03",
        to: "2025-11-03",
        unplanned: true,
      },
      {
        id: "not-flag",
        personId: "b",
        industry: "general",
        from: "2025-11-03",
        to: "2025-11-03",
        unplanned: "yes",
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
      {
        id: "sick",
        personId: "b",
        industry: "general",
        from: "2025-11-03",
        to: "2025-11-03",
        unplanned: true,
      },
      { id: "not-flag", personId: "b", industry: "general", from: "2025-11-03", to: "2025-11-03" },
    ]);
  });

  it("returns an empty list for anything that is not an array", () => {
    expect(normalizePlannedAbsences(undefined)).toEqual([]);
    expect(normalizePlannedAbsences({})).toEqual([]);
  });
});
