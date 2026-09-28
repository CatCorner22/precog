import { CheckCircle2, CircleAlert, Lightbulb, OctagonX } from "lucide-react";
import type { Recommendation } from "@/lib/precog/procedures/quality";
import { WRITING_STANDARD_LABEL } from "@/lib/precog/procedures/writing";

/**
 * What to change so a stand-in can follow the procedure, from the
 * best-practice check (procedures/quality.ts): writing errors that block
 * verification first, then other fixes, then improvements. Each names the
 * writing standard it enforces, the step it is about and why it matters.
 */
export function BestPracticeCheck({
  recommendations,
  headingLevel = "h3",
}: {
  recommendations: readonly Recommendation[];
  headingLevel?: "h2" | "h3";
}) {
  const Heading = headingLevel;
  const blocking = recommendations.filter((r) => r.blocksVerification).length;
  const fixes = recommendations.filter((r) => r.level === "fix").length - blocking;
  const improvements = recommendations.length - blocking - fixes;
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
          It meets every standard this check applies.
        </p>
      ) : (
        <>
          <p className="text-xs text-muted">
            {[
              blocking
                ? `${blocking} writing ${blocking === 1 ? "error blocks" : "errors block"} verification`
                : "",
              fixes ? `${fixes} to fix before someone else relies on it` : "",
              improvements ? `${improvements} to make it easier to follow` : "",
            ]
              .filter(Boolean)
              .join(" · ")}
          </p>
          <ul className="space-y-1.5">
            {recommendations.map((r) => (
              <li key={r.id} className="flex gap-2 text-sm">
                {r.blocksVerification ? (
                  <OctagonX
                    className="mt-0.5 size-4 shrink-0 text-danger"
                    aria-label="Blocks verification"
                  />
                ) : r.level === "fix" ? (
                  <CircleAlert className="mt-0.5 size-4 shrink-0 text-warn" aria-label="Fix" />
                ) : (
                  <Lightbulb className="mt-0.5 size-4 shrink-0 text-muted" aria-label="Improve" />
                )}
                <div className="min-w-0 [overflow-wrap:anywhere]">
                  <p>
                    {r.step ? <span className="font-medium">Step {r.step}: </span> : null}
                    {r.title}
                  </p>
                  <p className="text-xs text-muted">
                    {r.standard && r.standard !== "practice" && (
                      <span className="font-medium">{WRITING_STANDARD_LABEL[r.standard]}. </span>
                    )}
                    {r.why}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
