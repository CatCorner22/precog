/* eslint-disable react-refresh/only-export-components -- the texts next to the form are tested on their own */
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  RETENTION_YEARS_DEFAULT,
  RETENTION_YEARS_MAX,
  RETENTION_YEARS_MIN,
} from "@/lib/precog/firm/engagement-row";
import { getEngagement, saveFirmRetention } from "@/lib/precog/firm/engagement-server";

export const RETENTION_LABEL = "Keep a deleted client's records for";
export const RETENTION_HELP =
  "Precog keeps a deleted client's locked report versions and monthly review log for this many years after the deletion, then purges them. The firm's activity log keeps each entry for this many years from the day it was written. Seven years is the least Precog allows.";
export const SAVE_RETENTION = "Save";
export const RETENTION_SAVED = "Retention saved.";
/** The toast when the save fails with no message of its own. */
export const RETENTION_NOT_SAVED = "Precog did not save the retention period.";

/** 7, 8, … 15: the periods a firm can pick. */
export const RETENTION_OPTIONS: readonly number[] = Array.from(
  { length: RETENTION_YEARS_MAX - RETENTION_YEARS_MIN + 1 },
  (_, i) => RETENTION_YEARS_MIN + i,
);

/** The select and its help; `years` is the stored period. */
export function RetentionForm({
  years,
  busy = false,
  onSave,
}: {
  years: number;
  busy?: boolean;
  onSave?: (years: number) => void;
}) {
  const [picked, setPicked] = useState(years);
  useEffect(() => setPicked(years), [years]);
  return (
    <form
      className="mt-4 space-y-2 border-t border-border pt-4"
      onSubmit={(e) => {
        e.preventDefault();
        onSave?.(picked);
      }}
    >
      <div className="flex flex-wrap items-end gap-2">
        <label className="text-xs text-muted">
          {RETENTION_LABEL}
          <select
            className="mt-1 block rounded-md border border-border bg-bg px-2 py-1.5 text-sm text-fg"
            value={picked}
            onChange={(e) => setPicked(Number(e.target.value))}
          >
            {RETENTION_OPTIONS.map((n) => (
              <option key={n} value={n}>
                {n} years
              </option>
            ))}
          </select>
        </label>
        <Button type="submit" size="sm" variant="outline" disabled={busy}>
          {SAVE_RETENTION}
        </Button>
      </div>
      <p className="text-xs text-muted">{RETENTION_HELP}</p>
    </form>
  );
}

/** The firm owner's retention setting, under the letterhead on the firm page. */
export function FirmRetention() {
  const [years, setYears] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancel = false;
    void getEngagement({ data: {} })
      .then((res) => {
        if (!cancel) setYears(res.retentionYears ?? RETENTION_YEARS_DEFAULT);
      })
      .catch(() => undefined);
    return () => {
      cancel = true;
    };
  }, []);

  if (years === null) return null;

  async function save(next: number) {
    setBusy(true);
    try {
      setYears((await saveFirmRetention({ data: { years: next } })).retentionYears);
      toast.success(RETENTION_SAVED);
    } catch (err) {
      toast.error(err instanceof Error && err.message ? err.message : RETENTION_NOT_SAVED);
    } finally {
      setBusy(false);
    }
  }

  return <RetentionForm years={years} busy={busy} onSave={(n) => void save(n)} />;
}
