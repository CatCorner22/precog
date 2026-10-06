import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { controlExecutionLogReady } from "@/lib/migration-status.server";
import { RequestError } from "@/lib/request-errors";
import { openTestDb, type TestDb } from "@/test/pglite";
import { insertReviewEvent } from "../firm/store";
import type { ControlExecution } from "./executions/model";
import {
  executeControlCommand,
  listControlExecutionChain,
  listControlExecutions,
} from "./executions/store";
import { bridgeMonthlyReview, type SavedMonthlyReview } from "./review-bridge.server";

const report = vi.hoisted(() => ({
  error: vi.fn(async (_err: unknown, _at?: string | null) => {}),
}));
vi.mock("@/lib/observability/report.server", () => ({ reportServerError: report.error }));
// The real store and readiness check, wrapped so a test can make them fail or count calls.
vi.mock("./executions/store", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./executions/store")>();
  return {
    ...actual,
    executeControlCommand: vi.fn(actual.executeControlCommand),
    listControlExecutions: vi.fn(actual.listControlExecutions),
    listControlExecutionChain: vi.fn(actual.listControlExecutionChain),
  };
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
  await db.clear("control_execution_log", "review_events");
  report.error.mockClear();
  vi.mocked(listControlExecutions).mockClear();
  vi.mocked(listControlExecutionChain).mockClear();
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

/** Stores the result in the monthly log, as recordMonthlyReview does before it bridges. */
function store(saved: SavedMonthlyReview) {
  return insertReviewEvent(db.sql, "owner", saved, "owner");
}

/** One save: the monthly log first, then the bridge, as recordMonthlyReview runs them. */
async function save(patch: Partial<SavedMonthlyReview> = {}, day = TODAY) {
  const saved = review(patch);
  await store(saved);
  return bridgeMonthlyReview(db.sql, "owner", saved, day);
}

function logRows() {
  return db.sql<{ id: string; record: ControlExecution }>`
    select id, record from control_execution_log where user_id = 'owner' and business_id = 'biz_1'
  `;
}

/** Each entry's recorded work, by run id. */
async function chainWork() {
  const rows = await logRows();
  return new Map(rows.map((r) => [r.id, { status: r.record.status, ...r.record.history[0] }]));
}

const written = (evidenceStatus: string) => ({
  evidenceBridged: true,
  evidenceStatus,
  evidenceSkippedReason: null,
});
const notWritten = (evidenceSkippedReason: string | null) => ({
  evidenceBridged: false,
  evidenceStatus: null,
  evidenceSkippedReason,
});

describe("monthly review bridge to the control evidence log", () => {
  it("records Done on the day it is recorded, as inquiry awaiting review", async () => {
    expect(await save()).toEqual(written("recorded"));
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
    const outcome = await save({
      itemKey: "payroll_headcount",
      result: "exception",
      notes: "Ghost employee.",
    });
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
    await save();
    // The screen clears the note after a save, so a repeated Done differs in its note only.
    for (const repeat of [{ notes: "" }, {}]) {
      expect(await save(repeat, "2026-04-16")).toEqual(notWritten("already_recorded"));
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
      const outcome = await save({ result: step.result, notes: step.notes }, step.day);
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
    expect((await save({ notes: "" }, "2026-04-21")).evidenceSkippedReason).toBe(
      "already_recorded",
    );
    expect(await logRows()).toHaveLength(3);
    expect(report.error).not.toHaveBeenCalled();
  });

  it("withdraws the entry of a check changed to Skipped, so Done -> Skipped -> Done ends on Done", async () => {
    expect(await save({}, "2026-04-15")).toEqual(written("recorded"));
    expect(await save({ result: "skipped", notes: "No statement yet." }, "2026-04-17")).toEqual(
      written("withdrawn"),
    );
    let chain = await chainWork();
    // The monthly log says Skipped, so the evidence log no longer ends on Done.
    expect(chain.get("2026-04-bank_statement-v2")).toMatchObject({
      status: "needs_correction",
      command: {
        commandId: "monthly-withdraw-2026-04-bank_statement-v2",
        result: "exception",
        performedOn: "2026-04-17",
        note: "Corrects the entry of Apr 15, 2026: now Skipped. This entry withdraws the check as skipped, and the log holds it as an exception until someone does the check. No statement yet.",
        evidenceRefs: ["No statement yet."],
        followUpOwner: "Alex Owner",
        dueOn: "2026-05-10",
      },
    });
    // Skipped again changes nothing; the withdrawal already stands.
    expect(await save({ result: "skipped", notes: "" }, "2026-04-18")).toEqual(
      notWritten("already_recorded"),
    );
    expect(await save({ notes: "Statement arrived; opened it." }, "2026-04-20")).toEqual(
      written("corrected"),
    );
    chain = await chainWork();
    expect([...chain.keys()].sort()).toEqual([
      "2026-04-bank_statement",
      "2026-04-bank_statement-v2",
      "2026-04-bank_statement-v3",
    ]);
    expect(chain.get("2026-04-bank_statement-v3")).toMatchObject({
      status: "awaiting_review",
      command: {
        commandId: "monthly-bridge-2026-04-bank_statement-v3",
        result: "no_exception",
        note: "Corrects the entry of Apr 17, 2026: now Done. Statement arrived; opened it.",
      },
    });
    expect(report.error).not.toHaveBeenCalled();
  });

  it("withdraws an Exception changed to Skipped, and corrects the withdrawal back to Exception", async () => {
    await save({ result: "exception", notes: "Unknown payee." });
    expect(await save({ result: "skipped", notes: "" }, "2026-04-16")).toEqual(
      written("withdrawn"),
    );
    expect(await save({ result: "exception", notes: "Unknown payee." }, "2026-04-17")).toEqual(
      written("corrected"),
    );
    const chain = await chainWork();
    expect(chain.get("2026-04-bank_statement-v2")?.command).toMatchObject({
      commandId: "monthly-withdraw-2026-04-bank_statement-v2",
      evidenceRefs: ["No evidence reference given"],
    });
    expect(chain.get("2026-04-bank_statement-v3")?.command).toMatchObject({
      commandId: "monthly-bridge-2026-04-bank_statement-v3",
      result: "exception",
      note: "Corrects the entry of Apr 16, 2026: now Exception. Unknown payee.",
    });
  });

  it("writes nothing for Skipped when the check has no entry to withdraw", async () => {
    expect(await save({ result: "skipped" })).toEqual(notWritten(null));
    expect(await logRows()).toHaveLength(0);
    // A later Done is the check's first entry.
    expect(await save({}, "2026-04-16")).toEqual(written("recorded"));
  });

  it("corrects only its own check and month", async () => {
    await save();
    const other = await save({
      itemKey: "card_statement",
      result: "exception",
      notes: "Late fee.",
    });
    expect(other.evidenceStatus).toBe("recorded");
    expect((await logRows()).map((r) => r.id).sort()).toEqual([
      "2026-04-bank_statement",
      "2026-04-card_statement",
    ]);
  });

  it("follows the latest stored monthly result: an earlier save that a later one replaced writes nothing", async () => {
    // Two devices: one saves Exception, the other Done, in that order. The
    // later save's bridge runs first; the earlier save's bridge runs last.
    const exception = review({ result: "exception", notes: "Unknown payee." });
    const done = review({ notes: "Opened it again." });
    await store(exception);
    await store(done);
    expect(await bridgeMonthlyReview(db.sql, "owner", done, TODAY)).toEqual(written("recorded"));
    expect(await bridgeMonthlyReview(db.sql, "owner", exception, TODAY)).toEqual(
      notWritten("superseded"),
    );
    // The evidence log ends on Done, as the monthly log does.
    const chain = await chainWork();
    expect([...chain.keys()]).toEqual(["2026-04-bank_statement"]);
    expect(chain.get("2026-04-bank_statement")?.command).toMatchObject({
      result: "no_exception",
    });
    expect(report.error).not.toHaveBeenCalled();
  });

  it("corrects an entry the other save wrote, when its own result is the latest", async () => {
    // Done is saved and bridged, then two saves race: Done from one device and
    // Exception from another, the Exception stored last.
    await save();
    const again = review({ notes: "" });
    const exception = review({ result: "exception", notes: "Unknown payee." });
    await store(again);
    await store(exception);
    expect(await bridgeMonthlyReview(db.sql, "owner", again, "2026-04-16")).toEqual(
      notWritten("superseded"),
    );
    expect(await bridgeMonthlyReview(db.sql, "owner", exception, "2026-04-16")).toEqual(
      written("corrected"),
    );
    const chain = await chainWork();
    expect(chain.get("2026-04-bank_statement-v2")?.command).toMatchObject({
      result: "exception",
    });
  });

  it("reads the check's chain in one query, however busy the month", async () => {
    await save();
    // Forty-five checks recorded by hand after the monthly entry push it to the third page.
    for (let i = 0; i < 45; i++) {
      await executeControlCommand(db.sql, "owner", "biz_1", {
        action: "record",
        commandId: `cmd_${i}`,
        runId: `check_${i}`,
        baseRevision: 0,
        controlKey: "cleared_checks",
        period: "2026-04",
        performedOn: TODAY,
        performedBy: "Alex Owner",
        method: "inspection",
        scope: "April cleared checks",
        evidenceRefs: ["Bank images"],
        result: "no_exception",
        note: "Read every image.",
      });
    }
    vi.mocked(listControlExecutions).mockClear();
    vi.mocked(listControlExecutionChain).mockClear();
    expect(await save({ result: "exception", notes: "Unknown payee." }, "2026-04-16")).toEqual(
      written("corrected"),
    );
    expect(listControlExecutionChain).toHaveBeenCalledTimes(1);
    expect(listControlExecutions).not.toHaveBeenCalled();
    expect((await chainWork()).get("2026-04-bank_statement-v2")?.command).toMatchObject({
      result: "exception",
    });
  });

  it("passes on another conflict's message without reporting it", async () => {
    vi.mocked(executeControlCommand).mockRejectedValueOnce(
      new RequestError(409, "This check changed. Reload the log."),
    );
    expect(await save()).toEqual(notWritten("This check changed. Reload the log."));
    expect(report.error).not.toHaveBeenCalled();
  });

  it("reports a command the log refuses as invalid and passes on its message", async () => {
    // A day before the period starts, which a client clock far behind the server's can send.
    expect(await save({}, "2026-03-31")).toEqual(
      notWritten(
        "Performance must fall on or after the period starts, and cannot be in the future.",
      ),
    );
    expect(report.error).toHaveBeenCalledWith(
      expect.objectContaining({ status: 400 }),
      "monthly-review-bridge",
    );
    expect(await logRows()).toHaveLength(0);
  });

  it("writes nothing when the bridge is turned off", async () => {
    const previous = process.env.VITE_EVIDENCE_BRIDGE;
    process.env.VITE_EVIDENCE_BRIDGE = "false";
    try {
      expect(await save()).toEqual(notWritten("bridge_disabled"));
      expect(await save({ result: "skipped" })).toEqual(notWritten("bridge_disabled"));
    } finally {
      if (previous === undefined) delete process.env.VITE_EVIDENCE_BRIDGE;
      else process.env.VITE_EVIDENCE_BRIDGE = previous;
    }
    expect(await logRows()).toHaveLength(0);
  });

  it("reports a failed write and keeps its message from the owner", async () => {
    const failure = new Error("Database unavailable");
    vi.mocked(executeControlCommand).mockRejectedValueOnce(failure);
    expect(await save()).toEqual(notWritten("bridge_failed"));
    expect(report.error).toHaveBeenCalledWith(failure, "monthly-review-bridge");
    expect(await logRows()).toHaveLength(0);
  });

  it("reports a failed readiness check instead of throwing after the review was saved", async () => {
    const failure = new Error("Connection lost");
    vi.mocked(controlExecutionLogReady).mockRejectedValueOnce(failure);
    await expect(save()).resolves.toEqual(notWritten("bridge_failed"));
    expect(report.error).toHaveBeenCalledWith(failure, "monthly-review-bridge");
    expect(await logRows()).toHaveLength(0);
  });
});
