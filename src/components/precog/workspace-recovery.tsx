import { useEffect, useState } from "react";
import { useWorkspace } from "@/lib/precog/workspace-context";
import { scopedBrowserStorage, WORKSPACE_PREFIX } from "@/lib/precog/workspace-storage";
import {
  hasUserWork,
  loadPortfolio,
  makeBusinessId,
  normalizeProfile,
  readStoredActiveProfile,
  parseStoredProfile,
  savePortfolioEntry,
} from "@/lib/precog/practice-profile";
import { downloadText } from "@/lib/download";
import { readLocal, writeLocal } from "@/lib/precog/local-data";

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
export function WorkspaceRecovery() {
  const workspace = useWorkspace();
  const [legacy, setLegacy] = useState(false);
  const [guestCount, setGuestCount] = useState(0);
  const [message, setMessage] = useState("");
  useEffect(() => {
    setLegacy(
      Object.keys(legacyEntries(false)).length + Object.keys(legacyEntries(true)).length > 0,
    );
    if (!workspace.accountId) return;
    const guest = scopedBrowserStorage(null);
    const all = loadPortfolio(guest);
    const raw = readStoredActiveProfile(guest);
    if (raw) {
      const profile = parseStoredProfile(raw);
      all[profile.businessId ?? "biz_default"] = profile;
    }
    setGuestCount(
      Object.values(all).filter(
        (p) =>
          hasUserWork(p) &&
          p.onboardingComplete !== false &&
          !readLocal(`precog.guest-import.${p.businessId}`, workspace.local),
      ).length,
    );
  }, [workspace]);
  if (!legacy && !guestCount && !message) return null;
  function exportLegacy() {
    if (
      !window.confirm(
        "These older browser records have no verified account owner. Export them for manual recovery only if you are authorized to access this browser's business records.",
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
  function importGuest() {
    if (
      !workspace.accountId ||
      !workspace.local ||
      !window.confirm(
        "Copy guest businesses from this browser into the current account's workspace? Existing account businesses will not be overwritten. The guest originals remain available.",
      )
    )
      return;
    const guest = scopedBrowserStorage(null);
    const all = loadPortfolio(guest);
    const raw = readStoredActiveProfile(guest);
    if (raw) {
      const profile = parseStoredProfile(raw);
      all[profile.businessId ?? "biz_default"] = profile;
    }
    let copied = 0;
    for (const p of Object.values(all)) {
      const key = `precog.guest-import.${p.businessId}`;
      if (!hasUserWork(p) || p.onboardingComplete === false || readLocal(key, workspace.local))
        continue;
      const id = makeBusinessId();
      savePortfolioEntry(normalizeProfile({ ...p, businessId: id }), workspace.local);
      // Verify persistence before marking the original imported.
      if (loadPortfolio(workspace.local)[id]) {
        writeLocal(key, id, workspace.local);
        copied += 1;
      }
    }
    setGuestCount((n) => Math.max(0, n - copied));
    setMessage(
      copied
        ? `Copied ${copied} guest business(es). Open one from the business menu to review and sync it.`
        : "No copies were saved. Check browser storage and export your guest work.",
    );
    window.dispatchEvent(new Event("precog:portfolio-change"));
  }
  return (
    <details className="mx-4 mt-2 rounded border border-border bg-panel p-2 text-sm">
      <summary className="cursor-pointer">Local recovery and guest work</summary>
      {legacy && (
        <p className="mt-2">
          Older browser records were left unassigned, not loaded into an account.{" "}
          <button type="button" className="underline" onClick={exportLegacy}>
            Export older browser records
          </button>
        </p>
      )}
      {guestCount > 0 && (
        <p className="mt-2">
          {guestCount} guest business(es) can be copied after your confirmation.{" "}
          <button type="button" className="underline" onClick={importGuest}>
            Import guest businesses
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
