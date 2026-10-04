import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { toast } from "sonner";
import { Copy, Link2, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { inputCls, labelCls } from "@/components/ui/field-classes";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { SHARE_PASSCODE_MIN, type SharedMapPayload } from "@/lib/precog/share/share-schema";
import { createMapShare, listMapShares, revokeMapShare } from "@/lib/precog/share/share-server";
import type { ShareSummary } from "@/lib/precog/share/share-store";
import { formatDayShort } from "@/lib/precog/dates";
import { count } from "@/lib/precog/text";
import { cn } from "@/lib/utils";

/**
 * Read-only share links for an advisor or lender: create one, and see,
 * copy or revoke every live link. Revoked and expired links fold away.
 */
export function SharePanel({
  businessId,
  buildPayload,
}: {
  /** The business the link copies; deleting it revokes the link. */
  businessId: string;
  buildPayload: (note?: string, redactNames?: boolean) => SharedMapPayload;
}) {
  const { user, isPending } = useCurrentUserState();
  const [note, setNote] = useState("");
  const [redactNames, setRedactNames] = useState(false);
  const [passcode, setPasscode] = useState("");
  const [days, setDays] = useState(30);
  const [busy, setBusy] = useState(false);
  const [links, setLinks] = useState<ShareSummary[] | null>(null);
  const [listFailed, setListFailed] = useState(false);
  const [showInactive, setShowInactive] = useState(false);
  const [latest, setLatest] = useState<string | null>(null);

  // Keyed on the id: the user object is rebuilt on every render, and a
  // dependency on it re-requested the list without end.
  const userId = user?.id;
  useEffect(() => {
    if (!userId) return;
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
  }, [userId]);

  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const urlFor = (token: string) => `${origin}/share/${token}`;

  async function create() {
    setBusy(true);
    try {
      const res = await createMapShare({
        data: {
          businessId,
          payload: buildPayload(note, redactNames),
          expiresInDays: days,
          redacted: redactNames,
          passcode,
        },
      });
      setLatest(res.token);
      setLinks((cur) => [
        {
          token: res.token,
          createdAt: new Date().toISOString(),
          expiresAt: res.expiresAt,
          revoked: false,
          redacted: redactNames,
          hasPasscode: res.hasPasscode,
          views: 0,
          lastViewedAt: null,
          createdBy: null,
          kind: "map",
          businessId,
          reportVersionId: null,
          versionNo: null,
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

  async function copy(text: string) {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // clipboard may be blocked; the link is still shown
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
  const live = (links ?? []).filter((l) => isLive(l, now));
  const inactive = (links ?? []).filter((l) => !isLive(l, now));

  if (isPending)
    return (
      <div className="rounded-lg border border-border bg-panel p-2.5 text-xs text-muted">
        Checking sign-in…
      </div>
    );
  if (user?.isDevFallback) {
    return (
      <div className="rounded-lg border border-border bg-panel p-2.5 text-xs text-muted">
        Share links need a real account so that you can revoke them later. This build has sign-in
        turned off, so sharing is unavailable here; it works once Precog runs with sign-in turned
        on.
      </div>
    );
  }
  if (!user) {
    return (
      <div className="space-y-2 rounded-lg border border-border bg-panel p-2.5 text-xs">
        <p className="text-muted">
          Your account owns each link, so you can revoke it later.{" "}
          <Link to="/login" className="text-primary hover:underline">
            Sign in
          </Link>{" "}
          to create one.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-2 rounded-lg border border-border bg-panel p-2.5 text-xs">
      <p className="text-muted">
        Create a read-only snapshot for an advisor, lender, or board member — no sign-in needed to
        view. The link does not show edits you make later; create a new link when you want to share
        an update.
      </p>
      <textarea
        className={cn(inputCls, "min-h-[44px] resize-y")}
        aria-label="Note to the reader (optional)"
        maxLength={NOTE_MAX}
        placeholder="Optional note to the reader (for example: 'Draft for our Q3 lender review — please focus on cash controls.')"
        value={note}
        onChange={(e) => setNote(e.target.value)}
      />
      <div className="flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-1.5 text-muted">
          <input
            type="checkbox"
            checked={redactNames}
            onChange={(e) => setRedactNames(e.target.checked)}
          />
          Hide people&apos;s names (roles only)
        </label>
        <label className="flex min-w-48 flex-1 items-center gap-1.5 text-muted">
          <span className="shrink-0">Optional passcode</span>
          <input
            type="password"
            className={cn(inputCls, "min-w-0 flex-1")}
            placeholder={`${SHARE_PASSCODE_MIN}+ characters; share it separately`}
            value={passcode}
            onChange={(e) => setPasscode(e.target.value)}
          />
        </label>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <label className="flex items-center gap-1 text-muted">
          Expires in
          <select
            className={cn(inputCls, "w-auto")}
            value={days}
            onChange={(e) => setDays(Number(e.target.value))}
          >
            {[7, 30, 90, 180].map((d) => (
              <option key={d} value={d}>
                {d} days
              </option>
            ))}
          </select>
        </label>
        <Button size="sm" onClick={() => void create()} disabled={busy}>
          {busy ? <Loader2 className="size-3.5 animate-spin" /> : <Link2 className="size-3.5" />}
          Create link
        </Button>
      </div>
      {latest && (
        <div className="flex items-center gap-1.5 rounded-md border border-ok/40 bg-ok/10 px-2 py-1.5">
          <code className="min-w-0 flex-1 truncate text-xs text-fg">{urlFor(latest)}</code>
          <button
            type="button"
            onClick={() => void copy(urlFor(latest))}
            className="text-primary hover:underline"
            title="Copy"
          >
            <Copy className="size-3" />
          </button>
          <a
            href={urlFor(latest)}
            target="_blank"
            rel="noreferrer"
            className="text-primary hover:underline"
          >
            Open
          </a>
        </div>
      )}
      {listFailed && (
        <p className="text-xs text-danger">
          Couldn&apos;t load your links. Close and reopen Share to try again.
        </p>
      )}
      {live.length > 0 && (
        <div>
          <p className={labelCls}>Live links ({live.length})</p>
          <ul className="mt-1 space-y-1">
            {live.map((l) => (
              <ShareRow key={l.token} link={l}>
                {l.createdBy && (
                  <span className="rounded bg-elevated px-1 text-xs text-subtle">
                    made by {l.createdBy}
                  </span>
                )}
                {l.redacted && (
                  <span className="rounded bg-elevated px-1 text-xs text-subtle">names hidden</span>
                )}
                {l.hasPasscode && (
                  <span className="rounded bg-elevated px-1 text-xs text-subtle">passcode</span>
                )}
                <span className="text-xs text-subtle">
                  {l.views
                    ? `viewed ${l.views}× · last ${formatDayShort(l.lastViewedAt ?? l.createdAt)}`
                    : "not viewed yet"}
                </span>
                <button
                  type="button"
                  onClick={() => void copy(urlFor(l.token))}
                  className="text-xs text-primary hover:underline"
                >
                  Copy
                </button>
                <button
                  type="button"
                  onClick={() => void revoke(l.token)}
                  className="text-xs text-danger hover:underline"
                >
                  Revoke
                </button>
              </ShareRow>
            ))}
          </ul>
        </div>
      )}
      {inactive.length > 0 && (
        <div>
          <button
            type="button"
            aria-expanded={showInactive}
            onClick={() => setShowInactive((v) => !v)}
            className="text-xs text-subtle underline hover:text-fg"
          >
            {showInactive ? "Hide" : "Show"} {count(inactive.length, "revoked or expired link")}
          </button>
          {showInactive && (
            <ul className="mt-1 space-y-1">
              {inactive.map((l) => (
                <ShareRow key={l.token} link={l} faded>
                  <span className="text-xs text-subtle">{l.revoked ? "revoked" : "expired"}</span>
                </ShareRow>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

function ShareRow({
  link,
  faded = false,
  children,
}: {
  link: ShareSummary;
  faded?: boolean;
  children: React.ReactNode;
}) {
  return (
    <li
      className={cn(
        "flex items-center gap-2 rounded-md border border-border bg-elevated px-2 py-1",
        faded && "opacity-50",
      )}
    >
      <code className="min-w-0 flex-1 truncate text-xs">…{link.token.slice(-10)}</code>
      <span className="text-xs text-subtle">
        {formatDayShort(link.createdAt)}
        {link.expiresAt ? ` → ${formatDayShort(link.expiresAt)}` : ""}
      </span>
      {children}
    </li>
  );
}

/** Not revoked and not past its expiry: the link still opens. */
function isLive(link: ShareSummary, nowIso: string): boolean {
  return !link.revoked && (!link.expiresAt || link.expiresAt > nowIso);
}

/** The server's limit on the note (share-schema.ts). */
const NOTE_MAX = 2_000;
