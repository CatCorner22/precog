import { describe, expect, it, vi } from "vitest";
import {
  askForReviewLabel,
  askReturnNote,
  returnedNoteLine,
  returnVersionLabel,
  returnWithNote,
  reviewButtonsFor,
  REVIEW_WORKFLOW_TEXT,
  reviewRequestedToast,
  SHARED_BUSINESS_NOTE,
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
    expect(SHARED_BUSINESS_NOTE).toBe(
      "The firm working on this business locks, reviews, sends and shares its report versions. Open any version to read it.",
    );
  });
});

describe("request-and-return buttons", () => {
  it("names the version in each button's accessible name", () => {
    expect(askForReviewLabel(3)).toBe("Ask for review of version 3");
    expect(returnVersionLabel(3)).toBe("Return version 3 to its preparer");
  });

  const fresh = { preparedBy: "ada", reviewedAt: null, reviewRequestedAt: null, returnedAt: null };
  const requested = { ...fresh, reviewRequestedAt: "2026-10-06T09:00:00.000Z" };
  const returned = { ...requested, returnedAt: "2026-10-07T09:00:00.000Z" };
  const reviewed = { ...requested, reviewedAt: "2026-10-07T09:00:00.000Z" };
  const none = { ask: false, issueAlone: false, reviewOrReturn: false };

  it("offers the preparer Ask for review and Issue alone, never Review or Return", () => {
    expect(
      reviewButtonsFor({ version: fresh, viewerId: "ada", role: "preparer", firmClient: true }),
    ).toEqual({ ask: true, issueAlone: true, reviewOrReturn: false });
    // A preparer who is also the firm owner still cannot review their own version.
    expect(
      reviewButtonsFor({ version: fresh, viewerId: "ada", role: "owner", firmClient: true }),
    ).toEqual({ ask: true, issueAlone: true, reviewOrReturn: false });
  });

  it("offers the firm owner Ask for review on a version someone else prepared, beside Review and Return", () => {
    expect(
      reviewButtonsFor({ version: fresh, viewerId: "own", role: "owner", firmClient: true }),
    ).toEqual({ ask: true, issueAlone: false, reviewOrReturn: true });
  });

  it("offers a reviewer who did not prepare it Review and Return, not Ask for review", () => {
    expect(
      reviewButtonsFor({ version: fresh, viewerId: "bea", role: "reviewer", firmClient: true }),
    ).toEqual({ ask: false, issueAlone: false, reviewOrReturn: true });
  });

  it("offers another preparer nothing", () => {
    expect(
      reviewButtonsFor({ version: fresh, viewerId: "cy", role: "preparer", firmClient: true }),
    ).toEqual(none);
  });

  it("asks for review only on a firm client's version", () => {
    expect(
      reviewButtonsFor({ version: fresh, viewerId: "ada", role: null, firmClient: false }),
    ).toEqual({ ask: false, issueAlone: true, reviewOrReturn: false });
  });

  it("drops Ask for review once asked, and keeps Review and Return for the reviewer", () => {
    expect(
      reviewButtonsFor({ version: requested, viewerId: "ada", role: "preparer", firmClient: true }),
    ).toEqual({ ask: false, issueAlone: true, reviewOrReturn: false });
    expect(
      reviewButtonsFor({ version: requested, viewerId: "bea", role: "reviewer", firmClient: true }),
    ).toEqual({ ask: false, issueAlone: false, reviewOrReturn: true });
  });

  it("offers nothing to an account that reads the versions and does none of the firm's work", () => {
    // The business's own account after sharing it with a firm: no role in that
    // firm, even on a version it prepared alone before sharing.
    for (const viewerId of ["ada", "bo"]) {
      expect(
        reviewButtonsFor({
          version: fresh,
          viewerId,
          role: null,
          firmClient: true,
          readOnly: true,
        }),
      ).toEqual(none);
    }
  });

  it("shows no review button on a returned or a reviewed version, to anyone", () => {
    for (const version of [returned, reviewed]) {
      for (const [viewerId, role] of [
        ["ada", "preparer"],
        ["own", "owner"],
        ["bea", "reviewer"],
      ] as const) {
        expect(reviewButtonsFor({ version, viewerId, role, firmClient: true })).toEqual(none);
      }
    }
  });
});
