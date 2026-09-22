import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { usePractice } from "@/lib/precog/practice-context";
import { cn } from "@/lib/utils";

export function SaveConflictBanner() {
  const { saveConflict, resolveSaveConflict } = usePractice();
  if (!saveConflict) return null;

  const remoteTime = new Date(saveConflict.remoteUpdatedAt).toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
  });

  return (
    <Card
      className={cn("rounded-none border-x-0 border-danger/30 bg-danger/10 shadow-none")}
      role="alert"
    >
      <div className="mx-auto flex max-w-7xl flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <p className="text-sm text-fg">
          This business was changed on another device or tab (at {remoteTime}). Your latest edits
          here haven&apos;t been saved to your account.
        </p>
        <div className="flex shrink-0 flex-wrap gap-2">
          <Button size="sm" variant="secondary" onClick={() => void resolveSaveConflict("reload")}>
            Load their version
          </Button>
          <Button size="sm" variant="danger" onClick={() => void resolveSaveConflict("overwrite")}>
            Keep mine and overwrite
          </Button>
        </div>
      </div>
    </Card>
  );
}
