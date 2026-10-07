import { ShieldOff } from "lucide-react";
import type { ScenarioTemplate } from "@/lib/precog/types";
import { joinWithAnd } from "@/lib/precog/text";
import type { ScenarioUnfolding } from "@/lib/precog/scenario-unfolding";
import { dutyFacts, knowledgeFact } from "@/lib/precog/scenario-watch";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { scenarioRuleIds, type ScenarioWatch } from "./scenario-page";

export function ScenarioWatchCard({
  scenario,
  unfolding,
  watch,
  onOpenFailure,
}: {
  scenario: Pick<ScenarioTemplate, "id" | "sodRuleIds">;
  unfolding: ScenarioUnfolding;
  watch: ScenarioWatch;
  onOpenFailure?: (targetKey: string) => void;
}) {
  const ruleIds = scenarioRuleIds(scenario);
  const control = watch.control;

  return (
    <Card>
      <CardHeader>
        <CardTitle>What could go wrong</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <section>
          <p className="text-xs font-medium tracking-wide text-subtle uppercase">How it unfolds</p>
          <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm text-muted">
            {unfolding.steps.map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ol>
        </section>

        <section>
          <p className="text-xs font-medium tracking-wide text-subtle uppercase">Warning signs</p>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-muted">
            {unfolding.warningSigns.map((sign) => (
              <li key={sign}>{sign}</li>
            ))}
          </ul>
        </section>

        {(ruleIds.length > 0 || watch.control || watch.knowledge) && (
          <section>
            <p className="text-xs font-medium tracking-wide text-subtle uppercase">
              In your business now
            </p>
            <div className="mt-2 space-y-1 text-sm text-muted">
              {ruleIds.length > 0 &&
                dutyFacts(watch).map((fact, index) => <p key={`${fact}:${index}`}>{fact}</p>)}
              {control &&
                (control.example ? (
                  <p>
                    &ldquo;{control.name}&rdquo; is Precog&rsquo;s example. You have not confirmed
                    it runs here.
                  </p>
                ) : (
                  <p>
                    &ldquo;{control.name}&rdquo; is{" "}
                    {control.inPlace ? "marked in place." : "not marked in place."}
                  </p>
                ))}
              {watch.knowledge && (
                <>
                  <p>{knowledgeFact(watch.knowledge)}</p>
                  {watch.knowledge.outToday.length > 0 && (
                    <p className="text-warn">{joinWithAnd(watch.knowledge.outToday)} out today.</p>
                  )}
                </>
              )}
            </div>
          </section>
        )}

        {control && onOpenFailure && (
          <Button
            aria-label={`What if “${control.name}” fails?`}
            variant="secondary"
            size="sm"
            onClick={() => onOpenFailure(`control:${control.id}`)}
          >
            <ShieldOff className="size-3.5" />
            What if &ldquo;{control.name}&rdquo; fails?
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
