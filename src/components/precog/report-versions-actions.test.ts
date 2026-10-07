import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  askForReviewLabel,
  awaitingReviewText,
  lockButtonVariant,
  openVersionText,
  RETURN_NOTE_TEXT,
  returnedNoteLine,
  returnNoteConfirmLabel,
  returnNoteLabel,
  returnNoteReady,
  returnVersionLabel,
  versionAwaitingReview,
  reviewButtonsFor,
  REVIEW_WORKFLOW_TEXT,
  reviewRequestedToast,
  SHARED_BUSINESS_NOTE,
  canWithdrawReview,
  needsOverrideNote,
  overrideLine,
  overrideNoteLabel,
  overrideNoteReady,
  signOffDialogText,
  signOffHint,
  SIGN_OFF_TEXT,
  supersededBy,
  supersededLabel,
  withdrawConfirmText,
} from "./report-versions-actions";

describe("the sign-off dialog", () => {
  it("names the version, the preparer and an independent review", () => {
    expect(
      signOffDialogText({
        versionNo: 7,
        preparerName: "Ada Park",
        sole: false,
        supersededBy: null,
      }),
    ).toEqual({
      title: "Sign off version 7 as reviewer?",
      lines: ["Prepared by Ada Park", "Independent review"],
      confirm: "Sign off as reviewer",
    });
  });

  it("says a preparer issuing alone is not an independent review, and names a newer version", () => {
    expect(
      signOffDialogText({ versionNo: 2, preparerName: null, sole: true, supersededBy: 4 }),
    ).toEqual({
      title: "Issue version 2 without an independent review?",
      lines: [
        "Prepared by a firm member",
        "Not an independent review",
        "Superseded by version 4: a newer version exists.",
      ],
      confirm: "Issue without an independent review",
    });
  });

  it("names the remaining sign-off words", () => {
    expect(SIGN_OFF_TEXT).toEqual({
      heading: "Review this version",
      openToReview: "Open to review",
      review: "Sign off as reviewer",
      issueAlone: "Issue without an independent review",
      independent: "Independent review",
      notIndependent: "Not an independent review",
      cancel: "Cancel",
      note: "Note for the file (optional)",
      reviewed: "Reviewed for issuance.",
      failed: "Precog did not record the review.",
      withdraw: "Withdraw review",
      keep: "Keep the review",
      withdrawn: "Review withdrawn. The version reads as not reviewed for issuance.",
      withdrawFailed: "Precog did not withdraw the review.",
    });
  });

  it("says under Sign off as reviewer what signing off records and what follows", () => {
    expect(signOffHint(1)).toBe(
      "Signing off records you as the reviewer of version 1 for issuance. The version can then be marked sent and shared with the client.",
    );
  });
});

describe("superseded versions", () => {
  const list = [
    { id: "c", versionNo: 3 },
    { id: "b", versionNo: 2 },
    { id: "a", versionNo: 1 },
  ];
  it("names the newest version above this one", () => {
    expect(supersededBy(list[2], list)).toBe(3);
    expect(supersededBy(list[1], list)).toBe(3);
    expect(supersededBy(list[0], list)).toBeNull();
    expect(supersededLabel(3)).toBe("Superseded by version 3");
  });
});

describe("the override note", () => {
  it("is needed when someone other than the assigned reviewer reviews", () => {
    const version = { preparedBy: "prep" };
    expect(needsOverrideNote({ version, viewerId: "own", assignedReviewerUserId: "rev" })).toBe(
      true,
    );
    expect(needsOverrideNote({ version, viewerId: "rev", assignedReviewerUserId: "rev" })).toBe(
      false,
    );
    expect(needsOverrideNote({ version, viewerId: "own", assignedReviewerUserId: null })).toBe(
      false,
    );
  });

  it("is not needed on a version the assigned reviewer prepared, as the server counts it", () => {
    // assignedReviewerFor leaves out the preparer, so no one is assigned to that version.
    expect(
      needsOverrideNote({
        version: { preparedBy: "rev" },
        viewerId: "own",
        assignedReviewerUserId: "rev",
      }),
    ).toBe(false);
  });

  it("takes 10 to 600 characters after trimming", () => {
    expect(overrideNoteReady("  short  ")).toBe(false);
    expect(overrideNoteReady(" Bea is on leave ")).toBe(true);
    expect(overrideNoteReady("x".repeat(600))).toBe(true);
    expect(overrideNoteReady("x".repeat(601))).toBe(false);
    expect(overrideNoteLabel("Bea Lin")).toBe(
      "Why you review in place of the assigned reviewer Bea Lin (10 to 600 characters)",
    );
    expect(overrideNoteLabel(null)).toBe(
      "Why you review in place of the assigned reviewer (10 to 600 characters)",
    );
  });

  it("prints who signed in whose place, and why", () => {
    const signed = {
      reviewOverrideNote: "Bea is on leave.",
      reviewedBy: "own",
      reviewedByName: "Owen Owner",
    };
    expect(overrideLine(signed, { userId: "rev", name: "Bea Lin" })).toBe(
      "Signed by Owen Owner instead of the assigned reviewer Bea Lin: Bea is on leave.",
    );
    // The engagement now names the signer, or nobody Precog can name.
    expect(overrideLine(signed, { userId: "own", name: "Owen Owner" })).toBe(
      "Signed by Owen Owner instead of the assigned reviewer: Bea is on leave.",
    );
    expect(overrideLine(signed, null)).toBe(
      "Signed by Owen Owner instead of the assigned reviewer: Bea is on leave.",
    );
    expect(overrideLine({ ...signed, reviewOverrideNote: null }, null)).toBeNull();
  });
});

describe("withdrawing a review", () => {
  const reviewed = {
    reviewedAt: "2026-10-07T09:00:00.000Z",
    reviewedBy: "rev",
    sentAt: null,
    preparedBy: "prep",
  };
  const firm = (role: "owner" | "reviewer" | "preparer" | null) => ({ firm: true, role });

  it("is for the signer and the firm owner, before the version is sent", () => {
    expect(canWithdrawReview({ version: reviewed, viewerId: "rev", work: firm("reviewer") })).toBe(
      true,
    );
    expect(canWithdrawReview({ version: reviewed, viewerId: "own", work: firm("owner") })).toBe(
      true,
    );
    expect(canWithdrawReview({ version: reviewed, viewerId: "rev2", work: firm("reviewer") })).toBe(
      false,
    );
    expect(
      canWithdrawReview({
        version: { ...reviewed, sentAt: "2026-10-08T09:00:00.000Z" },
        viewerId: "own",
        work: firm("owner"),
      }),
    ).toBe(false);
    expect(
      canWithdrawReview({
        version: { ...reviewed, reviewedAt: null, reviewedBy: null },
        viewerId: "own",
        work: firm("owner"),
      }),
    ).toBe(false);
  });

  it("is not for a signer whose firm role no longer reviews, unless they issued the version alone", () => {
    // The server refuses these with "Your role at the firm no longer lets you withdraw this review."
    expect(canWithdrawReview({ version: reviewed, viewerId: "rev", work: firm("preparer") })).toBe(
      false,
    );
    const alone = { ...reviewed, preparedBy: "rev" };
    expect(canWithdrawReview({ version: alone, viewerId: "rev", work: firm("preparer") })).toBe(
      true,
    );
    expect(canWithdrawReview({ version: alone, viewerId: "rev", work: firm(null) })).toBe(false);
    // The account's own version, with no firm reading it: the signer may withdraw.
    expect(canWithdrawReview({ version: reviewed, viewerId: "rev", work: null })).toBe(true);
  });

  it("is not for the owner of another firm on a solo business, nor for a reader", () => {
    // On a business with no firm, the server lets only the signer withdraw.
    expect(
      canWithdrawReview({
        version: reviewed,
        viewerId: "own",
        work: { firm: false, role: "owner" },
      }),
    ).toBe(false);
    expect(
      canWithdrawReview({ version: reviewed, viewerId: "rev", work: firm(null), readOnly: true }),
    ).toBe(false);
  });

  it("says what withdrawing does, without the irreversible warning", () => {
    const text = withdrawConfirmText(3);
    expect(text).toBe(
      "Withdraw the review of version 3? It reads as not reviewed for issuance again: nobody can mark it sent or share it, and its report links stop opening it, until someone reviews it again. The activity log records the withdrawal.",
    );
    expect(text).not.toContain("You cannot undo this.");
  });
});

describe("the return note", () => {
  it("is asked inline, never in a browser prompt", () => {
    const source = readFileSync(
      fileURLToPath(new URL("./report-versions-actions.ts", import.meta.url)),
      "utf8",
    );
    const panel = readFileSync(
      fileURLToPath(new URL("./report-versions.tsx", import.meta.url)),
      "utf8",
    );
    expect(source).not.toContain("window.prompt");
    expect(panel).not.toContain("window.prompt");
  });

  it("labels its box with the version, that it is required and its length", () => {
    expect(RETURN_NOTE_TEXT).toEqual({
      confirm: "Return with this note",
      cancel: "Cancel",
    });
    expect(returnNoteLabel(4)).toBe(
      "What to change before version 4 goes back to its preparer (required, up to 600 characters)",
    );
    expect(returnNoteConfirmLabel(4)).toBe("Return version 4 with this note");
  });

  it("is ready only with words in it, and at most 600 characters", () => {
    expect(returnNoteReady("")).toBe(false);
    expect(returnNoteReady("   ")).toBe(false);
    expect(returnNoteReady(" Add the payroll duties. ")).toBe(true);
    expect(returnNoteReady("x".repeat(600))).toBe(true);
    expect(returnNoteReady("x".repeat(601))).toBe(false);
  });
});

describe("the version waiting for the viewer's review", () => {
  const base = {
    id: "rv_1",
    versionNo: 1,
    preparedBy: "ada",
    reviewedAt: null,
    returnedAt: null,
    reviewRequestedAt: "2026-10-06T09:00:00.000Z",
    reviewRequestedFrom: "bea",
  };
  const view = { viewerId: "bea", role: "reviewer" as const, firmClient: true };

  it("is the newest version asked of the viewer, or of the firm's reviewers", () => {
    const v2 = { ...base, id: "rv_2", versionNo: 2, reviewRequestedFrom: null };
    expect(versionAwaitingReview({ ...view, versions: [v2, base] })?.versionNo).toBe(2);
    expect(versionAwaitingReview({ ...view, versions: [base] })?.versionNo).toBe(1);
  });

  it("is none for a version asked of someone else, not asked, reviewed, returned or prepared by the viewer", () => {
    for (const patch of [
      { reviewRequestedFrom: "own" },
      { reviewRequestedAt: null, reviewRequestedFrom: null },
      { reviewedAt: "2026-10-07T09:00:00.000Z" },
      { returnedAt: "2026-10-07T09:00:00.000Z" },
      { preparedBy: "bea" },
    ]) {
      expect(versionAwaitingReview({ ...view, versions: [{ ...base, ...patch }] })).toBeNull();
    }
    expect(versionAwaitingReview({ ...view, role: "preparer", versions: [base] })).toBeNull();
    expect(versionAwaitingReview({ ...view, readOnly: true, versions: [base] })).toBeNull();
  });

  it("is never a version a newer one superseded", () => {
    const v2 = { ...base, id: "rv_2", versionNo: 2, reviewRequestedAt: null };
    expect(versionAwaitingReview({ ...view, versions: [v2, base] })).toBeNull();
  });

  it("is named in the banner and its link", () => {
    expect(awaitingReviewText(3)).toBe("Version 3 waits for your review.");
    expect(openVersionText(3)).toBe("Open version 3");
  });
});

describe("Lock this version", () => {
  it("is an outline button for a firm reviewer and for anyone a version waits on", () => {
    expect(lockButtonVariant({ role: "reviewer", awaiting: false })).toBe("outline");
    expect(lockButtonVariant({ role: "owner", awaiting: true })).toBe("outline");
    expect(lockButtonVariant({ role: "owner", awaiting: false })).toBe("default");
    expect(lockButtonVariant({ role: "preparer", awaiting: false })).toBe("default");
    expect(lockButtonVariant({ role: null, awaiting: false })).toBe("default");
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
    expect(
      returnedNoteLine({
        returnNote: "Add the payroll duties.",
        returnedByName: "Bea Lin",
        returnedAt: "2026-10-07T15:00:00.000Z",
      }),
    ).toBe("Returned by Bea Lin on Oct 7, 2026: “Add the payroll duties.”");
    expect(
      returnedNoteLine({ returnNote: "Add it.", returnedByName: null, returnedAt: null }),
    ).toBe("Returned by a reviewer: “Add it.”");
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

  it("drops Issue alone when the review rules refuse it", () => {
    expect(
      reviewButtonsFor({
        version: fresh,
        viewerId: "ada",
        role: "preparer",
        firmClient: true,
        canIssueAlone: false,
      }),
    ).toEqual({ ask: true, issueAlone: false, reviewOrReturn: false });
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
