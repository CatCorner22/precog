import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { collectDueItems, groupByDay } from "./due";
import { defaultProfile, type DecisionEntry } from "../practice-profile";

const decision: DecisionEntry = {
  id: "d1",
  createdAt: "2026-09-26T12:00:00.000Z",
  subject: "Cross-train Chris on payroll",
  kind: "remediate",
  note: "",
  reviewBy: "2026-10-26",
};

describe("decision re-reviews on the control calendar west of UTC", () => {
  const originalTz = process.env.TZ;
  beforeAll(() => {
    process.env.TZ = "America/New_York";
  });
  afterAll(() => {
    process.env.TZ = originalTz;
  });

  it("puts the re-review on its own review day and counts the full days left", () => {
    const profile = { ...defaultProfile(), decisions: [decision] };
    const now = new Date(2026, 8, 26, 9, 0);
    const items = collectDueItems([], [], profile, now);
    const item = items.find((i) => i.decisionId === "d1");
    expect(item?.daysLeft).toBe(30);
    expect([...groupByDay(items).keys()]).toEqual(["2026-10-26"]);
  });

  it("calls the re-review due today, not overdue, on its review day", () => {
    const profile = { ...defaultProfile(), decisions: [decision] };
    const items = collectDueItems([], [], profile, new Date(2026, 9, 26, 18, 0));
    expect(items.find((i) => i.decisionId === "d1")?.status).toBe("today");
  });

  it("skips a review date that is not a calendar day", () => {
    const profile = { ...defaultProfile(), decisions: [{ ...decision, reviewBy: "soon" }] };
    expect(collectDueItems([], [], profile, new Date(2026, 8, 26))).toEqual([]);
  });
});
