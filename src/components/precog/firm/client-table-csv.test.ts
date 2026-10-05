import { describe, expect, it } from "vitest";
import type { ClientEngagementRow } from "@/lib/precog/firm/store";
import {
  CLIENT_TABLE_CSV_HEADER,
  clientStatusText,
  clientTableCsv,
  clientTableFileName,
  clientTotals,
  sortClients,
  thisMonthText,
  type ClientSort,
} from "./client-table-csv";

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
    period: "2026-10",
    thisMonthRecorded: 3,
    awaitingReview: 1,
    ...over,
  };
}

describe("client table CSV", () => {
  it("names the columns verbatim on the first line", () => {
    expect(CLIENT_TABLE_CSV_HEADER).toBe(
      "id,client,status,ended_on,last_review,this_month_recorded,this_month_total,open_duty_conflicts,awaiting_review,owner_email_status",
    );
    expect(clientTableCsv([]).split("\n")[0]).toBe(CLIENT_TABLE_CSV_HEADER);
  });

  it("writes one line per client with days, counts and empty cells for none", () => {
    const csv = clientTableCsv([
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
        period: "2026-09",
        thisMonthRecorded: 0,
        awaitingReview: 0,
      }),
    ]);
    expect(csv.split("\n")).toEqual([
      CLIENT_TABLE_CSV_HEADER,
      "biz_1,North Dental,active,,2026-10-03,3,5,2,1,confirmed",
      "biz_2,South Clinic,ended,2026-09-30,,0,4,,0,",
      "",
    ]);
  });

  it("quotes commas and quotes, and keeps a formula-like name as text", () => {
    const csv = clientTableCsv([
      row({ name: 'Smith, Jones & "Co"' }),
      row({ id: "biz_3", name: "=HYPERLINK(1)" }),
    ]);
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
  it("prints the four This month forms", () => {
    const today = "2026-10-12";
    expect(thisMonthText(row({ thisMonthRecorded: 5 }), today)).toBe("Done");
    expect(thisMonthText(row({ thisMonthRecorded: 0 }), today)).toBe("Not started");
    expect(thisMonthText(row({ thisMonthRecorded: 3 }), today)).toBe("3 of 5 recorded");
    // The month's checks are due on the 10th of the next month, as the
    // Monthly review says; after it, the open ones are overdue.
    expect(thisMonthText(row({ thisMonthRecorded: 3 }), "2026-11-10")).toBe("3 of 5 recorded");
    expect(thisMonthText(row({ thisMonthRecorded: 3 }), "2026-11-11")).toBe("2 overdue");
    expect(thisMonthText(row({ thisMonthRecorded: 0 }), "2026-11-11")).toBe("5 overdue");
    expect(thisMonthText(row({ thisMonthRecorded: 5 }), "2026-11-11")).toBe("Done");
    // September 2026 had four checks; the card statement check starts in October.
    expect(thisMonthText(row({ period: "2026-09", thisMonthRecorded: 2 }), "2026-09-20")).toBe(
      "2 of 4 recorded",
    );
  });

  it("says Active, or Ended with the day", () => {
    expect(clientStatusText(row())).toBe("Active");
    expect(clientStatusText(row({ status: "ended", endedAt: "2026-09-30T12:00:00.000Z" }))).toMatch(
      /^Ended Sep (29|30), 2026$/,
    );
    expect(clientStatusText(row({ status: "ended", endedAt: null }))).toBe("Ended");
  });

  it("totals clients, open months from the 5th and versions awaiting review", () => {
    const clients = [
      row({ thisMonthRecorded: 3, awaitingReview: 1 }),
      row({ id: "b2", thisMonthRecorded: 5, awaitingReview: 0 }),
      row({ id: "b3", thisMonthRecorded: 0, awaitingReview: 2 }),
      row({ id: "b4", thisMonthRecorded: 0, awaitingReview: 0, status: "ended" }),
    ];
    expect(clientTotals(clients, "2026-10-12")).toBe(
      "4 clients · 2 with this month's review open · 3 versions awaiting review",
    );
    expect(clientTotals(clients, "2026-10-04")).toBe(
      "4 clients · 0 with this month's review open · 3 versions awaiting review",
    );
    expect(clientTotals([row({ thisMonthRecorded: 5, awaitingReview: 1 })], "2026-10-12")).toBe(
      "1 client · 0 with this month's review open · 1 version awaiting review",
    );
  });
});

describe("client table sort", () => {
  const today = "2026-10-12";
  const clients = [
    row({ id: "b", name: "beta", lastReviewAt: null, openFindings: null, thisMonthRecorded: 5 }),
    row({ id: "a", name: "Alpha", openFindings: 4, thisMonthRecorded: 0, awaitingReview: 0 }),
    row({
      id: "c",
      name: "Cedar",
      status: "ended",
      endedAt: "2026-09-01T12:00:00.000Z",
      lastReviewAt: "2026-10-05T12:00:00.000Z",
      openFindings: 0,
      thisMonthRecorded: 2,
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
    expect(order("thisMonth")).toEqual(["a", "c", "b"]);
    expect(order("conflicts")).toEqual(["b", "c", "a"]);
    expect(order("awaiting", "desc")).toEqual(["c", "b", "a"]);
  });

  it("puts an overdue month below every other", () => {
    const late = sortClients(clients, { key: "thisMonth", dir: "asc" }, "2026-11-11");
    expect(late.map((c) => thisMonthText(c, "2026-11-11"))).toEqual([
      "5 overdue",
      "3 overdue",
      "Done",
    ]);
  });
});
