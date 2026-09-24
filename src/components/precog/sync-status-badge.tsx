import { usePractice, type SyncStatus } from "@/lib/precog/practice-context";
import { Cloud, CloudAlert, CloudOff, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

const LABEL: Record<SyncStatus, string> = {
  idle: "",
  loading: "Syncing…",
  synced: "Saved to account",
  local: "Saved on this device",
  "local-error": "Not saved — this browser is not keeping data",
  error: "Sync failed — saved locally",
  conflict: "Edited elsewhere — not saved",
};

export function SyncStatusBadge({ className }: { className?: string }) {
  const { syncStatus } = usePractice();
  const label = LABEL[syncStatus];
  if (!label) return null;

  const Icon =
    syncStatus === "loading"
      ? Loader2
      : syncStatus === "synced"
        ? Cloud
        : syncStatus === "conflict" || syncStatus === "local-error"
          ? CloudAlert
          : CloudOff;

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs",
        syncStatus === "synced" && "border-ok/30 bg-ok/10 text-ok",
        syncStatus === "local" && "border-border bg-elevated text-muted",
        syncStatus === "loading" && "border-border bg-elevated text-muted",
        syncStatus === "error" && "border-warn/40 bg-warn/10 text-warn",
        syncStatus === "local-error" && "border-danger/40 bg-danger/10 text-danger",
        syncStatus === "conflict" && "border-danger/40 bg-danger/10 text-danger",
        className,
      )}
    >
      <Icon className={cn("size-3", syncStatus === "loading" && "animate-spin")} />
      {label}
    </span>
  );
}
