import { Link } from "@tanstack/react-router";
import { SignedOut } from "@/lib/auth/gates";
import { FileText } from "lucide-react";
import { tabLabel, type NavFn } from "@/lib/precog/navigation";
import { usePresentation } from "@/lib/precog/presentation";
import type { SodDetectionReport } from "@/lib/precog/sod/detect";
import { buttonClass } from "@/components/ui/button-variants";
import { HowThisWorks, WordsUsedHere } from "./page-intro";
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
 *   1. Who is out today, when someone is.
 *   2. The three actions that answer the most open gaps, each with a button
 *      to the screen that gets it done.
 *   3. The open duty-conflict count.
 *
 * The stand-in percentage is Precog's own index. It sits under "Why we say
 * this", with where one person controls too much, what that exposure has cost
 * organizations like this one, what Precog cannot tell, and every case it
 * cites. Every dollar figure and duration there resolves to a prosecuted case
 * or a published study.
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
    <div className="space-y-6">
      <header className="space-y-1">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-2xl font-semibold tracking-tight">Start here</h1>
          {!model.preamble.isSampleTeam && (
            <Link
              to="/report"
              className={buttonClass({
                variant: "outline",
                className: "min-h-11 text-muted hover:text-fg",
              })}
            >
              <FileText className="size-4" aria-hidden />
              Control report
            </Link>
          )}
        </div>
        <p className="max-w-2xl text-sm leading-relaxed text-muted">
          Your next steps to protect the business and keep work moving.
        </p>
        <WordsUsedHere tab="start" />
      </header>

      <StartHerePreamble model={model.preamble} onOpenDetail={onOpenDetail} />
      {!model.preamble.isSampleTeam && (
        <SignedOut>
          <p
            data-testid="keep-it-note"
            className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-md border border-border bg-elevated/50 px-3 py-2 text-xs text-muted"
          >
            <span>Saved on this device only. Sign in to keep this business on every device.</span>
            <Link to="/login" className="font-medium text-primary underline underline-offset-2">
              Sign in
            </Link>
          </p>
        </SignedOut>
      )}
      <StartHereContinuitySection
        model={model.continuity}
        onOpenDetail={onOpenDetail}
        part="today"
      />
      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_17rem]">
        <div className="min-w-0 space-y-3">
          <StartHereFirstStepsSection
            model={model.firstSteps}
            onOpenDetail={onOpenDetail}
            part="actions"
          />
          {model.exposure.titleDuties && (
            <p className="text-xs leading-relaxed text-muted" data-testid="title-duties-note">
              {model.exposure.titleDuties} Untick or confirm those duties on{" "}
              <button
                type="button"
                onClick={() => onOpenDetail("team")}
                className="font-medium text-primary underline underline-offset-2 hover:text-fg"
              >
                Team
              </button>
              .
            </p>
          )}
        </div>
        <aside aria-label="At a glance" className="min-w-0 space-y-3">
          <h2 className="text-lg font-semibold tracking-tight">At a glance</h2>
          <StartHereFiguresSection
            model={model.figures}
            onOpenDetail={onOpenDetail}
            part="conflicts"
          />
          <p className="text-xs leading-relaxed text-muted">
            Open the count to review the duty assignments behind this figure.
          </p>
        </aside>
      </div>

      <HowThisWorks
        summary={WHY_WE_SAY_THIS}
        className="max-w-none"
        bodyClassName="space-y-8 pt-2 text-base text-fg"
      >
        <HowThisWorks>
          <p>
            This page leads with who is out, three steps, and the open duty-conflict count. The
            stand-in figure is under {WHY_WE_SAY_THIS}. Most steps are checks that catch problems
            sooner. The sooner a theft is found, the smaller the loss.
          </p>
          <p>
            {WHY_WE_SAY_THIS} shows where one person controls too much, what these gaps have cost
            real businesses, and who can cover for whom. It also explains what Precog cannot tell
            you and lists every case it uses.
          </p>
          <p>
            Each dollar figure and time span links to its case or study. Precog calculates the
            coverage percentages. {tabLabel("knowledge", say)} explains how.
          </p>
        </HowThisWorks>
        <StartHereFiguresSection model={model.figures} onOpenDetail={onOpenDetail} part="standin" />
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
