import { useEffect, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";

import { cn } from "@/lib/utils";

import { Loader2 } from "lucide-react";

import { createMapShare, listMapShares, revokeMapShare } from "@/lib/precog/builder/share-server";

import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { Link } from "@tanstack/react-router";
import { Copy, Link2 } from "lucide-react";

import { inputCls, labelCls } from "@/components/precog/builder/form-shared";
export function SharePanel({
  buildPayload,
}: {
  buildPayload: (
    note?: string,
    redactNames?: boolean,
  ) => import("@/lib/precog/builder/share-server").SharedMapPayload;
}) {
  const { user, isPending } = useCurrentUserState();
  const [note, setNote] = useState("");
  const [redactNames, setRedactNames] = useState(false);
  const [passcode, setPasscode] = useState("");
  const [days, setDays] = useState(30);
  const [busy, setBusy] = useState(false);
  const [links, setLinks] = useState<
    | {
        token: string;
        createdAt: string;
        expiresAt: string | null;
        revoked: boolean;
        redacted: boolean;
        hasPasscode: boolean;
        views: number;
        lastViewedAt: string | null;
      }[]
    | null
  >(null);
  const [latest, setLatest] = useState<string | null>(null);

  // Keyed on the id: the user object is rebuilt on every render, and a
  // dependency on it re-requested the list without end.
  const userId = user?.id;
  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    void listMapShares()
      .then((list) => {
        if (!cancelled) setLinks(list);
      })
      .catch(() => {
        if (!cancelled) setLinks([]);
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
          hasPasscode: passcode.trim().length >= 8,
          views: 0,
          lastViewedAt: null,
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
    await revokeMapShare({ data: { token } });
    setLinks((cur) => (cur ?? []).map((l) => (l.token === token ? { ...l, revoked: true } : l)));
    toast("Link revoked");
  }

  if (isPending)
    return (
      <div className="rounded-lg border border-border bg-panel p-2.5 text-xs text-muted">
        Checking sign-in…
      </div>
    );
  if (user?.isDevFallback) {
    return (
      <div className="rounded-lg border border-border bg-panel p-2.5 text-xs text-muted">
        Share links need a real account so they can be revoked later. Sign-in is turned off in this
        build, so sharing is unavailable here — it works once the app is published with sign-in
        enabled.
      </div>
    );
  }
  if (!user) {
    return (
      <div className="space-y-2 rounded-lg border border-border bg-panel p-2.5 text-xs">
        <p className="text-muted">
          Share links are tied to your account so you can revoke them later.{" "}
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
        view. Edits you make later are not shown; create a new link when you want to share an
        update.
      </p>
      <textarea
        className={cn(inputCls, "min-h-[44px] resize-y")}
        placeholder="Optional note to the reader (e.g. 'Draft for our Q3 lender review — please focus on cash controls.')"
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
            placeholder="8+ characters; share it separately"
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
      {links && links.length > 0 && (
        <div>
          <p className={labelCls}>Your links</p>
          <ul className="mt-1 space-y-1">
            {links.slice(0, 6).map((l) => (
              <li
                key={l.token}
                className={cn(
                  "flex items-center gap-2 rounded-md border border-border bg-elevated px-2 py-1",
                  l.revoked && "opacity-50",
                )}
              >
                <code className="min-w-0 flex-1 truncate text-xs">…{l.token.slice(-10)}</code>
                <span className="text-xs text-subtle">
                  {new Date(l.createdAt).toLocaleDateString("en-US", {
                    month: "short",
                    day: "numeric",
                  })}
                  {l.expiresAt
                    ? ` → ${new Date(l.expiresAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}`
                    : ""}
                </span>
                {l.revoked ? (
                  <span className="text-xs text-subtle">revoked</span>
                ) : (
                  <>
                    {l.redacted && (
                      <span className="rounded bg-elevated px-1 text-xs text-subtle">
                        names hidden
                      </span>
                    )}
                    {l.hasPasscode && (
                      <span className="rounded bg-elevated px-1 text-xs text-subtle">passcode</span>
                    )}
                    <span className="text-xs text-subtle">
                      {l.views
                        ? `viewed ${l.views}× · last ${new Date(l.lastViewedAt ?? l.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}`
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
                  </>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
