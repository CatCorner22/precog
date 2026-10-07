import { describe, expect, it } from "vitest";
import {
  appendReview,
  clientTablePeriods,
  isReviewItemKey,
  latestReview,
  MAX_REVIEW_RECORDS,
  monthlyReviewTasks,
  normalizeReviewRecords,
  openPeriods,
  periodMonthName,
  periodStanding,
  periodWithDue,
  recordReview,
  reportPeriod,
  resolvedNote,
  reviewDueText,
  reviewItemsFor,
  reviewResultLine,
  reviewSaveProblem,
  reviewTrimNotice,
  savedResultLine,
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
    expect(trimReviewRecords(plain)).toEqual({ records: plain, removed: 0, replaced: 0 });
    const next = appendReview(plain, {
      key: "bank_statement",
      period: periodOf(1001),
      result: "done",
      ownerName: "Pat",
      notes: "",
    });
    expect(next.removed).toBe(1);
    expect(next.replaced).toBe(0);
    expect(next.records).toHaveLength(MAX_REVIEW_RECORDS);
    expect(next.records.at(-1)).toEqual(plain.at(-2));
    expect(reviewTrimNotice(next)).toBe(
      "Precog keeps up to 1,200 monthly results, so it removed 1 result from the oldest months.",
    );
    expect(reviewTrimNotice({ removed: 400, replaced: 0 })).toBe(
      "Precog keeps up to 1,200 monthly results, so it removed 400 results from the oldest months.",
    );
    expect(reviewTrimNotice({ removed: 1500, replaced: 1497 })).toBe(
      "Precog keeps up to 1,200 monthly results, so it removed 1,497 earlier results that a later one replaced for the same check and month, and 3 results from the oldest months.",
    );
    const loaded = normalizeReviewRecords([...plain, ...plain.slice(0, 20)]);
    expect(loaded).toHaveLength(MAX_REVIEW_RECORDS);
  });

  it("calls a replaced result from this month replaced, not older (RW1-6)", () => {
    // Full, with this month's first check recorded twice: saving another
    // result this month removes a result a later one replaced this month,
    // not one from an old month.
    const month = periodOf(1000);
    const plain = Array.from({ length: MAX_REVIEW_RECORDS - 1 }, (_, i) => ({
      key: CHECKS[i % 4],
      period: periodOf(1000 - Math.floor(i / 4)),
      result: "done" as const,
      ownerName: "Pat",
      notes: "",
      recordedAt: "2026-01-01T00:00:00.000Z",
    }));
    const twice = [{ ...plain[0], result: "exception" as const }, ...plain];
    const next = appendReview(twice, {
      key: CHECKS[1],
      period: month,
      result: "done",
      ownerName: "Pat",
      notes: "",
    });
    expect(next).toMatchObject({ removed: 1, replaced: 1 });
    // The removed result is this month's replaced one: the oldest month stays whole.
    expect(next.records.filter((r) => r.period === month && r.key === CHECKS[1])).toHaveLength(1);
    expect(next.records.at(-1)).toEqual(plain.at(-1));
    expect(reviewTrimNotice(next)).toBe(
      "Precog keeps up to 1,200 monthly results, so it removed 1 earlier result that a later one replaced for the same check and month.",
    );
    expect(reviewTrimNotice(next)).not.toMatch(/older/);
  });
});

describe("open periods", () => {
  it("keeps last month open until its due day, the 10th", () => {
    expect(openPeriods("2026-10-01")).toEqual(["2026-09", "2026-10"]);
    expect(openPeriods("2026-10-10")).toEqual(["2026-09", "2026-10"]);
    expect(openPeriods("2026-10-11")).toEqual(["2026-10"]);
    expect(openPeriods("2027-01-03")).toEqual(["2026-12", "2027-01"]);
    expect(reportPeriod("2026-10-03")).toBe("2026-09");
    expect(reportPeriod("2026-10-11")).toBe("2026-10");
  });

  it("names a period with its due day", () => {
    expect(periodWithDue("2026-09")).toBe("September 2026 (due October 10)");
    expect(periodWithDue("2026-12")).toBe("December 2026 (due January 10)");
    expect(periodMonthName("2026-09")).toBe("September");
    expect(reviewDueText("2026-09")).toBe("October 10");
  });

  it("builds the tasks for the period asked for", () => {
    const tasks = monthlyReviewTasks("2026-10-03", people, {}, "2026-09");
    expect([tasks[0].period, tasks[0].dueOn]).toEqual(["2026-09", "2026-10-10"]);
    // September has no card statement check; it starts in October.
    expect(tasks.map((t) => t.key)).not.toContain("card_statement");
    expect(monthlyReviewTasks("2026-10-03", people)[0].period).toBe("2026-10");
  });

  it("covers last month and this month for every calendar within a day of the server's", () => {
    expect(clientTablePeriods("2026-10-06")).toEqual(["2026-09", "2026-10"]);
    expect(clientTablePeriods("2026-11-01")).toEqual(["2026-09", "2026-10", "2026-11"]);
    expect(clientTablePeriods("2026-10-31")).toEqual(["2026-09", "2026-10", "2026-11"]);
    expect(clientTablePeriods("2027-01-01")).toEqual(["2026-11", "2026-12", "2027-01"]);
  });

  it("counts only Done toward completion and marks a month overdue after its due day", () => {
    const months = [{ period: "2026-09", done: 2, exceptions: 1, skipped: 0 }];
    expect(periodStanding(months, "2026-09", "2026-10-10")).toEqual({
      period: "2026-09",
      total: 4,
      done: 2,
      exceptions: 1,
      skipped: 0,
      overdue: false,
    });
    // One of September's four checks has no result after its due day.
    expect(periodStanding(months, "2026-09", "2026-10-11").overdue).toBe(true);
    expect(periodStanding([{ ...months[0], done: 3 }], "2026-09", "2026-10-11").overdue).toBe(
      false,
    );
    expect(periodStanding([], "2026-10", "2026-10-11")).toMatchObject({ done: 0, total: 5 });
  });

  it("calls a month overdue only when a check has no result by its due day", () => {
    // Every check recorded on time, one as Exception and one as Skipped: not
    // overdue, although only two are Done.
    const recorded = [{ period: "2026-09", done: 2, exceptions: 1, skipped: 1 }];
    expect(periodStanding(recorded, "2026-09", "2026-10-11")).toMatchObject({
      done: 2,
      total: 4,
      overdue: false,
    });
    expect(periodStanding(recorded, "2026-09", "2027-03-01").overdue).toBe(false);
    const skippedAll = [{ period: "2026-09", done: 0, exceptions: 0, skipped: 4 }];
    expect(periodStanding(skippedAll, "2026-09", "2026-10-11").overdue).toBe(false);
  });
});

describe("the deposit and duplicate-payment checks from November 2026", () => {
  it("keeps five checks for October and has seven from November", () => {
    expect(reviewItemsFor("2026-10")).toHaveLength(5);
    expect(reviewItemsFor("2026-11").map((i) => i.key)).toEqual([
      "bank_statement",
      "cleared_checks",
      "payroll_headcount",
      "new_vendors",
      "card_statement",
      "deposits_match",
      "duplicate_payments",
    ]);
    expect(reviewItemsFor("2027-03")).toHaveLength(7);
    const titles = Object.fromEntries(reviewItemsFor("2026-11").map((i) => [i.key, i.title]));
    expect(titles.deposits_match).toBe(
      "Match each deposit to the takings, donations or payments recorded for that day",
    );
    expect(titles.duplicate_payments).toBe("Look for the same invoice paid twice");
  });

  it("counts seven checks toward a November month's completion", () => {
    expect(periodStanding([], "2026-11", "2026-12-11")).toMatchObject({
      total: 7,
      overdue: true,
    });
    expect(
      periodStanding(
        [{ period: "2026-11", done: 5, exceptions: 0, skipped: 0 }],
        "2026-11",
        "2026-12-11",
      ).overdue,
    ).toBe(true);
  });

  it("gives every sample business a reviewer for each new check", () => {
    for (const { id } of INDUSTRIES) {
      const tpl = getIndustryTemplate(id);
      const tasks = monthlyReviewTasks("2026-11-05", tpl.people, tpl.roleTemplates);
      expect(tasks).toHaveLength(7);
      for (const key of ["deposits_match", "duplicate_payments"]) {
        const task = tasks.find((t) => t.key === key);
        expect(tpl.people.some((p) => p.name === task?.suggestedOwner)).toBe(true);
      }
    }
  });

  it("loads saved results for the new checks", () => {
    expect(isReviewItemKey("deposits_match")).toBe(true);
    expect(isReviewItemKey("duplicate_payments")).toBe(true);
    const saved = normalizeReviewRecords([
      {
        key: "duplicate_payments",
        period: "2026-11",
        result: "done",
        ownerName: "Ada",
        notes: "",
        recordedAt: "2026-12-02T00:00:00.000Z",
      },
    ]);
    expect(saved.map((r) => r.key)).toEqual(["duplicate_payments"]);
  });
});

describe("what a monthly result needs before Precog saves it", () => {
  it("asks who did the check", () => {
    expect(reviewSaveProblem({ result: "done", ownerName: " ", notes: "Read it" })).toBe(
      "Choose who did this check.",
    );
  });

  it("refuses an Exception with a blank note", () => {
    expect(reviewSaveProblem({ result: "exception", ownerName: "Dana", notes: "  " })).toBe(
      "Say what you found.",
    );
    expect(
      reviewSaveProblem({ result: "exception", ownerName: "Dana", notes: "Paid ACME twice" }),
    ).toBeNull();
  });

  it("takes Done and Skipped without a note", () => {
    expect(reviewSaveProblem({ result: "done", ownerName: "Dana", notes: "" })).toBeNull();
    expect(reviewSaveProblem({ result: "skipped", ownerName: "Dana", notes: "" })).toBeNull();
  });
});

describe("savedResultLine", () => {
  it("says what was saved, by whom and on which day", () => {
    expect(
      savedResultLine(
        {
          result: "done",
          ownerName: "Dana",
          notes: "",
          recordedAt: "2026-10-07T15:00:00.000Z",
        },
        "2026-10-07",
      ),
    ).toBe("Saved: Done by Dana on Oct 7");
    expect(
      savedResultLine(
        {
          result: "exception",
          ownerName: "Dana",
          notes: "Paid ACME twice",
          recordedAt: "2026-10-07T15:00:00.000Z",
        },
        "2027-01-04",
      ),
    ).toBe("Saved: Exception by Dana on Oct 7, 2026 — Paid ACME twice");
  });

  it("leaves out an empty name", () => {
    expect(
      savedResultLine(
        { result: "skipped", ownerName: "", notes: "", recordedAt: "2026-10-07T15:00:00.000Z" },
        "2026-10-07",
      ),
    ).toBe("Saved: Skipped on Oct 7");
  });
});

describe("resolvedNote", () => {
  it("records what resolved the problem, or the problem itself when nothing was typed", () => {
    expect(resolvedNote("Refund received", "Paid ACME twice")).toBe("Resolved: Refund received");
    expect(resolvedNote("  ", "Paid ACME twice")).toBe("Resolved: Paid ACME twice");
    expect(resolvedNote("", "")).toBe("Resolved");
  });
});
