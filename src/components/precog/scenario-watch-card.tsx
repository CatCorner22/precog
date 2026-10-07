import { ShieldOff } from "lucide-react";
import type { ScenarioTemplate } from "@/lib/precog/types";
import { joinWithAnd, verb } from "@/lib/precog/text";
import type { ScenarioUnfolding } from "@/lib/precog/scenario-unfolding";
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
                (watch.conflicts.length > 0 ? (
                  <>
                    {watch.conflicts.slice(0, 3).map((conflict, index) => (
                      <p key={`${conflict.personName}:${index}`}>
                        {conflict.personName} holds both duties: {conflict.title}
                      </p>
                    ))}
                    {watch.conflicts.length > 3 && <p>and {watch.conflicts.length - 3} more</p>}
                  </>
                ) : watch.unassignedDuties.length > 0 ? (
                  <>
                    <p>
                      Nobody on the team is ticked for {joinWithAnd(watch.unassignedDuties)}, so
                      Precog cannot tell whether one person holds both duties this needs. Tick
                      whoever does {verb(watch.unassignedDuties.length, "it", "them")} on the Team
                      tab.
                    </p>
                    {watch.offTeamDuties.length > 0 && (
                      <p>
                        Your setup answers place {joinWithAnd(watch.offTeamDuties)} outside the
                        team.
                      </p>
                    )}
                  </>
                ) : watch.offTeamDuties.length > 0 ? (
                  <p>
                    Your setup answers place {joinWithAnd(watch.offTeamDuties)} outside the team, so
                    nobody on the team holds both duties this needs.
                  </p>
                ) : (
                  <p>Nobody on the team holds both duties this needs.</p>
                ))}
              {control && (
                <p>
                  &ldquo;{control.name}&rdquo; is{" "}
                  {control.inPlace ? "marked in place." : "not marked in place."}
                </p>
              )}
              {watch.knowledge && (
                <>
                  <p>
                    {watch.knowledge.name}:{" "}
                    {watch.knowledge.holders.length > 0
                      ? `${joinWithAnd(watch.knowledge.holders)} can run it alone.`
                      : "nobody can run it alone."}
                  </p>
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
