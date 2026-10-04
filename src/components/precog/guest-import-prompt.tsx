/* eslint-disable react-refresh/only-export-components -- the dialog and the wording next to the loader are tested on their own */
import {
  useEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
} from "react";
import { toast } from "sonner";
import { useWorkspace } from "@/lib/precog/workspace-context";
import { scopedBrowserStorage, WORKSPACE_PREFIX } from "@/lib/precog/workspace-storage";
import {
  copiedGuestBusinessId,
  copyGuestBusinesses,
  declineGuestBusinesses,
  importableGuestBusinesses,
} from "@/lib/precog/guest-import";
import { usePracticeActions, usePracticeSync } from "@/lib/precog/practice-context";
import { getFirm } from "@/lib/precog/firm/server";
import type { StorageLike } from "@/lib/precog/local-data";
import type { SwitchResult } from "@/lib/precog/use-portfolio";
import { count, joinWithAnd } from "@/lib/precog/text";
import { Card, CardContent, CardDescription, CardHeader } from "@/components/ui/card";
import { buttonClass } from "@/components/ui/button-variants";

export const GUEST_IMPORT_SAVE = "Save to my account";
export const GUEST_IMPORT_NOT_NOW = "Not now";
export const GUEST_IMPORT_FIRM_NOTE = "This business joins your firm's client list.";
export const GUEST_IMPORT_NOT_SAVED =
  "The copy did not save. Check browser storage, then export your guest work.";

/**
 * The question after sign-in on a browser that holds guest work: save it to
 * the account, or not now. Mounted only for a signed-in viewer; shows nothing
 * while the sign-in conflict banner is up (the switch would refuse), once
 * every guest business is copied, or once the account said "Not now" to each
 * of them (the recovery panel keeps offering those). The firm question is one
 * read, made once the prompt has something to ask about. `onOpenChange` tells
 * the page when the question is up, so setup hides behind it
 * (BehindGuestImportPrompt) instead of showing underneath it.
 */
export function GuestImportPrompt({
  onOpenChange,
}: {
  onOpenChange?: (open: boolean) => void;
} = {}) {
  const workspace = useWorkspace();
  const { switchBusiness } = usePracticeActions();
  const { saveConflict } = usePracticeSync();
  const [names, setNames] = useState<string[]>([]);
  const [inFirm, setInFirm] = useState(false);
  const askedFirm = useRef(false);

  useEffect(() => {
    const guest = scopedBrowserStorage(null);
    const recount = () =>
      setNames(
        workspace.accountId && workspace.local && guest
          ? importableGuestBusinesses(guest, workspace.local, { includeDeclined: false }).map(
              (p) => p.practiceName,
            )
          : [],
      );
    recount();
    // Guest work saved in another tab (storage) or copied here (portfolio-change).
    const onStorage = (event: StorageEvent) => {
      if (event.key === null || event.key.startsWith(WORKSPACE_PREFIX)) recount();
    };
    window.addEventListener("precog:portfolio-change", recount);
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener("precog:portfolio-change", recount);
      window.removeEventListener("storage", onStorage);
    };
  }, [workspace]);

  const open = names.length > 0 && !saveConflict;
  useEffect(() => {
    onOpenChange?.(open);
    return () => onOpenChange?.(false);
  }, [open, onOpenChange]);
  useEffect(() => {
    if (!open || askedFirm.current) return;
    askedFirm.current = true;
    let cancel = false;
    void getFirm()
      .then((res) => {
        if (!cancel) setInFirm(Boolean(res.firm));
      })
      .catch(() => undefined);
    return () => {
      cancel = true;
    };
  }, [open]);

  if (!open) return null;
  const guest = scopedBrowserStorage(null);
  const account = workspace.local;
  if (!guest || !account) return null;

  const close = () => {
    setNames([]);
    window.dispatchEvent(new Event("precog:portfolio-change"));
  };
  return (
    <GuestImportDialog
      names={names}
      inFirm={inFirm}
      onSave={() => {
        void saveGuestWork(guest, account, switchBusiness);
        close();
      }}
      onDecline={() => {
        declineGuestWork(guest, account);
        close();
      }}
    />
  );
}

/**
 * Wraps the setup dialog on the home page: hidden and inert while the
 * guest-work question is open, so only one dialog ever shows and Tab and a
 * screen reader meet only the question. Setup stays mounted underneath, so
 * typed work survives even when the browser keeps nothing; without the
 * wrapper the two modals would compete, and setup's own focus on its title
 * would pull the keyboard behind the question's backdrop.
 */
export function BehindGuestImportPrompt({
  open,
  children,
}: {
  open: boolean;
  children: ReactNode;
}) {
  return (
    <div inert={open} hidden={open || undefined}>
      {children}
    </div>
  );
}

/**
 * Copies what the prompt offered, opens the first copy and says so. A copy
 * that did not store is named, since the copies continue past it (the toast
 * names only what is in the account); a failed switch says why.
 */
export async function saveGuestWork(
  guest: StorageLike,
  account: StorageLike,
  switchBusiness: (id: string) => Promise<SwitchResult>,
): Promise<void> {
  const offered = importableGuestBusinesses(guest, account, { includeDeclined: false });
  const ids = copyGuestBusinesses(guest, account, { includeDeclined: false });
  if (ids.length === 0) {
    toast.error(GUEST_IMPORT_NOT_SAVED);
    return;
  }
  // Each copy is matched to what was offered through the account's copied
  // marker, so two guest businesses with one name are still told apart.
  const copyOf = new Map(offered.map((p) => [copiedGuestBusinessId(p.businessId, account), p]));
  const copied = ids.map((id) => copyOf.get(id)?.practiceName ?? "");
  const notSaved = offered
    .filter((p) => !ids.includes(copiedGuestBusinessId(p.businessId, account) ?? ""))
    .map((p) => p.practiceName);
  if (notSaved.length > 0) toast.error(guestImportNotSavedToast(notSaved));
  const result = await switchBusiness(ids[0]);
  if (!result.ok) {
    toast.error(result.reason);
    return;
  }
  toast.success(guestImportSavedToast(copied));
}

/** "Not now": remembers, for this account, each business the prompt offered, so it does not ask again. */
export function declineGuestWork(guest: StorageLike, account: StorageLike): void {
  declineGuestBusinesses(guest, account);
}

/** "Save Riverside Dental to your account?", or the count when there are several. */
export function guestImportTitle(names: string[]): string {
  return names.length === 1
    ? `Save ${names[0]} to your account?`
    : `Save ${count(names.length, "business", "businesses")} to your account?`;
}

/** What the browser holds and what Save does with it. */
export function guestImportBody(names: string[]): string {
  const what = names.length === 1 ? names[0] : count(names.length, "business", "businesses");
  return `This browser holds ${what} from before you signed in. Precog copies ${names.length === 1 ? "it" : "them"} into your account and keeps the ${names.length === 1 ? "original" : "originals"} on this device.`;
}

/** The toast after Save: the one business, or the count and which one is open. */
export function guestImportSavedToast(names: string[]): string {
  return names.length === 1
    ? `${names[0]} is in your account. It syncs from here on.`
    : `Copied ${count(names.length, "business", "businesses")}. ${names[0]} is open.`;
}

/** The businesses whose copy did not store, when others did: the same advice as when none did. */
export function guestImportNotSavedToast(names: string[]): string {
  return `${joinWithAnd(names)} did not save. Check browser storage, then export your guest work.`;
}

/** The dialog itself: the question, the names when there are several, the firm note and the two buttons. */
export function GuestImportDialog({
  names,
  inFirm,
  onSave,
  onDecline,
}: {
  names: string[];
  inFirm: boolean;
  onSave: () => void;
  onDecline: () => void;
}) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);
  // The question opens with focus on it, so a screen reader starts there.
  useEffect(() => {
    titleRef.current?.focus({ preventScroll: true });
  }, []);

  /** Tab and Shift+Tab stay inside the dialog while it is open. */
  function keepFocusInside(event: ReactKeyboardEvent<HTMLDivElement>) {
    if (event.key !== "Tab") return;
    const items = focusableIn(dialogRef.current);
    if (items.length === 0) return;
    const first = items[0];
    const last = items[items.length - 1];
    const active = document.activeElement;
    if (event.shiftKey && (active === first || active === titleRef.current)) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && active === last) {
      event.preventDefault();
      first.focus();
    }
  }

  return (
    <div
      ref={dialogRef}
      className="fixed inset-0 z-[60] flex items-center justify-center bg-bg/90 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="guest-import-title"
      onKeyDown={keepFocusInside}
    >
      <Card className="w-full max-w-lg border-border bg-surface shadow-2xl">
        <CardHeader>
          <h2
            id="guest-import-title"
            ref={titleRef}
            tabIndex={-1}
            className="text-lg font-semibold tracking-tight"
          >
            {guestImportTitle(names)}
          </h2>
          <CardDescription>
            {guestImportBody(names)}
            {inFirm ? ` ${GUEST_IMPORT_FIRM_NOTE}` : ""}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {names.length > 1 && (
            <ul className="list-disc space-y-1 pl-5 text-sm">
              {names.map((name, i) => (
                <li key={`${i}-${name}`}>{name}</li>
              ))}
            </ul>
          )}
          <div className="flex flex-wrap justify-end gap-2">
            <button
              type="button"
              onClick={onDecline}
              className={buttonClass({ variant: "ghost", size: "sm" })}
            >
              {GUEST_IMPORT_NOT_NOW}
            </button>
            <button type="button" onClick={onSave} className={buttonClass({ size: "sm" })}>
              {GUEST_IMPORT_SAVE}
            </button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

/**
 * The dialog's focusable controls, in order. Kept here rather than imported
 * from the setup helpers, which would pull the job-title catalog onto the
 * home page's first load.
 */
function focusableIn(root: HTMLElement | null): HTMLElement[] {
  if (!root) return [];
  return Array.from(
    root.querySelectorAll<HTMLElement>('button:not([disabled]), [tabindex]:not([tabindex="-1"])'),
  );
}
