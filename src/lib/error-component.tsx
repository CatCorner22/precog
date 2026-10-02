import { useEffect, useState } from "react";
import type { ErrorComponentProps } from "@tanstack/react-router";
import { TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useWorkspace } from "@/lib/precog/workspace-context";
import { clearLocalCopies } from "@/lib/precog/local-data";
import { CLEAR_LOCAL_CONFIRM, downloadRecoveryCopy } from "@/lib/precog/recovery-copy";
import { reportClientError } from "@/lib/observability/report-browser";

/**
 * The screen shown when a route crashes. It keeps the real error message
 * visible and gives the owner ways out: reload; download a recovery copy of
 * what this browser keeps; or clear the saved local data (the usual cause
 * of a crash that survives a reload) and then reload. The download comes
 * first, so clearing never has to cost work. Cloud copies are untouched; a
 * signed-in owner's business reloads from them.
 */
export function AppErrorComponent({ error }: ErrorComponentProps) {
  const workspace = useWorkspace();
  const [downloadError, setDownloadError] = useState<string | null>(null);
  useEffect(() => {
    reportClientError(error);
  }, [error]);
  function reload() {
    window.location.reload();
  }
  function downloadRecovery() {
    // Blocked storage, a likely cause of the crash, can refuse this read too.
    try {
      downloadRecoveryCopy(workspace, null);
      setDownloadError(null);
    } catch (cause) {
      const detail = cause instanceof Error && cause.message ? ` ${cause.message}` : "";
      setDownloadError(`Precog could not read this browser's saved data.${detail}`);
    }
  }
  function clearAndReload() {
    if (!window.confirm(CLEAR_LOCAL_CONFIRM)) return;
    clearLocalCopies(workspace.local);
    workspace.session?.clear();
    window.location.replace("/");
  }
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-3 bg-bg px-6 text-center text-fg">
      <span className="text-danger" aria-hidden="true">
        <TriangleAlert className="size-10" strokeWidth={2} />
      </span>
      <h1 className="text-lg font-semibold">Something went wrong</h1>
      <p className="max-w-md text-sm break-words text-muted">
        {error.message || "An unexpected error occurred. Try reloading the page."}
      </p>
      <div className="mt-2 flex flex-wrap justify-center gap-2">
        <Button variant="secondary" size="sm" onClick={reload}>
          Reload
        </Button>
        <Button
          variant="secondary"
          size="sm"
          onClick={downloadRecovery}
          disabled={!workspace.local}
        >
          Download a recovery copy
        </Button>
        <Button variant="secondary" size="sm" onClick={clearAndReload} disabled={!workspace.local}>
          Clear the saved data on this device and reload
        </Button>
      </div>
      {downloadError && (
        <p className="max-w-md text-sm break-words text-danger" role="alert">
          {downloadError}
        </p>
      )}
      <p className="max-w-md text-xs text-muted">
        Clearing removes only the copy kept in this browser. A signed-in account reloads its
        business from the cloud; a signed-out visitor starts over.
      </p>
    </main>
  );
}
