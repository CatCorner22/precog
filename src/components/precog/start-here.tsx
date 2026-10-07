import { Link } from "@tanstack/react-router";
import { FileText } from "lucide-react";
import { tabLabel, type NavFn } from "@/lib/precog/navigation";
import { usePresentation } from "@/lib/precog/presentation";
import type { SodDetectionReport } from "@/lib/precog/sod/detect";
import { buttonClass } from "@/components/ui/button-variants";
import { HowThisWorks } from "./page-intro";
import { EvidenceFooter } from "./start-here-parts";
import { StartHereContinuitySection } from "./start-here-continuity-section";
import { StartHereCostSection } from "./start-here-cost-section";
import { StartHereExposureSection } from "./start-here-exposure-section";
import { StartHereFiguresSection } from "./start-here-figures-section";
import { StartHereFirstStepsSection } from "./start-here-first-steps-section";
import { StartHereLimitsSection } from "./start-here-limits-section";
import { StartHerePreamble } from "./start-here-preamble";
import { WHY_WE_SAY_THIS } from "@/lib/precog/start-here/layout";
import { useStartHere } from "./use-start-here";

/**
 * Home: the first screen an owner sees, kept to one screen.
 *
 *   1. Two headline figures.
 *   2. Who is out today, when someone is.
 *   3. The three actions that answer the most open gaps, each with a button
 *      to the screen that gets it done.
 *
 * Everything behind those — where one person controls too much, what that
 * exposure has cost organizations like this one, the continuity figures,
 * what Precog cannot tell, and every case it cites — sits under a closed
 * "Why we say this". Every dollar figure and duration there resolves to a
 * prosecuted case or a published study; the continuity percentages are
 * Precog's own indices and say so.
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
  const { say } = usePresentation();

  return (
    <div className="space-y-4">
      <header className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-2xl font-semibold tracking-tight">Start here</h1>
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
          What to do first, who is out today, and whether the work goes on without them.
        </p>
        <HowThisWorks>
          <p>
            Two headline figures, who is out today, then the three actions that answer the most of
            your open gaps; most are detective controls, which shorten how long a scheme runs, and
            that is what decides the loss. {WHY_WE_SAY_THIS} holds the evidence: where one person
            controls too much, what that same exposure has cost real businesses, your continuity
            figures, what Precog cannot tell you, and every case it cites.
          </p>
          <p>
            Every dollar figure and duration on this page links to the case or study it came from.
            The continuity percentages are Precog&rsquo;s own indices; {tabLabel("knowledge", say)}{" "}
            explains how Precog counts each.
          </p>
        </HowThisWorks>
      </header>

      <StartHerePreamble model={model.preamble} onOpenDetail={onOpenDetail} />
      <StartHereFiguresSection model={model.figures} onOpenDetail={onOpenDetail} />
      <StartHereContinuitySection
        model={model.continuity}
        onOpenDetail={onOpenDetail}
        part="today"
      />
      <StartHereFirstStepsSection
        model={model.firstSteps}
        onOpenDetail={onOpenDetail}
        part="actions"
      />

      <HowThisWorks
        summary={WHY_WE_SAY_THIS}
        className="max-w-none"
        bodyClassName="space-y-8 pt-2 text-base text-fg"
      >
        <StartHereExposureSection model={model.exposure} onOpenDetail={onOpenDetail} />
        <StartHereCostSection model={model.cost} />
        <StartHereFirstStepsSection model={model.firstSteps} part="notes" />
        <StartHereContinuitySection
          model={model.continuity}
          onOpenDetail={onOpenDetail}
          part="readiness"
        />
        <StartHereLimitsSection />
        <EvidenceFooter model={model.footer} />
      </HowThisWorks>
    </div>
  );
}
