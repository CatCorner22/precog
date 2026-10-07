import { useEffect, useState, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { toast } from "sonner";
import { Link2, Lock, PenLine, Send, ShieldOff, Undo2, UserCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { usePractice, usePracticeSync } from "@/lib/precog/practice-context";
import {
  getFirm,
  listReports,
  lockReport,
  markReportSent,
  signOffReport,
  withdrawReportReview,
} from "@/lib/precog/firm/server";
import { requestReportReview, returnReport } from "@/lib/precog/firm/review-server";
import { getEntitlements } from "@/lib/precog/firm/entitlements-server";
import {
  RETURN_NOTE_MAX,
  versionProvenance,
  type ReportVersionRow,
} from "@/lib/precog/firm/reports";
import type { FirmMember, FirmRole } from "@/lib/precog/firm/store";
import { isOwnTeam } from "@/lib/precog/firm/engagement";
import { formatDay, localDateKey } from "@/lib/precog/dates";
import {
  askForReviewLabel,
  awaitingReviewText,
  canWithdrawReview,
  issueAloneLabel,
  lockButtonVariant,
  needsOverrideNote,
  openToReviewLabel,
  openVersionText,
  overrideLine,
  overrideNoteLabel,
  overrideNoteReady,
  RETURN_NOTE_TEXT,
  returnedNoteLine,
  returnNoteConfirmLabel,
  returnNoteLabel,
  returnNoteReady,
  returnVersionLabel,
  reviewButtonsFor,
  reviewVersionLabel,
  REVIEW_WORKFLOW_TEXT,
  reviewRequestedToast,
  SHARED_BUSINESS_NOTE,
  SIGN_OFF_TEXT,
  signOffDialogText,
  supersededBy,
  supersededLabel,
  versionAwaitingReview,
  withdrawConfirmText,
  withdrawLabel,
} from "./report-versions-actions";
import { ReportSharePanel } from "./report-share-panel";

/** The work the caller does on the business, as the versions list reports it (businessWork). */
type BusinessWork = Awaited<ReturnType<typeof listReports>>["work"];
/** The business's review rules as they apply to the caller (ReviewRules in firm/server.ts). */
type ReviewRules = Awaited<ReturnType<typeof listReports>>["review"];

/** The engagement's assigned reviewer with their name, from the firm's members. */
function assignedReviewer(
  review: ReviewRules | null,
  members: readonly Pick<FirmMember, "userId" | "name">[],
): { userId: string; name: string | null } | null {
  const userId = review?.assignedReviewerUserId ?? null;
  if (!userId) return null;
  return { userId, name: members.find((m) => m.userId === userId)?.name || null };
}

/** The lines under a version's provenance: superseded, reviewed in someone's place, returned. */
function versionNotes(
  v: ReportVersionRow,
  versions: readonly ReportVersionRow[],
  assigned: { userId: string; name: string | null } | null,
): ReactNode {
  const newer = supersededBy(v, versions);
  const override = overrideLine(v, assigned);
  return (
    <>
      {newer !== null && (
        <p className="text-xs font-medium text-amber-800">{supersededLabel(newer)}</p>
      )}
      {override && <p className="text-xs text-neutral-700">{override}</p>}
      {v.returnedAt && <p className="text-xs text-neutral-700">{returnedNoteLine(v)}</p>}
    </>
  );
}

/** The question before a withdrawal, with its two answers. Not a component: it holds no state. */
function withdrawConfirm(input: {
  versionNo: number;
  busy: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}): ReactNode {
  return (
    <div
      role="alertdialog"
      aria-label={withdrawLabel(input.versionNo)}
      className="mt-2 w-full rounded-md border border-amber-300 bg-amber-50 p-3 text-xs text-neutral-800"
    >
      <p>{withdrawConfirmText(input.versionNo)}</p>
      <div className="mt-2 flex flex-wrap gap-1.5">
        <Button size="sm" variant="secondary" onClick={input.onCancel} disabled={input.busy}>
          {SIGN_OFF_TEXT.keep}
        </Button>
        <Button size="sm" onClick={input.onConfirm} disabled={input.busy}>
          <ShieldOff className="size-3.5" /> {SIGN_OFF_TEXT.withdraw}
        </Button>
      </div>
    </div>
  );
}

/**
 * Withdraws the version's review and hands back the version as it now
 * reads, or null after saying why it failed.
 */
async function withdraw(id: string): Promise<ReportVersionRow | null> {
  try {
    const { version } = await withdrawReportReview({ data: { id } });
    toast.success(SIGN_OFF_TEXT.withdrawn);
    return version;
  } catch (err) {
    toast.error(err instanceof Error ? err.message : SIGN_OFF_TEXT.withdrawFailed);
    return null;
  }
}

/**
 * Locking, listing and reviewing report versions for issuance. A version
 * freezes the saved business under a number and the preparer's name; the
 * preparer asks for review; a reviewer of the firm who did not prepare it
 * opens it ("Open to review") and reviews it for issuance or returns it
 * with a note from the open version (OpenVersionReview), never from this
 * list over the live report; "sent" is stamped once. Until then the firm
 * owner or the signer can withdraw the review. The business's own account,
 * once it shares the business with a firm, reads the versions here and the
 * firm does that work (SHARED_BUSINESS_NOTE).
 */
export function ReportVersionsPanel() {
  const { profile, businesses, replaceProfile } = usePractice();
  const { syncStatus } = usePracticeSync();
  const { user, isPending } = useCurrentUserState();
  const [versions, setVersions] = useState<ReportVersionRow[] | null>(null);
  // The caller's role in the business's own firm (not in whatever firm they
  // belong to), as the server checks it; null until the list loads.
  const [work, setWork] = useState<BusinessWork | null>(null);
  const [review, setReview] = useState<ReviewRules | null>(null);
  const [members, setMembers] = useState<FirmMember[]>([]);
  // The account is in no firm and its plan allows locked versions.
  const [soloPlanOpen, setSoloPlanOpen] = useState(false);
  const [scope, setScope] = useState("");
  const [busy, setBusy] = useState(false);
  const [sharing, setSharing] = useState<string | null>(null);
  const [withdrawing, setWithdrawing] = useState<string | null>(null);
  const businessId = profile.businessId ?? null;
  const own = isOwnTeam(profile);
  // Report links are for a firm's client businesses (share-store.ts), and for
  // a solo owner in no firm whose plan allows locked versions (share-server.ts
  // soloShareAllowed); any other business shows no Share button rather than
  // a refused one. The server refuses anyway when the panel is wrong.
  const firmClient = Boolean(businesses.find((b) => b.id === businessId)?.firmClient);
  const canShareSolo = !firmClient && soloPlanOpen;
  const role: FirmRole | null = work?.role ?? null;
  // A business its owner shared with a firm, seen by that owner: the server
  // refuses them Lock, review, Mark sent and Share (requireBusinessRole).
  const readOnly = work?.firm === true && work.role === null;
  // Keyed on the account id, never on `user`: the session hook builds a new
  // user object on every render, so an effect keyed on it would load again
  // after each answer it set, and keep calling the server.
  const userId = user?.id ?? null;

  useEffect(() => {
    if (isPending || !userId || !businessId || !own) return;
    let cancel = false;
    void Promise.all([
      listReports({ data: { businessId } }),
      // The plan decides only a solo owner's Share, so an account in a firm
      // never asks for it. The members name the assigned reviewer.
      getFirm().then(async (firm) => ({
        members: firm.members ?? [],
        plan: firm.firm ? null : await getEntitlements().catch(() => null),
      })),
    ])
      .then(([res, { members: people, plan }]) => {
        if (cancel) return;
        setVersions(res.versions);
        setWork(res.work);
        setReview(res.review ?? null);
        setMembers(people);
        setSoloPlanOpen(Boolean(plan?.features.lockedVersions));
      })
      .catch(() => {
        if (!cancel) setVersions([]);
      });
    return () => {
      cancel = true;
    };
  }, [isPending, userId, businessId, own]);

  if (isPending || !user || !businessId || !own) return null;

  async function lock() {
    if (!businessId) return;
    if (syncStatus !== "synced") {
      toast("Wait for the save to finish", {
        description: "A locked version freezes what you have saved to your account.",
      });
      return;
    }
    setBusy(true);
    try {
      const { version } = await lockReport({
        data: { businessId, scopeNote: scope, today: localDateKey(new Date()) },
      });
      setVersions((cur) => [version, ...(cur ?? [])]);
      setScope("");
      toast.success(`Version ${version.versionNo} locked.`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "The report was not locked.");
    } finally {
      setBusy(false);
    }
  }

  const replace = (version: ReportVersionRow) =>
    setVersions((cur) => (cur ?? []).map((v) => (v.id === version.id ? version : v)));

  async function askForReview(id: string) {
    setBusy(true);
    try {
      const { version } = await requestReportReview({ data: { id } });
      replace(version);
      toast.success(
        reviewRequestedToast(
          version.reviewRequestedFrom ? (version.reviewRequestedFromName ?? "a reviewer") : null,
        ),
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : REVIEW_WORKFLOW_TEXT.askFailed);
    } finally {
      setBusy(false);
    }
  }

  async function withdrawReview(id: string) {
    setBusy(true);
    try {
      const version = await withdraw(id);
      if (version) {
        replace(version);
        setWithdrawing(null);
      }
    } finally {
      setBusy(false);
    }
  }

  async function sent(id: string) {
    setBusy(true);
    try {
      await markReportSent({ data: { id } });
      const now = new Date().toISOString();
      setVersions((cur) =>
        (cur ?? []).map((v) => (v.id === id ? { ...v, sentAt: v.sentAt ?? now } : v)),
      );
      // The business's own stamp is the one the firm page counts; keep it in step.
      if (!profile.engagement?.reportSentAt) {
        replaceProfile({ ...profile, engagement: { ...profile.engagement, reportSentAt: now } });
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not mark the version sent.");
    } finally {
      setBusy(false);
    }
  }

  const viewerId = user.id;
  const assigned = assignedReviewer(review, members);
  const buttonsFor = (version: ReportVersionRow) =>
    reviewButtonsFor({
      version,
      viewerId,
      role,
      firmClient,
      readOnly,
      canIssueAlone: review?.canIssueAlone,
    });
  // The version a reviewer came here for: named at the top, so the draft
  // below never reads as the thing to review.
  const awaiting = versions
    ? versionAwaitingReview({ versions, viewerId, role, firmClient, readOnly })
    : null;

  return (
    <section className="print:hidden mx-auto max-w-4xl px-6 pt-6" aria-label="Report versions">
      {awaiting && (
        <div
          role="status"
          className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-blue-300 bg-blue-50 p-3 text-sm font-medium text-blue-950"
        >
          <span>{awaitingReviewText(awaiting.versionNo)}</span>
          <Link
            to="/report"
            search={{ version: awaiting.id }}
            className="inline-flex h-8 items-center rounded-md bg-blue-700 px-3 text-xs font-medium text-white hover:bg-blue-800"
          >
            {openVersionText(awaiting.versionNo)}
          </Link>
        </div>
      )}
      <div className="rounded-lg border border-neutral-200 bg-neutral-50 p-4 text-sm">
        {readOnly ? (
          <p className="text-xs text-neutral-600">{SHARED_BUSINESS_NOTE}</p>
        ) : (
          <>
            <div className="flex flex-wrap items-end gap-2">
              <label className="min-w-[16rem] flex-1 text-xs text-neutral-600">
                Scope note for the next locked version (optional)
                <input
                  className="mt-1 w-full rounded-md border border-neutral-300 bg-white px-2 py-1.5 text-sm text-neutral-900"
                  value={scope}
                  onChange={(e) => setScope(e.target.value)}
                  placeholder="Money duties as mapped on the date above; excludes clinical systems."
                  maxLength={600}
                />
              </label>
              {/* Held until the list says what this account may do here. */}
              <Button
                size="sm"
                variant={lockButtonVariant({ role, awaiting: awaiting !== null })}
                onClick={() => void lock()}
                disabled={busy || versions === null}
              >
                <Lock className="size-3.5" /> Lock this version
              </Button>
            </div>
            <p className="mt-2 text-xs text-neutral-500">
              Locking freezes the business as you have saved it to your account, with your name and
              today's date. A firm reviewer who did not prepare it opens it and reviews it for
              issuance. {REVIEW_WORKFLOW_TEXT.explainer} When no one else at the firm holds the
              owner or reviewer role, the preparer may issue the file alone; that line says it is
              not an independent review. Duty ticks are starting duties, not system access. Precog
              sets the sent stamp only once.
            </p>
          </>
        )}
        {versions && versions.length > 0 && (
          <ul className="mt-3 divide-y divide-neutral-200">
            {versions.map((v) => {
              const buttons = buttonsFor(v);
              const toReview = buttons.reviewOrReturn || buttons.issueAlone;
              return (
                <li key={v.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                  <div className="min-w-0">
                    <p className="font-medium">{versionProvenance(v)}</p>
                    <p className="text-xs text-neutral-500">
                      {v.scopeNote || "No scope note"}
                      {v.sentAt ? ` · Sent ${formatDay(v.sentAt)}` : ""}
                    </p>
                    {versionNotes(v, versions, assigned)}
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    <Link
                      to="/report"
                      search={{ version: v.id }}
                      className="inline-flex h-7 items-center rounded-md border border-neutral-300 bg-white px-2 text-xs hover:bg-neutral-100"
                      aria-label={
                        toReview ? openToReviewLabel(v.versionNo) : `Open version ${v.versionNo}`
                      }
                    >
                      {toReview ? SIGN_OFF_TEXT.openToReview : "Open"}
                    </Link>
                    {buttons.ask && (
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => void askForReview(v.id)}
                        disabled={busy}
                        aria-label={askForReviewLabel(v.versionNo)}
                      >
                        <UserCheck className="size-3.5" /> {REVIEW_WORKFLOW_TEXT.ask}
                      </Button>
                    )}
                    {!readOnly && !v.sentAt && v.reviewedAt && (
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => void sent(v.id)}
                        disabled={busy}
                        aria-label={`Mark version ${v.versionNo} as sent`}
                      >
                        <Send className="size-3.5" /> Mark sent
                      </Button>
                    )}
                    {canWithdrawReview({ version: v, viewerId, work, readOnly }) && (
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => setWithdrawing((cur) => (cur === v.id ? null : v.id))}
                        disabled={busy}
                        aria-label={withdrawLabel(v.versionNo)}
                        aria-expanded={withdrawing === v.id}
                      >
                        <ShieldOff className="size-3.5" /> {SIGN_OFF_TEXT.withdraw}
                      </Button>
                    )}
                    {!readOnly && (firmClient || canShareSolo) && v.reviewedAt && v.hasFigures && (
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => setSharing((cur) => (cur === v.id ? null : v.id))}
                        aria-label={`Share version ${v.versionNo}`}
                        aria-expanded={sharing === v.id}
                      >
                        <Link2 className="size-3.5" /> Share
                      </Button>
                    )}
                  </div>
                  {withdrawing === v.id &&
                    withdrawConfirm({
                      versionNo: v.versionNo,
                      busy,
                      onConfirm: () => void withdrawReview(v.id),
                      onCancel: () => setWithdrawing(null),
                    })}
                  {sharing === v.id && (
                    <ReportSharePanel
                      versionId={v.id}
                      versionNo={v.versionNo}
                      onClose={() => setSharing(null)}
                    />
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </section>
  );
}

/**
 * The review controls on an open locked version (/report?version=…), above
 * its frozen report: the one place a reviewer reviews a version for
 * issuance, issues it alone, returns it, or withdraws a review. It reloads
 * the business's versions and review rules for the viewer, so it says when
 * a newer version supersedes this one and asks for the override note when
 * the viewer reviews in the assigned reviewer's place. A sign-off goes
 * through a dialog naming the version, its preparer and whether the review
 * is independent. Nothing shows to a signed-out visitor or to an account
 * that only reads the versions. After a sign-off, a return or a withdrawal,
 * `onChange` receives the version as it now reads, so the page above it
 * prints that provenance rather than the one it opened with.
 */
export function OpenVersionReview({
  version,
  onChange,
}: {
  version: ReportVersionRow;
  onChange?: (version: ReportVersionRow) => void;
}) {
  const { user, isPending } = useCurrentUserState();
  const [versions, setVersions] = useState<ReportVersionRow[] | null>(null);
  const [work, setWork] = useState<BusinessWork | null>(null);
  const [review, setReview] = useState<ReviewRules | null>(null);
  const [members, setMembers] = useState<FirmMember[]>([]);
  const [busy, setBusy] = useState(false);
  // The open sign-off dialog: a review (sole false) or issuing alone (sole true).
  const [dialog, setDialog] = useState<{ sole: boolean } | null>(null);
  const [note, setNote] = useState("");
  const [overrideNote, setOverrideNote] = useState("");
  const [withdrawing, setWithdrawing] = useState(false);
  // The return form under "Return to preparer": open or not, and its note.
  const [returning, setReturning] = useState(false);
  const [returnNote, setReturnNote] = useState("");
  const userId = user?.id ?? null;
  const businessId = version.businessId;

  useEffect(() => {
    if (isPending || !userId) return;
    let cancel = false;
    void Promise.all([
      listReports({ data: { businessId } }),
      getFirm()
        .then((firm) => firm.members ?? [])
        .catch(() => []),
    ])
      .then(([res, people]) => {
        if (cancel) return;
        setVersions(res.versions);
        setWork(res.work);
        setReview(res.review ?? null);
        setMembers(people);
      })
      .catch(() => {
        if (!cancel) setVersions([]);
      });
    return () => {
      cancel = true;
    };
  }, [isPending, userId, businessId]);

  if (isPending || !user || !versions || !work) return null;
  const readOnly = work.firm && work.role === null;
  if (readOnly) return null;

  const current = versions.find((v) => v.id === version.id) ?? version;
  const viewerId = user.id;
  const buttons = reviewButtonsFor({
    version: current,
    viewerId,
    role: work.role,
    firmClient: work.firm,
    canIssueAlone: review?.canIssueAlone,
  });
  const preparedOpen =
    !current.reviewedAt && !current.returnedAt && current.preparedBy === viewerId;
  const issueAloneReason =
    preparedOpen && review && !review.canIssueAlone ? review.issueAloneReason : null;
  const withdrawable = canWithdrawReview({ version: current, viewerId, work });
  const assigned = assignedReviewer(review, members);
  const newer = supersededBy(current, versions);
  const overrideNeeded =
    dialog !== null &&
    needsOverrideNote({
      version: current,
      viewerId,
      assignedReviewerUserId: review?.assignedReviewerUserId ?? null,
    });
  const text = dialog
    ? signOffDialogText({
        versionNo: current.versionNo,
        preparerName: current.preparedByName,
        sole: dialog.sole,
        supersededBy: newer,
      })
    : null;
  const replace = (next: ReportVersionRow) => {
    setVersions((cur) => (cur ?? []).map((v) => (v.id === next.id ? next : v)));
    onChange?.(next);
  };

  if (!buttons.reviewOrReturn && !buttons.issueAlone && !issueAloneReason && !withdrawable) {
    // Nothing for this viewer to do here; still say when a newer version
    // exists, and what the reviewer asked to change on a returned one.
    if (newer === null && !current.returnedAt) return null;
    return (
      <section
        className="print:hidden mx-auto max-w-4xl px-6 pt-6"
        aria-label={SIGN_OFF_TEXT.heading}
      >
        <div className="space-y-1 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
          {newer !== null && <p className="font-medium">{supersededLabel(newer)}</p>}
          {current.returnedAt && <p>{returnedNoteLine(current)}</p>}
        </div>
      </section>
    );
  }

  function openDialog(sole: boolean) {
    setNote("");
    setOverrideNote("");
    setDialog({ sole });
  }

  async function confirmSignOff() {
    if (!dialog) return;
    setBusy(true);
    try {
      const { version: signed } = await signOffReport({
        data: {
          id: current.id,
          note,
          issueWithoutIndependentReview: dialog.sole,
          ...(overrideNeeded ? { overrideNote } : {}),
        },
      });
      replace(signed);
      setDialog(null);
      toast.success(SIGN_OFF_TEXT.reviewed);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : SIGN_OFF_TEXT.failed);
    } finally {
      setBusy(false);
    }
  }

  async function giveBack() {
    if (!returnNoteReady(returnNote)) {
      toast.error(REVIEW_WORKFLOW_TEXT.noteRequired);
      return;
    }
    setBusy(true);
    try {
      const { version: returned } = await returnReport({
        data: { id: current.id, note: returnNote.trim() },
      });
      replace(returned);
      setReturning(false);
      setReturnNote("");
      toast.success(REVIEW_WORKFLOW_TEXT.returned);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : REVIEW_WORKFLOW_TEXT.returnFailed);
    } finally {
      setBusy(false);
    }
  }

  async function withdrawReview() {
    setBusy(true);
    try {
      const next = await withdraw(current.id);
      if (next) {
        replace(next);
        setWithdrawing(false);
      }
    } finally {
      setBusy(false);
    }
  }

  const ready = !overrideNeeded || overrideNoteReady(overrideNote);

  return (
    <section
      className="print:hidden mx-auto max-w-4xl px-6 pt-6"
      aria-label={SIGN_OFF_TEXT.heading}
    >
      <div className="rounded-lg border border-neutral-200 bg-neutral-50 p-4 text-sm">
        <p className="font-medium">{versionProvenance(current)}</p>
        {versionNotes(current, versions, assigned)}
        {issueAloneReason && <p className="mt-1 text-xs text-neutral-700">{issueAloneReason}</p>}
        <div className="mt-2 flex flex-wrap gap-1.5">
          {buttons.reviewOrReturn && (
            <>
              <Button
                size="sm"
                onClick={() => openDialog(false)}
                disabled={busy}
                aria-label={reviewVersionLabel(current.versionNo)}
              >
                <PenLine className="size-3.5" /> {SIGN_OFF_TEXT.review}
              </Button>
              <Button
                size="sm"
                variant="secondary"
                onClick={() => setReturning((cur) => !cur)}
                disabled={busy}
                aria-label={returnVersionLabel(current.versionNo)}
                aria-expanded={returning}
              >
                <Undo2 className="size-3.5" /> {REVIEW_WORKFLOW_TEXT.returnToPreparer}
              </Button>
            </>
          )}
          {buttons.issueAlone && (
            <Button
              size="sm"
              variant="secondary"
              onClick={() => openDialog(true)}
              disabled={busy}
              aria-label={issueAloneLabel(current.versionNo)}
            >
              <PenLine className="size-3.5" /> {SIGN_OFF_TEXT.issueAlone}
            </Button>
          )}
          {withdrawable && (
            <Button
              size="sm"
              variant="secondary"
              onClick={() => setWithdrawing((cur) => !cur)}
              disabled={busy}
              aria-label={withdrawLabel(current.versionNo)}
              aria-expanded={withdrawing}
            >
              <ShieldOff className="size-3.5" /> {SIGN_OFF_TEXT.withdraw}
            </Button>
          )}
        </div>
        {returning && buttons.reviewOrReturn && (
          <div className="mt-2 rounded-md border border-neutral-300 bg-white p-3">
            <label className="block text-xs text-neutral-700">
              {returnNoteLabel(current.versionNo)}
              <textarea
                className="mt-1 w-full rounded-md border border-neutral-300 bg-white px-2 py-1.5 text-sm text-neutral-900"
                value={returnNote}
                onChange={(e) => setReturnNote(e.target.value)}
                maxLength={RETURN_NOTE_MAX}
                rows={3}
                required
                autoFocus
              />
            </label>
            <div className="mt-2 flex flex-wrap justify-end gap-1.5">
              <Button
                size="sm"
                variant="secondary"
                onClick={() => setReturning(false)}
                disabled={busy}
              >
                {RETURN_NOTE_TEXT.cancel}
              </Button>
              <Button
                size="sm"
                onClick={() => void giveBack()}
                disabled={busy || !returnNoteReady(returnNote)}
                aria-label={returnNoteConfirmLabel(current.versionNo)}
              >
                <Undo2 className="size-3.5" /> {RETURN_NOTE_TEXT.confirm}
              </Button>
            </div>
          </div>
        )}
        {withdrawing &&
          withdrawable &&
          withdrawConfirm({
            versionNo: current.versionNo,
            busy,
            onConfirm: () => void withdrawReview(),
            onCancel: () => setWithdrawing(false),
          })}
      </div>
      {dialog && text && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-neutral-900/40 p-4"
          role="dialog"
          aria-modal="true"
          aria-label={text.title}
          onKeyDown={(e) => {
            if (e.key === "Escape" && !busy) setDialog(null);
          }}
        >
          <div className="w-full max-w-lg rounded-lg border border-neutral-200 bg-white p-5 text-sm text-neutral-900 shadow-2xl">
            <h2 className="text-base font-semibold">{text.title}</h2>
            <ul className="mt-2 space-y-0.5 text-neutral-700">
              {text.lines.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
            {overrideNeeded && (
              <label className="mt-3 block text-xs text-neutral-700">
                {overrideNoteLabel(assigned?.name ?? null)}
                <textarea
                  className="mt-1 w-full rounded-md border border-neutral-300 bg-white px-2 py-1.5 text-sm text-neutral-900"
                  value={overrideNote}
                  onChange={(e) => setOverrideNote(e.target.value)}
                  maxLength={RETURN_NOTE_MAX}
                  rows={2}
                  autoFocus
                />
              </label>
            )}
            <label className="mt-3 block text-xs text-neutral-700">
              {SIGN_OFF_TEXT.note}
              <textarea
                className="mt-1 w-full rounded-md border border-neutral-300 bg-white px-2 py-1.5 text-sm text-neutral-900"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                maxLength={RETURN_NOTE_MAX}
                rows={2}
                autoFocus={!overrideNeeded}
              />
            </label>
            <div className="mt-4 flex flex-wrap justify-end gap-2">
              <Button size="sm" variant="secondary" onClick={() => setDialog(null)} disabled={busy}>
                {SIGN_OFF_TEXT.cancel}
              </Button>
              <Button size="sm" onClick={() => void confirmSignOff()} disabled={busy || !ready}>
                <PenLine className="size-3.5" /> {text.confirm}
              </Button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
