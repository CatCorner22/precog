/* eslint-disable react-refresh/only-export-components -- the helpers next to the controls are tested on their own */
import { useWorkspace } from "@/lib/precog/workspace-context";
import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Bell, BellOff, Download, History, MonitorSmartphone, Trash2 } from "lucide-react";
import {
  deleteAccount,
  exportAccountData,
  exportBusinessHistory,
  listHistoryDownloads,
} from "@/lib/precog/account-server";
import { getNotificationSettings, updateNotificationSettings } from "@/lib/precog/firm/server";
import type { NotificationSettings } from "@/lib/precog/firm/store";
import { useDigestState, weeklyDigestAfter } from "@/components/precog/digest-state";
import { signOut } from "@/lib/auth/client";
import { clearLocalCopies } from "@/lib/precog/local-data";
import { downloadText } from "@/lib/download";
import { localDateKey } from "@/lib/precog/dates";
import { clientErrorStatus } from "@/lib/request-errors";
import { slug } from "@/lib/precog/text";

/** The sessions dialog, loaded only when the entry is used. */
const AccountSessionsDialog = lazy(() => import("./account-sessions"));

/** The menu entry's label and hover text. */
export const SESSIONS_ENTRY = {
  label: "Sessions",
  title: "See where this account is signed in, and sign out other sessions",
} as const;

/** The "Sessions" entry and, once used, its dialog; focus returns to the entry on close. */
export function SessionsControl({ disabled }: { disabled: boolean }) {
  const [open, setOpen] = useState(false);
  const button = useRef<HTMLButtonElement>(null);
  function close() {
    setOpen(false);
    requestAnimationFrame(() => button.current?.focus());
  }
  return (
    <>
      <button
        ref={button}
        type="button"
        aria-haspopup="dialog"
        onClick={() => setOpen(true)}
        disabled={disabled}
        title={SESSIONS_ENTRY.title}
        className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-muted hover:bg-elevated hover:text-fg disabled:opacity-50"
      >
        <MonitorSmartphone className="size-3.5" aria-hidden />
        {SESSIONS_ENTRY.label}
      </button>
      {open && (
        <Suspense fallback={null}>
          <AccountSessionsDialog onClose={close} />
        </Suspense>
      )}
    </>
  );
}

interface HistoryBusiness {
  businessId: string;
  name: string;
  versions: number;
  /** The account that holds the row: the caller's own, or a firm member's for the firm owner. */
  ownerUserId: string;
}

/** One list row's key: a firm owner's own business and a member's client can share an id. */
function historyKey(b: HistoryBusiness): string {
  return `${b.ownerUserId}:${b.businessId}`;
}

/** One page as the server sends it: the rows' JSON in base64 (see encodeHistoryPage). */
function decodeHistoryPage(base64: string): unknown[] {
  const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
  return JSON.parse(new TextDecoder().decode(bytes)) as unknown[];
}

/** Fetches every page of one business's past versions and saves them as one file. */
async function downloadBusinessHistory(business: HistoryBusiness): Promise<void> {
  const versions: unknown[] = [];
  let before: number | null = null;
  do {
    const page: { base64: string; nextBeforeRevision: number | null } = await exportBusinessHistory(
      {
        data: {
          businessId: business.businessId,
          beforeRevision: before,
          ownerUserId: business.ownerUserId,
        },
      },
    );
    versions.push(...decodeHistoryPage(page.base64));
    before = page.nextBeforeRevision;
  } while (before !== null);
  const file = {
    exportedAt: new Date().toISOString(),
    businessId: business.businessId,
    name: business.name,
    versions,
  };
  downloadText(
    `precog-history-${slug(business.name) || business.businessId}-${localDateKey(new Date())}.json`,
    JSON.stringify(file, null, 2),
    "application/json",
  );
}

/**
 * Lists the account's businesses that have past versions; each one downloads
 * on its own. Reports a running download through `onBusy` so the other
 * account controls wait for it.
 */
function HistoryDownloads({
  disabled,
  onBusy,
}: {
  disabled: boolean;
  onBusy: (busy: boolean) => void;
}) {
  const [open, setOpen] = useState(false);
  const [businesses, setBusinesses] = useState<HistoryBusiness[] | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function closeOutside(event: Event) {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener("pointerdown", closeOutside);
    document.addEventListener("focusin", closeOutside);
    return () => {
      document.removeEventListener("pointerdown", closeOutside);
      document.removeEventListener("focusin", closeOutside);
    };
  }, [open]);

  async function toggle() {
    if (open) {
      setOpen(false);
      return;
    }
    setOpen(true);
    try {
      setBusinesses((await listHistoryDownloads()).businesses);
    } catch {
      setOpen(false);
      toast.error("Precog could not list past versions. Try again in a moment.");
    }
  }

  async function download(business: HistoryBusiness) {
    setBusyId(historyKey(business));
    onBusy(true);
    try {
      await downloadBusinessHistory(business);
      toast.success(`Past versions of ${business.name} are downloading as one JSON file.`);
    } catch {
      toast.error("The history download failed. Try again in a moment.");
    } finally {
      setBusyId(null);
      onBusy(false);
    }
  }

  return (
    <div ref={root} className="relative">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => void toggle()}
        onKeyDown={(event) => {
          if (event.key === "Escape") setOpen(false);
        }}
        disabled={disabled}
        title="Download each business's past versions, one file per business"
        className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-muted hover:bg-elevated hover:text-fg disabled:opacity-50"
      >
        <History className="size-3.5" aria-hidden />
        Download history
      </button>
      {open && (
        <div
          role="group"
          aria-label="Download history"
          onKeyDown={(event) => {
            if (event.key === "Escape") setOpen(false);
          }}
          className="absolute right-0 z-30 mt-1 w-64 rounded-lg border border-border bg-surface p-1 shadow-xl"
        >
          {businesses === null ? (
            <p className="px-2.5 py-2 text-xs text-muted">Loading…</p>
          ) : businesses.length === 0 ? (
            <p className="px-2.5 py-2 text-xs text-muted">No business has past versions yet.</p>
          ) : (
            businesses.map((b) => (
              <button
                key={historyKey(b)}
                type="button"
                onClick={() => void download(b)}
                disabled={busyId !== null}
                title={`Download history for ${b.name}`}
                className="flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-xs text-muted hover:bg-elevated hover:text-fg disabled:opacity-50"
              >
                <Download className="size-3.5" aria-hidden />
                <span className="flex-1 truncate">{b.name}</span>
                <span>
                  {busyId === historyKey(b)
                    ? "Downloading…"
                    : `${b.versions} ${b.versions === 1 ? "version" : "versions"}`}
                </span>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}

export const DELETE_ACCOUNT_PROMPT =
  "This deletes your account and everything in it: every business and its history, report versions, snapshots, shared links, your firm workspace and its members' access, reminders, the billing record (Stripe keeps its invoices and tax records) and the QuickBooks link. You cannot undo this. Export data and Download history first if you want a copy. Type DELETE to confirm.";

/** The header's wording for the weekly digest switch. */
export function digestSwitchLabel(weeklyDigest: boolean): string {
  return weeklyDigest ? "Weekly digest: on" : "Weekly digest: off";
}

/** Why the weekly digest cannot reach the account's address (getNotificationSettings). */
export type DigestAddressProblem = "x_only" | "unconfirmed" | null;

/** The note under the digest switch when the digest is on but cannot reach the account. */
export function digestAddressNote(problem: DigestAddressProblem): string | null {
  if (problem === "x_only") {
    return "Precog cannot email the address your X sign-in carries, so the weekly digest cannot reach you. Sign in with Google or an email-and-password account to receive it.";
  }
  if (problem === "unconfirmed") {
    return "Precog cannot confirm the address on this account, so the weekly digest cannot reach you. Sign in with a Google account whose address Google has confirmed, or with an email-and-password account.";
  }
  return null;
}

/**
 * Flips the weekly digest alone and saves both switches; the saved settings
 * come back, or null when the save failed and the old ones stand.
 */
export async function toggleDigest(
  settings: NotificationSettings,
): Promise<NotificationSettings | null> {
  const next = { ...settings, weeklyDigest: !settings.weeklyDigest };
  try {
    await updateNotificationSettings({ data: next });
    return next;
  } catch {
    toast.error("Precog did not save the reminder settings.");
    return null;
  }
}

/**
 * The digest switch as drawn; hidden while this deployment cannot send email.
 * While on, a note under it says why the digest cannot reach this account,
 * when it cannot.
 */
export function DigestSwitch({
  state,
  disabled,
  onToggle,
}: {
  state: {
    settings: NotificationSettings;
    mailConfigured: boolean;
    digestAddressProblem?: DigestAddressProblem;
  } | null;
  disabled: boolean;
  onToggle: () => void;
}) {
  if (!state || !state.mailConfigured) return null;
  const on = state.settings.weeklyDigest;
  const Icon = on ? Bell : BellOff;
  const note = on ? digestAddressNote(state.digestAddressProblem ?? null) : null;
  const button = (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      onClick={onToggle}
      disabled={disabled}
      title="Once a week, Precog emails what is due on your businesses"
      className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-muted hover:bg-elevated hover:text-fg disabled:opacity-50"
    >
      <Icon className="size-3.5" aria-hidden />
      {digestSwitchLabel(on)}
    </button>
  );
  if (!note) return button;
  return (
    <span className="inline-flex max-w-xs flex-col items-start">
      {button}
      <span className="px-2 text-xs text-warn">{note}</span>
    </span>
  );
}

/**
 * Loads the switches once and keeps the digest one in step with the one-time
 * question above the tab strip: an answer there shows here, and a flip here
 * answers the question (the server stamps the ask on either save).
 */
function DigestControl({ disabled }: { disabled: boolean }) {
  const [state, setState] = useState<{
    settings: NotificationSettings;
    mailConfigured: boolean;
    digestAddressProblem: DigestAddressProblem;
  } | null>(null);
  const [saving, setSaving] = useState(false);
  const digest = useDigestState();
  useEffect(() => {
    let cancel = false;
    void getNotificationSettings()
      .then((res) => {
        if (!cancel) {
          setState({
            settings: res.settings,
            mailConfigured: res.mailConfigured,
            digestAddressProblem: res.digestAddressProblem ?? null,
          });
        }
      })
      .catch(() => undefined);
    return () => {
      cancel = true;
    };
  }, []);
  const shown = state && {
    ...state,
    settings: {
      ...state.settings,
      weeklyDigest: weeklyDigestAfter(digest.change, state.settings.weeklyDigest),
    },
  };
  async function toggle() {
    if (!shown) return;
    setSaving(true);
    const saved = await toggleDigest(shown.settings);
    if (saved) {
      setState({ ...shown, settings: saved });
      digest.record({ asked: true, weeklyDigest: saved.weeklyDigest });
    }
    setSaving(false);
  }
  return (
    <DigestSwitch state={shown} disabled={disabled || saving} onToggle={() => void toggle()} />
  );
}

/** Export, history, digest, sessions and delete controls for the signed-in account. */
export function AccountDataControls() {
  const workspace = useWorkspace();
  const [busy, setBusy] = useState<"export" | "history" | "delete" | null>(null);

  async function exportAll() {
    setBusy("export");
    try {
      const { json } = await exportAccountData();
      downloadText(`precog-account-${localDateKey(new Date())}.json`, json, "application/json");
      toast.success("Your data is downloading as one JSON file.");
    } catch {
      toast.error("The export failed. Try again in a moment.");
    } finally {
      setBusy(null);
    }
  }

  async function deleteAccountAndSignOut() {
    const typed = window.prompt(DELETE_ACCOUNT_PROMPT);
    if (typed !== "DELETE") return;
    setBusy("delete");
    try {
      await deleteAccount({ data: { confirm: "DELETE" } });
      clearLocalCopies(workspace.local);
      workspace.session?.clear();
      toast.success("Precog has deleted your account and its data.");
      await signOut("/", { skipRecovery: true });
    } catch (error) {
      toast.error(
        clientErrorStatus(error) === 409 && error instanceof Error
          ? error.message
          : "Precog could not finish the deletion or the sign-out. Reload to check the account. If the deletion finished, you cannot undo this.",
      );
      setBusy(null);
    }
  }

  return (
    // On a phone the five controls wrap under one another instead of
    // pushing the header wider than the screen.
    <div className="flex min-w-0 flex-wrap items-center gap-1">
      <button
        type="button"
        onClick={() => void exportAll()}
        disabled={busy !== null}
        title="Download this account's data as one JSON file; past versions download with Download history"
        className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-muted hover:bg-elevated hover:text-fg disabled:opacity-50"
      >
        <Download className="size-3.5" aria-hidden />
        Export data
      </button>
      <HistoryDownloads
        disabled={busy !== null}
        onBusy={(running) => setBusy(running ? "history" : null)}
      />
      <DigestControl disabled={busy !== null} />
      <SessionsControl disabled={busy !== null} />
      <button
        type="button"
        onClick={() => void deleteAccountAndSignOut()}
        disabled={busy !== null}
        title="Delete this account and everything in it"
        className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-muted hover:bg-elevated hover:text-danger disabled:opacity-50"
      >
        <Trash2 className="size-3.5" aria-hidden />
        Delete account
      </button>
    </div>
  );
}
