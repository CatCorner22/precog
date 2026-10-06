import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  latestReview,
  MONTHLY_REVIEW_GRACE_DAY,
  openMonthlyChecks,
  periodStanding,
  reviewItemsFor,
  type PeriodResults,
  type ReviewRecord,
  type ReviewResult,
} from "@/lib/precog/firm/reviews";
import type { ClientEngagementRow } from "@/lib/precog/firm/store";
import type { Person } from "@/lib/precog/types";
import { clientTotals } from "./firm/client-table-csv";
import {
  buildNeedsAttentionItems,
  monthlyAttentionItems,
  openNeedsAttentionItem,
} from "./needs-attention-menu.logic";
import { NeedsAttentionMenu } from "./needs-attention-menu";

const state = vi.hoisted(() => ({
  today: new Date(2026, 9, 5),
  records: [] as ReviewRecord[],
  owner: {
    id: "owner",
    name: "Owner",
    role: "Owner",
    active: true,
    owner: true,
    entitlements: ["enter_payroll", "sign_checks", "bank_reconcile", "create_vendor"],
  } as Person,
}));
vi.mock("@/lib/use-today", () => ({ useToday: () => state.today }));
vi.mock("@/lib/precog/practice-context", async () => {
  const { getIndustryTemplate: template } = await import("@/lib/precog/templates");
  const tpl = { ...template("general"), people: [state.owner], roleTemplates: {} };
  return {
    useTemplate: () => tpl,
    usePracticeState: () => ({
      profile: {
        industry: "general",
        decisions: [],
        leaverAccessChecks: [],
        monthlyReviews: state.records,
      },
    }),
  };
});

const view = () => renderToStaticMarkup(<NeedsAttentionMenu onOpen={() => undefined} />);

/** One monthly result, as the Monthly review saves it (the list is newest first). */
function result(
  key: ReviewRecord["key"],
  period: string,
  outcome: ReviewResult,
  recordedAt = `${period}-28T12:00:00Z`,
): ReviewRecord {
  return { key, period, result: outcome, ownerName: "Owner", notes: "", recordedAt };
}

/** Every check of `period` with the same result. */
function all(period: string, outcome: ReviewResult): ReviewRecord[] {
  return reviewItemsFor(period).map((item) => result(item.key, period, outcome));
}

/** The firm's client-table row for a business with this monthly log, counted as the server counts it. */
function firmRow(records: readonly ReviewRecord[]): ClientEngagementRow {
  const months: PeriodResults[] = ["2026-09", "2026-10"].map((period) => {
    const latest = reviewItemsFor(period).map(
      (item) => latestReview(records, item.key, period)?.result,
    );
    const tally = (outcome: ReviewResult) => latest.filter((r) => r === outcome).length;
    return {
      period,
      done: tally("done"),
      exceptions: tally("exception"),
      skipped: tally("skipped"),
    };
  });
  return {
    id: "biz_1",
    name: "North Dental",
    ownerUserId: "owner",
    shared: false,
    startedAt: null,
    mapCompletedAt: null,
    reportSentAt: null,
    openFindings: 0,
    acceptedFindings: 0,
    lastReviewAt: null,
    ownerEmail: null,
    ownerEmailStatus: null,
    status: "active",
    endedAt: null,
    granted: false,
    months,
    awaitingReview: 0,
  };
}

beforeEach(() => {
  state.records = [];
  state.today = new Date(2026, 9, 5);
});

describe("open monthly checks", () => {
  it("counts last month through its due day, the 10th, and this month from the 5th", () => {
    expect(MONTHLY_REVIEW_GRACE_DAY).toBe(5);
    // September (four checks, due Oct 10) is still open; October's checks wait for the 5th.
    expect(openMonthlyChecks("2026-10-04", [])).toEqual([
      { period: "2026-09", notDone: 4, exceptions: 0 },
    ]);
    expect(openMonthlyChecks("2026-10-05", [])).toEqual([
      { period: "2026-09", notDone: 4, exceptions: 0 },
      { period: "2026-10", notDone: 5, exceptions: 0 },
    ]);
    expect(openMonthlyChecks("2026-10-10", [])).toHaveLength(2);
    // After September's due day, this month alone.
    expect(openMonthlyChecks("2026-10-11", [])).toEqual([
      { period: "2026-10", notDone: 5, exceptions: 0 },
    ]);
  });

  it("closes a check only with Done: Skipped is not done, and an Exception waits to be resolved", () => {
    const records = [
      result("bank_statement", "2026-10", "done"),
      result("payroll_headcount", "2026-09", "skipped"),
      result("cleared_checks", "2026-09", "exception"),
      result("bank_statement", "2026-09", "done"),
    ];
    expect(openMonthlyChecks("2026-10-07", records)).toEqual([
      { period: "2026-09", notDone: 2, exceptions: 1 },
      { period: "2026-10", notDone: 4, exceptions: 0 },
    ]);
    // The latest result counts: Done after the Exception resolves it.
    const resolved = [
      result("cleared_checks", "2026-09", "done", "2026-10-06T09:00:00Z"),
      ...records,
    ];
    expect(openMonthlyChecks("2026-10-07", resolved)[0]).toEqual({
      period: "2026-09",
      notDone: 2,
      exceptions: 0,
    });
    // A month whose every check is Done waits on nothing and is left out.
    expect(openMonthlyChecks("2026-10-07", all("2026-09", "done"))).toEqual([
      { period: "2026-10", notDone: 5, exceptions: 0 },
    ]);
    expect(
      openMonthlyChecks("2026-10-07", [...all("2026-10", "done"), ...all("2026-09", "done")]),
    ).toEqual([]);
  });

  it("counts each month as the firm's client table does, on Oct 7 and Oct 11", () => {
    const scenarios: ReviewRecord[][] = [
      [],
      [...all("2026-10", "done"), ...all("2026-09", "done")],
      // Every check has a result, but only some are Done.
      [...all("2026-10", "skipped"), ...all("2026-09", "exception")],
      [
        result("card_statement", "2026-10", "exception"),
        result("bank_statement", "2026-10", "done"),
        result("new_vendors", "2026-09", "skipped"),
        result("bank_statement", "2026-09", "done"),
      ],
      [...all("2026-10", "done"), result("cleared_checks", "2026-09", "exception")],
    ];
    for (const records of scenarios) {
      const row = firmRow(records);
      for (const day of ["2026-10-07", "2026-10-11"]) {
        const open = openMonthlyChecks(day, records);
        // This month counts exactly when the table counts its review open.
        const tableOpen = /^1 client · 1 with this month's review open/.test(
          clientTotals([row], day),
        );
        expect(open.some((m) => m.period === "2026-10")).toBe(tableOpen);
        // Each month counted waits on every check the table does not count Done,
        // and names the table's exceptions as exceptions.
        for (const month of open) {
          const standing = periodStanding(row.months, month.period, day);
          expect(month.notDone + month.exceptions).toBe(standing.total - standing.done);
          expect(month.exceptions).toBe(standing.exceptions);
        }
        // Last month counts through its due day only: on Oct 11 the table
        // shows September as it stands (Overdue when a check has no result),
        // and the owner can no longer record it.
        const september = periodStanding(row.months, "2026-09", day);
        expect(open.some((m) => m.period === "2026-09")).toBe(
          day === "2026-10-07" && september.done < september.total,
        );
      }
    }
  });
});

describe("Needs attention menu", () => {
  it("names checks not done and exceptions to resolve as separate items", () => {
    expect(
      monthlyAttentionItems([
        { period: "2026-09", notDone: 2, exceptions: 1 },
        { period: "2026-10", notDone: 4, exceptions: 0 },
      ]).map(({ id, n, text, target }) => [id, n, text, target]),
    ).toEqual([
      ["monthly", 6, "6 Monthly review checks not done", "monthly"],
      ["monthly-exceptions", 1, "1 Monthly review exception to resolve", "monthly"],
    ]);
    expect(monthlyAttentionItems([{ period: "2026-10", notDone: 1, exceptions: 2 }])).toEqual([
      {
        id: "monthly",
        n: 1,
        text: "1 Monthly review check not done",
        target: "monthly",
        item: "checks",
      },
      {
        id: "monthly-exceptions",
        n: 2,
        text: "2 Monthly review exceptions to resolve",
        target: "monthly",
        item: "checks",
      },
    ]);
  });

  it("shows last month's checks before the 5th, while last month is still open", () => {
    state.today = new Date(2026, 9, 4);
    expect(view()).toContain("Needs attention (4)");
    state.records = all("2026-09", "done");
    expect(view()).toBe("");
  });

  it("counts both open months from the 5th, and this month alone after the 10th", () => {
    state.today = new Date(2026, 9, 5);
    expect(view()).toContain("Needs attention (9)");
    state.records = [
      result("cleared_checks", "2026-10", "exception"),
      result("payroll_headcount", "2026-10", "skipped"),
    ];
    state.today = new Date(2026, 9, 11);
    // October's five checks: four not done (one of them Skipped) and one exception.
    expect(view()).toContain("Needs attention (5)");
  });

  it("opens a leaver reminder at the leaving section", () => {
    const [leavers] = buildNeedsAttentionItems({
      overdue: 0,
      slipped: 0,
      leavers: 1,
      months: [],
    });
    const onOpen = vi.fn();

    openNeedsAttentionItem(leavers, onOpen);

    expect(onOpen).toHaveBeenCalledWith("knowledge", "leaving");
  });

  it("opens monthly reminders at checks and keeps journal reminders on their alias", () => {
    const items = buildNeedsAttentionItems({
      overdue: 1,
      slipped: 1,
      leavers: 0,
      months: [{ period: "2026-10", notDone: 1, exceptions: 1 }],
    });
    const onOpen = vi.fn();

    openNeedsAttentionItem(
      items.find((item) => item.id === "monthly")!,
      onOpen,
    );
    expect(onOpen).toHaveBeenLastCalledWith("monthly", "checks");

    openNeedsAttentionItem(
      items.find((item) => item.id === "monthly-exceptions")!,
      onOpen,
    );
    expect(onOpen).toHaveBeenLastCalledWith("monthly", "checks");

    openNeedsAttentionItem(
      items.find((item) => item.id === "overdue")!,
      onOpen,
    );
    expect(onOpen).toHaveBeenLastCalledWith("journal");
  });
});
