import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { toast } from "sonner";
import { Lock, PenLine, Send } from "lucide-react";
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
import { versionProvenance, type ReportVersionRow } from "@/lib/precog/firm/reports";
import type { FirmRole } from "@/lib/precog/firm/store";
import { isOwnTeam } from "@/lib/precog/firm/engagement";
import { formatDay, localDateKey } from "@/lib/precog/dates";
import { signOffWithNote } from "./report-versions-actions";

/**
 * Locking, listing and reviewing report versions for issuance. A version
 * freezes the saved business under a number and the preparer's name; a
 * reviewer of the firm who did not prepare it reviews it for issuance;
 * "sent" is stamped once.
 */
export function ReportVersionsPanel() {
  const { profile, replaceProfile } = usePractice();
  const { syncStatus } = usePracticeSync();
  const { user, isPending } = useCurrentUserState();
  const [versions, setVersions] = useState<ReportVersionRow[] | null>(null);
  const [role, setRole] = useState<FirmRole | null>(null);
  const [scope, setScope] = useState("");
  const [busy, setBusy] = useState(false);
  const businessId = profile.businessId ?? null;
  const own = isOwnTeam(profile);

  useEffect(() => {
    if (isPending || !user || !businessId || !own) return;
    let cancel = false;
    void Promise.all([listReports({ data: { businessId } }), getFirm()])
      .then(([res, firm]) => {
        if (cancel) return;
        setVersions(res.versions);
        setRole(firm.firm?.role ?? null);
      })
      .catch(() => {
        if (!cancel) setVersions([]);
      });
    return () => {
      cancel = true;
    };
  }, [isPending, user, businessId, own]);

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
      const { version } = result;
      setVersions((cur) => (cur ?? []).map((v) => (v.id === id ? version : v)));
      toast.success("Reviewed for issuance.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Precog did not record the review.");
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
    } catch {
      toast.error("Could not mark the version sent.");
    } finally {
      setBusy(false);
    }
  }

  const canReview = role === "owner" || role === "reviewer";

  return (
    <section className="print:hidden mx-auto max-w-4xl px-6 pt-6" aria-label="Report versions">
      <div className="rounded-lg border border-neutral-200 bg-neutral-50 p-4 text-sm">
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
          <Button size="sm" onClick={() => void lock()} disabled={busy}>
            <Lock className="size-3.5" /> Lock this version
          </Button>
        </div>
        <p className="mt-2 text-xs text-neutral-500">
          Locking freezes the business as you have saved it to your account, with your name and
          today's date. A firm reviewer who did not prepare it reviews it for issuance. A one-person
          firm may issue the file; that line says it is not an independent review. Duty ticks are
          starting duties, not system access. Precog sets the sent stamp only once.
        </p>
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
                  {!v.reviewedAt && v.preparedBy === user.id && (
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
                  {!v.reviewedAt && canReview && v.preparedBy !== user.id && (
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => void signOff(v.id, v.versionNo)}
                      disabled={busy}
                      aria-label={`Review version ${v.versionNo} for issuance`}
                    >
                      <PenLine className="size-3.5" /> Review for issuance
                    </Button>
                  )}
                  {!v.sentAt && (
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
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
