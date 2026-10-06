import {
  NOT_INDEPENDENT,
  OVERRIDE_NOTE_MIN,
  RETURN_NOTE_MAX,
  type ReportVersionRow,
} from "@/lib/precog/firm/reports";
import type { FirmRole } from "@/lib/precog/firm/store";

/**
 * The words of reviewing a version for issuance (CPA-7). A reviewer opens a
 * version before reviewing it: the versions list offers "Open to review",
 * and the review buttons sit on the open version, above its frozen report.
 * Each review goes through a dialog that names the version, its preparer
 * and whether the review is independent; nothing is recorded until its
 * confirm button.
 */
export const SIGN_OFF_TEXT = {
  heading: "Review this version",
  openToReview: "Open to review",
  review: "Review for issuance",
  issueAlone: "Issue without an independent review",
  independent: "Independent review",
  notIndependent: NOT_INDEPENDENT,
  cancel: "Cancel",
  note: "Note for the file (optional)",
  reviewed: "Reviewed for issuance.",
  failed: "Precog did not record the review.",
  withdraw: "Withdraw review",
  keep: "Keep the review",
  withdrawn: "Review withdrawn. The version reads as not reviewed for issuance.",
  withdrawFailed: "Precog did not withdraw the review.",
} as const;

/** The accessible names of the sign-off controls, naming the version. */
export function openToReviewLabel(versionNo: number): string {
  return `Open version ${versionNo} to review`;
}
export function reviewVersionLabel(versionNo: number): string {
  return `Review version ${versionNo} for issuance`;
}
export function issueAloneLabel(versionNo: number): string {
  return `Issue version ${versionNo} without an independent review`;
}
export function withdrawLabel(versionNo: number): string {
  return `Withdraw the review of version ${versionNo}`;
}

/** The newest version number above this one, or null when this version is the newest. */
export function supersededBy(
  version: Pick<ReportVersionRow, "id" | "versionNo">,
  versions: readonly Pick<ReportVersionRow, "id" | "versionNo">[],
): number | null {
  let newest: number | null = null;
  for (const v of versions) {
    if (v.id !== version.id && v.versionNo > version.versionNo) {
      newest = Math.max(newest ?? 0, v.versionNo);
    }
  }
  return newest;
}

export function supersededLabel(newer: number): string {
  return `Superseded by version ${newer}`;
}

/**
 * What the sign-off dialog says before anything is recorded: the version,
 * who prepared it, and whether the review is independent (a preparer
 * issuing alone is not), plus the newer version when one exists.
 */
export function signOffDialogText(input: {
  versionNo: number;
  preparerName: string | null;
  sole: boolean;
  supersededBy: number | null;
}): { title: string; lines: string[]; confirm: string } {
  const lines = [
    `Prepared by ${input.preparerName ?? "a firm member"}`,
    input.sole ? SIGN_OFF_TEXT.notIndependent : SIGN_OFF_TEXT.independent,
  ];
  if (input.supersededBy !== null) {
    lines.push(`${supersededLabel(input.supersededBy)}: a newer version exists.`);
  }
  return input.sole
    ? {
        title: `Issue version ${input.versionNo} without an independent review?`,
        lines,
        confirm: SIGN_OFF_TEXT.issueAlone,
      }
    : {
        title: `Review version ${input.versionNo} for issuance?`,
        lines,
        confirm: SIGN_OFF_TEXT.review,
      };
}

/**
 * Whether the viewer must write an override note to review this version: the
 * client's engagement names a reviewer (`assignedReviewerUserId`, from
 * listReports), the viewer is someone else, and that reviewer did not
 * prepare the version. The server's assignedReviewerFor counts no assigned
 * reviewer on a version they prepared themselves, so nobody needs the note
 * there.
 */
export function needsOverrideNote(input: {
  version: Pick<ReportVersionRow, "preparedBy">;
  viewerId: string;
  assignedReviewerUserId: string | null;
}): boolean {
  const assigned = input.assignedReviewerUserId;
  return assigned !== null && assigned !== input.viewerId && assigned !== input.version.preparedBy;
}

/** The label of the override note's box, naming the assigned reviewer when known. */
export function overrideNoteLabel(assignedName: string | null): string {
  const who = assignedName ? `the assigned reviewer ${assignedName}` : "the assigned reviewer";
  return `Why you review in place of ${who} (${OVERRIDE_NOTE_MIN} to ${RETURN_NOTE_MAX} characters)`;
}

/** True when the override note is long enough and not too long, after trimming. */
export function overrideNoteReady(note: string): boolean {
  const n = note.trim().length;
  return n >= OVERRIDE_NOTE_MIN && n <= RETURN_NOTE_MAX;
}

/**
 * The line a version reviewed in the assigned reviewer's place shows, or
 * null. `assigned` is the engagement's reviewer now; the name is left out
 * when unknown or when that is the signer (the engagement changed since).
 */
export function overrideLine(
  version: Pick<ReportVersionRow, "reviewOverrideNote" | "reviewedBy" | "reviewedByName">,
  assigned: { userId: string; name: string | null } | null,
): string | null {
  if (!version.reviewOverrideNote) return null;
  const name =
    assigned && assigned.userId !== version.reviewedBy && assigned.name ? ` ${assigned.name}` : "";
  return `Signed by ${version.reviewedByName ?? "a reviewer"} instead of the assigned reviewer${name}: ${version.reviewOverrideNote}`;
}

/**
 * Whether the viewer may withdraw the version's review for issuance, as
 * withdrawReportVersionReview allows it: the version is reviewed and not
 * sent, and the viewer is the person who reviewed it or the owner of the
 * business's firm. Never for an account that only reads the versions.
 */
export function canWithdrawReview(input: {
  version: Pick<ReportVersionRow, "reviewedAt" | "reviewedBy" | "sentAt" | "preparedBy">;
  viewerId: string;
  work: { firm: boolean; role: FirmRole | null } | null;
  readOnly?: boolean;
}): boolean {
  const { version: v, work } = input;
  if (input.readOnly || !v.reviewedAt || v.sentAt) return false;
  const firmRole = work?.firm === true ? work.role : null;
  if (firmRole === "owner") return true;
  if (v.reviewedBy !== input.viewerId) return false;
  if (work?.firm !== true) return true;
  // The server's rule (withdrawReportVersionReview): on a firm's version the
  // signer still reviews for the firm, or issued it alone and is still a member.
  return firmRole === "reviewer" || (v.preparedBy === v.reviewedBy && firmRole !== null);
}

/**
 * What withdrawing says before it happens. The version can be reviewed
 * again afterwards, so this is not an irreversible step.
 */
export function withdrawConfirmText(versionNo: number): string {
  return `Withdraw the review of version ${versionNo}? It reads as not reviewed for issuance again: nobody can mark it sent or share it, and its report links stop opening it, until someone reviews it again. The activity log records the withdrawal.`;
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
  /**
   * "Issue without an independent review": the preparer, on a version not yet
   * reviewed or returned, when the review rules allow it (canIssueAlone).
   */
  issueAlone: boolean;
  /** "Review for issuance" and "Return to preparer": an owner or reviewer who did not prepare it, on a version not yet reviewed or returned. */
  reviewOrReturn: boolean;
}

/**
 * What the versions panel says, in place of Lock and the version buttons, to
 * the account that shared its business with a firm: the firm does that work
 * (the server refuses it to that account with BUSINESS_ROLE_REFUSED).
 */
export const SHARED_BUSINESS_NOTE =
  "The firm working on this business locks, reviews, sends and shares its report versions. Open any version to read it.";

export function reviewButtonsFor(input: {
  version: Pick<ReportVersionRow, "preparedBy" | "reviewedAt" | "reviewRequestedAt" | "returnedAt">;
  viewerId: string;
  /** The viewer's role in the business's firm (in their own firm for a business with none). */
  role: FirmRole | null;
  firmClient: boolean;
  /** The review rules' canIssueAlone (listReports); true when not yet known. */
  canIssueAlone?: boolean;
  /**
   * The viewer reads the versions and does none of the firm's work on the
   * business: its own account, after sharing it with a firm. No button, even
   * on a version that account prepared alone before sharing.
   */
  readOnly?: boolean;
}): ReviewButtons {
  const { version: v, viewerId, role, firmClient } = input;
  if (input.readOnly) return { ask: false, issueAlone: false, reviewOrReturn: false };
  const open = !v.reviewedAt && !v.returnedAt;
  const prepared = v.preparedBy === viewerId;
  return {
    ask: firmClient && open && !v.reviewRequestedAt && (prepared || role === "owner"),
    issueAlone: open && prepared && input.canIssueAlone !== false,
    reviewOrReturn: open && !prepared && (role === "owner" || role === "reviewer"),
  };
}
