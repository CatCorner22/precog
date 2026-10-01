import { ArrowRight, ExternalLink } from "lucide-react";
import { SectionHeading } from "./start-here-parts";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import type { StartHereModel } from "@/lib/precog/start-here/model";
import { effortPhrase, lossPhrase } from "@/lib/precog/evidence";

export function StartHereFirstStepsSection({ model }: { model: StartHereModel["firstSteps"] }) {
  const { steps, caseById, tips, hotlineGap, soleKnowledge, driftActions } = model;

  return (
    <section className="space-y-3">
      <SectionHeading
        icon={<ArrowRight className="size-4" aria-hidden />}
        title="Do these first"
        subtitle="Ordered first by how many of your open gaps each one answers, then by how many of the real cases above it would plausibly have caught. Most of these are detective controls: they shorten how long a scheme runs, which is what decides the loss."
      />

      {driftActions.length > 0 && (
        <Card className="border-warn/30 bg-warn/5">
          <CardContent className="space-y-2 pt-5">
            <p className="text-sm font-medium">Books vs your duty map</p>
            <ul className="space-y-2 text-sm text-muted">
              {driftActions.map((d) => (
                <li key={d.id}>
                  <span className="text-fg">{d.title}</span> — {d.why}
                </li>
              ))}
            </ul>
            <p className="text-xs text-subtle">
              Open the Firm workspace to match payroll, vendors, and access exports to your map.
            </p>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent className="pt-5">
          {steps.length === 0 ? (
            <p className="text-sm leading-relaxed text-muted">
              Nothing outstanding from the duty conflicts. What follows applies to every business.
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
                      {effortPhrase(s.control)} ·{" "}
                      {s.answers > 0
                        ? `answers ${s.answers} of your open ${s.answers === 1 ? "gap" : "gaps"} · `
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
                                {c.lossUsd > 0 ? ` (${lossPhrase(c)})` : ""}
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
