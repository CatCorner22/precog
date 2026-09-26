import { EvidenceFooter } from "./start-here-parts";
import { StartHereContinuitySection } from "./start-here-continuity-section";
import { StartHereCostSection } from "./start-here-cost-section";
import { StartHereExposureSection } from "./start-here-exposure-section";
import { StartHereFirstStepsSection } from "./start-here-first-steps-section";
import { StartHereLimitsSection } from "./start-here-limits-section";
import { StartHerePreamble } from "./start-here-preamble";
import { useStartHere } from "./use-start-here";

/**
 * The first screen an owner sees.
 *
 * It answers three questions in order, in plain words, and nothing else:
 *
 *   1. Where is this business exposed right now?
 *   2. What has that exposure actually cost organizations like it?
 *   3. What should be done first?
 *
 * Every claim on this screen resolves to a prosecuted case or a published
 * study. Where the application cannot support a claim, it says so rather than
 * filling the space.
 */
export function StartHere({ onOpenDetail }: { onOpenDetail?: (tab: string) => void }) {
  const model = useStartHere();

  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">Start here</h1>
        <p className="max-w-2xl text-sm leading-relaxed text-muted">
          This page shows where a business like yours is exposed, what that same exposure has cost
          real organizations, and what to do about it first. Every figure links to the case or study
          it came from.
        </p>
      </header>

      <StartHerePreamble model={model} onOpenDetail={onOpenDetail} />
      <StartHereContinuitySection model={model} onOpenDetail={onOpenDetail} />
      <StartHereExposureSection model={model} onOpenDetail={onOpenDetail} />
      <StartHereCostSection model={model} />
      <StartHereFirstStepsSection model={model} />
      <StartHereLimitsSection />

      <EvidenceFooter cases={model.evidence} industryId={model.industryId} />
    </div>
  );
}
