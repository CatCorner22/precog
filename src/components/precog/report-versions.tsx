import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { toast } from "sonner";
import { Link2, Lock, PenLine, Send, Undo2, UserCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { usePractice, usePracticeSync } from "@/lib/precog/practice-context";
import {
  getFirm,
  listReports,
  lockReport,
  markReportSent,
  signOffReport,
} from "@/lib/precog/firm/server";
import { requestReportReview, returnReport } from "@/lib/precog/firm/review-server";
import { getEntitlements } from "@/lib/precog/firm/entitlements-server";
import { versionProvenance, type ReportVersionRow } from "@/lib/precog/firm/reports";
import type { FirmRole } from "@/lib/precog/firm/store";
import { isOwnTeam } from "@/lib/precog/firm/engagement";
import { formatDay, localDateKey } from "@/lib/precog/dates";
import {
  askForReviewLabel,
  returnedNoteLine,
  returnVersionLabel,
  returnWithNote,
  reviewButtonsFor,
  REVIEW_WORKFLOW_TEXT,
  reviewRequestedToast,
  SHARED_BUSINESS_NOTE,
  signOffWithNote,
} from "./report-versions-actions";
import { ReportSharePanel } from "./report-share-panel";

/** The work the caller does on the business, as the versions list reports it (businessWork). */
type BusinessWork = Awaited<ReturnType<typeof listReports>>["work"];

/**
 * Locking, listing and reviewing report versions for issuance. A version
 * freezes the saved business under a number and the preparer's name; the
 * preparer asks for review; a reviewer of the firm who did not prepare it
 * reviews it for issuance or returns it with a note; "sent" is stamped once.
 * The business's own account, once it shares the business with a firm, reads
 * the versions here and the firm does that work (SHARED_BUSINESS_NOTE).
 */
export function ReportVersionsPanel() {
  const { profile, businesses, replaceProfile } = usePractice();
  const { syncStatus } = usePracticeSync();
  const { user, isPending } = useCurrentUserState();
  const [versions, setVersions] = useState<ReportVersionRow[] | null>(null);
  // The caller's role in the business's own firm (not in whatever firm they
  // belong to), as the server checks it; null until the list loads.
  const [work, setWork] = useState<BusinessWork | null>(null);
  // The account is in no firm and its plan allows locked versions.
  const [soloPlanOpen, setSoloPlanOpen] = useState(false);
  const [scope, setScope] = useState("");
  const [busy, setBusy] = useState(false);
  const [sharing, setSharing] = useState<string | null>(null);
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
      // never asks for it.
      getFirm().then(async (firm) =>
        firm.firm ? null : await getEntitlements().catch(() => null),
      ),
    ])
      .then(([res, plan]) => {
        if (cancel) return;
        setVersions(res.versions);
        setWork(res.work);
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

  async function signOff(id: string, versionNo: number, sole = false) {
    try {
      const result = await signOffWithNote(versionNo, (note) => {
        setBusy(true);
        return signOffReport({
          data: { id, note, issueWithoutIndependentReview: sole },
        });
      });
      if (!result) return;
      replace(result.version);
      toast.success("Reviewed for issuance.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Precog did not record the review.");
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

  async function giveBack(id: string, versionNo: number) {
    try {
      const result = await returnWithNote(versionNo, (note) => {
        setBusy(true);
        return returnReport({ data: { id, note } });
      });
      if (result === null) return;
      if (result === "empty") {
        toast.error(REVIEW_WORKFLOW_TEXT.noteRequired);
        return;
      }
      replace(result.version);
      toast.success(REVIEW_WORKFLOW_TEXT.returned);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : REVIEW_WORKFLOW_TEXT.returnFailed);
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
  const buttonsFor = (version: ReportVersionRow) =>
    reviewButtonsFor({ version, viewerId, role, firmClient, readOnly });

  return (
    <section className="print:hidden mx-auto max-w-4xl px-6 pt-6" aria-label="Report versions">
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
              <Button size="sm" onClick={() => void lock()} disabled={busy || versions === null}>
                <Lock className="size-3.5" /> Lock this version
              </Button>
            </div>
            <p className="mt-2 text-xs text-neutral-500">
              Locking freezes the business as you have saved it to your account, with your name and
              today's date. A firm reviewer who did not prepare it reviews it for issuance.{" "}
              {REVIEW_WORKFLOW_TEXT.explainer} A one-person firm may issue the file; that line says
              it is not an independent review. Duty ticks are starting duties, not system access.
              Precog sets the sent stamp only once.
            </p>
          </>
        )}
        {versions && versions.length > 0 && (
          <ul className="mt-3 divide-y divide-neutral-200">
            {versions.map((v) => (
              <li key={v.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <div className="min-w-0">
                  <p className="font-medium">{versionProvenance(v)}</p>
                  <p className="text-xs text-neutral-500">
                    {v.scopeNote || "No scope note"}
                    {v.sentAt ? ` · Sent ${formatDay(v.sentAt)}` : ""}
                  </p>
                  {v.returnedAt && (
                    <p className="text-xs text-neutral-700">{returnedNoteLine(v.returnNote)}</p>
                  )}
                </div>
                <div className="flex flex-wrap gap-1.5">
                  <Link
                    to="/report"
                    search={{ version: v.id }}
                    className="inline-flex h-7 items-center rounded-md border border-neutral-300 bg-white px-2 text-xs hover:bg-neutral-100"
                    aria-label={`Open version ${v.versionNo}`}
                  >
                    Open
                  </Link>
                  {buttonsFor(v).ask && (
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
                  {buttonsFor(v).issueAlone && (
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => void signOff(v.id, v.versionNo, true)}
                      disabled={busy}
                      aria-label={`Issue version ${v.versionNo} without an independent review`}
                    >
                      <PenLine className="size-3.5" /> Issue without an independent review
                    </Button>
                  )}
                  {buttonsFor(v).reviewOrReturn && (
                    <>
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => void signOff(v.id, v.versionNo)}
                        disabled={busy}
                        aria-label={`Review version ${v.versionNo} for issuance`}
                      >
                        <PenLine className="size-3.5" /> Review for issuance
                      </Button>
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => void giveBack(v.id, v.versionNo)}
                        disabled={busy}
                        aria-label={returnVersionLabel(v.versionNo)}
                      >
                        <Undo2 className="size-3.5" /> {REVIEW_WORKFLOW_TEXT.returnToPreparer}
                      </Button>
                    </>
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
                {sharing === v.id && (
                  <ReportSharePanel
                    versionId={v.id}
                    versionNo={v.versionNo}
                    onClose={() => setSharing(null)}
                  />
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
