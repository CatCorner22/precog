import { useEffect, useState } from "react";
import { useWorkspace } from "@/lib/precog/workspace-context";
import { WORKSPACE_PREFIX } from "@/lib/precog/workspace-storage";
import {
  hasWorkspaceRecoveryOffer,
  importableGuestCount,
  legacyEntryCount,
} from "@/lib/precog/workspace-recovery-offer";
import { WorkspaceRecoveryPanel } from "./workspace-recovery-panel";

/**
 * Recovery panel: exports older browser records that belong to no account,
 * and copies guest work into the signed-in account. Hidden when there is
 * nothing to offer; open while there is, so a failed import's toast never
 * points at a collapsed box the owner never opens.
 */
export function WorkspaceRecovery() {
  const workspace = useWorkspace();
  const [offer, setOffer] = useState(false);
  const [statusMessage, setStatusMessage] = useState("");
  useEffect(() => {
    const recount = () => {
      setOffer(hasWorkspaceRecoveryOffer(workspace.accountId, workspace.local));
    };
    recount();
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
  if (!offer && !statusMessage) return null;

  const legacy = legacyEntryCount() > 0;
  const guestCount = importableGuestCount(workspace.accountId, workspace.local);

  return (
    <details
      className="mx-4 mt-2 rounded border border-border bg-panel p-2 text-sm"
      open={legacy || guestCount > 0 || statusMessage !== ""}
    >
      <summary className="cursor-pointer">Local recovery and guest work</summary>
      <div className="mt-2">
        <WorkspaceRecoveryPanel onStatusMessage={setStatusMessage} />
      </div>
    </details>
  );
}
