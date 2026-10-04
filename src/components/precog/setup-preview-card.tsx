import { useDeferredValue, useMemo, useState } from "react";
import { ShieldAlert } from "lucide-react";
import type { IndustryId } from "@/lib/precog/industry";
import type { OwnTeamRow } from "@/lib/precog/onboarding/own-team";
import { previewSetup, type SetupPreview } from "@/lib/precog/onboarding/setup-preview";
import { NO_CASE_FOR_RULE, sectorPhrase } from "@/lib/precog/evidence";
import { CaseMarker } from "@/components/precog/case-card";
import { cn } from "@/lib/utils";

/**
 * The payoff inside setup: the first conflict the typed team produces and
 * the prosecuted case that shows what the same arrangement cost. Appears
 * once two duties on one person form a conflict; until then it says what
 * would make it appear.
 *
 * The card stays in place while the owner types: it shows the last result,
 * dimmed and marked busy, until the new one is ready. A screen reader hears
 * the finding once, when its rule or person changes, not on every keystroke.
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
  const updating = deferredRows !== rows;
  const announcement = useFindingAnnouncement(preview);

  return (
    <>
      <p className="sr-only" role="status">
        {announcement}
      </p>
      <PreviewBody preview={preview} updating={updating} />
    </>
  );
}

function PreviewBody({ preview, updating }: { preview: SetupPreview; updating: boolean }) {
  if (preview.peopleWithDuties === 0) return null;
  const busy = { "aria-busy": updating, className: cn(updating && "opacity-60") };

  if (!preview.first) {
    return (
      <div {...busy}>
        <p className="rounded-lg border border-border bg-elevated px-3 py-2 text-xs text-muted">
          No conflict found among the duties entered so far. This is a provisional check, not a
          completed assessment; review title-based suggestions and any missing duties.
        </p>
      </div>
    );
  }

  const { conflict, study, lossPhrase, durationPhrase } = preview.first;
  const more = preview.conflictCount - 1;
  return (
    <div {...busy}>
      <div className="rounded-lg border border-warn/40 bg-warn/5 p-3 text-sm" data-setup-preview>
        <p className="flex items-center gap-1.5 text-xs font-semibold tracking-wide text-warn uppercase">
          <ShieldAlert className="size-3.5" aria-hidden /> Provisional first duty conflict
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
        {study ? (
          <p className="mt-2 text-xs leading-relaxed text-muted">
            <span className="font-medium text-fg">The same arrangement</span>{" "}
            {sectorPhrase(study.sector)}: {study.title}
            {lossPhrase ? ` — ${lossPhrase} taken` : ""}
            {durationPhrase ? ` over ${durationPhrase}` : ""}. <CaseMarker study={study} /> Every
            figure links to its record after setup.
          </p>
        ) : (
          <p className="mt-2 text-xs text-subtle">{NO_CASE_FOR_RULE}</p>
        )}
      </div>
    </div>
  );
}

/**
 * What the live region says about the preview. The text is renewed only when
 * the first finding's rule or person changes (or a finding appears or goes),
 * so typing a name does not re-read the finding after every character.
 */
function useFindingAnnouncement(preview: SetupPreview): string {
  const first = preview.first;
  const key = first
    ? `${first.conflict.ruleId}|${first.conflict.personId}`
    : preview.peopleWithDuties > 0
      ? "none"
      : "";
  const [spoken, setSpoken] = useState({ key: "", text: "" });
  if (spoken.key !== key) {
    const text = first
      ? `Provisional first duty conflict: ${first.conflict.personName} holds both ${first.conflict.labelA.toLowerCase()} and ${first.conflict.labelB.toLowerCase()}.`
      : key === "none"
        ? "No duty conflict found among the duties entered so far."
        : "";
    setSpoken({ key, text });
  }
  return spoken.text;
}
