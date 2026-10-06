import { describe, expect, it } from "vitest";
import {
  bridgeEnabled,
  bridgeRecordCommand,
  correctionNote,
  executionRunId,
  monthlyBridgeCommandId,
  monthlyChainRunId,
  monthlyEntryResult,
  monthlyEntryVersion,
  NO_EVIDENCE_REFERENCE,
  supersedingRunId,
} from "./review-bridge";
import { parseCommand, type ExecutionCommand } from "./executions/model";
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

  it("with no note, carries exactly one reference saying none was given, and passes the record schema", () => {
    for (const result of ["done", "exception"] as const) {
      const cmd = bridgeRecordCommand({
        businessId: "biz_a",
        period: "2026-04",
        itemKey: "bank_statement",
        ownerName: "Alex Owner",
        dueOn: "2026-05-10",
        result,
        notes: "   ",
        performedOn: "2026-04-12",
        baseRevision: 1,
      });
      expect(cmd?.action).toBe("record");
      if (cmd?.action !== "record") return;
      expect(cmd.evidenceRefs).toEqual(["No evidence reference given"]);
      expect(NO_EVIDENCE_REFERENCE).toBe("No evidence reference given");
      const parsed = parseCommand(cmd);
      expect(parsed.action === "record" && parsed.evidenceRefs).toEqual([
        "No evidence reference given",
      ]);
    }
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

  it("withdraws the entry of a check changed to Skipped, as an exception whose note says so", () => {
    expect(correctionNote("2026-04-12", "skipped")).toBe(
      "Corrects the entry of Apr 12, 2026: now Skipped. This entry withdraws the check as skipped, and the log holds it as an exception until someone does the check.",
    );
    const cmd = bridgeRecordCommand({
      businessId: "biz_a",
      period: "2026-04",
      itemKey: "new_vendors",
      ownerName: "Alex",
      dueOn: "2026-05-10",
      result: "skipped",
      notes: "",
      performedOn: "2026-04-14",
      baseRevision: 0,
      supersedes: { runId: "2026-04-new_vendors", performedOn: "2026-04-12" },
    });
    expect(cmd).toMatchObject({
      runId: "2026-04-new_vendors-v2",
      commandId: "monthly-withdraw-2026-04-new_vendors-v2",
      result: "exception",
      performedOn: "2026-04-14",
      note: correctionNote("2026-04-12", "skipped"),
      evidenceRefs: [NO_EVIDENCE_REFERENCE],
      followUpOwner: "Alex",
      dueOn: "2026-05-10",
    });
    expect(parseCommand(cmd)).toMatchObject({
      commandId: "monthly-withdraw-2026-04-new_vendors-v2",
    });
  });

  it("reads back the monthly result each entry of a chain stands for", () => {
    const input = {
      businessId: "biz_a",
      period: "2026-04",
      itemKey: "new_vendors" as const,
      ownerName: "Alex",
      dueOn: "2026-05-10",
      notes: "",
      performedOn: "2026-04-14",
      baseRevision: 0,
    };
    const entry = (command: ExecutionCommand | null) => ({
      history: command
        ? [{ actor: { id: "owner", name: "Owner" }, recordedAt: "2026-04-14T12:00:00Z", command }]
        : [],
    });
    const supersedes = { runId: "2026-04-new_vendors", performedOn: "2026-04-12" };
    expect(monthlyEntryResult(entry(bridgeRecordCommand({ ...input, result: "done" })))).toBe(
      "done",
    );
    expect(
      monthlyEntryResult(entry(bridgeRecordCommand({ ...input, result: "exception", supersedes }))),
    ).toBe("exception");
    expect(
      monthlyEntryResult(entry(bridgeRecordCommand({ ...input, result: "skipped", supersedes }))),
    ).toBe("skipped");
    expect(monthlyEntryResult(entry(null))).toBeNull();
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

  it("numbers the monthly chain by the entry each one supersedes", () => {
    const key: ReviewItemKey = "bank_statement";
    expect(supersedingRunId("2026-04", key, "2026-04-bank_statement")).toBe(
      "2026-04-bank_statement-v2",
    );
    expect(supersedingRunId("2026-04", key, "2026-04-bank_statement-v2")).toBe(
      "2026-04-bank_statement-v3",
    );
    expect(() => supersedingRunId("2026-04", key, "check-abc")).toThrow();
    expect(monthlyEntryVersion("2026-04-bank_statement", "2026-04", key)).toBe(1);
    expect(monthlyEntryVersion("2026-04-bank_statement-v12", "2026-04", key)).toBe(12);
    for (const other of [
      "2026-04-bank_statement-v1",
      "2026-04-bank_statement-v02",
      "2026-04-bank_statement-x",
      "2026-05-bank_statement",
      "2026-04-card_statement",
    ])
      expect(monthlyEntryVersion(other, "2026-04", key)).toBeNull();
    expect(monthlyChainRunId("2026-04-bank_statement-v3")).toBe("2026-04-bank_statement");
    expect(monthlyChainRunId("2026-04-bank_statement")).toBe("2026-04-bank_statement");
  });

  it("builds a correcting entry that names the entry it corrects and passes the record schema", () => {
    expect(correctionNote("2026-04-15", "exception")).toBe(
      "Corrects the entry of Apr 15, 2026: now Exception.",
    );
    const cmd = bridgeRecordCommand({
      businessId: "biz_a",
      period: "2026-04",
      itemKey: "bank_statement",
      ownerName: "Alex Owner",
      dueOn: "2026-05-10",
      result: "exception",
      notes: "Unknown payee.",
      performedOn: "2026-04-17",
      baseRevision: 0,
      supersedes: { runId: "2026-04-bank_statement", performedOn: "2026-04-15" },
    });
    expect(cmd).toMatchObject({
      runId: "2026-04-bank_statement-v2",
      commandId: "monthly-bridge-2026-04-bank_statement-v2",
      note: "Corrects the entry of Apr 15, 2026: now Exception. Unknown payee.",
    });
    expect(parseCommand(cmd)).toMatchObject({ runId: "2026-04-bank_statement-v2" });
  });

  it("respects VITE_EVIDENCE_BRIDGE disable flag", () => {
    const prev = process.env.VITE_EVIDENCE_BRIDGE;
    process.env.VITE_EVIDENCE_BRIDGE = "false";
    expect(bridgeEnabled()).toBe(false);
    process.env.VITE_EVIDENCE_BRIDGE = prev;
  });
});
