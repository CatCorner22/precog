import { ArrowRight, ExternalLink } from "lucide-react";
import { SectionHeading } from "./start-here-parts";
import { TeamLink } from "./team-link";
import { Button } from "@/components/ui/button";
import { doNextDrift, doNextSteps, stepFocus, type DoNextStep } from "@/lib/precog/actions/do-next";
import type { NavFn } from "@/lib/precog/navigation";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { FIRST_STEPS_SHOWN, stepDestination } from "@/lib/precog/start-here/layout";
import type { StartHereModel } from "@/lib/precog/start-here/model";
import { benchmarkCitation, effortPhrase, lossPhrase } from "@/lib/precog/evidence";
import { cn } from "@/lib/utils";

export function StartHereFirstStepsSection({
  model,
  onOpenDetail,
  part,
}: {
  model: StartHereModel["firstSteps"];
  /** Opens the screen that fixes a step; without it the steps have no button. */
  onOpenDetail?: NavFn;
  /**
   * "actions" renders the ranked list and the books-vs-duties card; "notes"
   * the reporting-channel and sole-knowledge cards. Both when absent.
   */
  part?: "actions" | "notes";
}) {
  const { items, caseById, tips, hotlineGap, soleKnowledge, alreadyInPlace } = model;
  const steps = doNextSteps(items);
  const driftActions = doNextDrift(items);
  const shown = steps.slice(0, FIRST_STEPS_SHOWN);
  const rest = steps.slice(FIRST_STEPS_SHOWN);
  const showActions = part !== "notes";
  const showNotes = part !== "actions";
  const hasNotes = Boolean(tips) || soleKnowledge.length > 0;
  if (part === "notes" && !hasNotes) return null;

  const renderStep = (s: DoNextStep, i: number) => {
    const focus = stepFocus(s, model.open ?? [], model.staff);
    const landing = stepDestination(s, focus);
    // Item 1 names the person and duties in conflict, in the words the
    // duty-conflict tab's "What to do first" box gives it.
    const label = (i === 0 && model.firstLine) || s.control.label;
    return (
      <li
        key={s.control.id}
        className={cn(
          "flex gap-3 rounded-lg p-4",
          i === 0 && "bg-primary/5 ring-1 ring-primary/20",
        )}
      >
        <span
          className={cn(
            "mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold",
            i === 0 ? "bg-primary text-primary-fg" : "bg-elevated text-muted",
          )}
          aria-hidden
        >
          {i + 1}
        </span>
        <div className="min-w-0 flex-1">
          {i === 0 && <p className="mb-1 text-xs font-medium text-primary">Start with this</p>}
          <p className="text-sm font-medium leading-relaxed [overflow-wrap:anywhere]">{label}</p>
          <p className="mt-1 text-xs leading-relaxed text-muted">{effortPhrase(s.control)}</p>
          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1">
            {onOpenDetail && landing && (
              <Button
                size="sm"
                variant={i === 0 ? "default" : "secondary"}
                className="min-h-11 h-auto max-w-full py-2 text-left whitespace-normal"
                data-step-id={s.control.id}
                aria-label={`${landing.button}: ${label}`}
                onClick={() => onOpenDetail(landing.tab, landing.item)}
              >
                <span className="min-w-0 [overflow-wrap:anywhere]">{landing.button}</span>
                <ArrowRight className="size-3.5 shrink-0" aria-hidden />
              </Button>
            )}
          </div>
          <details className="mt-1">
            <summary
              aria-label={`Why this helps: ${label}`}
              className="min-h-11 w-fit max-w-full cursor-pointer content-center rounded-md text-xs font-medium text-muted hover:text-fg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
            >
              Why this helps
            </summary>
            <p className="text-sm leading-relaxed text-muted">{s.control.why}</p>
            <div className="mt-2 text-xs leading-relaxed text-subtle">
              {s.answers > 0
                ? `covers ${s.answers === 1 ? "1 duty pair" : `${s.answers} of the duty pairs`} behind your open conflicts · `
                : ""}
              would plausibly have caught {s.supportingCaseIds.length}{" "}
              {s.supportingCaseIds.length === 1 ? "case" : "cases"} below
              {s.supportingCaseIds.length > 0 && (
                <ul className="mt-2 list-disc space-y-1 pl-4 text-xs text-muted">
                  {s.supportingCaseIds.map((id) => {
                    const c = caseById.get(id);
                    return c ? (
                      <li key={id}>
                        {c.title}
                        {c.lossUsd > 0 ? ` (${lossPhrase(c)})` : ""}
                      </li>
                    ) : null;
                  })}
                </ul>
              )}
            </div>
          </details>
        </div>
      </li>
    );
  };

  return (
    <section className="space-y-3">
      {showActions && (
        <>
          <div className="space-y-1">
            <h2 className="text-lg font-semibold tracking-tight">Do these first</h2>
            <p className="text-sm text-muted">
              {steps.length > 0
                ? "Start with one step. The reasons are here when you need them."
                : "No actions from the duty conflicts recorded so far."}
            </p>
          </div>

          <Card>
            <CardContent className="p-3">
              {steps.length === 0 ? (
                <p className="text-sm leading-relaxed text-muted">
                  Nothing outstanding from the duty conflicts. What follows applies to every
                  business.
                </p>
              ) : (
                <ol className="space-y-1">{shown.map(renderStep)}</ol>
              )}
              {rest.length > 0 && (
                <details className="mt-3">
                  <summary className="min-h-11 cursor-pointer content-center rounded-md px-4 text-sm font-medium text-primary hover:underline focus-visible:outline-2 focus-visible:outline-primary">
                    Show the other {rest.length === 1 ? "one" : rest.length}
                  </summary>
                  <ol start={FIRST_STEPS_SHOWN + 1} className="mt-3 space-y-1">
                    {rest.map((s, i) => renderStep(s, i + FIRST_STEPS_SHOWN))}
                  </ol>
                </details>
              )}
              {alreadyInPlace.length > 0 && (
                <p className="mt-3 text-xs text-muted">
                  Not shown: you said at setup that these controls already run:{" "}
                  {alreadyInPlace.map((control) => control.label).join(", ")}.
                </p>
              )}
              {onOpenDetail && <SoleTaskLine sole={model.soleKnowledge[0]} onOpen={onOpenDetail} />}
              {steps.length > 0 && (
                <details className="mt-3 border-t border-border px-4 pt-1">
                  <summary className="min-h-11 cursor-pointer content-center rounded-md text-xs font-medium text-muted hover:text-fg focus-visible:outline-2 focus-visible:outline-primary">
                    How these actions are ranked
                  </summary>
                  <p className="pb-3 text-xs leading-relaxed text-muted">
                    Precog ranks actions by open conflict pairs covered, then by real cases below
                    each could plausibly have caught.
                  </p>
                </details>
              )}
            </CardContent>
          </Card>

          {driftActions.length > 0 && (
            <Card className="border-warn/30 bg-warn/5">
              <CardContent className="space-y-2 pt-5">
                <p className="text-sm font-medium">Books vs your duty assignments</p>
                <ul className="space-y-2 text-sm text-muted">
                  {driftActions.map((d) => (
                    <li key={d.id}>
                      <span className="text-fg">{d.title}</span> — {d.why}
                    </li>
                  ))}
                </ul>
                <p className="text-xs text-subtle">
                  <TeamLink>
                    Match payroll and access exports to your duty assignments under Team
                  </TeamLink>
                </p>
              </CardContent>
            </Card>
          )}
        </>
      )}

      {part === "notes" && hasNotes && <SectionHeading title="Also worth knowing" />}

      {showNotes && tips && (
        <Card>
          <CardContent className="space-y-1 pt-5">
            <p className="text-sm font-medium">
              Give staff a way to report concerns without going through the person they are worried
              about.
            </p>
            <p className="text-sm leading-relaxed text-muted">{tips.soWhat}</p>
            {hotlineGap && (
              <p className="text-sm leading-relaxed text-muted">
                {hotlineGap.label}: {hotlineGap.value}.
              </p>
            )}
            {tips.caveat && <p className="text-xs leading-relaxed text-subtle">{tips.caveat}</p>}
            <a
              href={tips.source.url}
              target="_blank"
              rel="noreferrer noopener"
              className="inline-flex items-center gap-1.5 text-xs font-medium text-primary hover:underline"
            >
              {benchmarkCitation(tips)}
              <ExternalLink className="size-3" aria-hidden />
            </a>
          </CardContent>
        </Card>
      )}

      {showNotes && soleKnowledge.length > 0 && (
        <Card>
          <CardContent className="space-y-2 pt-5">
            <p className="text-sm font-medium">
              {soleKnowledge.length} {soleKnowledge.length === 1 ? "task depends" : "tasks depend"}{" "}
              on exactly one person.
            </p>
            <p className="text-sm leading-relaxed text-muted">
              One-person knowledge creates a continuity and oversight gap. No one else can review
              work they do not understand.
            </p>
            <ul className="flex flex-wrap gap-1.5 pt-1">
              {soleKnowledge.slice(0, 6).map((k) => (
                <li key={k.knowledgeId} className="min-w-0 max-w-full">
                  <Badge
                    variant="warn"
                    className="inline-block min-w-0 max-w-full whitespace-normal break-words [overflow-wrap:anywhere]"
                  >
                    {k.name}
                  </Badge>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
    </section>
  );
}

/** One sole-held task, beside the ranked controls, opening that register row. */
function SoleTaskLine({
  sole,
  onOpen,
}: {
  sole: StartHereModel["firstSteps"]["soleKnowledge"][number] | undefined;
  onOpen: NavFn;
}) {
  const person = sole?.owners[0];
  if (!sole || !person) return null;
  return (
    <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-border px-4 pt-4">
      <p className="min-w-0 text-sm leading-relaxed">
        Only {person.name} can run {sole.name}.
      </p>
      <Button
        size="sm"
        variant="secondary"
        className="min-h-11 h-auto max-w-full py-2 whitespace-normal"
        aria-label={`Open Who knows what: ${sole.name}`}
        onClick={() => onOpen("knowledge", sole.knowledgeId)}
      >
        Open that task
        <ArrowRight className="size-3.5" aria-hidden />
      </Button>
    </div>
  );
}
