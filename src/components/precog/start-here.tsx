import { Link } from "@tanstack/react-router";
import { FileText } from "lucide-react";
import type { NavFn } from "@/lib/precog/navigation";
import type { SodDetectionReport } from "@/lib/precog/sod/detect";
import { buttonClass } from "@/components/ui/button-variants";
import { EvidenceFooter } from "./start-here-parts";
import { StartHereContinuitySection } from "./start-here-continuity-section";
import { StartHereCostSection } from "./start-here-cost-section";
import { StartHereExposureSection } from "./start-here-exposure-section";
import { StartHereFiguresSection } from "./start-here-figures-section";
import { StartHereFirstStepsSection } from "./start-here-first-steps-section";
import { StartHereLimitsSection } from "./start-here-limits-section";
import { StartHerePreamble } from "./start-here-preamble";
import { useStartHere } from "./use-start-here";

/**
 * Home: the first screen an owner sees.
 *
 * After the two headline figures it answers, in this order and in plain
 * words:
 *
 *   1. What to do first.
 *   2. Where this business is exposed right now.
 *   3. What that exposure has actually cost organizations like it.
 *   4. Whether the business can run if someone is out.
 *
 * and then says what Precog cannot tell. Every dollar figure and duration
 * resolves to a prosecuted case or a published study; the continuity
 * percentages are Precog's own indices and say so. Where Precog cannot
 * support a claim, it says so rather than filling the space.
 */
export function StartHere({
  onOpenDetail,
  sod,
}: {
  onOpenDetail: NavFn;
  /** The shell's duty-conflict report for the same profile, so the detector runs once. */
  sod?: SodDetectionReport;
}) {
  const model = useStartHere(sod);

  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-2xl font-semibold tracking-tight">Home</h1>
          {!model.preamble.isSampleTeam && (
            <Link
              to="/report"
              className={buttonClass({
                variant: "outline",
                className: "h-9 text-muted hover:text-fg",
              })}
            >
              <FileText className="size-4" aria-hidden />
              Control report
            </Link>
          )}
        </div>
        <p className="max-w-2xl text-sm leading-relaxed text-muted">
          This page starts with what to do first, then shows where a business like yours carries
          exposure, what that same exposure has cost real businesses, and whether the work goes on
          when someone is out. Every dollar figure and duration on this page links to the case or
          study it came from. The continuity percentages are Precog&rsquo;s own indices; Who knows
          what explains how Precog counts each.
        </p>
      </header>

      <StartHerePreamble model={model.preamble} onOpenDetail={onOpenDetail} />
      <StartHereFiguresSection model={model.figures} onOpenDetail={onOpenDetail} />
      <StartHereFirstStepsSection model={model.firstSteps} />
      <StartHereExposureSection model={model.exposure} onOpenDetail={onOpenDetail} />
      <StartHereCostSection model={model.cost} />
      <StartHereContinuitySection model={model.continuity} onOpenDetail={onOpenDetail} />
      <StartHereLimitsSection />

      <EvidenceFooter model={model.footer} />
    </div>
  );
}
