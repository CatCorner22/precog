import { describe, expect, it } from "vitest";
import { latestReview, monthlyReviewTasks, recordReview } from "./reviews";
import type { Person } from "../types";

const people: Person[] = [
  {
    id: "a",
    name: "Ada Owner",
    role: "Owner",
    active: true,
    owner: true,
    entitlements: ["bank_reconcile"],
  },
  {
    id: "b",
    name: "Ben Payroll",
    role: "Payroll",
    active: true,
    entitlements: ["approve_payroll"],
  },
];

describe("monthly review", () => {
  it("names the person who holds the duty and dates the close to the 10th", () => {
    const tasks = monthlyReviewTasks("2026-09-24", people);
    expect(tasks).toHaveLength(4);
    expect(tasks.find((t) => t.key === "bank_statement")?.suggestedOwner).toBe("Ada Owner");
    expect(tasks.find((t) => t.key === "payroll_headcount")?.suggestedOwner).toBe("Ben Payroll");
    expect(tasks[0].dueOn).toBe("2026-10-10");
  });

  it("keeps the earlier result when a later one is recorded", () => {
    const first = recordReview([], {
      key: "new_vendors",
      period: "2026-09",
      result: "exception",
      ownerName: "Ada",
      notes: "New ACH on a vendor",
      recordedAt: "2026-09-10T00:00:00.000Z",
    });
    const second = recordReview(first, {
      key: "new_vendors",
      period: "2026-09",
      result: "done",
      ownerName: "Ada",
      notes: "Vendor removed",
      recordedAt: "2026-09-12T00:00:00.000Z",
    });
    expect(second).toHaveLength(2);
    expect(latestReview(second, "new_vendors", "2026-09")?.result).toBe("done");
    expect(second[1].result).toBe("exception");
  });
});
