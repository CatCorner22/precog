import { describe, expect, it } from "vitest";
import { applyCommand, parseCommand, type Actor, type ControlExecution } from "./model";

const now = "2026-09-29T12:00:00.000Z";
const first: Actor = { id: "original", name: "Alex Morgan", canReview: true };
const corrector: Actor = { id: "corrector", name: "Blair Lane", canReview: true };
const independent: Actor = { id: "independent", name: "Casey Reed", canReview: true };
const record = (performedBy = first.name) =>
  applyCommand(
    null,
    parseCommand({
      action: "record",
      commandId: "record_1",
      runId: "run_1",
      baseRevision: 0,
      controlKey: "bank_statement",
      period: "2026-08",
      performedOn: "2026-09-20",
      performedBy,
      method: "inspection",
      scope: "August statement and reconciliation",
      evidenceRefs: ["Restricted statement v1"],
      result: "exception",
      note: "An unresolved difference.",
      followUpOwner: corrector.name,
      dueOn: "2026-09-29",
    }),
    first,
    now,
    7,
  );
const correction = (previous: ControlExecution, actor = corrector, performedOn = "2026-09-25") =>
  applyCommand(
    previous,
    parseCommand({
      action: "correct",
      commandId: `correct_${previous.revision}`,
      runId: previous.id,
      baseRevision: previous.revision,
      performedOn,
      performedBy: actor.name,
      scope: "Traced and corrected the unsupported entry",
      evidenceRefs: ["Correction v2"],
      note: "Correction ready for independent retest.",
    }),
    actor,
    now,
    8,
  );
const retest = (previous: ControlExecution, actor = independent) =>
  applyCommand(
    previous,
    parseCommand({
      action: "review",
      commandId: `review_${previous.revision}`,
      runId: previous.id,
      baseRevision: previous.revision,
      method: "reperformance",
      evidenceRefs: ["Retest v3"],
      result: "no_exception",
      note: "Reperformed for the recorded scope.",
      independenceConfirmed: true,
    }),
    actor,
    now,
    8,
  );

describe("independence across the complete execution history", () => {
  it("does not let the original recorder retest after someone else corrects the work", () => {
    expect(() => retest(correction(record()), first)).toThrow(/different account/i);
  });
  it("does not let a previously named performer retest under a different account", () => {
    expect(() => retest(correction(record(independent.name)), independent)).toThrow(/performed/i);
  });
  it("normalizes Unicode and whitespace when matching a recorded performer name", () => {
    expect(() => retest(correction(record("Ｃａｓｅｙ   Reed")), independent)).toThrow(
      /performed/i,
    );
  });
  it("allows an uninvolved authorized reviewer to retest, without changing earlier evidence", () => {
    const work = correction(record());
    const before = structuredClone(work);
    expect(retest(work).status).toBe("reviewed");
    expect(work).toEqual(before);
  });
  it("still refuses the latest correction recorder", () => {
    expect(() => retest(correction(record()), corrector)).toThrow(/different account/i);
  });
  it("preserves earlier participation across reopening and a second correction", () => {
    const reviewed = retest(correction(record()));
    const reopened = applyCommand(
      reviewed,
      parseCommand({
        action: "reopen",
        commandId: "reopen_1",
        runId: reviewed.id,
        baseRevision: reviewed.revision,
        note: "Further discrepancy",
        followUpOwner: first.name,
        dueOn: "2026-09-29",
      }),
      independent,
      now,
      9,
    );
    const amended = correction(reopened, first, "2026-09-28");
    expect(() => retest(amended, corrector)).toThrow(/different account/i);
  });
  it("rejects a reported correction dated before the work it corrects", () => {
    expect(() => correction(record(), corrector, "2026-09-10")).toThrow(/before/i);
  });
  it("allows a same-day correction without inventing finer time precision", () => {
    expect(correction(record(), corrector, "2026-09-20").status).toBe("awaiting_retest");
  });
});
