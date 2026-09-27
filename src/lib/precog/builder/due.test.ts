import { describe, expect, it } from "vitest";
import { defaultProfile, type DecisionEntry } from "../practice-profile";
import type { ProcessNode } from "../types";
import { collectDueItems, groupByDay, summarizeDue } from "./due";

const NOW = new Date(2026, 8, 26, 10, 0); // Sep 26, 2026, 10:00 local

function decision(overrides: Partial<DecisionEntry>): DecisionEntry {
  return {
    id: "d1",
    createdAt: "2026-06-01T10:00:00.000Z",
    subject: "Second signer on checks over $1,000",
    kind: "accept_risk",
    note: "",
    ...overrides,
  } as DecisionEntry;
}

function evidenceProcess(lastDoneAt: string): ProcessNode {
  return {
    id: "proc-cash",
    name: "Cash handling",
    layer: "process",
    description: "",
    dependencies: [],
    controlIds: [],
    evidence: [{ id: "e1", label: "Deposit review", frequency: "weekly", lastDoneAt }],
  };
}

describe("collectDueItems", () => {
  it("leaves a closed decision off the calendar even when its review date has passed", () => {
    const profile = {
      ...defaultProfile("dental"),
      decisions: [
        decision({ id: "closed", reviewBy: "2026-09-01", status: "closed" }),
        decision({ id: "open", reviewBy: "2026-09-01" }),
      ],
    };
    const items = collectDueItems([], [], profile, NOW).filter((i) => i.kind === "decision");
    expect(items.map((i) => i.decisionId)).toEqual(["open"]);
    expect(items[0]).toMatchObject({ status: "overdue", daysLeft: -25 });
  });

  it("files a re-review under its own calendar day and skips ones beyond 60 days", () => {
    const profile = {
      ...defaultProfile("dental"),
      decisions: [
        decision({ id: "soon", reviewBy: "2026-09-26" }),
        decision({ id: "far", reviewBy: "2026-12-31" }),
      ],
    };
    const items = collectDueItems([], [], profile, NOW).filter((i) => i.kind === "decision");
    expect(items.map((i) => i.decisionId)).toEqual(["soon"]);
    expect(items[0]).toMatchObject({ status: "today", daysLeft: 0 });
    expect([...groupByDay(items).keys()]).toEqual(["2026-09-26"]);
  });

  it("gives an evidence item the same day count as the evidence list", () => {
    // Weekly review done Sep 19 at 23:30: due Sep 26, today.
    const items = collectDueItems(
      [evidenceProcess("2026-09-19T23:30:00")],
      [],
      defaultProfile("dental"),
      NOW,
    );
    expect(items[0]).toMatchObject({ kind: "evidence", status: "today", daysLeft: 0 });
  });

  it("marks evidence nobody has done as unscheduled and sorts overdue first", () => {
    const never: ProcessNode = { ...evidenceProcess(""), id: "proc-never" };
    never.evidence = [{ id: "e2", label: "Never done", frequency: "monthly" }];
    const items = collectDueItems(
      [never, evidenceProcess("2026-09-01T10:00:00")],
      [],
      defaultProfile("dental"),
      NOW,
    );
    expect(items.map((i) => i.status)).toEqual(["overdue", "unscheduled"]);
    expect(summarizeDue(items)).toMatchObject({ overdue: 1, unscheduled: 1 });
  });
});
