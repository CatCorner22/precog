import { describe, expect, it } from "vitest";
import { defaultProfile, MAX_DECISIONS, type DecisionEntry } from "../practice-profile";
import { decisionsTrimmedBy, decisionsTrimmedNotice, withDecision } from "../profile-actions";
import { decisionStaysOnTrim, trimDecisions } from "./trim";

const entry = (i: number, over: Partial<DecisionEntry> = {}): DecisionEntry => ({
  id: `d${i}`,
  createdAt: new Date(Date.UTC(2026, 0, 1) + i * 60_000).toISOString(),
  subject: `Decision ${i}`,
  kind: "monitor",
  note: "",
  ...over,
});

/** Newest first, as the journal is stored: index 0 is the newest. */
function journal(count: number, shape: (i: number) => Partial<DecisionEntry>): DecisionEntry[] {
  return Array.from({ length: count }, (_, k) => {
    const i = count - 1 - k;
    return entry(i, shape(i));
  });
}

describe("trimDecisions", () => {
  it("keeps 1,100 decisions' linked, not-valid and acceptance entries and reports the count dropped", () => {
    expect(MAX_DECISIONS).toBe(1000);
    // Oldest 300: one in three linked to a finding, one in three judged not
    // valid, one in three accepting a risk. The 800 after them link to nothing.
    const entries = journal(1100, (i) =>
      i >= 300
        ? { kind: "remediate", linkedTab: "knowledge" }
        : i % 3 === 0
          ? { linkedTab: "sod", linkedId: `rule-${i}`, linkedIndustry: "dental" }
          : i % 3 === 1
            ? {
                linkedTab: "sod",
                disposition: { verdict: "not_valid", reason: "other", at: "2026-01-02" },
              }
            : { kind: "accept_residual" },
    );
    const { kept, dropped } = trimDecisions(entries, MAX_DECISIONS, "dental");
    expect(dropped).toBe(100);
    expect(kept).toHaveLength(MAX_DECISIONS);
    const keptIds = new Set(kept.map((d) => d.id));
    for (let i = 0; i < 300; i++) expect(keptIds.has(`d${i}`)).toBe(true);
    // The oldest unlinked entries went: d300 to d399.
    for (let i = 300; i < 400; i++) expect(keptIds.has(`d${i}`)).toBe(false);
    expect(keptIds.has("d400")).toBe(true);
    // Order stays newest first.
    expect(kept[0].id).toBe("d1099");
    expect(kept.at(-1)?.id).toBe("d0");
  });

  it("drops nothing at or under the cap", () => {
    const entries = journal(5, () => ({}));
    expect(trimDecisions(entries, 5)).toEqual({ kept: entries, dropped: 0 });
  });

  it("drops the oldest kept entries only when they alone exceed the cap", () => {
    const entries = journal(6, (i) => (i < 4 ? { kind: "accept_residual" } : {}));
    const { kept, dropped } = trimDecisions(entries, 3);
    expect(dropped).toBe(3);
    expect(kept.map((d) => d.id)).toEqual(["d3", "d2", "d1"]);
  });

  it("keeps the first accepted risk after more decisions than the cap, and says how many older ones went", () => {
    const now = new Date("2026-09-01T12:00:00Z");
    let p = withDecision(
      defaultProfile("general"),
      { subject: "Finding 1", kind: "accept_residual", note: "", linkedTab: "sod", linkedId: "r1" },
      "first",
      now,
    );
    for (let i = 0; i < MAX_DECISIONS - 1; i++)
      p = withDecision(p, { subject: `s${i}`, kind: "monitor", note: "" }, `d${i}`, now);
    expect(p.decisions).toHaveLength(MAX_DECISIONS);
    const next = { subject: "One more", kind: "monitor" as const, note: "" };
    expect(decisionsTrimmedBy(p, [next])).toBe(1);
    p = withDecision(p, next, "last", now);
    expect(p.decisions).toHaveLength(MAX_DECISIONS);
    expect(p.decisions.some((d) => d.id === "first")).toBe(true);
    expect(p.decisions.some((d) => d.id === "d0")).toBe(false);
    expect(decisionsTrimmedNotice(1)).toBe(
      "Precog kept the newest 1,000 decisions and removed 1 older one that no current finding uses. Download a recovery copy first if you need them.",
    );
    expect(decisionsTrimmedNotice(120)).toBe(
      "Precog kept the newest 1,000 decisions and removed 120 older ones that no current finding uses. Download a recovery copy first if you need them.",
    );
  });

  it("counts a link made under another industry as linked to no current finding", () => {
    const stale = entry(1, { linkedId: "r1", linkedIndustry: "retail" });
    expect(decisionStaysOnTrim(stale, "dental")).toBe(false);
    expect(decisionStaysOnTrim(stale, "retail")).toBe(true);
    expect(decisionStaysOnTrim(stale)).toBe(true);
  });
});
