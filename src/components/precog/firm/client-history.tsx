import { useEffect, useState } from "react";
import { toast } from "sonner";
import { History } from "lucide-react";
import { Button } from "@/components/ui/button";
import { usePractice } from "@/lib/precog/practice-context";
import { getHistoryVersion, listHistory } from "@/lib/precog/firm/server";
import type { BusinessHistoryEntry } from "@/lib/precog/business-store";
import { localDateKey } from "@/lib/precog/decisions/follow-through";

function when(iso: string): string {
  return new Date(iso).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

/**
 * Every saved version of the open business, newest first, with who saved
 * it. Restoring loads that version as the working copy; the version it
 * replaces is itself kept, so nothing is lost either way.
 */
export function ClientHistory({ signedIn }: { signedIn: boolean }) {
  const { profile, replaceProfile, syncStatus } = usePractice();
  const businessId = profile.businessId ?? null;
  const [entries, setEntries] = useState<BusinessHistoryEntry[] | null>(null);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open || !signedIn || !businessId) return;
    let cancel = false;
    void listHistory({ data: { businessId } })
      .then((res) => {
        if (!cancel) setEntries(res.history);
      })
      .catch(() => {
        if (!cancel) setEntries([]);
      });
    return () => {
      cancel = true;
    };
  }, [open, signedIn, businessId, syncStatus]);

  if (!signedIn || !businessId) return null;

  async function restore(entry: BusinessHistoryEntry) {
    if (!businessId) return;
    if (
      !window.confirm(
        `Load the version saved ${when(entry.savedAt)} as the working copy? The current version stays in the history.`,
      )
    ) {
      return;
    }
    setBusy(true);
    try {
      const res = await getHistoryVersion({
        data: { businessId, revision: entry.revision, today: localDateKey(new Date()) },
      });
      replaceProfile({ ...res.profile, businessId });
      toast.success(`Loaded the version from ${when(entry.savedAt)}.`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "That version could not be loaded.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="rounded-xl border border-border bg-surface p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-lg font-semibold">Change history</h2>
          <p className="mt-1 text-sm text-muted">
            Every save of {profile.practiceName} is kept with who made it, so the map as it stood on
            a given day can be brought back.
          </p>
        </div>
        <Button size="sm" variant="secondary" onClick={() => setOpen((v) => !v)}>
          <History className="size-3.5" /> {open ? "Hide" : "Show history"}
        </Button>
      </div>
      {open &&
        (entries === null ? (
          <p className="mt-3 text-sm text-muted">Loading…</p>
        ) : entries.length === 0 ? (
          <p className="mt-3 text-sm text-muted">
            No earlier versions yet. The history starts with the next save after this one.
          </p>
        ) : (
          <ul className="mt-3 divide-y divide-border">
            {entries.map((e) => (
              <li
                key={e.revision}
                className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm"
              >
                <div>
                  <p className="font-medium">
                    Revision {e.revision} · {when(e.savedAt)}
                  </p>
                  <p className="text-xs text-muted">
                    Saved by {e.savedByName ?? "an account"} · {e.peopleCount} people ·{" "}
                    {e.processCount} processes · {e.decisionCount} decisions
                  </p>
                </div>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => void restore(e)}
                  disabled={busy}
                >
                  Load this version
                </Button>
              </li>
            ))}
          </ul>
        ))}
    </section>
  );
}
