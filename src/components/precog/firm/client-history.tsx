import { useEffect, useState } from "react";
import { toast } from "sonner";
import { History } from "lucide-react";
import { Button } from "@/components/ui/button";
import { usePractice, usePracticeSync } from "@/lib/precog/practice-context";
import { getHistoryVersion, keepHistoryBeforeRestore, listHistory } from "@/lib/precog/firm/server";
import type { BusinessHistoryEntry } from "@/lib/precog/business-store";
import { historyRuleText } from "@/lib/precog/business-retention";
import { localDateKey, formatDayTime } from "@/lib/precog/dates";
import { verificationsAsHeld } from "@/lib/precog/procedures/lifecycle";

/**
 * The saved snapshots of the open business the store keeps (one per window
 * of each person's editing, see business-retention.ts), newest first, with
 * who saved each one.
 * Restoring loads that snapshot as the working copy; the one it replaces is
 * itself kept, so a restore loses nothing.
 */
export function ClientHistory({ signedIn }: { signedIn: boolean }) {
  const { profile, replaceProfile } = usePractice();
  const { syncStatus } = usePracticeSync();
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
        `Load the snapshot saved ${formatDayTime(entry.savedAt)} as the working copy? The current state stays in the history.`,
      )
    ) {
      return;
    }
    setBusy(true);
    try {
      const res = await getHistoryVersion({
        data: { businessId, revision: entry.revision, today: localDateKey(new Date()) },
      });
      await keepHistoryBeforeRestore({ data: { businessId } });
      replaceProfile({
        ...res.profile,
        businessId,
        // An older verification is not one the account holds now; see verificationsAsHeld.
        procedures: verificationsAsHeld(res.profile.procedures ?? [], profile.procedures ?? []),
      });
      toast.success(`Loaded the snapshot from ${formatDayTime(entry.savedAt)}.`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Precog could not load that snapshot.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="rounded-xl border border-border bg-surface p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-lg font-semibold">Change history</h2>
          <p className="mt-1 text-sm text-muted">{historyRuleText(profile.practiceName)}</p>
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
            No earlier snapshots yet. The history starts with the next save after this one.
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
                    Snapshot {e.revision} · {formatDayTime(e.savedAt)}
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
                  aria-label={`Load snapshot ${e.revision} from ${formatDayTime(e.savedAt)}`}
                >
                  Load this snapshot
                </Button>
              </li>
            ))}
          </ul>
        ))}
    </section>
  );
}
