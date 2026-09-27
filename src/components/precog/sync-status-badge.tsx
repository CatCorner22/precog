import { usePracticeSync, type SyncStatus } from "@/lib/precog/practice-context";
import { Cloud, CloudAlert, CloudOff, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Where the open business is saved. `compactOnPhone` shows only the icon on
 * narrow screens (the words stay in the tooltip and for screen readers), so
 * a phone still shows whether an edit is saved.
 */
export function SyncStatusBadge({
  className,
  compactOnPhone = false,
}: {
  className?: string;
  compactOnPhone?: boolean;
}) {
  const { syncStatus } = usePracticeSync();
  const label = LABEL[syncStatus];
  if (!label) return null;

  const busy = syncStatus === "loading" || syncStatus === "saving";
  const Icon = busy
    ? Loader2
    : syncStatus === "synced"
      ? Cloud
      : syncStatus === "conflict" || syncStatus === "local-error"
        ? CloudAlert
        : CloudOff;

  return (
    <span
      title={label}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs",
        syncStatus === "synced" && "border-ok/30 bg-ok/10 text-ok",
        (syncStatus === "local" || busy) && "border-border bg-elevated text-muted",
        syncStatus === "error" && "border-warn/40 bg-warn/10 text-warn",
        (syncStatus === "local-error" || syncStatus === "conflict") &&
          "border-danger/40 bg-danger/10 text-danger",
        className,
      )}
    >
      <Icon className={cn("size-3", busy && "animate-spin")} aria-hidden />
      <span className={cn(compactOnPhone && "sr-only sm:not-sr-only")}>{label}</span>
      {/* Announced only when work is not saved, not on every save. */}
      <span role="status" className="sr-only">
        {ANNOUNCED.has(syncStatus) ? label : ""}
      </span>
    </span>
  );
}

const ANNOUNCED = new Set<SyncStatus>(["error", "local-error", "conflict"]);

const LABEL: Record<SyncStatus, string> = {
  idle: "",
  loading: "Loading your account…",
  saving: "Saving to your account…",
  synced: "Saved to your account",
  local: "Saved on this device",
  "local-error": "Not saved — this browser is not keeping data",
  error: "Not saved to your account — saved on this device",
  conflict: "Edited elsewhere — not saved",
};
