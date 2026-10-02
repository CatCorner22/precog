import { downloadText } from "@/lib/download";
import type { PracticeProfile } from "./practice-profile";
import type { Workspace } from "./workspace-context";

/** The crash screen asks this before it clears this browser's copies. */
export const CLEAR_LOCAL_CONFIRM =
  "Clear the saved data on this device? You lose changes that have not synced to your account, unless you downloaded a recovery copy. This does not affect other accounts. You cannot undo this.";

/** The file every recovery download saves as. */
export const RECOVERY_FILE_NAME = "precog-unsynced-recovery.json";

/**
 * The recovery copy the sign-out check, the crash screen, the save badge and
 * a refused "keep a copy" all download, in one format: the business named
 * (null on the crash screen, which holds none in memory) and everything this
 * workspace keeps in this browser.
 */
export function recoveryCopyText(workspace: Workspace, profile: PracticeProfile | null): string {
  return JSON.stringify(
    {
      version: 1,
      accountId: workspace.accountId,
      profile,
      local: workspace.local?.entries() ?? {},
      session: workspace.session?.entries() ?? {},
    },
    null,
    2,
  );
}

export function downloadRecoveryCopy(workspace: Workspace, profile: PracticeProfile | null): void {
  downloadText(RECOVERY_FILE_NAME, recoveryCopyText(workspace, profile), "application/json");
}
