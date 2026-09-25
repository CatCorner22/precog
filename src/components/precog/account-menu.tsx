import { useState } from "react";
import { toast } from "sonner";
import { Download, Trash2 } from "lucide-react";
import { deleteAccount, exportAccountData } from "@/lib/precog/account-server";
import { signOut } from "@/lib/auth/client";
import { clearLocalCopies } from "@/lib/precog/local-data";
import { downloadText } from "@/lib/download";

/** Export and delete controls for the signed-in account. */
export function AccountMenu() {
  const [busy, setBusy] = useState<"export" | "delete" | null>(null);

  async function exportAll() {
    setBusy("export");
    try {
      const { json } = await exportAccountData();
      downloadText(
        `precog-account-${new Date().toISOString().slice(0, 10)}.json`,
        json,
        "application/json",
      );
      toast.success("Your data is downloading as one JSON file.");
    } catch {
      toast.error("The export failed. Try again in a moment.");
    } finally {
      setBusy(null);
    }
  }

  async function removeAccount() {
    const typed = window.prompt(
      "This deletes your account, every business, snapshot and shared link, and cannot be undone. Export first if you want a copy. Type DELETE to confirm.",
    );
    if (typed !== "DELETE") return;
    setBusy("delete");
    try {
      await deleteAccount({ data: { confirm: "DELETE" } });
      clearLocalCopies();
      toast.success("Your account and its data are deleted.");
      await signOut("/");
    } catch {
      toast.error("The deletion failed. Nothing was removed; try again in a moment.");
      setBusy(null);
    }
  }

  return (
    <div className="flex items-center gap-1">
      <button
        type="button"
        onClick={() => void exportAll()}
        disabled={busy !== null}
        title="Download everything this account holds as one JSON file"
        className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-muted hover:bg-elevated hover:text-fg disabled:opacity-50"
      >
        <Download className="size-3.5" aria-hidden />
        Export data
      </button>
      <button
        type="button"
        onClick={() => void removeAccount()}
        disabled={busy !== null}
        title="Delete this account and everything it holds"
        className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-muted hover:bg-elevated hover:text-danger disabled:opacity-50"
      >
        <Trash2 className="size-3.5" aria-hidden />
        Delete account
      </button>
    </div>
  );
}
