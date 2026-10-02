import { describe, expect, it } from "vitest";
import {
  bridgeEnabled,
  bridgeRecordCommand,
  executionRunId,
  monthlyBridgeCommandId,
} from "./review-bridge";
import type { ReviewItemKey } from "../firm/reviews";

describe("review-bridge", () => {
  it("maps done and exception to execution results", () => {
    const done = bridgeRecordCommand({
      businessId: "biz_a",
      period: "2026-04",
      itemKey: "bank_statement",
      ownerName: "Alex Owner",
      dueOn: "2026-05-10",
      result: "done",
      notes: "Opened April statement.",
      performedOn: "2026-04-12",
      baseRevision: 3,
    });
    expect(done?.action).toBe("record");
    if (done?.action !== "record") return;
    expect(done.result).toBe("no_exception");
    expect(done.controlKey).toBe("bank_statement");
    expect(done.evidenceRefs).toEqual(["Opened April statement."]);
    expect(done.method).toBe("inquiry");
  });

  it("skips bridging skipped reviews", () => {
    expect(
      bridgeRecordCommand({
        businessId: "biz_a",
        period: "2026-04",
        itemKey: "new_vendors",
        ownerName: "Alex",
        dueOn: "2026-05-10",
        result: "skipped",
        notes: "",
        performedOn: "2026-04-12",
        baseRevision: 1,
      }),
    ).toBeNull();
  });

  it("requires follow-up fields for exceptions", () => {
    const cmd = bridgeRecordCommand({
      businessId: "biz_a",
      period: "2026-04",
      itemKey: "payroll_headcount",
      ownerName: "Sam",
      dueOn: "2026-05-10",
      result: "exception",
      notes: "Ghost employee.",
      performedOn: "2026-04-12",
      baseRevision: 2,
      followUpOwner: "Owner",
      followUpDueOn: "2026-04-20",
    });
    expect(cmd?.action).toBe("record");
    if (cmd?.action !== "record") return;
    expect(cmd.result).toBe("exception");
    expect(cmd.followUpOwner).toBe("Owner");
    expect(cmd.method).toBe("inquiry");
  });

  it("uses stable run and command ids per period and key", () => {
    const key: ReviewItemKey = "cleared_checks";
    expect(executionRunId("2026-04", key)).toBe("2026-04-cleared_checks");
    expect(monthlyBridgeCommandId("2026-04", key)).toBe("monthly-bridge-2026-04-cleared_checks");
  });

  it("respects VITE_EVIDENCE_BRIDGE disable flag", () => {
    const prev = process.env.VITE_EVIDENCE_BRIDGE;
    process.env.VITE_EVIDENCE_BRIDGE = "false";
    expect(bridgeEnabled()).toBe(false);
    process.env.VITE_EVIDENCE_BRIDGE = prev;
  });
});
