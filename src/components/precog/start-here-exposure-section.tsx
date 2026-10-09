import { ArrowRight, ShieldAlert } from "lucide-react";
import { SectionHeading } from "./start-here-parts";
import { BADGE_VARIANT } from "./start-here-copy";
import { caseForRule, lossPhrase, NO_CASE_FOR_RULE } from "@/lib/precog/evidence";
import { gapBadge } from "@/lib/precog/coach/first-steps";
import { closingSteps } from "@/lib/precog/controls/dual-release-wording";
import { personLabel } from "@/lib/precog/person-label";
import { CaseCard } from "./case-card";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatUsd } from "@/lib/utils";
import type { StartHereModel, TenureNoteModel } from "@/lib/precog/start-here/model";
import type { NavFn } from "@/lib/precog/navigation";
import { count, joinWithAnd, midSentence, verb } from "@/lib/precog/text";
import { industryNoun } from "@/lib/precog/industry";
import { useTabName } from "@/lib/precog/presentation";

export function StartHereExposureSection({
  model,
  onOpenDetail,
}: {
  model: StartHereModel["exposure"];
  onOpenDetail: NavFn;
}) {
  const tabName = useTabName();
  const {
    industryId,
    counts,
    gaps,
    topThree,
    narrowed,
    partialCoverage,
    headline,
    keptApart,
    ownerHeld,
    titleDuties,
    unheld,
    placesOf,
    atPlaces,
    gapPlaces,
    tenureNote,
    dualRelease,
  } = model;

  return (
    <section className="space-y-3">
      <SectionHeading
        icon={<ShieldAlert className="size-4" aria-hidden />}
        title="Where one person controls too much"
        subtitle={exposureSubtitle(counts, gaps.length)}
      />

      {titleDuties && (
        <p className="rounded-md border border-warn/30 bg-warn/5 px-3 py-2 text-sm leading-relaxed text-muted">
          {titleDuties}{" "}
          <button
            type="button"
            onClick={() => onOpenDetail("sod")}
            className="font-medium text-primary underline underline-offset-2 hover:text-fg"
          >
            Confirm them in {tabName("sod")}.
          </button>
        </p>
      )}

      {unheld.length > 0 && (
        <p className="rounded-md border border-warn/30 bg-warn/5 px-3 py-2 text-sm leading-relaxed text-muted">
          You have marked nobody still working here for: {unheld.join(", ")}. Somebody does{" "}
          {verb(unheld.length, "this", "each of these")} in every {industryNoun(industryId)} that
          handles money, so mark who on {tabName("sod")}; until then this check cannot cover{" "}
          {verb(unheld.length, "that duty", "those duties")}.
        </p>
      )}

      {headline && (
        <p className="rounded-md border border-danger/30 bg-danger/5 px-3 py-2 text-sm leading-relaxed">
          <span className="font-medium">
            {personLabel(headline.personName, headline.role)}
            {placesOf.has(headline.personId)
              ? `, at ${joinWithAnd(placesOf.get(headline.personId) ?? [])},`
              : ""}{" "}
            holds {headline.gaps} of the {headline.totalGaps} open duty conflicts.
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
            No unmitigated conflicts remain in this setup. That is the right outcome. Recheck when
            someone joins, leaves, or changes roles. Ordinary staffing changes reopen gaps far more
            often than decisions to remove a control.
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
                      <Badge variant="default">At {joinWithAnd(gapPlaces(ids))}</Badge>
                    )}
                  </div>
                  <CardTitle as="h3" className="leading-snug">
                    {people.length === 1 ? `${people[0]} can` : "These people each can"} both{" "}
                    {midSentence(conflict.labelA)} and {midSentence(conflict.labelB)}
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3 text-sm">
                  <p className="leading-relaxed text-muted">{conflict.why}</p>

                  {conflict.ruleId === tenureNote?.ruleId && <TenureNote note={tenureNote} />}

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

                  {pick?.citesRule ? (
                    <div>
                      <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-subtle">
                        {pick.ownSector
                          ? "This exact gap, in your line of business"
                          : "This exact gap, somewhere real"}
                      </p>
                      <CaseCard study={pick.study} />
                    </div>
                  ) : (
                    <p className="text-xs text-subtle">{NO_CASE_FOR_RULE}</p>
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
                Your policy requires two people above the threshold. Beneath it, and wherever an
                exception raises or waives the threshold, one person can still act alone.
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

          {gaps.length > topThree.length && (
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
            Different people hold the two duties in each of these pairs, so the pair needs no fix:{" "}
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
            These pairs are yours as the owner. You cannot steal from yourself, so they are not
            theft findings. The exposure is error, tax, and lender reliance.{" "}
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

/**
 * The section's count, in open duty conflicts as every screen counts them
 * (headline/open-conflicts): the narrowed ones are part of it, and the pairs
 * dual release covers at every amount are named apart, never counted in it.
 */
function exposureSubtitle(counts: StartHereModel["exposure"]["counts"], pairs: number): string {
  if (pairs === 0) return "Nothing open right now.";
  const { open, reducedNotClosed: reduced, closedByDualRelease: closed } = counts;
  const covered =
    closed > 0
      ? `Dual release covers ${count(closed, "more duty conflict")} at every amount, so ${verb(closed, "it is", "they are")} not counted.`
      : "";
  if (open === 0) return `No open duty conflicts. ${covered}`.trim();
  return [
    `${count(open, "open duty conflict")}, grouped by pair of duties, worst first.`,
    reduced > 0 ? `${reduced} of them your dual-release policy narrows rather than closes.` : "",
    covered,
  ]
    .filter(Boolean)
    .join(" ");
}

/**
 * Why long service is no reassurance, beside the first top gap a long-serving
 * person holds: the longest- and shortest-serving people in the library's
 * cases whose source states tenure.
 */
function TenureNote({ note }: { note: TenureNoteModel }) {
  const { longServing } = note;
  const { longest, shortest, n } = note.cases;
  if (!longest) return null;
  return (
    <p className="rounded border border-border bg-elevated/50 p-3 text-sm leading-relaxed text-muted">
      {longServing.length === 1
        ? `${longServing[0].name} has ${longServing[0].years} years here.`
        : `${longServing.map((p) => `${p.name} (${p.years} years)`).join(", ")} have long service here.`}{" "}
      Length of service is not a control. The library has {n} cases with stated tenure. The
      longest-serving person had {longest.tenureYearsStated} years of service. That case cost the
      business {lossPhrase(longest)}.
      {shortest
        ? ` The shortest-serving started ${
            shortest.tenureYearsStated === 0
              ? "within months of hire"
              : `after ${shortest.tenureYearsStated} years`
          }. That case cost ${lossPhrase(shortest)}.`
        : ""}{" "}
      Their employers trusted them for the same reason you trust your team.
    </p>
  );
}
