import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  latestReview,
  MONTHLY_REVIEW_GRACE_DAY,
  monthlyReviewTasks,
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
  groupNeedsAttentionItems,
  openNeedsAttentionItem,
} from "./needs-attention-menu.logic";
import { NeedsAttentionList, NeedsAttentionMenu } from "./needs-attention-menu";

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
    awaitingVersionId: null,
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

/** A team of two: Dana owns the business and enters payroll; Lisa adds vendors. */
const dana = {
  id: "dana",
  name: "Dana",
  role: "Owner",
  active: true,
  owner: true,
  entitlements: ["enter_payroll"],
} as Person;
const lisa = {
  id: "lisa",
  name: "Lisa",
  role: "Office manager",
  active: true,
  entitlements: ["create_vendor"],
} as Person;

const none = { overdue: [], slipped: [], leavers: 0, reviews: [] };

describe("Needs attention menu", () => {
  it("makes the header button 44px tall on a touch screen, and keeps its mouse size", () => {
    const button = /<button[^>]*data-needs-attention[^>]*class="([^"]*)"/.exec(view());
    const classes = button?.[1].split(" ") ?? [];
    expect(classes).toContain("pointer-coarse:min-h-11");
    expect(classes).toContain("py-1");
  });

  it("on the 1st with no results, counts only the month that is due, with its due day", () => {
    const items = buildNeedsAttentionItems({ ...none, day: "2026-10-01", people: [state.owner] });
    expect(items.map(({ id, n, text, who }) => [id, n, text, who])).toEqual([
      ["monthly-Owner", 4, "4 checks for September, due October 10", "Owner"],
    ]);
  });

  it("from the 5th to the 10th still counts only last month's checks, not this month's", () => {
    const items = buildNeedsAttentionItems({ ...none, day: "2026-10-07", people: [state.owner] });
    expect(items.map((item) => item.text)).toEqual(["4 checks for September, due October 10"]);
    // After the 10th, this month is the one due.
    const later = buildNeedsAttentionItems({ ...none, day: "2026-10-11", people: [state.owner] });
    expect(later.map((item) => item.text)).toEqual(["5 checks for October, due November 10"]);
  });

  it("counts exceptions from both open months, one item for each check, opening that check", () => {
    const reviews = [
      result("cleared_checks", "2026-10", "exception"),
      result("bank_statement", "2026-09", "exception"),
      result("new_vendors", "2026-09", "done"),
    ];
    const items = buildNeedsAttentionItems({
      ...none,
      day: "2026-10-07",
      people: [state.owner],
      reviews,
    });
    expect(items.map(({ id, n, text, item }) => [id, n, text, item])).toEqual([
      [
        "monthly-Owner",
        2,
        "2 checks for September, due October 10",
        "check-2026-09-cleared_checks",
      ],
      [
        "exception-2026-09-bank_statement",
        1,
        "Resolve the September exception: Open the bank statement",
        "check-2026-09-bank_statement",
      ],
      [
        "exception-2026-10-cleared_checks",
        1,
        "Resolve the October exception: Read the cleared-check images",
        "check-2026-10-cleared_checks",
      ],
    ]);
    const onOpen = vi.fn();
    openNeedsAttentionItem(items[2], onOpen);
    expect(onOpen).toHaveBeenCalledWith("monthly", "check-2026-10-cleared_checks");
  });

  it("splits the checks by the person each is suggested for and groups every item by person", () => {
    const day = "2026-10-07";
    const items = buildNeedsAttentionItems({
      day,
      people: [dana, lisa],
      overdue: [{ linkedPersonId: "lisa" }, {}],
      slipped: [{ linkedPersonId: "someone-gone" }],
      leavers: 1,
      reviews: [],
    });
    // Each check counts under the person the Monthly review suggests for it.
    const tasks = monthlyReviewTasks(day, [dana, lisa], {}, "2026-09");
    for (const task of tasks) {
      const mine = items.find((item) => item.id === `monthly-${task.suggestedOwner}`);
      expect(mine?.who).toBe(task.suggestedOwner);
    }
    expect(tasks.find((t) => t.key === "payroll_headcount")?.suggestedOwner).toBe("Lisa");
    expect(tasks.find((t) => t.key === "new_vendors")?.suggestedOwner).toBe("Dana");
    const groups = groupNeedsAttentionItems(items, [dana, lisa]);
    expect(groups.map((g) => g.heading)).toEqual(["Dana", "Lisa", "Unassigned"]);
    const lisaGroup = groups[1].items.map((item) => item.text);
    expect(lisaGroup).toContain("1 decision to review");
    // A decision about nobody, or about someone not on the team, and the leaver check go to Unassigned.
    expect(groups[2].items.map((item) => item.text)).toEqual([
      "1 decision to review",
      "1 decision undone since you marked it done",
      "1 person who left: check their access",
    ]);
    // Nothing is lost or counted twice.
    const total = (list: readonly { n: number }[]) => list.reduce((n, i) => n + i.n, 0);
    expect(total(groups.flatMap((g) => g.items))).toBe(total(items));
    expect(total(items.filter((i) => i.id.startsWith("monthly-")))).toBe(4);
  });

  it("shows last month's checks before the 5th, while last month is still open", () => {
    state.today = new Date(2026, 9, 4);
    expect(view()).toContain("Needs attention (4)");
    // On a phone the words hide behind the bell but stay for screen readers.
    const compact = renderToStaticMarkup(
      <NeedsAttentionMenu compactOnPhone onOpen={() => undefined} />,
    );
    expect(compact).toContain('class="sr-only sm:not-sr-only">Needs attention </span>(4)');
    state.records = all("2026-09", "done");
    expect(view()).toBe("");
  });

  it("counts last month alone through the 10th, and this month alone after it", () => {
    state.today = new Date(2026, 9, 5);
    expect(view()).toContain("Needs attention (4)");
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
      ...none,
      day: "2026-10-07",
      people: [state.owner],
      reviews: [...all("2026-09", "done"), ...all("2026-10", "done")],
      leavers: 1,
    });
    const onOpen = vi.fn();

    openNeedsAttentionItem(leavers, onOpen);

    expect(onOpen).toHaveBeenCalledWith("knowledge", "leaving");
  });

  it("opens the checks not done at the first one and keeps journal reminders on their alias", () => {
    const items = buildNeedsAttentionItems({
      ...none,
      day: "2026-10-07",
      people: [state.owner],
      overdue: [{}],
      reviews: [result("bank_statement", "2026-09", "done")],
    });
    const onOpen = vi.fn();

    openNeedsAttentionItem(
      items.find((item) => item.id === "monthly-Owner")!,
      onOpen,
    );
    expect(onOpen).toHaveBeenLastCalledWith("monthly", "check-2026-09-cleared_checks");

    openNeedsAttentionItem(
      items.find((item) => item.id === "overdue-")!,
      onOpen,
    );
    expect(onOpen).toHaveBeenLastCalledWith("journal");
  });

  it("renders each person's heading over their rows, each a menu item at least 44px tall on touch", () => {
    const items = buildNeedsAttentionItems({
      ...none,
      day: "2026-10-07",
      people: [dana, lisa],
      leavers: 1,
    });
    const html = renderToStaticMarkup(
      <NeedsAttentionList
        groups={groupNeedsAttentionItems(items, [dana, lisa])}
        onPick={() => {}}
      />,
    );
    expect(html.match(/role="group"/g)).toHaveLength(3);
    expect(html).toMatch(/role="group" aria-labelledby="([^"]+)"><div id="\1"[^>]*>Dana</);
    expect(html).toContain(">Unassigned<");
    const rows = html.match(/<button[^>]*role="menuitem"[^>]*>/g) ?? [];
    expect(rows).toHaveLength(items.length);
    for (const row of rows) expect(row).toContain("pointer-coarse:min-h-11");
  });
});
