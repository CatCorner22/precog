import { describe, expect, it, vi } from "vitest";
import {
  askReturnNote,
  returnedNoteLine,
  returnWithNote,
  REVIEW_WORKFLOW_TEXT,
  reviewRequestedToast,
  signOffWithNote,
} from "./report-versions-actions";

describe("signOffWithNote", () => {
  it("records nothing when the reviewer cancels the prompt", async () => {
    const send = vi.fn(async (note: string) => ({ note }));
    await expect(signOffWithNote(3, send, () => null)).resolves.toBeNull();
    expect(send).not.toHaveBeenCalled();
  });

  it("records the review with an empty note on OK, and with the note when one is typed", async () => {
    const send = vi.fn(async (note: string) => ({ note }));
    await expect(signOffWithNote(3, send, () => "")).resolves.toEqual({ note: "" });
    await expect(signOffWithNote(3, send, () => "Tied to the ledger")).resolves.toEqual({
      note: "Tied to the ledger",
    });
    expect(send).toHaveBeenCalledTimes(2);
  });

  it("names the version in the question", async () => {
    const ask = vi.fn(() => null);
    await signOffWithNote(7, async () => undefined, ask);
    expect(ask).toHaveBeenCalledWith(expect.stringContaining("Review version 7 for issuance?"));
  });
});

describe("returnWithNote", () => {
  it("asks for what to change, naming the version", () => {
    const ask = vi.fn(() => null);
    expect(askReturnNote(4, ask)).toBeNull();
    expect(ask).toHaveBeenCalledWith(
      "Return version 4 to its preparer? Say what to change (up to 600 characters):",
    );
  });

  it("sends nothing when the reviewer cancels", async () => {
    const send = vi.fn(async (note: string) => ({ note }));
    await expect(returnWithNote(4, send, () => null)).resolves.toBeNull();
    expect(send).not.toHaveBeenCalled();
  });

  it("sends nothing for an empty note and says so", async () => {
    const send = vi.fn(async (note: string) => ({ note }));
    await expect(returnWithNote(4, send, () => "   ")).resolves.toBe("empty");
    expect(send).not.toHaveBeenCalled();
    expect(REVIEW_WORKFLOW_TEXT.noteRequired).toBe("Add a note saying what to change.");
  });

  it("sends the trimmed note", async () => {
    const send = vi.fn(async (note: string) => ({ note }));
    await expect(returnWithNote(4, send, () => " Add the payroll duties. ")).resolves.toEqual({
      note: "Add the payroll duties.",
    });
  });
});

describe("request-and-return wording", () => {
  it("names the buttons, the toasts and the panel's sentence", () => {
    expect(REVIEW_WORKFLOW_TEXT).toEqual({
      ask: "Ask for review",
      returnToPreparer: "Return to preparer",
      returned: "Returned to the preparer.",
      noteRequired: "Add a note saying what to change.",
      explainer: "A reviewer can return a version with a note; the preparer then locks a new one.",
      askFailed: "Precog did not ask for the review.",
      returnFailed: "Precog did not return the version.",
    });
    expect(reviewRequestedToast("Bea Lin")).toBe("Review requested from Bea Lin.");
    expect(reviewRequestedToast(null)).toBe("Review requested from the firm's reviewers.");
    expect(returnedNoteLine("Add the payroll duties.")).toBe("Returned: Add the payroll duties.");
  });
});
