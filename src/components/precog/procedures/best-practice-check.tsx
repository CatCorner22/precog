import { CheckCircle2, CircleAlert, Lightbulb } from "lucide-react";
import type { Recommendation } from "@/lib/precog/procedures/quality";

/**
 * What to change so a stand-in can follow the procedure, from the
 * best-practice check (procedures/quality.ts): fixes first, then
 * improvements, each with the step it is about and why it matters.
 */
export function BestPracticeCheck({
  recommendations,
  headingLevel = "h3",
}: {
  recommendations: readonly Recommendation[];
  headingLevel?: "h2" | "h3";
}) {
  const Heading = headingLevel;
  const fixes = recommendations.filter((r) => r.level === "fix").length;
  const improvements = recommendations.length - fixes;
  return (
    <section aria-labelledby="best-practice-heading" className="space-y-2">
      <Heading
        id="best-practice-heading"
        className="text-xs font-medium uppercase tracking-wide text-muted"
      >
        Best-practice check
      </Heading>
      {recommendations.length === 0 ? (
        <p className="flex items-center gap-1.5 text-xs text-ok">
          <CheckCircle2 className="size-3.5" aria-hidden />
          It follows every practice this check looks for.
        </p>
      ) : (
        <>
          <p className="text-xs text-muted">
            {[
              fixes ? `${fixes} to fix before someone else relies on it` : "",
              improvements ? `${improvements} to make it easier to follow` : "",
            ]
              .filter(Boolean)
              .join(" · ")}
          </p>
          <ul className="space-y-1.5">
            {recommendations.map((r) => (
              <li key={r.id} className="flex gap-2 text-sm">
                {r.level === "fix" ? (
                  <CircleAlert className="mt-0.5 size-4 shrink-0 text-warn" aria-label="Fix" />
                ) : (
                  <Lightbulb className="mt-0.5 size-4 shrink-0 text-muted" aria-label="Improve" />
                )}
                <div className="min-w-0 [overflow-wrap:anywhere]">
                  <p>
                    {r.step ? <span className="font-medium">Step {r.step}: </span> : null}
                    {r.title}
                  </p>
                  <p className="text-xs text-muted">{r.why}</p>
                </div>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
