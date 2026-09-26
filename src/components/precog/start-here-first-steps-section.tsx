import { ArrowRight, ExternalLink } from "lucide-react";
import { SectionHeading } from "./start-here-parts";
import { effortPhrase } from "./start-here-copy";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { formatUsd } from "@/lib/utils";
import type { StartHereModel } from "./use-start-here";

export function StartHereFirstStepsSection({ model }: { model: StartHereModel }) {
  const { steps, caseById, tips, soleKnowledge } = model;

  return (
    <section className="space-y-3">
      <SectionHeading
        icon={<ArrowRight className="size-4" aria-hidden />}
        title="Do these first"
        subtitle="Ordered first by how many of your open findings each one answers, then by how many of the real cases above it would plausibly have caught. Most of these are detective controls: they shorten how long a scheme runs, which is where the loss is decided."
      />

      <Card>
        <CardContent className="pt-5">
          {steps.length === 0 ? (
            <p className="text-sm leading-relaxed text-muted">
              Nothing outstanding from the duty-conflict findings. The two items below still apply
              to every business regardless.
            </p>
          ) : (
            <ol className="space-y-3">
              {steps.slice(0, 6).map((s, i) => (
                <li key={s.control.id} className="flex gap-3">
                  <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-elevated font-mono text-xs text-muted">
                    {i + 1}
                  </span>
                  <div className="min-w-0">
                    <p className="text-sm leading-relaxed">{s.control.label}</p>
                    <p className="mt-0.5 text-sm leading-relaxed text-muted">{s.control.why}</p>
                    <p className="mt-1 text-xs text-subtle">
                      {effortPhrase(s.control.effort)} ·{" "}
                      {s.answers > 0
                        ? `answers ${s.answers} of your open ${s.answers === 1 ? "finding" : "findings"} · `
                        : ""}
                      would plausibly have caught {s.supportingCaseIds.length}{" "}
                      {s.supportingCaseIds.length === 1 ? "case" : "cases"} above
                    </p>
                    {s.supportingCaseIds.length > 0 && (
                      <details className="mt-1">
                        <summary className="cursor-pointer text-xs font-medium text-primary hover:underline">
                          Which {s.supportingCaseIds.length === 1 ? "case" : "cases"}
                        </summary>
                        <ul className="mt-1 space-y-0.5 text-xs text-muted">
                          {s.supportingCaseIds.map((id) => {
                            const c = caseById.get(id);
                            return c ? (
                              <li key={id}>
                                · {c.title}
                                {c.lossUsd > 0
                                  ? ` (${c.lossIsFloor ? "at least " : ""}${formatUsd(c.lossUsd)})`
                                  : ""}
                              </li>
                            ) : null;
                          })}
                        </ul>
                      </details>
                    )}
                  </div>
                </li>
              ))}
            </ol>
          )}
        </CardContent>
      </Card>

      {tips && (
        <Card>
          <CardContent className="space-y-1 pt-5">
            <p className="text-sm font-medium">
              Give your staff a way to raise a concern that does not run through the person they are
              worried about.
            </p>
            <p className="text-sm leading-relaxed text-muted">{tips.soWhat}</p>
            <a
              href={tips.source.url}
              target="_blank"
              rel="noreferrer noopener"
              className="inline-flex items-center gap-1.5 text-xs font-medium text-primary hover:underline"
            >
              {tips.study}
              <ExternalLink className="size-3" aria-hidden />
            </a>
          </CardContent>
        </Card>
      )}

      {soleKnowledge.length > 0 && (
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
                <li key={k.knowledgeId}>
                  <Badge variant="warn">{k.name}</Badge>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
    </section>
  );
}
