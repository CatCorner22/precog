import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { usePracticeSync } from "@/lib/precog/practice-context";
import { formatDayTime, localDateKey } from "@/lib/precog/dates";
import { cn } from "@/lib/utils";

export function SaveConflictBanner() {
  const { saveConflict, resolveSaveConflict } = usePracticeSync();
  if (!saveConflict) return null;
  const otherTab = saveConflict.reason === "other-tab";
  const when = savedWhen(saveConflict.remoteUpdatedAt);

  const situation = otherTab
    ? `Another tab in this browser saved changes to this business ${when}. This tab has stopped saving so neither copy is overwritten. Changes you make in this tab are not saved until you choose which copy to keep.`
    : saveConflict.reason === "sign-in"
      ? `This device has work on this business from before you signed in, and your account holds a different copy (saved ${when}). Nothing has been overwritten yet.`
      : saveConflict.reason === "unreachable"
        ? `This device has edits made while your account could not be reached, and your account holds a different copy (saved ${when}). Nothing has been overwritten yet.`
        : `Someone changed this business on another device or tab (saved ${when}). Precog has not saved your latest edits here to your account yet.`;

  return (
    <Card
      className={cn("rounded-none border-x-0 border-danger/30 bg-danger/10 shadow-none")}
      role="alert"
    >
      <div className="mx-auto flex max-w-7xl flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <p className="text-sm text-fg">
          {situation} Choose one; Precog keeps the one you do not choose as a copy in your
          businesses.
        </p>
        <div className="flex shrink-0 flex-wrap gap-2">
          <Button size="sm" variant="secondary" onClick={() => void resolveSaveConflict("reload")}>
            {otherTab ? "Use the other tab's copy" : "Use the account's copy"}
          </Button>
          <Button size="sm" variant="danger" onClick={() => void resolveSaveConflict("overwrite")}>
            {otherTab ? "Keep this tab's copy" : "Keep this device's copy"}
          </Button>
        </div>
      </div>
    </Card>
  );
}

/** "today at 3:12 PM", or "on Sep 16, 2026, 3:12 PM" for a copy saved another day. */
function savedWhen(iso: string, now = new Date()): string {
  const saved = new Date(iso);
  if (Number.isNaN(saved.getTime())) return "earlier";
  return localDateKey(saved) === localDateKey(now)
    ? `today at ${TIME.format(saved)}`
    : `on ${formatDayTime(saved)}`;
}

const TIME = new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit" });
