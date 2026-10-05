import { useState } from "react";
import { useWorkspace } from "@/lib/precog/workspace-context";
import { scopedBrowserStorage } from "@/lib/precog/workspace-storage";
import { copyGuestBusinesses } from "@/lib/precog/guest-import";
import {
  importableGuestCount,
  legacyEntries,
  legacyEntryCount,
} from "@/lib/precog/workspace-recovery-offer";
import { downloadText } from "@/lib/download";
import { count, verb } from "@/lib/precog/text";

/** Copy, export and status text shared by the banner and the account-menu dialog. */
export function WorkspaceRecoveryPanel({
  onStatusMessage,
}: {
  /** Keeps the home banner visible after a copy when guest work is gone. */
  onStatusMessage?: (message: string) => void;
} = {}) {
  const workspace = useWorkspace();
  const legacy = legacyEntryCount() > 0;
  const guestCount = importableGuestCount(workspace.accountId, workspace.local);
  const [message, setMessage] = useState("");
  function noteStatus(text: string) {
    setMessage(text);
    onStatusMessage?.(text);
  }

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
    const copied = copyGuestBusinesses(guest, workspace.local).length;
    noteStatus(
      copied
        ? `Copied ${count(copied, "guest business", "guest businesses")}. Open one from the business menu to review and sync it.`
        : "The copy did not save. Check browser storage, then export your guest work.",
    );
    window.dispatchEvent(new Event("precog:portfolio-change"));
  }

  if (!legacy && !guestCount && !message) {
    return (
      <p className="text-sm text-muted">
        This browser has no older unassigned records and no guest businesses to copy.
      </p>
    );
  }

  return (
    <div className="space-y-2 text-sm">
      {legacy && (
        <p>
          This browser holds older records that belong to no account. Precog did not load them.{" "}
          <button type="button" className="underline" onClick={exportLegacy}>
            Export older browser records
          </button>
        </p>
      )}
      {guestCount > 0 && (
        <p>
          {count(guestCount, "guest business", "guest businesses")} {verb(guestCount, "is", "are")}{" "}
          ready to copy.{" "}
          <button type="button" className="underline" onClick={copyGuest}>
            Copy guest businesses
          </button>
        </p>
      )}
      {message && (
        <p role="status" className="text-muted">
          {message}
        </p>
      )}
    </div>
  );
}
