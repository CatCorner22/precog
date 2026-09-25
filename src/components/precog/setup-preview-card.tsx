import { useDeferredValue, useMemo } from "react";
import { ShieldAlert } from "lucide-react";
import type { IndustryId } from "@/lib/precog/industry";
import type { OwnTeamRow } from "@/lib/precog/onboarding/own-team";
import { previewSetup } from "@/lib/precog/onboarding/setup-preview";

/**
 * The payoff inside setup: the first conflict the typed team produces and
 * the prosecuted case that shows what the same arrangement cost. Appears
 * once two duties on one person form a conflict; until then it says what
 * would make it appear.
 */
export function SetupPreviewCard({
  rows,
  industry,
}: {
  rows: readonly OwnTeamRow[];
  industry: IndustryId;
}) {
  // Keep typing urgent; expensive conflict/case matching may render later.
  const deferredRows = useDeferredValue(rows);
  const preview = useMemo(() => previewSetup(deferredRows, industry), [deferredRows, industry]);
  if (deferredRows !== rows)
    return (
      <p role="status" className="text-xs text-muted">
        Updating provisional findings…
      </p>
    );
  if (preview.peopleWithDuties === 0) return null;

  if (!preview.first) {
    return (
      <p
        className="rounded-lg border border-border bg-elevated px-3 py-2 text-xs text-muted"
        role="status"
      >
        No conflict found among the duties entered so far. This is a provisional check, not a
        completed assessment; review title-based suggestions and any missing duties.
      </p>
    );
  }

  const { conflict, study, citesRule, lossPhrase, durationPhrase } = preview.first;
  const more = preview.conflictCount - 1;
  return (
    <div
      className="rounded-lg border border-warn/40 bg-warn/5 p-3 text-sm"
      role="status"
      aria-live="polite"
      data-setup-preview
    >
      <p className="flex items-center gap-1.5 text-xs font-semibold tracking-wide text-warn uppercase">
        <ShieldAlert className="size-3.5" aria-hidden /> Provisional first finding
        {more > 0 && (
          <span className="font-normal normal-case text-muted">· {more} more after setup</span>
        )}
      </p>
      <p className="mt-1 font-medium">
        {conflict.personName} {conflict.ownerHeld ? "(the owner) " : ""}holds both{" "}
        <span className="text-fg">{conflict.labelA.toLowerCase()}</span> and{" "}
        <span className="text-fg">{conflict.labelB.toLowerCase()}</span>.
      </p>
      <p className="mt-1 text-xs leading-relaxed text-muted">{conflict.fraudPath}</p>
      {study && (
        <p className="mt-2 text-xs leading-relaxed text-muted">
          <span className="font-medium text-fg">
            {citesRule ? "The same arrangement" : "A related arrangement"}
          </span>{" "}
          at a {study.sector.replace(/_/g, " ")} business: {study.title}
          {lossPhrase ? ` — ${lossPhrase} taken` : ""}
          {durationPhrase ? ` over ${durationPhrase}` : ""}. Every figure links to its record after
          setup.
        </p>
      )}
    </div>
  );
}
