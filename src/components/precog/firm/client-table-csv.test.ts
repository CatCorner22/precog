import { afterAll, describe, expect, it, vi } from "vitest";
import type { ClientEngagementRow } from "@/lib/precog/firm/store";
import type { PeriodResults } from "@/lib/precog/firm/reviews";
import {
  CLIENT_TABLE_CSV_HEADER,
  clientStatusText,
  clientTableCsv,
  clientTableFileName,
  clientTotals,
  DEFAULT_CLIENT_SORT,
  exceptionsText,
  lastMonthStanding,
  lastMonthText,
  skippedText,
  sortClients,
  thisMonthText,
  withEngagementStatus,
  type ClientSort,
} from "./client-table-csv";

/** September and October counts, as the server returns them around Oct 12. */
function months(
  september: Partial<PeriodResults> = {},
  october: Partial<PeriodResults> = {},
): PeriodResults[] {
  return [
    { period: "2026-09", done: 4, exceptions: 0, skipped: 0, ...september },
    { period: "2026-10", done: 3, exceptions: 0, skipped: 0, ...october },
  ];
}

function row(over: Partial<ClientEngagementRow> = {}): ClientEngagementRow {
  return {
    id: "biz_1",
    name: "North Dental",
    ownerUserId: "u1",
    shared: false,
    startedAt: null,
    mapCompletedAt: null,
    reportSentAt: null,
    openFindings: 2,
    acceptedFindings: 0,
    lastReviewAt: "2026-10-03T15:00:00.000Z",
    ownerEmail: "owner@north.test",
    ownerEmailStatus: "confirmed",
    status: "active",
    endedAt: null,
    granted: false,
    months: months(),
    awaitingReview: 1,
    ...over,
  };
}

const today = "2026-10-12";

describe("client table CSV", () => {
  it("names the columns verbatim on the first line", () => {
    expect(CLIENT_TABLE_CSV_HEADER).toBe(
      "id,client,status,ended_on,last_review,last_month,last_month_done,last_month_total,last_month_overdue,this_month,this_month_done,this_month_total,exceptions_last_month,exceptions_this_month,skipped_last_month,skipped_this_month,open_duty_conflicts,awaiting_review,owner_email_status",
    );
    expect(clientTableCsv([], today).split("\n")[0]).toBe(CLIENT_TABLE_CSV_HEADER);
  });

  it("writes one line per client with days, months, counts and empty cells for none", () => {
    const csv = clientTableCsv(
      [
        row(),
        row({
          id: "biz_2",
          name: "South Clinic",
          status: "ended",
          endedAt: "2026-09-30T12:00:00.000Z",
          lastReviewAt: null,
          openFindings: null,
          ownerEmail: null,
          ownerEmailStatus: null,
          months: months({ done: 1, exceptions: 2, skipped: 1 }, { done: 0, exceptions: 1 }),
          awaitingReview: 0,
        }),
      ],
      today,
    );
    expect(csv.split("\n")).toEqual([
      CLIENT_TABLE_CSV_HEADER,
      "biz_1,North Dental,active,,2026-10-03,2026-09,4,4,no,2026-10,3,5,0,0,0,0,2,1,confirmed",
      "biz_2,South Clinic,ended,2026-09-30,,2026-09,1,4,yes,2026-10,0,5,2,1,1,0,,0,",
      "",
    ]);
  });

  it("keeps last month open, not overdue, until its due day", () => {
    const late = row({ months: months({ done: 1 }) });
    expect(clientTableCsv([late], "2026-10-10").split("\n")[1]).toContain(",2026-09,1,4,no,");
    expect(clientTableCsv([late], "2026-10-11").split("\n")[1]).toContain(",2026-09,1,4,yes,");
  });

  it("quotes commas and quotes, and keeps a formula-like name as text", () => {
    const csv = clientTableCsv(
      [row({ name: 'Smith, Jones & "Co"' }), row({ id: "biz_3", name: "=HYPERLINK(1)" })],
      today,
    );
    const [, first, second] = csv.split("\n");
    expect(first.startsWith('biz_1,"Smith, Jones & ""Co""",active,')).toBe(true);
    expect(second.startsWith("biz_3,'=HYPERLINK(1),active,")).toBe(true);
  });

  it("names the file after the firm", () => {
    expect(clientTableFileName("North Advisors LLP")).toBe("north-advisors-llp-clients.csv");
    expect(clientTableFileName("")).toBe("clients.csv");
  });
});

describe("client table cells", () => {
  it("counts only Done toward last month and this month", () => {
    expect(thisMonthText(row(), today)).toBe("3 of 5 done");
    expect(thisMonthText(row({ months: months({}, { done: 0 }) }), today)).toBe("0 of 5 done");
    // September 2026 had four checks; the card statement check starts in October.
    expect(lastMonthText(row(), today)).toBe("4 of 4 done");
    // Two Skipped and two Exception results leave nothing Done.
    const none = row({ months: months({ done: 0, exceptions: 2, skipped: 2 }) });
    expect(lastMonthText(none, today)).toBe("0 of 4 done");
    expect(exceptionsText(none, today)).toBe("2 last month");
    expect(skippedText(none, today)).toBe("2 last month");
  });

  it("marks last month overdue only after its due day, the 10th", () => {
    const open = row({ months: months({ done: 3 }) });
    expect(lastMonthStanding(open, "2026-10-10").overdue).toBe(false);
    expect(lastMonthStanding(open, "2026-10-11").overdue).toBe(true);
    expect(lastMonthStanding(row(), "2026-10-11").overdue).toBe(false);
  });

  it("reads the viewer's own months from the counts", () => {
    // On Nov 2 the viewer's last month is October and this month is November.
    const november = row({
      months: [...months(), { period: "2026-11", done: 1, exceptions: 1, skipped: 0 }],
    });
    expect(lastMonthText(november, "2026-11-02")).toBe("3 of 5 done");
    expect(thisMonthText(november, "2026-11-02")).toBe("1 of 5 done");
    expect(exceptionsText(november, "2026-11-02")).toBe("1 this month");
  });

  it("names the month of each exception and skip, or says None", () => {
    expect(exceptionsText(row(), today)).toBe("None");
    expect(skippedText(row(), today)).toBe("None");
    const both = row({ months: months({ exceptions: 1, skipped: 2 }, { exceptions: 2 }) });
    expect(exceptionsText(both, today)).toBe("1 last month, 2 this month");
    expect(skippedText(both, today)).toBe("2 last month");
  });

  it("says Active, or Ended with the day", () => {
    expect(clientStatusText(row())).toBe("Active");
    expect(clientStatusText(row({ status: "ended", endedAt: "2026-09-30T12:00:00.000Z" }))).toMatch(
      /^Ended Sep (29|30), 2026$/,
    );
    expect(clientStatusText(row({ status: "ended", endedAt: null }))).toBe("Ended");
  });

  describe("west of UTC", () => {
    const tz = process.env.TZ;
    afterAll(() => {
      if (tz === undefined) delete process.env.TZ;
      else process.env.TZ = tz;
      vi.resetModules();
    });

    it("prints the same end day in the table and the CSV", async () => {
      // A fresh copy of the module, so its day format reads the New York clock.
      process.env.TZ = "America/New_York";
      vi.resetModules();
      const m = await import("./client-table-csv");
      // 9 pm on Sep 30 in New York is already Oct 1 in UTC.
      const ended = row({ status: "ended", endedAt: "2026-10-01T01:00:00.000Z" });
      expect(m.clientStatusText(ended)).toBe("Ended Sep 30, 2026");
      expect(m.clientTableCsv([ended], today).split("\n")[1]).toBe(
        "biz_1,North Dental,ended,2026-09-30,2026-10-03,2026-09,4,4,no,2026-10,3,5,0,0,0,0,2,1,confirmed",
      );
    });
  });

  it("takes the engagement the card returned into that client's row only", () => {
    const clients = [
      row(),
      row({ id: "biz_2", name: "South Clinic" }),
      row({ ownerUserId: "u2", name: "Same Id Elsewhere" }),
    ];
    const ended = withEngagementStatus(clients, clients[0], {
      status: "ended",
      endedAt: "2026-10-04T15:00:00.000Z",
    });
    expect(ended.map((c) => [c.status, c.endedAt])).toEqual([
      ["ended", "2026-10-04T15:00:00.000Z"],
      ["active", null],
      ["active", null],
    ]);
    // The totals stop counting its month as open; reopening counts it again.
    expect(clientTotals(clients, today)).toMatch(/^3 clients · 3 with/);
    expect(clientTotals(ended, today)).toMatch(/^3 clients · 2 with/);
    const reopened = withEngagementStatus(ended, clients[0], { status: "active", endedAt: null });
    expect(reopened.map((c) => c.status)).toEqual(["active", "active", "active"]);
    expect(clientStatusText(reopened[0])).toBe("Active");
  });

  it("totals clients, open months from the 5th, overdue last months, exceptions and versions awaiting review", () => {
    const clients = [
      row({ awaitingReview: 1 }),
      row({ id: "b2", months: months({}, { done: 5 }), awaitingReview: 0 }),
      row({
        id: "b3",
        months: months({ done: 2, exceptions: 1 }, { done: 0 }),
        awaitingReview: 2,
      }),
      row({
        id: "b4",
        months: months({ done: 0 }, { done: 0 }),
        awaitingReview: 0,
        status: "ended",
      }),
    ];
    expect(clientTotals(clients, today)).toBe(
      "4 clients · 2 with this month's review open · 1 with last month overdue · 1 with exceptions · 3 versions awaiting review",
    );
    expect(clientTotals(clients, "2026-10-04")).toBe(
      "4 clients · 0 with this month's review open · 0 with last month overdue · 1 with exceptions · 3 versions awaiting review",
    );
    // Five results with any Exception or Skip among them do not close the month.
    const notDone = row({ months: months({}, { done: 4, exceptions: 1 }), awaitingReview: 1 });
    expect(clientTotals([notDone], today)).toBe(
      "1 client · 1 with this month's review open · 0 with last month overdue · 1 with exceptions · 1 version awaiting review",
    );
    expect(clientTotals([row({ months: months({}, { done: 5 }) })], today)).toBe(
      "1 client · 0 with this month's review open · 0 with last month overdue · 0 with exceptions · 1 version awaiting review",
    );
  });
});

describe("client table sort", () => {
  const clients = [
    row({
      id: "b",
      name: "beta",
      lastReviewAt: null,
      openFindings: null,
      months: months({}, { done: 5, skipped: 0 }),
    }),
    row({
      id: "a",
      name: "Alpha",
      openFindings: 4,
      months: months({ done: 1 }, { done: 0, skipped: 2 }),
      awaitingReview: 0,
    }),
    row({
      id: "c",
      name: "Cedar",
      status: "ended",
      endedAt: "2026-09-01T12:00:00.000Z",
      lastReviewAt: "2026-10-05T12:00:00.000Z",
      openFindings: 0,
      months: months({ exceptions: 0 }, { done: 2, exceptions: 1, skipped: 1 }),
      awaitingReview: 3,
    }),
  ];
  const order = (key: ClientSort["key"], dir: ClientSort["dir"] = "asc") =>
    sortClients(clients, { key, dir }, today).map((c) => c.id);

  it("sorts by any column, both ways, ties by name", () => {
    expect(order("client")).toEqual(["a", "b", "c"]);
    expect(order("client", "desc")).toEqual(["c", "b", "a"]);
    expect(order("status")).toEqual(["a", "b", "c"]);
    expect(order("status", "desc")).toEqual(["c", "a", "b"]);
    expect(order("lastReview")).toEqual(["b", "a", "c"]);
    // Alpha's September is overdue on Oct 12, so it sorts below every other.
    expect(order("lastMonth")).toEqual(["a", "b", "c"]);
    expect(order("thisMonth")).toEqual(["a", "c", "b"]);
    expect(order("exceptions", "desc")).toEqual(["c", "a", "b"]);
    expect(order("skipped", "desc")).toEqual(["a", "c", "b"]);
    expect(order("conflicts")).toEqual(["b", "c", "a"]);
    expect(order("awaiting", "desc")).toEqual(["c", "b", "a"]);
  });

  it("opens with the clients that reported exceptions on top, the rest by name", () => {
    expect(DEFAULT_CLIENT_SORT).toEqual({ key: "exceptions", dir: "desc" });
    expect(sortClients(clients, DEFAULT_CLIENT_SORT, today).map((c) => c.id)).toEqual([
      "c",
      "a",
      "b",
    ]);
  });
});
