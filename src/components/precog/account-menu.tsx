/* eslint-disable react-refresh/only-export-components -- the helpers next to the controls are tested on their own */
import { useWorkspace } from "@/lib/precog/workspace-context";
import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { toast } from "sonner";
import {
  Bell,
  BellOff,
  Download,
  HardDriveDownload,
  History,
  MonitorSmartphone,
  Trash2,
} from "lucide-react";
import { hasWorkspaceRecoveryOffer } from "@/lib/precog/workspace-recovery-offer";
import {
  deleteAccount,
  exportAccountDataPage,
  exportBusinessHistory,
  listHistoryDownloads,
  SIGN_IN_AGAIN_TO_DELETE,
} from "@/lib/precog/account-server";
import {
  assembleAccountExport,
  decodeBase64Json,
  decodeExportPage,
  EXPORT_CHANGED,
  ExportChangedError,
  exportFileChunks,
  exportProgressLabel,
  partArrivedWhole,
  type ExportPartRequest,
} from "@/lib/precog/account-export";
import { getNotificationSettings, updateNotificationSettings } from "@/lib/precog/firm/server";
import type { NotificationSettings } from "@/lib/precog/firm/store";
import { useDigestState, weeklyDigestAfter } from "@/components/precog/digest-state";
import { signOut } from "@/lib/auth/client";
import { clearLocalCopies } from "@/lib/precog/local-data";
import { downloadText, downloadUrl } from "@/lib/download";
import { localDateKey } from "@/lib/precog/dates";
import { clientErrorStatus } from "@/lib/request-errors";
import { slug } from "@/lib/precog/text";
import { showSignInAgain } from "./sign-in-again";

/** The sessions dialog, loaded only when the entry is used. */
const AccountSessionsDialog = lazy(() => import("./account-sessions"));
const WorkspaceRecoveryDialog = lazy(() => import("./workspace-recovery-dialog"));

/** The account menu entry for local guest copy and legacy export. */
export const RECOVERY_ENTRY = {
  label: "Local recovery",
  title: "Copy guest businesses or export older records saved on this device",
} as const;

/** The menu entry's label and hover text. */
export const SESSIONS_ENTRY = {
  label: "Sessions",
  title: "See where you are signed in and sign out other sessions",
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
    // One page as the server sends it: the rows' JSON in base64.
    versions.push(...decodeBase64Json<unknown[]>(page.base64));
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

/** How many more times the download asks for one part after a failure that may pass. */
export const EXPORT_PART_RETRIES = 2;
/** The wait before the first retry of a part; the next one waits twice as long. */
const EXPORT_RETRY_WAIT_MS = 1_000;

/** How the export download reaches the disk and waits between tries; tests pass their own. */
export interface ExportDownloadOptions {
  save?: (fileName: string, file: Blob) => void;
  wait?: (ms: number) => Promise<void>;
}

/** Saves a file built in the browser: one object URL, one click, released. */
function saveBlob(fileName: string, file: Blob): void {
  const url = URL.createObjectURL(file);
  downloadUrl(fileName, url);
  URL.revokeObjectURL(url);
}

/**
 * Asks for one part, and again up to EXPORT_PART_RETRIES more times when
 * the failure may pass (the network, the server). A refusal (4xx) answers
 * the same way again, so it fails at once: signed out, or the data changed.
 */
async function fetchPart(
  part: ExportPartRequest,
  wait: (ms: number) => Promise<void>,
): Promise<{ base64: string; parts: ExportPartRequest[] | null }> {
  for (let attempt = 0; ; attempt += 1) {
    try {
      return await exportAccountDataPage({ data: part });
    } catch (error) {
      if (attempt >= EXPORT_PART_RETRIES || clientErrorStatus(error) !== null) throw error;
      await wait(EXPORT_RETRY_WAIT_MS * 2 ** attempt);
    }
  }
}

/**
 * Fetches the account export's parts in order, reporting each one done
 * against the total the first part names, and saves them joined as one
 * file, built from pieces (exportFileChunks) rather than one string. A part
 * that fails is asked for again (fetchPart). A part that comes back with
 * fewer or more rows than the plan counted means the data changed during
 * the download: nothing is saved (ExportChangedError), and the person tries
 * again for a file that holds everything.
 */
export async function downloadAccountExport(
  onProgress: (done: number, total: number) => void,
  options: ExportDownloadOptions = {},
): Promise<void> {
  const save = options.save ?? saveBlob;
  const wait = options.wait ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const first = await fetchPart({ section: "account" }, wait);
  const rest = first.parts ?? [];
  const total = rest.length + 1;
  const pages = [decodeExportPage(first.base64)];
  onProgress(1, total);
  for (const part of rest) {
    const page = decodeExportPage((await fetchPart(part, wait)).base64);
    if (!partArrivedWhole(part, page)) throw new ExportChangedError();
    pages.push(page);
    onProgress(pages.length, total);
  }
  const file = new Blob(exportFileChunks(assembleAccountExport(pages)), {
    type: "application/json",
  });
  save(`precog-account-${localDateKey(new Date())}.json`, file);
}

/** The button on a failed export's message, which starts the download again. */
export const EXPORT_RETRY_LABEL = "Try again";
/** The message when an export fails for any other reason. */
export const EXPORT_FAILED = "Export failed. Try again soon.";

/**
 * Says why the export saved nothing, with a button that starts it again: the
 * data changed during the download (a part came back short or long, or the
 * server refused one), or the export failed.
 */
export function showExportFailure(error: unknown, retry: () => void): void {
  const changed = error instanceof ExportChangedError || clientErrorStatus(error) === 409;
  toast.error(changed ? EXPORT_CHANGED : EXPORT_FAILED, {
    duration: 15_000,
    action: { label: EXPORT_RETRY_LABEL, onClick: retry },
  });
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
      toast.error("History download failed. Try again soon.");
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
        title="Download one file per business with its past versions"
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
  "Delete your account and everything in it: every business and its history, report versions, snapshots, shared links, your firm workspace and member access, reminders, the billing record, and the QuickBooks link. Stripe keeps its invoices and tax records. You cannot undo this. Export data and Download history first if you want a copy. Type DELETE to confirm.";

/** The header's wording for the weekly digest switch. */
export function digestSwitchLabel(weeklyDigest: boolean): string {
  return weeklyDigest ? "Weekly digest: on" : "Weekly digest: off";
}

/** Why the weekly digest cannot reach the account's address (getNotificationSettings). */
export type DigestAddressProblem = "x_only" | "unconfirmed" | null;

/** The note under the digest switch when the digest is on but cannot reach the account. */
export function digestAddressNote(problem: DigestAddressProblem): string | null {
  if (problem === "x_only") {
    return "Precog cannot email the address linked to your X sign-in. Sign in with Google or email and password to get the weekly digest.";
  }
  if (problem === "unconfirmed") {
    return "Precog cannot confirm this email address. Sign in with Google using an address Google has confirmed, or with email and password, to get the weekly digest.";
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
      title="Once a week, Precog emails what is due for your businesses"
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

/** Opens guest copy and legacy export without opening a business tab first. */
function LocalRecoveryControl({ disabled }: { disabled: boolean }) {
  const workspace = useWorkspace();
  const [available, setAvailable] = useState(false);
  const [open, setOpen] = useState(false);
  const button = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const recount = () => {
      setAvailable(hasWorkspaceRecoveryOffer(workspace.accountId, workspace.local));
    };
    recount();
    window.addEventListener("precog:portfolio-change", recount);
    window.addEventListener("storage", recount);
    return () => {
      window.removeEventListener("precog:portfolio-change", recount);
      window.removeEventListener("storage", recount);
    };
  }, [workspace]);
  if (!available) return null;
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
        title={RECOVERY_ENTRY.title}
        className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-muted hover:bg-elevated hover:text-fg disabled:opacity-50"
      >
        <HardDriveDownload className="size-3.5" aria-hidden />
        {RECOVERY_ENTRY.label}
      </button>
      {open && (
        <Suspense fallback={null}>
          <WorkspaceRecoveryDialog onClose={close} />
        </Suspense>
      )}
    </>
  );
}

/** The button on the refusal when the sign-in is too old to delete the account. */
export { SIGN_IN_AGAIN_LABEL } from "./sign-in-again";

/**
 * Says why the deletion did not go through. The 403 for an old sign-in asks
 * for a recent one and offers the button that signs out and opens the
 * sign-in page; a 409 says what blocks the deletion; anything else may have
 * deleted the account before failing, so it says to reload and check.
 */
export function showDeletionFailure(error: unknown): void {
  const status = clientErrorStatus(error);
  const message = error instanceof Error ? error.message : "";
  if (status === 403 && message === SIGN_IN_AGAIN_TO_DELETE) {
    showSignInAgain(message, signOut);
    return;
  }
  toast.error(
    status === 409 && message
      ? message
      : "Precog could not finish the deletion or the sign-out. Reload to check the account. If the deletion finished, you cannot undo this.",
  );
}

/** Export, history, digest, sessions and delete controls for the signed-in account. */
export function AccountDataControls() {
  const workspace = useWorkspace();
  const [busy, setBusy] = useState<"export" | "history" | "delete" | null>(null);
  const [exportProgress, setExportProgress] = useState<string | null>(null);
  // The failure message's Try again stays clickable while a new export runs.
  const exporting = useRef(false);

  async function exportAll() {
    if (exporting.current) return;
    exporting.current = true;
    setBusy("export");
    try {
      await downloadAccountExport((done, total) =>
        setExportProgress(exportProgressLabel(done, total)),
      );
      toast.success("Your data is downloading as one JSON file.");
    } catch (error) {
      showExportFailure(error, () => void exportAll());
    } finally {
      exporting.current = false;
      setExportProgress(null);
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
      showDeletionFailure(error);
      setBusy(null);
    }
  }

  return (
    // On a phone the five controls wrap under one another instead of
    // pushing the header wider than the screen.
    <div className="flex min-w-0 flex-wrap items-center gap-1">
      <Link
        to="/firm"
        title="For accountants and advisors who look after several businesses"
        className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-muted hover:bg-elevated hover:text-fg"
      >
        Firm workspace
      </Link>
      <button
        type="button"
        onClick={() => void exportAll()}
        disabled={busy !== null}
        title="Download this account's data as one JSON file. Use Download history for past versions."
        className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-muted hover:bg-elevated hover:text-fg disabled:opacity-50"
      >
        <Download className="size-3.5" aria-hidden />
        Export data
      </button>
      {exportProgress && (
        <span role="status" className="px-2 text-xs text-muted">
          {exportProgress}
        </span>
      )}
      <HistoryDownloads
        disabled={busy !== null}
        onBusy={(running) => setBusy(running ? "history" : null)}
      />
      <DigestControl disabled={busy !== null} />
      <LocalRecoveryControl disabled={busy !== null} />
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
