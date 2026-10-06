import { describe, expect, it } from "vitest";
import {
  appendReview,
  latestReview,
  MAX_REVIEW_RECORDS,
  monthlyReviewTasks,
  normalizeReviewRecords,
  recordReview,
  reviewResultLine,
  reviewTrimNotice,
  trimReviewRecords,
} from "./reviews";
import type { Person } from "../types";
import { getIndustryTemplate } from "../templates";
import { INDUSTRIES } from "../industry";
import { personDuties } from "../sod/assignments";

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
  it("suggests a separate reviewer for owner-prepared work and dates the close to the 10th", () => {
    const tasks = monthlyReviewTasks("2026-09-24", people);
    expect(tasks).toHaveLength(4);
    expect(tasks.map((t) => t.suggestedOwner)).toEqual([
      "Ben Payroll",
      "Ada Owner",
      "Ada Owner",
      "Ada Owner",
    ]);
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
    ).toBe("Sam Ortiz");
  });

  it("adds the card statement as a fifth check from October 2026 with a reviewer who holds no card duty", () => {
    const team: Person[] = [
      ...people,
      {
        id: "c",
        name: "Cara Office",
        role: "Office manager",
        active: true,
        owner: false,
        entitlements: ["hold_company_card", "review_card_statement", "approve_expenses"],
      },
    ];
    expect(monthlyReviewTasks("2026-09-24", team).map((t) => t.key)).not.toContain(
      "card_statement",
    );
    const tasks = monthlyReviewTasks("2026-10-05", team);
    expect(tasks.map((t) => t.key)).toEqual([
      "bank_statement",
      "cleared_checks",
      "payroll_headcount",
      "new_vendors",
      "card_statement",
    ]);
    const card = tasks.find((t) => t.key === "card_statement");
    expect(card?.title).toBe("Read the company card statement line by line");
    expect([card?.suggestedOwner, card?.reviewerIndependence]).toEqual([
      "Ada Owner",
      "separate_duties",
    ]);
    const cardDuties = ["hold_company_card", "review_card_statement", "approve_expenses"];
    for (const { id } of INDUSTRIES) {
      const tpl = getIndustryTemplate(id);
      const sample = monthlyReviewTasks("2026-10-05", tpl.people, tpl.roleTemplates);
      expect(sample).toHaveLength(5);
      const reviewer = tpl.people.find(
        (p) => p.name === sample.find((t) => t.key === "card_statement")?.suggestedOwner,
      );
      expect(reviewer).toBeDefined();
      expect(personDuties(reviewer!, tpl.roleTemplates).some((d) => cardDuties.includes(d))).toBe(
        false,
      );
    }
  });

  it("still loads saved results for the four earlier checks", () => {
    const saved = ["bank_statement", "cleared_checks", "payroll_headcount", "new_vendors"].map(
      (key) => ({
        key,
        period: "2026-08",
        result: "done",
        ownerName: "Ada",
        notes: "",
        recordedAt: "2026-09-02T00:00:00.000Z",
      }),
    );
    expect(normalizeReviewRecords(saved).map((r) => r.key)).toEqual(saved.map((r) => r.key));
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

describe("reviewResultLine", () => {
  it("prints the result as the screen names it, with who reported it and the note", () => {
    expect(
      reviewResultLine({
        result: "exception",
        ownerName: "Dana",
        notes: "Check 1043 payable to cash",
      }),
    ).toBe("Exception — Dana: Check 1043 payable to cash");
  });

  it("leaves out an empty name or note", () => {
    expect(reviewResultLine({ result: "done", ownerName: "", notes: "" })).toBe("Done");
    expect(reviewResultLine({ result: "skipped", ownerName: "Dana", notes: " " })).toBe(
      "Skipped — Dana",
    );
  });
});

describe("monthly results past the cap", () => {
  const CHECKS = ["bank_statement", "cleared_checks", "payroll_headcount", "new_vendors"] as const;
  const periodOf = (month: number) => new Date(Date.UTC(2010, month, 1)).toISOString().slice(0, 7);

  /** Each check each month first found an exception, then was cleared, oldest month first. */
  function history(months: number) {
    let records: ReturnType<typeof recordReview> = [];
    for (let m = 0; m < months; m++) {
      const period = periodOf(m);
      for (const key of CHECKS) {
        records = recordReview(records, {
          key,
          period,
          result: "exception",
          ownerName: "Pat",
          notes: "Check 1043 payable to cash",
          recordedAt: `${period}-12T10:00:00.000Z`,
        });
        records = recordReview(records, {
          key,
          period,
          result: "done",
          ownerName: "Pat",
          notes: "Cleared with the owner",
          recordedAt: `${period}-20T10:00:00.000Z`,
        });
      }
    }
    return records;
  }

  // ST-SCALE-4: past 240 results the oldest months were dropped silently.
  it("keeps every result while they fit, the earlier ones included", () => {
    const records = history(25);
    expect(records).toHaveLength(200);
    expect(latestReview(records, "bank_statement", periodOf(0))?.result).toBe("done");
    expect(records.at(-1)?.result).toBe("exception");
    const stored = normalizeReviewRecords(JSON.parse(JSON.stringify(history(38))));
    expect(stored).toHaveLength(304);
    expect(latestReview(stored, "new_vendors", periodOf(0))?.result).toBe("done");
  });

  it("drops results a later one replaced before any month, so every month keeps its latest", () => {
    // 200 months x 4 checks x 2 results = 1,600 records, past the 1,200 cap.
    const stored = history(200);
    expect(MAX_REVIEW_RECORDS).toBe(1200);
    expect(stored).toHaveLength(MAX_REVIEW_RECORDS);
    for (let m = 0; m < 200; m++)
      for (const key of CHECKS) expect(latestReview(stored, key, periodOf(m))?.result).toBe("done");
    // The newest months keep their exception too; the oldest lose only that.
    expect(stored.filter((r) => r.period === periodOf(199))).toHaveLength(8);
    expect(stored.filter((r) => r.period === periodOf(0))).toHaveLength(4);
  });

  it("counts what it removes, and removes the oldest months only once no duplicate is left", () => {
    const plain = Array.from({ length: MAX_REVIEW_RECORDS }, (_, i) => ({
      key: CHECKS[i % 4],
      period: periodOf(1000 - Math.floor(i / 4)),
      result: "done" as const,
      ownerName: "Pat",
      notes: "",
      recordedAt: "2026-01-01T00:00:00.000Z",
    }));
    expect(trimReviewRecords(plain)).toEqual({ records: plain, removed: 0 });
    const next = appendReview(plain, {
      key: "bank_statement",
      period: periodOf(1001),
      result: "done",
      ownerName: "Pat",
      notes: "",
    });
    expect(next.removed).toBe(1);
    expect(next.records).toHaveLength(MAX_REVIEW_RECORDS);
    expect(next.records.at(-1)).toEqual(plain.at(-2));
    expect(reviewTrimNotice(next.removed)).toBe(
      "Precog kept the newest 1,200 monthly results and removed 1 older one.",
    );
    expect(reviewTrimNotice(400)).toBe(
      "Precog kept the newest 1,200 monthly results and removed 400 older ones.",
    );
    const loaded = normalizeReviewRecords([...plain, ...plain.slice(0, 20)]);
    expect(loaded).toHaveLength(MAX_REVIEW_RECORDS);
  });
});
