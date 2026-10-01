import { useEffect, useState } from "react";
import { useWorkspace } from "@/lib/precog/workspace-context";
import { scopedBrowserStorage, WORKSPACE_PREFIX } from "@/lib/precog/workspace-storage";
import { copyGuestBusinesses, importableGuestBusinesses } from "@/lib/precog/guest-import";
import { downloadText } from "@/lib/download";
import { count, verb } from "@/lib/precog/text";

/**
 * Recovery panel: exports older browser records that belong to no account,
 * and copies guest work into the signed-in account. Hidden when there is
 * nothing to offer.
 */
export function WorkspaceRecovery() {
  const workspace = useWorkspace();
  const [legacy, setLegacy] = useState(false);
  const [guestCount, setGuestCount] = useState(0);
  const [message, setMessage] = useState("");
  useEffect(() => {
    const recount = () => {
      setLegacy(
        Object.keys(legacyEntries(false)).length + Object.keys(legacyEntries(true)).length > 0,
      );
      const guest = scopedBrowserStorage(null);
      setGuestCount(
        workspace.accountId && workspace.local && guest
          ? importableGuestBusinesses(guest, workspace.local).length
          : 0,
      );
    };
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
  if (!legacy && !guestCount && !message) return null;

  function exportLegacy() {
    if (
      !window.confirm(
        "These older browser records have no verified account owner. Export them for manual recovery only if you have permission to access this browser's business records.",
      )
    )
      return;
    downloadText(
      "precog-unassigned-browser-recovery.json",
      JSON.stringify(
        {
          version: 1,
          ownership: "unassigned",
          local: legacyEntries(false),
          session: legacyEntries(true),
        },
        null,
        2,
      ),
      "application/json",
    );
  }

  function copyGuest() {
    const guest = scopedBrowserStorage(null);
    if (
      !workspace.accountId ||
      !workspace.local ||
      !guest ||
      !window.confirm(
        "Copy guest businesses from this browser into this account? The copies replace no account business, and the guest originals stay in this browser.",
      )
    )
      return;
    const copied = copyGuestBusinesses(guest, workspace.local);
    setMessage(
      copied
        ? `Copied ${count(copied, "guest business", "guest businesses")}. Open one from the business menu to review and sync it.`
        : "The copy did not save. Check browser storage, then export your guest work.",
    );
    window.dispatchEvent(new Event("precog:portfolio-change"));
  }

  return (
    <details className="mx-4 mt-2 rounded border border-border bg-panel p-2 text-sm">
      <summary className="cursor-pointer">Local recovery and guest work</summary>
      {legacy && (
        <p className="mt-2">
          This browser holds older records that belong to no account. Precog did not load them.{" "}
          <button type="button" className="underline" onClick={exportLegacy}>
            Export older browser records
          </button>
        </p>
      )}
      {guestCount > 0 && (
        <p className="mt-2">
          {count(guestCount, "guest business", "guest businesses")} {verb(guestCount, "is", "are")}{" "}
          ready to copy.{" "}
          <button type="button" className="underline" onClick={copyGuest}>
            Copy guest businesses
          </button>
        </p>
      )}
      {message && (
        <p role="status" className="mt-2">
          {message}
        </p>
      )}
    </details>
  );
}

/** Old unscoped data is quarantined, not attributed to whichever account signs in first. */
function legacyEntries(session: boolean): Record<string, string> {
  const entries: Record<string, string> = {};
  try {
    const raw = session ? window.sessionStorage : window.localStorage;
    for (let i = 0; i < raw.length; i += 1) {
      const key = raw.key(i);
      if (
        key &&
        !key.startsWith(WORKSPACE_PREFIX) &&
        /^precog(?:\.practiceProfile|\.portfolio|\.onboarding-draft|\.power-map|-value)/.test(key)
      ) {
        const value = raw.getItem(key);
        if (value !== null) entries[key] = value;
      }
    }
  } catch {
    /* unavailable */
  }
  return entries;
}
