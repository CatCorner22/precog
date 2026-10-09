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
    const focus = stepFocus(s, model.open ?? []);
    const landing = stepDestination(s, focus);
    // Item 1 names the person and duties in conflict, in the words the
    // duty-conflict tab's "What to do first" box gives it.
    const label = (i === 0 && model.firstLine) || s.control.label;
    return (
      <li key={s.control.id} className="flex gap-3">
        <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-elevated font-mono text-xs text-muted">
          {i + 1}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1">
            <p className="min-w-0 grow basis-56 text-sm leading-relaxed">{label}</p>
            {onOpenDetail && landing && (
              <Button
                size="sm"
                variant="secondary"
                className="shrink-0"
                data-step-id={s.control.id}
                aria-label={`${landing.button}: ${label}`}
                onClick={() => onOpenDetail(landing.tab, landing.item)}
              >
                {landing.button}
                <ArrowRight className="size-3.5" aria-hidden />
              </Button>
            )}
          </div>
          <p className="mt-0.5 text-sm leading-relaxed text-muted">{s.control.why}</p>
          <div className="mt-1 text-xs text-subtle">
            {effortPhrase(s.control)} ·{" "}
            {s.answers > 0
              ? `covers ${s.answers === 1 ? "1 duty pair" : `${s.answers} of the duty pairs`} behind your open conflicts · `
              : ""}
            would plausibly have caught {s.supportingCaseIds.length}{" "}
            {s.supportingCaseIds.length === 1 ? "case" : "cases"} below
            {s.supportingCaseIds.length > 0 && (
              <details className="inline">
                <summary className="ml-1 inline cursor-pointer font-medium text-primary hover:underline">
                  · which {s.supportingCaseIds.length === 1 ? "case" : "cases"}
                </summary>
                <ul className="mt-1 space-y-0.5 text-xs text-muted">
                  {s.supportingCaseIds.map((id) => {
                    const c = caseById.get(id);
                    return c ? (
                      <li key={id}>
                        · {c.title}
                        {c.lossUsd > 0 ? ` (${lossPhrase(c)})` : ""}
                      </li>
                    ) : null;
                  })}
                </ul>
              </details>
            )}
          </div>
        </div>
      </li>
    );
  };

  return (
    <section className="space-y-3">
      {showActions && (
        <>
          <SectionHeading
            icon={<ArrowRight className="size-4" aria-hidden />}
            title="Do these first"
            subtitle="Ranked by how many of the duty pairs behind your open conflicts each covers, then by how many of the real cases below it would plausibly have caught."
          />

          <Card>
            <CardContent className="pt-3">
              {steps.length === 0 ? (
                <p className="text-sm leading-relaxed text-muted">
                  Nothing outstanding from the duty conflicts. What follows applies to every
                  business.
                </p>
              ) : (
                <ol className="space-y-2.5">{shown.map(renderStep)}</ol>
              )}
              {rest.length > 0 && (
                <details className="mt-3">
                  <summary className="cursor-pointer text-sm font-medium text-primary hover:underline">
                    Show the other {rest.length === 1 ? "one" : rest.length}
                  </summary>
                  <ol className="mt-3 space-y-3">
                    {rest.map((s, i) => renderStep(s, i + FIRST_STEPS_SHOWN))}
                  </ol>
                </details>
              )}
              {alreadyInPlace.length > 0 && (
                <p className="mt-3 text-xs text-muted">
                  Left off because you said at setup they already run:{" "}
                  {alreadyInPlace.map((control) => control.label).join(", ")}.
                </p>
              )}
              {onOpenDetail && <SoleTaskLine sole={model.soleKnowledge[0]} onOpen={onOpenDetail} />}
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
              Give your staff a way to raise a concern that does not run through the person they are
              worried about.
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
              This is a continuity problem and an oversight problem at the same time. Nobody can
              review work they do not understand, so sole knowledge quietly removes the second pair
              of eyes as well.
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
    <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-border pt-3">
      <p className="min-w-0 text-sm leading-relaxed">
        Only {person.name} can run {sole.name}.
      </p>
      <Button
        size="sm"
        variant="secondary"
        className="shrink-0"
        aria-label={`Open Who knows what: ${sole.name}`}
        onClick={() => onOpen("knowledge", sole.knowledgeId)}
      >
        Open that task
        <ArrowRight className="size-3.5" aria-hidden />
      </Button>
    </div>
  );
}
