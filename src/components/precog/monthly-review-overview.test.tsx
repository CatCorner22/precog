import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { monthlyReviewTasks, type ReviewRecord } from "@/lib/precog/firm/reviews";
import { MonthlyReviewOverview } from "./monthly-review-overview";

const tasks = monthlyReviewTasks("2026-09-29", []);
const record = (index: number, result: ReviewRecord["result"]): ReviewRecord => ({
  key: tasks[index].key,
  period: tasks[index].period,
  result,
  ownerName: "Owner",
  notes: "Statement checked",
  recordedAt: "2026-09-29T12:00:00Z",
});
const view = (records: ReviewRecord[] = [], checks = tasks) =>
  renderToStaticMarkup(<MonthlyReviewOverview tasks={checks} records={records} />);

describe("monthly review overview", () => {
  it("starts with an honest empty progress state and a next-check action", () => {
    const html = view();
    expect(html).toContain('aria-label="Checks with a recorded result"');
    expect(html).toContain('value="0"');
    expect(html).toContain("0 of 4 recorded");
    expect(html).toContain("Record your next check");
    expect(html).toContain('aria-label="Review check navigation"');
    expect(html.match(/data-check-status="unrecorded"/g)).toHaveLength(4);
    expect(html).not.toContain("All checks done");
  });

  it("keeps done, problems and skipped distinct, using only the latest result for this month", () => {
    const html = view([
      record(0, "done"),
      record(1, "exception"),
      record(2, "skipped"),
      { ...record(3, "done"), period: "2026-08" },
      record(0, "exception"),
    ]);
    expect(html).toContain("3 of 4 recorded");
    expect(html).toContain('data-check-status="done"');
    expect(html).toContain('data-check-status="exception"');
    expect(html).toContain('data-check-status="skipped"');
    expect(html).toContain('data-check-status="unrecorded"');
    expect(html).toContain("Follow up on a problem");
    expect(html).toContain("Recorded results are not independent verification.");
  });

  it("does not call an all-skipped month complete", () => {
    const html = view(tasks.map((_, index) => record(index, "skipped")));
    expect(html).toContain("4 of 4 recorded");
    expect(html).toContain("Revisit a skipped check");
    expect(html).not.toContain("All checks have a Done result");
  });

  it("shows a qualified completion state without an empty next action", () => {
    const html = view(tasks.map((_, index) => record(index, "done")));
    expect(html).toContain("All checks have a Done result");
    expect(html).not.toContain("Open check");
    expect(html).toContain("Recorded results are not independent verification.");
  });

  it("handles no applicable checks without a zero-sized progress bar", () => {
    const html = view([], []);
    expect(html).toContain("No checks for this month");
    expect(html).not.toContain("<progress");
  });
});
