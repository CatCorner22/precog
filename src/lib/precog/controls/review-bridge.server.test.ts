import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { controlExecutionLogReady } from "@/lib/migration-status.server";
import { RequestError } from "@/lib/request-errors";
import { openTestDb, type TestDb } from "@/test/pglite";
import type { ControlExecution } from "./executions/model";
import { executeControlCommand } from "./executions/store";
import { bridgeMonthlyReview, type SavedMonthlyReview } from "./review-bridge.server";

const report = vi.hoisted(() => ({
  error: vi.fn(async (_err: unknown, _at?: string | null) => {}),
}));
vi.mock("@/lib/observability/report.server", () => ({ reportServerError: report.error }));
// The real store and readiness check, wrapped so a test can make them fail.
vi.mock("./executions/store", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./executions/store")>();
  return { ...actual, executeControlCommand: vi.fn(actual.executeControlCommand) };
});
vi.mock("@/lib/migration-status.server", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/migration-status.server")>();
  return { ...actual, controlExecutionLogReady: vi.fn(actual.controlExecutionLogReady) };
});

const TODAY = "2026-04-15";

let db: TestDb;
beforeAll(async () => {
  db = await openTestDb();
  await db.seedUser("owner");
  await db.pg.query(
    `insert into businesses (id, user_id, name, industry, profile, revision)
     values ('biz_1', 'owner', 'Biz', 'general', '{}'::jsonb, 1)`,
  );
}, 60_000);
afterAll(() => db.close());
beforeEach(async () => {
  await db.clear("control_execution_log");
  report.error.mockClear();
});

const review = (patch: Partial<SavedMonthlyReview> = {}): SavedMonthlyReview => ({
  businessId: "biz_1",
  period: "2026-04",
  itemKey: "bank_statement",
  ownerName: "Alex Owner",
  dueOn: "2026-05-10",
  result: "done",
  notes: "Opened the April statement.",
  ...patch,
});

function logRows() {
  return db.sql<{ id: string; record: ControlExecution }>`
    select id, record from control_execution_log where user_id = 'owner' and business_id = 'biz_1'
  `;
}

describe("monthly review bridge to the control evidence log", () => {
  it("records Done on the day it is recorded, as inquiry awaiting review", async () => {
    expect(await bridgeMonthlyReview(db.sql, "owner", review(), TODAY)).toEqual({
      evidenceBridged: true,
      evidenceStatus: "recorded",
      evidenceSkippedReason: null,
    });
    const rows = await logRows();
    expect(rows).toHaveLength(1);
    expect(rows[0].record.status).toBe("awaiting_review");
    expect(rows[0].record.history).toHaveLength(1);
    expect(rows[0].record.history[0].command).toMatchObject({
      action: "record",
      period: "2026-04",
      performedOn: TODAY,
      method: "inquiry",
      result: "no_exception",
    });
    expect(report.error).not.toHaveBeenCalled();
  });

  it("records an Exception with the review's due date as the follow-up due date", async () => {
    const outcome = await bridgeMonthlyReview(
      db.sql,
      "owner",
      review({ itemKey: "payroll_headcount", result: "exception", notes: "Ghost employee." }),
      TODAY,
    );
    expect(outcome.evidenceBridged).toBe(true);
    const rows = await logRows();
    expect(rows).toHaveLength(1);
    expect(rows[0].record.status).toBe("needs_correction");
    expect(rows[0].record.history[0].command).toMatchObject({
      performedOn: TODAY,
      method: "inquiry",
      result: "exception",
      followUpOwner: "Alex Owner",
      dueOn: "2026-05-10",
    });
  });

  it("keeps one entry when a later result matches the latest entry", async () => {
    await bridgeMonthlyReview(db.sql, "owner", review(), TODAY);
    // The screen clears the note after a save, so a repeated Done differs in its note only.
    for (const repeat of [review({ notes: "" }), review()]) {
      expect(await bridgeMonthlyReview(db.sql, "owner", repeat, "2026-04-16")).toEqual({
        evidenceBridged: false,
        evidenceStatus: null,
        evidenceSkippedReason: "already_recorded",
      });
    }
    const rows = await logRows();
    expect(rows).toHaveLength(1);
    expect(rows[0].record.history).toHaveLength(1);
    expect(report.error).not.toHaveBeenCalled();
  });

  it("writes a correcting entry for each changed result, so Done -> Exception -> Done ends on Done", async () => {
    const steps = [
      { result: "done" as const, day: "2026-04-15", notes: "Opened the April statement." },
      { result: "exception" as const, day: "2026-04-17", notes: "Found an unknown payee." },
      { result: "done" as const, day: "2026-04-20", notes: "" },
    ];
    const statuses = [];
    for (const step of steps) {
      const outcome = await bridgeMonthlyReview(
        db.sql,
        "owner",
        review({ result: step.result, notes: step.notes }),
        step.day,
      );
      expect(outcome.evidenceBridged).toBe(true);
      statuses.push(outcome.evidenceStatus);
    }
    expect(statuses).toEqual(["recorded", "corrected", "corrected"]);

    const rows = await logRows();
    const byId = new Map(rows.map((r) => [r.id, r.record]));
    expect([...byId.keys()].sort()).toEqual([
      "2026-04-bank_statement",
      "2026-04-bank_statement-v2",
      "2026-04-bank_statement-v3",
    ]);
    const work = (id: string) => byId.get(id)!.history[0].command;
    expect(work("2026-04-bank_statement")).toMatchObject({
      commandId: "monthly-bridge-2026-04-bank_statement",
      result: "no_exception",
      note: "Opened the April statement.",
    });
    expect(work("2026-04-bank_statement-v2")).toMatchObject({
      commandId: "monthly-bridge-2026-04-bank_statement-v2",
      result: "exception",
      performedOn: "2026-04-17",
      note: "Corrects the entry of Apr 15, 2026: now Exception. Found an unknown payee.",
      evidenceRefs: ["Found an unknown payee."],
      followUpOwner: "Alex Owner",
    });
    // The latest entry is Done again, and its note names the entry it corrects.
    expect(work("2026-04-bank_statement-v3")).toMatchObject({
      result: "no_exception",
      performedOn: "2026-04-20",
      note: "Corrects the entry of Apr 17, 2026: now Done.",
      evidenceRefs: ["No evidence reference given"],
    });
    expect(byId.get("2026-04-bank_statement-v3")!.status).toBe("awaiting_review");
    // A repeated Done after the correction adds nothing.
    expect(
      (await bridgeMonthlyReview(db.sql, "owner", review({ notes: "" }), "2026-04-21"))
        .evidenceSkippedReason,
    ).toBe("already_recorded");
    expect(await logRows()).toHaveLength(3);
    expect(report.error).not.toHaveBeenCalled();
  });

  it("corrects only its own check and month", async () => {
    await bridgeMonthlyReview(db.sql, "owner", review(), TODAY);
    const other = await bridgeMonthlyReview(
      db.sql,
      "owner",
      review({ itemKey: "card_statement", result: "exception", notes: "Late fee." }),
      TODAY,
    );
    expect(other.evidenceStatus).toBe("recorded");
    expect((await logRows()).map((r) => r.id).sort()).toEqual([
      "2026-04-bank_statement",
      "2026-04-card_statement",
    ]);
  });

  it("corrects the entry another save wrote between its read and its write", async () => {
    await bridgeMonthlyReview(db.sql, "owner", review(), TODAY);
    // Another save writes Exception as the next entry between this save's read and its write.
    const store = await vi.importActual<typeof import("./executions/store")>("./executions/store");
    vi.mocked(executeControlCommand).mockImplementationOnce(async (sql, actor, biz, command) => {
      await bridgeMonthlyReview(
        sql,
        actor,
        review({ result: "exception", notes: "Concurrent." }),
        "2026-04-16",
      );
      return store.executeControlCommand(sql, actor, biz, command);
    });
    const outcome = await bridgeMonthlyReview(
      db.sql,
      "owner",
      review({ result: "exception", notes: "Mine." }),
      "2026-04-16",
    );
    // The other save already holds Exception as the latest entry.
    expect(outcome).toEqual({
      evidenceBridged: false,
      evidenceStatus: null,
      evidenceSkippedReason: "already_recorded",
    });
    expect((await logRows()).map((r) => r.id).sort()).toEqual([
      "2026-04-bank_statement",
      "2026-04-bank_statement-v2",
    ]);
    expect(report.error).not.toHaveBeenCalled();
  });

  it("passes on another conflict's message without reporting it", async () => {
    vi.mocked(executeControlCommand).mockRejectedValueOnce(
      new RequestError(409, "This check changed. Reload the log."),
    );
    expect(await bridgeMonthlyReview(db.sql, "owner", review(), TODAY)).toEqual({
      evidenceBridged: false,
      evidenceStatus: null,
      evidenceSkippedReason: "This check changed. Reload the log.",
    });
    expect(report.error).not.toHaveBeenCalled();
  });

  it("reports a command the log refuses as invalid and passes on its message", async () => {
    // A day before the period starts, which a client clock far behind the server's can send.
    expect(await bridgeMonthlyReview(db.sql, "owner", review(), "2026-03-31")).toEqual({
      evidenceBridged: false,
      evidenceStatus: null,
      evidenceSkippedReason:
        "Performance must fall on or after the period starts, and cannot be in the future.",
    });
    expect(report.error).toHaveBeenCalledWith(
      expect.objectContaining({ status: 400 }),
      "monthly-review-bridge",
    );
    expect(await logRows()).toHaveLength(0);
  });

  it("writes nothing for Skipped or when the bridge is turned off", async () => {
    expect(
      await bridgeMonthlyReview(db.sql, "owner", review({ result: "skipped" }), TODAY),
    ).toEqual({ evidenceBridged: false, evidenceStatus: null, evidenceSkippedReason: null });
    const previous = process.env.VITE_EVIDENCE_BRIDGE;
    process.env.VITE_EVIDENCE_BRIDGE = "false";
    try {
      expect(await bridgeMonthlyReview(db.sql, "owner", review(), TODAY)).toEqual({
        evidenceBridged: false,
        evidenceStatus: null,
        evidenceSkippedReason: "bridge_disabled",
      });
    } finally {
      if (previous === undefined) delete process.env.VITE_EVIDENCE_BRIDGE;
      else process.env.VITE_EVIDENCE_BRIDGE = previous;
    }
    expect(await logRows()).toHaveLength(0);
  });

  it("reports a failed write and keeps its message from the owner", async () => {
    const failure = new Error("Database unavailable");
    vi.mocked(executeControlCommand).mockRejectedValueOnce(failure);
    expect(await bridgeMonthlyReview(db.sql, "owner", review(), TODAY)).toEqual({
      evidenceBridged: false,
      evidenceStatus: null,
      evidenceSkippedReason: "bridge_failed",
    });
    expect(report.error).toHaveBeenCalledWith(failure, "monthly-review-bridge");
    expect(await logRows()).toHaveLength(0);
  });

  it("reports a failed readiness check instead of throwing after the review was saved", async () => {
    const failure = new Error("Connection lost");
    vi.mocked(controlExecutionLogReady).mockRejectedValueOnce(failure);
    await expect(bridgeMonthlyReview(db.sql, "owner", review(), TODAY)).resolves.toEqual({
      evidenceBridged: false,
      evidenceStatus: null,
      evidenceSkippedReason: "bridge_failed",
    });
    expect(report.error).toHaveBeenCalledWith(failure, "monthly-review-bridge");
    expect(await logRows()).toHaveLength(0);
  });
});
