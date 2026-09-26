import { useWorkspace } from "@/lib/precog/workspace-context";
import { useState } from "react";
import { toast } from "sonner";
import { Download, Trash2 } from "lucide-react";
import { deleteAccount, exportAccountData } from "@/lib/precog/account-server";
import { signOut } from "@/lib/auth/client";
import { clearLocalCopies } from "@/lib/precog/local-data";
import { downloadText } from "@/lib/download";
import { localDateKey } from "@/lib/precog/dates";

/** Export and delete controls for the signed-in account. */
export function AccountDataControls() {
  const workspace = useWorkspace();
  const [busy, setBusy] = useState<"export" | "delete" | null>(null);

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
    const typed = window.prompt(
      "This deletes your account and everything in it: every business and its history, report versions, snapshots, shared links, your firm workspace and its members' access, reminders, the billing record and the QuickBooks link. You cannot undo it. Export first if you want a copy. Type DELETE to confirm.",
    );
    if (typed !== "DELETE") return;
    setBusy("delete");
    try {
      await deleteAccount({ data: { confirm: "DELETE" } });
      clearLocalCopies(workspace.local);
      workspace.session?.clear();
      toast.success("Your account and its data are deleted.");
      await signOut("/", { skipRecovery: true });
    } catch {
      toast.error(
        "The deletion or the sign-out did not finish. Reload to check the account; a finished deletion cannot be undone.",
      );
      setBusy(null);
    }
  }

  return (
    <div className="flex items-center gap-1">
      <button
        type="button"
        onClick={() => void exportAll()}
        disabled={busy !== null}
        title="Download this account's data as one JSON file"
        className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-muted hover:bg-elevated hover:text-fg disabled:opacity-50"
      >
        <Download className="size-3.5" aria-hidden />
        Export data
      </button>
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
