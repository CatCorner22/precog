import { ArrowRight, ShieldAlert } from "lucide-react";
import { SectionHeading } from "./start-here-parts";
import { BADGE_VARIANT, LONG_SERVICE_YEARS, lower } from "./start-here-copy";
import { caseForRule } from "@/lib/precog/evidence";
import { closingSteps, gapBadge } from "@/lib/precog/coach/first-steps";
import { midSentence } from "@/lib/precog/sod/verdict";
import { personLabel } from "@/lib/precog/person-label";
import { locationText } from "@/lib/precog/person-location";
import { CaseCard } from "./case-card";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatUsd } from "@/lib/utils";
import type { StartHereModel } from "./use-start-here";

export function StartHereExposureSection({
  model,
  onOpenDetail,
}: {
  model: StartHereModel;
  onOpenDetail?: (tab: string) => void;
}) {
  const {
    industryId,
    openConflicts,
    gaps,
    topThree,
    narrowed,
    narrowedCount,
    coveredCount,
    partialCoverage,
    headline,
    keptApart,
    ownerHeld,
    titleDuties,
    unheld,
    placesOf,
    atPlaces,
    gapPlaces,
    tenureByName,
    tenureCases,
    tenureNoteRuleId,
    dualRelease,
  } = model;

  return (
    <section className="space-y-3">
      <SectionHeading
        icon={<ShieldAlert className="size-4" aria-hidden />}
        title="Where one person controls too much"
        subtitle={
          gaps.length === 0
            ? "Nothing open right now."
            : `${gaps.length} distinct ${gaps.length === 1 ? "gap" : "gaps"} across ${openConflicts.length} ${openConflicts.length === 1 ? "finding" : "findings"}, worst first.` +
              (narrowedCount > 0
                ? ` ${narrowedCount} of them your dual-release policy narrows rather than closes.`
                : "") +
              (coveredCount > 0
                ? ` ${coveredCount} ${coveredCount === 1 ? "is" : "are"} covered by dual release at every amount.`
                : "")
        }
      />

      {titleDuties && (
        <p className="rounded-md border border-warn/30 bg-warn/5 px-3 py-2 text-sm leading-relaxed text-muted">
          {titleDuties}{" "}
          {onOpenDetail ? (
            <button
              type="button"
              onClick={() => onOpenDetail("sod")}
              className="font-medium text-primary underline underline-offset-2 hover:text-fg"
            >
              Check them in Who controls what.
            </button>
          ) : (
            "Check them in Who controls what."
          )}
        </p>
      )}

      {unheld.length > 0 && (
        <p className="rounded-md border border-warn/30 bg-warn/5 px-3 py-2 text-sm leading-relaxed text-muted">
          Nobody active is marked for: {unheld.join(", ")}. Somebody does each of these in every
          business that handles money, so mark who on Who controls what; until then the findings
          here cannot see that seat.
        </p>
      )}

      {headline && (
        <p className="rounded-md border border-danger/30 bg-danger/5 px-3 py-2 text-sm leading-relaxed">
          <span className="font-medium">
            {personLabel(headline.personName, headline.role)}
            {placesOf.has(headline.personId)
              ? `, at ${locationText(placesOf.get(headline.personId) ?? [])},`
              : ""}{" "}
            holds {headline.gaps} of the {headline.totalGaps} open gaps.
          </span>{" "}
          <span className="text-muted">
            Moving one duty, {midSentence(headline.dutyLabel)}, to someone who holds none of the
            others closes {headline.closes} of them.
          </span>
        </p>
      )}

      {gaps.length === 0 ? (
        <Card>
          <CardContent className="pt-5 text-sm leading-relaxed text-muted">
            No unmitigated conflicts remain in the current setup. That is the right outcome, and it
            is worth re-checking whenever someone joins, leaves, or changes role — these gaps reopen
            through ordinary staffing changes far more often than through any decision to remove a
            control.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {topThree.map(({ conflict, people, ids }) => {
            const pick = caseForRule(conflict.ruleId, industryId);
            const badge = gapBadge(conflict, partialCoverage.get(conflict.ruleId));
            const closes = closingSteps(
              conflict.compensatingControls,
              dualRelease,
              conflict.ruleId,
              conflict.controlsInPlace,
            );
            return (
              <Card key={conflict.ruleId}>
                <CardHeader className="pb-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant={BADGE_VARIANT[badge]}>{badge}</Badge>
                    <span className="text-xs text-subtle">
                      {people.length === 1
                        ? atPlaces(people[0], ids[0])
                        : `${people.length} people: ${people.map((name, i) => atPlaces(name, ids[i])).join(", ")}`}
                    </span>
                    {people.length > 1 && gapPlaces(ids).length > 0 && (
                      <Badge variant="default">At {locationText(gapPlaces(ids))}</Badge>
                    )}
                  </div>
                  <CardTitle as="h3" className="leading-snug">
                    {people.length === 1 ? `${people[0]} can` : "These people each can"} both{" "}
                    {lower(conflict.labelA)} and {lower(conflict.labelB)}
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3 text-sm">
                  <p className="leading-relaxed text-muted">{conflict.why}</p>

                  {(() => {
                    const longServing = people
                      .map((name) => ({ name, years: tenureByName.get(name) ?? 0 }))
                      .filter((p) => p.years >= LONG_SERVICE_YEARS);
                    const { longest, shortest, n } = tenureCases;
                    if (
                      conflict.ruleId !== tenureNoteRuleId ||
                      longServing.length === 0 ||
                      !longest
                    )
                      return null;
                    return (
                      <p className="rounded border border-border bg-elevated/50 p-3 text-sm leading-relaxed text-muted">
                        {longServing.length === 1
                          ? `${longServing[0].name} has ${longServing[0].years} years here.`
                          : `${longServing.map((p) => `${p.name} (${p.years} years)`).join(", ")} have long service here.`}{" "}
                        Length of service is not a control. Of the {n} cases in the library whose
                        source states how long the person had served, the longest,{" "}
                        {longest.tenureYearsStated} years, cost the business{" "}
                        {longest.lossIsFloor ? "at least " : ""}
                        {formatUsd(longest.lossUsd)}
                        {shortest
                          ? `; the shortest began ${
                              shortest.tenureYearsStated === 0
                                ? "within months of hire"
                                : `after ${shortest.tenureYearsStated} years`
                            } and cost ${shortest.lossIsFloor ? "at least " : ""}${formatUsd(shortest.lossUsd)}`
                          : ""}
                        . The people in those cases were trusted for the same reason yours are.
                      </p>
                    );
                  })()}

                  {partialCoverage.has(conflict.ruleId) && (
                    <p className="rounded border border-primary/30 bg-primary/5 p-3 text-sm leading-relaxed text-muted">
                      Your dual-release policy covers this above{" "}
                      {formatUsd(partialCoverage.get(conflict.ruleId) ?? 0)}. Below that, and
                      wherever an exception raises or waives the threshold, one person can still act
                      alone. Treat this as narrowed rather than closed.
                    </p>
                  )}

                  {closes.length > 0 && (
                    <div>
                      <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-subtle">
                        What closes it
                      </p>
                      <ul className="space-y-1">
                        {closes.map((c) => (
                          <li key={c} className="flex gap-2 leading-relaxed text-muted">
                            <span
                              aria-hidden
                              className="mt-1.5 size-1.5 shrink-0 rounded-full bg-accent"
                            />
                            <span>{c}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {pick && (
                    <div>
                      <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-subtle">
                        {!pick.citesRule
                          ? "A related scheme, somewhere real"
                          : pick.ownSector
                            ? "This exact gap, in your line of business"
                            : "This exact gap, somewhere real"}
                      </p>
                      <CaseCard study={pick.study} />
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}

          {narrowed.length > 0 && (
            <div className="rounded-lg border border-primary/30 bg-primary/5 p-4">
              <p className="text-sm font-medium">
                Narrowed by your dual-release policy, not closed
              </p>
              <p className="mt-1 text-sm leading-relaxed text-muted">
                Two people are required above the threshold. Beneath it, and wherever an exception
                raises or waives the threshold, one person can still act alone.
              </p>
              <ul className="mt-3 space-y-2">
                {narrowed.map(({ conflict, people, ids }) => (
                  <li key={conflict.ruleId} className="text-sm">
                    <span className="text-fg">
                      {people.map((name, i) => atPlaces(name, ids[i])).join(", ")} —{" "}
                      {conflict.labelA} with {conflict.labelB}
                    </span>
                    <span className="text-subtle">
                      {" "}
                      · still single-handed below{" "}
                      {formatUsd(partialCoverage.get(conflict.ruleId) ?? 0)}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {gaps.length > topThree.length && onOpenDetail && (
            <button
              type="button"
              onClick={() => onOpenDetail("sod")}
              className="inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline"
            >
              See the other {gaps.length - topThree.length}, and who each one applies to
              <ArrowRight className="size-3.5" aria-hidden />
            </button>
          )}
        </div>
      )}

      {keptApart.length > 0 && (
        <div className="rounded-lg border border-ok/30 bg-ok/5 p-4">
          <p className="text-sm font-medium">Kept apart on your team</p>
          <p className="mt-1 text-sm leading-relaxed text-muted">
            Both duties in each of these pairs are held, by different people, so the pair needs no
            fix:{" "}
            {keptApart
              .slice(0, 6)
              .map((p) => midSentence(p.title))
              .join("; ")}
            {keptApart.length > 6 ? `; and ${keptApart.length - 6} more` : ""}.
          </p>
        </div>
      )}

      {ownerHeld.length > 0 && (
        <div className="rounded-lg border border-border bg-panel/60 p-4">
          <p className="text-sm font-medium">Duties you hold yourself</p>
          <p className="mt-1 text-sm leading-relaxed text-muted">
            These pairs sit with you as the owner. You cannot steal from yourself, so they are not
            theft findings; the exposure is error, tax and lender reliance.{" "}
            {ownerHeld[0].suggestion
              ? `What closes it: ${ownerHeld[0].suggestion.replace(/^An /, "an ")}.`
              : ""}
          </p>
          <ul className="mt-2 space-y-1 text-sm text-muted">
            {ownerHeld.map((o) => (
              <li key={o.ruleId}>
                {o.personName}: {o.pair}
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
