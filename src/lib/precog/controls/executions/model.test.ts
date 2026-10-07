import { describe, expect, it } from "vitest";
import { REVIEW_ITEMS } from "../../firm/reviews";
import { applyCommand, parseCommand, type Actor, type ControlExecution } from "./model";

const now = "2026-09-29T12:00:00.000Z";
const preparer: Actor = { id: "prep", name: "Alex", canReview: false };
const reviewer: Actor = { id: "review", name: "Blair", canReview: true };
const record = () => ({
  action: "record" as const,
  commandId: "command_record",
  runId: "check_001",
  baseRevision: 0,
  controlKey: "bank_statement",
  period: "2026-08",
  performedOn: "2026-09-03",
  performedBy: "Alex",
  method: "inspection",
  scope: "All August statement lines and unmatched items",
  evidenceRefs: ["Restricted drive: August statement and reconciliation v1"],
  result: "no_exception",
  note: "Tied statement balance and inspected the unresolved-item register.",
});
const review = () => ({
  action: "review" as const,
  commandId: "command_review",
  runId: "check_001",
  baseRevision: 1,
  method: "inspection",
  evidenceRefs: ["Restricted drive: signed August review"],
  result: "no_exception",
  independenceConfirmed: true,
  note: "Inspected the statement and tested the reconciliation.",
});
const create = () => applyCommand(null, parseCommand(record()), preparer, now, 7);

describe("control execution lifecycle", () => {
  it("records a bounded check without calling it effective", () => {
    const run = create();
    expect(run.status).toBe("awaiting_review");
    expect(run.sourceBusinessRevision).toBe(7);
    expect(run.history[0].actor).toEqual({ id: "prep", name: "Alex" });
    expect(run.history[0].recordedAt).toBe(now);
    expect(run.revision).toBe(1);
  });
  it("accepts the card statement check and keeps the four earlier keys", () => {
    for (const controlKey of [
      "bank_statement",
      "cleared_checks",
      "payroll_headcount",
      "new_vendors",
      "card_statement",
    ]) {
      const run = applyCommand(null, parseCommand({ ...record(), controlKey }), preparer, now, 7);
      expect(run.controlKey).toBe(controlKey);
    }
    expect(() => parseCommand({ ...record(), controlKey: "petty_cash" })).toThrow();
  });
  it("accepts every monthly check, the deposit and duplicate-payment checks included", () => {
    const keys = REVIEW_ITEMS.map((item) => item.key);
    expect(keys).toContain("deposits_match");
    expect(keys).toContain("duplicate_payments");
    for (const controlKey of keys) {
      const run = applyCommand(null, parseCommand({ ...record(), controlKey }), preparer, now, 7);
      expect(run.controlKey).toBe(controlKey);
    }
  });
  it("requires specific scope and evidence references", () => {
    for (const edit of [{ evidenceRefs: [] }, { scope: " " }, { note: "" }]) {
      expect(() => parseCommand({ ...record(), ...edit })).toThrow();
    }
  });
  it("names the field to fix in plain words, never zod's own text", () => {
    const message = (edit: Record<string, unknown>) => {
      try {
        parseCommand({ ...record(), ...edit });
      } catch (error) {
        return (error as Error).message;
      }
      return "";
    };
    expect(message({ evidenceRefs: Array.from({ length: 9 }, (_, i) => `ref ${i}`) })).toBe(
      "Enter at most 8 evidence references, one per line.",
    );
    expect(message({ evidenceRefs: [] })).toBe("Enter at least one evidence reference.");
    expect(message({ scope: "   " })).toBe("Fill in the population, period and items checked.");
    expect(message({ note: " " })).toBe("Fill in the work performed and conclusion.");
    expect(message({ method: "" })).toBe("Choose a method.");
    expect(message({ performedOn: "2026-02-30" })).toBe(
      "Enter a real calendar date for the date performed.",
    );
    for (const edit of [{ actorId: "review" }, { runId: "bad id!" }, { baseRevision: 3 }]) {
      expect(message(edit)).toBe(
        "Precog could not read this check. Reload the page and try again.",
      );
    }
  });
  it("rejects impossible periods, future performance and work before the period", () => {
    expect(() => parseCommand({ ...record(), period: "2026-13" })).toThrow();
    expect(() => parseCommand({ ...record(), performedOn: "2026-02-30" })).toThrow();
    for (const day of ["2026-12-01", "2026-07-31"]) {
      expect(() =>
        applyCommand(null, parseCommand({ ...record(), performedOn: day }), preparer, now, 7),
      ).toThrow();
    }
  });
  it("refuses client-supplied provenance and extra fields", () => {
    expect(() => parseCommand({ ...record(), actorId: "review" })).toThrow();
    expect(() => parseCommand({ ...review(), recordedAt: now })).toThrow();
  });
  it("bounds and deduplicates references without fetching links", () => {
    const parsed = parseCommand({ ...record(), evidenceRefs: [" A ", "A", "B"] });
    expect("evidenceRefs" in parsed && parsed.evidenceRefs).toEqual(["A", "B"]);
    expect(() => parseCommand({ ...record(), evidenceRefs: Array(9).fill("reference") })).toThrow();
  });
  it("permits a different authorized account to report its review conclusion", () => {
    const run = applyCommand(create(), parseCommand(review()), reviewer, now, 7);
    expect(run.status).toBe("reviewed");
    expect(run.history).toHaveLength(2);
    expect(run.history[1].actor.id).toBe("review");
  });
  it("refuses same-account approval even for an owner", () => {
    expect(() =>
      applyCommand(create(), parseCommand(review()), { ...preparer, canReview: true }, now, 7),
    ).toThrow(/different account/i);
  });
  it("refuses the named performer even under another account", () => {
    expect(() =>
      applyCommand(create(), parseCommand(review()), { ...reviewer, name: " Alex " }, now, 7),
    ).toThrow(/performed/i);
  });
  it("refuses firm preparers and missing independence confirmation", () => {
    expect(() =>
      applyCommand(create(), parseCommand(review()), { ...reviewer, canReview: false }, now, 7),
    ).toThrow();
    expect(() =>
      applyCommand(
        create(),
        parseCommand({ ...review(), independenceConfirmed: false }),
        reviewer,
        now,
        7,
      ),
    ).toThrow();
  });
  it("does not allow inquiry alone to support a no-exception conclusion", () => {
    expect(() =>
      applyCommand(create(), parseCommand({ ...review(), method: "inquiry" }), reviewer, now, 7),
    ).toThrow(/inquiry/i);
  });
  it("keeps reported exceptions open until correction and a separate retest", () => {
    const issue = applyCommand(
      null,
      parseCommand({
        ...record(),
        result: "exception",
        followUpOwner: "Alex",
        dueOn: "2026-10-01",
      }),
      preparer,
      now,
      7,
    );
    expect(issue.status).toBe("needs_correction");
    expect(() => applyCommand(issue, parseCommand(review()), reviewer, now, 7)).toThrow();
    const fixed = applyCommand(
      issue,
      parseCommand({
        action: "correct",
        commandId: "command_fix",
        runId: issue.id,
        baseRevision: 1,
        performedOn: "2026-09-29",
        performedBy: "Alex",
        scope: "Corrected outstanding deposit entry",
        evidenceRefs: ["Correction journal 019"],
        note: "Found and corrected the missing deposit.",
      }),
      preparer,
      now,
      8,
    );
    expect(fixed.status).toBe("awaiting_retest");
    expect(() =>
      applyCommand(fixed, parseCommand({ ...review(), baseRevision: 2 }), reviewer, now, 8),
    ).toThrow(/reperformance/i);
    const retested = applyCommand(
      fixed,
      parseCommand({ ...review(), baseRevision: 2, method: "reperformance" }),
      reviewer,
      now,
      8,
    );
    expect(retested.status).toBe("reviewed");
    expect(retested.history).toHaveLength(3);
  });
  it("records review exceptions with accountable follow-up", () => {
    expect(() => parseCommand({ ...review(), result: "exception" })).toThrow();
    const issue = applyCommand(
      create(),
      parseCommand({
        ...review(),
        result: "exception",
        followUpOwner: "Alex",
        dueOn: "2026-10-02",
      }),
      reviewer,
      now,
      7,
    );
    expect(issue.status).toBe("needs_correction");
  });
  it("reopens a reviewed result without deleting its earlier conclusion", () => {
    const run = applyCommand(create(), parseCommand(review()), reviewer, now, 7);
    const reopened = applyCommand(
      run,
      parseCommand({
        action: "reopen",
        commandId: "command_reopen",
        runId: run.id,
        baseRevision: 2,
        note: "A supporting report was incomplete.",
        followUpOwner: "Alex",
        dueOn: "2026-10-02",
      }),
      preparer,
      now,
      7,
    );
    expect(reopened.status).toBe("needs_correction");
    expect(reopened.history[1].command.action).toBe("review");
  });
  it("rejects stale revisions and mismatched check identifiers", () => {
    expect(() =>
      applyCommand(create(), parseCommand({ ...review(), baseRevision: 8 }), reviewer, now, 7),
    ).toThrow(/changed/i);
    expect(() =>
      applyCommand(
        create(),
        parseCommand({ ...review(), runId: "another_check" }),
        reviewer,
        now,
        7,
      ),
    ).toThrow();
  });
  it("retries the same command idempotently but refuses changed content or actor", () => {
    const run = create();
    expect(applyCommand(run, parseCommand(record()), preparer, now, 9)).toEqual(run);
    expect(() =>
      applyCommand(run, parseCommand({ ...record(), note: "Different" }), preparer, now, 7),
    ).toThrow(/already/i);
    expect(() => applyCommand(run, parseCommand(record()), reviewer, now, 7)).toThrow();
  });
  it("requires a new run for a new period rather than overwriting a check", () => {
    expect(() =>
      applyCommand(
        create(),
        parseCommand({ ...record(), commandId: "new_command", period: "2026-09" }),
        preparer,
        now,
        7,
      ),
    ).toThrow();
  });
  it("does not mutate the supplied run", () => {
    const before = create();
    const clone = structuredClone(before);
    applyCommand(before, parseCommand(review()), reviewer, now, 7);
    expect(before).toEqual(clone);
  });
  it("never silently truncates the event history", () => {
    const run: ControlExecution = {
      ...create(),
      revision: 200,
      history: Array(200).fill(create().history[0]),
    };
    expect(() =>
      applyCommand(run, parseCommand({ ...review(), baseRevision: 200 }), reviewer, now, 7),
    ).toThrow(/full/i);
  });
});
