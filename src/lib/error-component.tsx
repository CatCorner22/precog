import { useEffect } from "react";
import type { ErrorComponentProps } from "@tanstack/react-router";
import { TriangleAlert } from "lucide-react";
import { clearLocalCopies } from "@/lib/precog/local-data";
import { reportClientError } from "@/lib/observability/report-browser";

/**
 * The screen shown when a route crashes. It keeps the real error message
 * visible and gives the owner two ways out: reload, or clear the saved local
 * data (the usual cause of a crash that survives a reload) and then reload.
 * Cloud copies are untouched; a signed-in owner's business reloads from them.
 */
export function AppErrorComponent({ error }: ErrorComponentProps) {
  useEffect(() => {
    reportClientError(error);
  }, [error]);
  function reload() {
    window.location.reload();
  }
  function clearAndReload() {
    clearLocalCopies();
    window.location.replace("/");
  }
  return (
    <main
      className={
        "flex min-h-screen flex-col items-center justify-center gap-3 px-6 text-center " +
        "bg-zinc-50 text-zinc-900 dark:bg-zinc-950 dark:text-zinc-50"
      }
    >
      <span className="text-red-500" aria-hidden="true">
        <TriangleAlert className="size-10" strokeWidth={2} />
      </span>
      <h1 className="text-lg font-semibold">Something went wrong</h1>
      <p className="max-w-md text-sm break-words text-zinc-500 dark:text-zinc-400">
        {error.message || "An unexpected error occurred. Try reloading the page."}
      </p>
      <div className="mt-2 flex flex-wrap justify-center gap-2">
        <button
          type="button"
          onClick={reload}
          className="rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm font-medium hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-900 dark:hover:bg-zinc-800"
        >
          Reload
        </button>
        <button
          type="button"
          onClick={clearAndReload}
          className="rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm font-medium hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-900 dark:hover:bg-zinc-800"
        >
          Clear saved data on this device and reload
        </button>
      </div>
      <p className="max-w-md text-xs text-zinc-500 dark:text-zinc-400">
        Clearing removes only the copy kept in this browser. A signed-in account reloads its
        business from the cloud; a signed-out visitor starts over.
      </p>
    </main>
  );
}
