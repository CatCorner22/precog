import { describe, expect, it } from "vitest";
import { defaultProfile } from "../practice-profile";
import { OTHER_PROBLEM_KEY, type ReviewRecord } from "../firm/reviews";
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

describe("a shared report's monthly results", () => {
  it("keeps every other problem of the month, and the latest result per check", () => {
    const first = record({
      key: OTHER_PROBLEM_KEY,
      result: "exception",
      notes: "A supplier was paid twice.",
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
    const profile = {
      ...defaultProfile("dental"),
      monthlyReviews: [resolved, first, second, bankNew, bankOld],
    };
    const shared = shareReportProfile(profile, "2026-10-07T12:00:00.000Z").monthlyReviews ?? [];
    expect(shared).toEqual([resolved, first, second, bankNew]);
  });
});
