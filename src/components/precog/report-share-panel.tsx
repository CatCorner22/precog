import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Copy, Link2, Loader2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { inputCls, labelCls } from "@/components/ui/field-classes";
import { SHARE_PASSCODE_MIN } from "@/lib/precog/share/share-schema";
import { createReportShare, listMapShares, revokeMapShare } from "@/lib/precog/share/share-server";
import type { ShareSummary } from "@/lib/precog/share/share-store";
import { formatDayShort } from "@/lib/precog/dates";
import { cn } from "@/lib/utils";
import { REPORT_SHARE_EXPIRIES, REPORT_SHARE_NOTE } from "./report-share-panel-text";

/**
 * Read-only links to one locked report version: an expiry, an optional
 * passcode, "Create link" (copied to the clipboard), and the live links of
 * this version with Revoke. Map links are the map builder's panel's and are
 * not listed here.
 */
export function ReportSharePanel({
  versionId,
  versionNo,
  onClose,
}: {
  versionId: string;
  versionNo: number;
  onClose: () => void;
}) {
  const [days, setDays] = useState<number>(30);
  const [passcode, setPasscode] = useState("");
  const [busy, setBusy] = useState(false);
  const [links, setLinks] = useState<ShareSummary[] | null>(null);
  const [listFailed, setListFailed] = useState(false);
  const [latest, setLatest] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void listMapShares()
      .then((list) => {
        if (cancelled) return;
        setLinks(list);
        setListFailed(false);
      })
      .catch(() => {
        if (cancelled) return;
        setLinks([]);
        setListFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [versionId]);

  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const urlFor = (token: string) => `${origin}/share/report/${token}`;

  async function copy(text: string) {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // The clipboard may be blocked; the link is still shown.
    }
  }

  async function create() {
    setBusy(true);
    try {
      const res = await createReportShare({
        data: { versionId, expiresInDays: days, passcode },
      });
      setLatest(res.token);
      setLinks((cur) => [
        {
          token: res.token,
          createdAt: new Date().toISOString(),
          expiresAt: res.expiresAt,
          revoked: false,
          redacted: false,
          hasPasscode: res.hasPasscode,
          views: 0,
          lastViewedAt: null,
          createdBy: null,
          kind: "report",
          businessId: null,
          reportVersionId: versionId,
          versionNo,
        },
        ...(cur ?? []),
      ]);
      setPasscode("");
      await copy(urlFor(res.token));
      toast.success("Share link created and copied", { description: `Expires in ${days} days.` });
    } catch (e) {
      toast.error("Couldn't create link", {
        description: e instanceof Error ? e.message : "Try again",
      });
    } finally {
      setBusy(false);
    }
  }

  async function revoke(token: string) {
    try {
      await revokeMapShare({ data: { token } });
    } catch (e) {
      // The link still opens; say so rather than leave the row looking revoked.
      toast.error("Couldn't revoke the link", {
        description: `It still opens. ${e instanceof Error ? e.message : "Try again in a moment."}`,
      });
      return;
    }
    setLinks((cur) => (cur ?? []).map((l) => (l.token === token ? { ...l, revoked: true } : l)));
    toast("Link revoked");
  }

  const now = new Date().toISOString();
  const live = (links ?? []).filter(
    (l) =>
      l.kind === "report" &&
      l.reportVersionId === versionId &&
      !l.revoked &&
      (!l.expiresAt || l.expiresAt > now),
  );

  return (
    <div
      className="mt-2 w-full space-y-2 rounded-md border border-neutral-300 bg-white p-3 text-xs"
      role="region"
      aria-label={`Share version ${versionNo}`}
    >
      <div className="flex items-start justify-between gap-2">
        <p className="text-neutral-700">{REPORT_SHARE_NOTE}</p>
        <button
          type="button"
          onClick={onClose}
          className="shrink-0 rounded p-0.5 text-neutral-500 hover:text-neutral-900"
          aria-label="Close sharing"
        >
          <X className="size-4" />
        </button>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-1 text-neutral-700">
          Expires in
          <select
            className={cn(inputCls, "w-auto")}
            value={days}
            onChange={(e) => setDays(Number(e.target.value))}
          >
            {REPORT_SHARE_EXPIRIES.map((d) => (
              <option key={d} value={d}>
                {d} days
              </option>
            ))}
          </select>
        </label>
        <label className="flex min-w-48 flex-1 items-center gap-1.5 text-neutral-700">
          <span className="shrink-0">Optional passcode</span>
          <input
            type="password"
            className={cn(inputCls, "min-w-0 flex-1")}
            placeholder={`${SHARE_PASSCODE_MIN}+ characters; share it separately`}
            value={passcode}
            onChange={(e) => setPasscode(e.target.value)}
          />
        </label>
        <Button size="sm" onClick={() => void create()} disabled={busy}>
          {busy ? <Loader2 className="size-3.5 animate-spin" /> : <Link2 className="size-3.5" />}
          Create link
        </Button>
      </div>
      {latest && (
        <div className="flex items-center gap-1.5 rounded-md border border-emerald-300 bg-emerald-50 px-2 py-1.5">
          <code className="min-w-0 flex-1 truncate text-xs">{urlFor(latest)}</code>
          <button
            type="button"
            onClick={() => void copy(urlFor(latest))}
            className="text-neutral-700 hover:underline"
            title="Copy"
          >
            <Copy className="size-3" />
          </button>
          <a
            href={urlFor(latest)}
            target="_blank"
            rel="noreferrer"
            className="text-neutral-700 hover:underline"
          >
            Open
          </a>
        </div>
      )}
      {listFailed && (
        <p className="text-red-700">Couldn&apos;t load this version&apos;s links. Try again.</p>
      )}
      {live.length > 0 && (
        <div>
          <p className={labelCls}>Live links ({live.length})</p>
          <ul className="mt-1 space-y-1">
            {live.map((l) => (
              <li
                key={l.token}
                className="flex items-center gap-2 rounded-md border border-neutral-200 bg-neutral-50 px-2 py-1"
              >
                <code className="min-w-0 flex-1 truncate text-xs">…{l.token.slice(-10)}</code>
                <span className="text-neutral-500">
                  {formatDayShort(l.createdAt)}
                  {l.expiresAt ? ` → ${formatDayShort(l.expiresAt)}` : ""}
                </span>
                {l.createdBy && (
                  <span className="rounded bg-neutral-200 px-1 text-neutral-700">
                    made by {l.createdBy}
                  </span>
                )}
                {l.hasPasscode && (
                  <span className="rounded bg-neutral-200 px-1 text-neutral-700">passcode</span>
                )}
                <span className="text-neutral-500">
                  {l.views
                    ? `viewed ${l.views}× · last ${formatDayShort(l.lastViewedAt ?? l.createdAt)}`
                    : "not viewed yet"}
                </span>
                <button
                  type="button"
                  onClick={() => void copy(urlFor(l.token))}
                  className="text-neutral-700 hover:underline"
                >
                  Copy
                </button>
                <button
                  type="button"
                  onClick={() => void revoke(l.token)}
                  className="text-red-700 hover:underline"
                >
                  Revoke
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
