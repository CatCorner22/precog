import { describe, expect, it } from "vitest";
import { defaultProfile } from "../practice-profile";
import {
  OTHER_PROBLEM_KEY,
  otherProblemReportLine,
  otherProblems,
  type ReviewRecord,
} from "../firm/reviews";
import { REPORT_LAYOUT_VERSION } from "../report/stored-model";
import { shareReportProfile } from "./report-share-profile";

const record = (over: Partial<ReviewRecord>): ReviewRecord => ({
  key: "bank_statement",
  period: "2026-09",
  result: "done",
  ownerName: "Dana",
  notes: "",
  recordedAt: "2026-10-05T10:00:00.000Z",
  ...over,
});

// Marco's donation check: an Exception with its note and finder, and the
// Done that resolved it. The report prints the Done's line alone.
const first = record({
  key: OTHER_PROBLEM_KEY,
  result: "exception",
  ownerName: "Marco",
  notes: "Marco took the $400 donation check; police report pending.",
  recordedAt: "2026-10-06T09:00:00.000Z",
});
const second = record({
  key: OTHER_PROBLEM_KEY,
  result: "exception",
  notes: "A mailed donation check never reached the bank.",
  recordedAt: "2026-10-05T09:00:00.000Z",
});
const resolved = record({
  key: OTHER_PROBLEM_KEY,
  result: "done",
  notes: "Resolved: refund received.",
  recordedAt: "2026-10-07T09:00:00.000Z",
  resolves: first.recordedAt,
});
const bankNew = record({ recordedAt: "2026-10-04T09:00:00.000Z" });
const bankOld = record({ result: "exception", recordedAt: "2026-10-01T09:00:00.000Z" });
// Newest first, as stored.
const september = [resolved, first, second, bankNew, bankOld];
const profile = { ...defaultProfile("dental"), monthlyReviews: september };
const LOCK = "2026-10-07T12:00:00.000Z";
const shared = (layoutVersion?: number, reviews = september) =>
  shareReportProfile(
    { ...profile, monthlyReviews: reviews },
    LOCK,
    { period: "2026-09" },
    layoutVersion,
  ).monthlyReviews ?? [];

describe("a shared report's monthly results", () => {
  it("keeps the latest result per check and each other problem as the report prints it", () => {
    // The resolved Exception travels without its note and finder: the
    // report prints "Another problem: Done — Dana: Resolved: refund received."
    const stripped = { ...first, ownerName: "", notes: "" };
    expect(shared()).toEqual([resolved, stripped, second, bankNew]);
    expect(JSON.stringify(shared())).not.toContain("police report");
    expect(JSON.stringify(shared())).not.toContain("Marco");
    // The page prints the same lines from what travels as from the whole list.
    const lines = (records: ReviewRecord[]) =>
      otherProblems(records, "2026-09").map(otherProblemReportLine);
    expect(lines(shared())).toEqual(lines(september));
    expect(lines(shared())).toEqual([
      "Another problem: Exception — Dana: A mailed donation check never reached the bank.",
      "Another problem: Done — Dana: Resolved: refund received.",
    ]);
  });

  it("sends no other problem for a version locked under layouts 1 to 6, which print none", () => {
    for (const layout of [1, 2, 3, 4, 5, 6]) {
      expect(shared(layout)).toEqual([bankNew]);
    }
    expect(shared(7).some((r) => r.key === OTHER_PROBLEM_KEY)).toBe(true);
  });

  it("leaves behind a Done that resolves nothing printed, and a Skipped", () => {
    const stray = record({
      key: OTHER_PROBLEM_KEY,
      result: "done",
      notes: "Resolved: a note on a problem since deleted.",
      recordedAt: "2026-10-08T09:00:00.000Z",
      resolves: "2026-09-01T09:00:00.000Z",
    });
    const skipped = record({
      key: OTHER_PROBLEM_KEY,
      result: "skipped",
      notes: "Not looked at.",
      recordedAt: "2026-10-08T10:00:00.000Z",
    });
    expect(shared(undefined, [skipped, stray, second])).toEqual([second]);
  });

  it("sends only the month a version without stored figures prints: September on an October 7 lock", () => {
    // Recalculated under the current layout, the page prints reportPeriod of
    // the lock's UTC day (last month through the 10th): September alone.
    const october = [
      record({ period: "2026-10", notes: "October: drawer short $60.", recordedAt: LOCK }),
      record({
        key: OTHER_PROBLEM_KEY,
        period: "2026-10",
        result: "exception",
        notes: "October: a check to cash.",
        recordedAt: LOCK,
      }),
    ];
    const sent =
      shareReportProfile(
        { ...profile, monthlyReviews: [...october, ...september] },
        LOCK,
        null,
        REPORT_LAYOUT_VERSION,
      ).monthlyReviews ?? [];
    expect(sent.map((r) => r.period)).toEqual(["2026-09", "2026-09", "2026-09", "2026-09"]);
    expect(JSON.stringify(sent)).not.toContain("October");
    // Layouts 1 to 4 printed the lock day's own month.
    const early =
      shareReportProfile({ ...profile, monthlyReviews: [...october, ...september] }, LOCK, null, 4)
        .monthlyReviews ?? [];
    expect(early.map((r) => r.period)).toEqual(["2026-10"]);
  });

  it("keeps every month's latest for the firm's archive, which passes no lock day", () => {
    const sent = shareReportProfile({
      ...profile,
      monthlyReviews: [record({ period: "2026-10", recordedAt: LOCK }), ...september],
    }).monthlyReviews;
    expect(sent?.map((r) => r.period)).toEqual([
      "2026-10",
      "2026-09",
      "2026-09",
      "2026-09",
      "2026-09",
    ]);
  });
});
