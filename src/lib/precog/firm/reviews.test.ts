import { describe, expect, it } from "vitest";
import { latestReview, monthlyReviewTasks, recordReview } from "./reviews";
import type { Person } from "../types";
import { getIndustryTemplate } from "../templates";
import { INDUSTRIES } from "../industry";

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
    owner: false,
    entitlements: ["approve_payroll"],
  },
];

const owner = (tasks: ReturnType<typeof monthlyReviewTasks>, key: string) =>
  tasks.find((t) => t.key === key)?.suggestedOwner;

describe("monthly review", () => {
  it("suggests the sole owner for every check and dates the close to the 10th", () => {
    const tasks = monthlyReviewTasks("2026-09-24", people);
    expect(tasks).toHaveLength(4);
    expect(tasks.map((t) => t.suggestedOwner)).toEqual(Array(4).fill("Ada Owner"));
    expect(tasks.every((t) => !t.reviewerHoldsDuty)).toBe(true);
    expect(tasks[0].dueOn).toBe("2026-10-10");
  });

  it("never suggests the person who holds the duty the check looks at", () => {
    const dana: Person = {
      id: "d",
      name: "Dana",
      role: "Firm Administrator",
      active: true,
      owner: false,
      entitlements: [
        "enter_invoices",
        "release_payment",
        "bank_reconcile",
        "create_vendor",
        "enter_payroll",
      ],
    };
    const partners: Person[] = [
      dana,
      {
        id: "p",
        name: "Pat",
        role: "Partner",
        active: true,
        owner: true,
        entitlements: ["sign_checks"],
      },
      { id: "q", name: "Quinn", role: "Partner", active: true, owner: true, entitlements: [] },
    ];
    const tasks = monthlyReviewTasks("2026-09-24", partners);
    expect(tasks.some((t) => t.suggestedOwner === "Dana")).toBe(false);
    expect(owner(tasks, "cleared_checks")).toBe("Quinn");
    expect(owner(tasks, "new_vendors")).toBe("Pat");
  });

  it("says so when everyone holds a checked duty", () => {
    const team: Person[] = [
      {
        id: "x",
        name: "Xu",
        role: "Partner",
        active: true,
        owner: true,
        entitlements: ["bank_reconcile"],
      },
      {
        id: "y",
        name: "Yan",
        role: "Partner",
        active: true,
        owner: true,
        entitlements: ["sign_checks"],
      },
    ];
    const bank = monthlyReviewTasks("2026-09-24", team).find((t) => t.key === "bank_statement");
    expect([bank?.suggestedOwner, bank?.reviewerHoldsDuty]).toEqual(["Xu", true]);
  });

  it("names a real person on every sample business", () => {
    for (const { id } of INDUSTRIES) {
      const tpl = getIndustryTemplate(id);
      const tasks = monthlyReviewTasks("2026-09-24", tpl.people, tpl.roleTemplates);
      const names = new Set(tpl.people.map((p) => p.name));
      for (const task of tasks) expect(names.has(task.suggestedOwner)).toBe(true);
    }
    const dental = getIndustryTemplate("dental");
    expect(
      owner(
        monthlyReviewTasks("2026-09-24", dental.people, dental.roleTemplates),
        "bank_statement",
      ),
    ).toBe("Dr. Elena Vargas");
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
