import { describe, expect, it } from "vitest";
import { applyRun, CLOSED_REASON, explainFinding, trimLedger, type LedgerRow } from "./ledger";
import type { MoneyFinding, runChecks } from "./detect";
import type { Cents } from "./parse";

const today = "2026-11-19";
const finding: MoneyFinding = {
  id: "unmatched_bank_line:2026-11-01:100:R1",
  check: "unmatched_bank_line",
  level: "info",
  sentence: "A bank line has no match.",
  amountCents: 100 as Cents,
  dates: { effective: "2026-11-01" },
  sourceRows: { bank: [1], books: [] },
};
const run = (
  findings: MoneyFinding[] = [finding],
  skipped: ReturnType<typeof runChecks>["skipped"] = [],
) => ({ findings, skipped });
const initial = () => applyRun([], run(), today);

describe("money findings ledger", () => {
  it("opens, refreshes, closes and reopens a stable finding", () => {
    const open = initial();
    expect(open[0]).toMatchObject({
      firstSeen: today,
      lastSeen: today,
      status: "open",
      reopenCount: 0,
    });
    const refreshed = applyRun(
      open,
      run([{ ...finding, level: "review", sentence: "A bank line is still unmatched." }]),
      "2026-11-20",
    );
    expect(refreshed[0]).toMatchObject({
      firstSeen: today,
      lastSeen: "2026-11-20",
      level: "review",
      sentence: "A bank line is still unmatched.",
    });
    const closed = applyRun(refreshed, run([]), "2026-11-21");
    expect(closed[0]).toMatchObject({
      status: "closed",
      closedOn: "2026-11-21",
      closeReason: CLOSED_REASON,
      lastSeen: "2026-11-20",
    });
    expect(applyRun(closed, run([]), "2026-11-22")).toEqual(closed);
    const reopened = applyRun(closed, run(), "2026-11-23");
    expect(reopened[0]).toMatchObject({
      status: "open",
      reopenCount: 1,
      firstSeen: today,
      lastSeen: "2026-11-23",
    });
    expect(reopened[0]).not.toHaveProperty("closedOn");
    expect(reopened[0]).not.toHaveProperty("closeReason");
    expect(applyRun(reopened, run(), "2026-11-24")[0].reopenCount).toBe(1);
  });
  it("leaves absent findings of skipped checks open and unchanged", () => {
    const ledger = initial();
    expect(
      applyRun(
        ledger,
        run([], [{ check: finding.check, missingColumn: "books" }]),
        "2026-11-20",
      )[0],
    ).toBe(ledger[0]);
  });
  it("validates and trims explanations, retaining them through closure and reopening", () => {
    for (const note of ["", " 123456789 "])
      expect(() => explainFinding(initial(), finding.id, note, today)).toThrow();
    const explained = explainFinding(initial(), finding.id, "  1234567890  ", today);
    expect(explained[0].explained).toEqual({ note: "1234567890", on: today });
    expect(applyRun(applyRun(explained, run([]), today), run(), today)[0].explained).toEqual(
      explained[0].explained,
    );
    expect(() => explainFinding(initial(), "unknown", "1234567890", today)).toThrow();
  });
  it("evicts oldest closed rows first, including those older than 13 months, never open rows", () => {
    const open = Array.from({ length: 499 }, (_, i) => ({ ...initial()[0], id: `open-${i}` }));
    const closed = (id: string, closedOn: string): LedgerRow => ({
      ...initial()[0],
      id,
      status: "closed",
      closedOn,
      closeReason: CLOSED_REASON,
    });
    const older = closed("older", "2025-10-18"),
      edge = closed("edge", "2025-10-19"),
      newest = closed("newest", "2026-11-01");
    expect(trimLedger([...open, newest, edge, older]).map((r) => r.id)).toContain("newest");
    expect(trimLedger([...open, newest, edge, older])).toHaveLength(500);
    expect(
      trimLedger([...open, newest, edge, older])
        .filter((r) => r.status === "closed")
        .map((r) => r.id),
    ).toEqual(["newest"]);
    expect(
      trimLedger([...open, { ...open[0], id: "open-500" }, { ...open[0], id: "open-501" }, older]),
    ).toHaveLength(501);
  });
  it("is deterministic, immutable, strips raw finding fields, and handles empty runs", () => {
    const input = [finding, { ...finding, id: "second" }];
    const snapshot = structuredClone(input);
    const ledger = applyRun([], run(input), today);
    expect(applyRun([], run([...input].reverse()), today)).toEqual(ledger);
    expect(input).toEqual(snapshot);
    expect(ledger[0]).not.toHaveProperty("sourceRows");
    expect(ledger[0]).not.toHaveProperty("dates");
    expect(applyRun([], run([]), today)).toEqual([]);
    expect(() => applyRun([], run([]), "bad")).toThrow();
  });
});
