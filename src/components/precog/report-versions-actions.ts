import type { ReportVersionRow } from "@/lib/precog/firm/reports";
import type { FirmRole } from "@/lib/precog/firm/store";

/**
 * Asks the reviewer for an optional note, then records the review for
 * issuance with it. Cancel on the prompt stops here and resolves to null:
 * nothing is sent, so a reviewer who backs out never leaves a recorded
 * review behind.
 */
export async function signOffWithNote<T>(
  versionNo: number,
  send: (note: string) => Promise<T>,
  ask: (message: string) => string | null = (message) => window.prompt(message),
): Promise<T | null> {
  const note = ask(`Review version ${versionNo} for issuance? Add a note (optional):`);
  if (note === null) return null;
  return send(note);
}

/** The words of the request-and-return buttons and toasts on the versions panel. */
export const REVIEW_WORKFLOW_TEXT = {
  ask: "Ask for review",
  returnToPreparer: "Return to preparer",
  returned: "Returned to the preparer.",
  noteRequired: "Add a note saying what to change.",
  explainer: "A reviewer can return a version with a note; the preparer then locks a new one.",
  askFailed: "Precog did not ask for the review.",
  returnFailed: "Precog did not return the version.",
} as const;

/** The toast after a request: the reviewer by name, or the firm's reviewers when unassigned. */
export function reviewRequestedToast(fromName: string | null): string {
  return fromName
    ? `Review requested from ${fromName}.`
    : "Review requested from the firm's reviewers.";
}

/** What a returned version shows in place of its review buttons. */
export function returnedNoteLine(note: string): string {
  return `Returned: ${note}`;
}

/** The question a reviewer answers to return a version; null when they cancel. */
export function askReturnNote(
  versionNo: number,
  ask: (message: string) => string | null = (message) => window.prompt(message),
): string | null {
  return ask(
    `Return version ${versionNo} to its preparer? Say what to change (up to 600 characters):`,
  );
}

/**
 * Asks for the return note, then returns the version with it. Cancel sends
 * nothing and resolves to null; an empty note sends nothing and resolves to
 * "empty", so the panel can say a note is needed.
 */
export async function returnWithNote<T>(
  versionNo: number,
  send: (note: string) => Promise<T>,
  ask?: (message: string) => string | null,
): Promise<T | null | "empty"> {
  const note = askReturnNote(versionNo, ask);
  if (note === null) return null;
  if (!note.trim()) return "empty";
  return send(note.trim());
}

/** The accessible names of the request-and-return buttons, naming the version. */
export function askForReviewLabel(versionNo: number): string {
  return `Ask for review of version ${versionNo}`;
}
export function returnVersionLabel(versionNo: number): string {
  return `Return version ${versionNo} to its preparer`;
}

/** Which review buttons a version shows the viewer on the versions panel. */
export interface ReviewButtons {
  /** "Ask for review": the preparer or the firm owner, on a firm client's version not yet reviewed, requested or returned. */
  ask: boolean;
  /** "Issue without an independent review": the preparer, on a version not yet reviewed or returned. */
  issueAlone: boolean;
  /** "Review for issuance" and "Return to preparer": an owner or reviewer who did not prepare it, on a version not yet reviewed or returned. */
  reviewOrReturn: boolean;
}

export function reviewButtonsFor(input: {
  version: Pick<ReportVersionRow, "preparedBy" | "reviewedAt" | "reviewRequestedAt" | "returnedAt">;
  viewerId: string;
  role: FirmRole | null;
  firmClient: boolean;
}): ReviewButtons {
  const { version: v, viewerId, role, firmClient } = input;
  const open = !v.reviewedAt && !v.returnedAt;
  const prepared = v.preparedBy === viewerId;
  return {
    ask: firmClient && open && !v.reviewRequestedAt && (prepared || role === "owner"),
    issueAlone: open && prepared,
    reviewOrReturn: open && !prepared && (role === "owner" || role === "reviewer"),
  };
}
