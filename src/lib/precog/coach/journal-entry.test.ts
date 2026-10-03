import { describe, expect, it } from "vitest";
import { journalEntry } from "./journal-entry";

describe("journalEntry", () => {
  it("links a cross-training move to its register item so the next brief follows it up", () => {
    const entry = journalEntry(
      {
        action: "Cross-train Chris Patel on Insurance denial appeals",
        rationale: "Only Jordan can run it.",
        effort: "medium",
        horizonDays: 30,
        link: { tab: "knowledge", id: "k-appeals", step: "cover", personId: "p6" },
      },
      new Date(2026, 8, 1),
    );
    expect(entry).toMatchObject({
      kind: "remediate",
      linkedTab: "knowledge",
      linkedId: "k-appeals",
      linkedStep: "cover",
      linkedPersonId: "p6",
      reviewBy: "2026-10-01",
    });
  });
});
