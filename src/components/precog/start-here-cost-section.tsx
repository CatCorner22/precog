import { Clock, Eye, ExternalLink, TrendingDown } from "lucide-react";
import { SectionHeading, StatTile } from "./start-here-parts";
import { caseMedianComparison, joinClauses, ROUTE_CLAUSE } from "./start-here-copy";
import {
  benchmarkCitation,
  CASE_LIBRARY,
  durationPhrase,
  DETECTION_LABEL,
} from "@/lib/precog/evidence";
import { count } from "@/lib/precog/text";
import { Card, CardContent } from "@/components/ui/card";
import { formatUsd } from "@/lib/utils";
import type { StartHereModel } from "@/lib/precog/start-here/model";

export function StartHereCostSection({ model }: { model: StartHereModel["cost"] }) {
  const {
    citing,
    evidenceCount,
    smallOrg,
    medianLoss,
    medianLossValue,
    medianDuration,
    delayCurve,
  } = model;
  const { loss: lossRange, duration, detection: found } = citing;
  const comparison = caseMedianComparison(lossRange?.median, medianLoss?.numeric);

  return (
    <section className="space-y-3">
      <SectionHeading
        icon={<TrendingDown className="size-4" aria-hidden />}
        title="What these gaps have cost other businesses"
        subtitle={
          citing.count > 0
            ? `Drawn from ${citing.count} prosecuted ${citing.count === 1 ? "case" : "cases"} whose records show the gaps above.`
            : evidenceCount > 0
              ? "No prosecuted case in the library shows these exact gaps; the cases below share their schemes."
              : "No matching cases, because no gaps are open."
        }
      />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {lossRange && (
          <StatTile
            label={`Median loss in the ${count(lossRange.n, "prosecuted case")} behind this page`}
            value={formatUsd(lossRange.median)}
            detail={`${formatUsd(lossRange.low)} to ${formatUsd(lossRange.high)}${
              lossRange.n < citing.count
                ? `, across the ${lossRange.n} of ${citing.count} that state a figure`
                : ""
            }`}
          />
        )}
        {duration && (
          <StatTile
            label="How long they ran undetected"
            value={durationPhrase(duration.median)}
            detail={`Longest in this set: ${durationPhrase(duration.longest)}`}
          />
        )}
        {medianLoss && (
          <StatTile
            label={
              smallOrg
                ? "Median loss in the fraud study, organizations under 100 employees"
                : "Median loss in the fraud study, given an investigated fraud"
            }
            value={medianLossValue ?? medianLoss.value}
            detail={benchmarkCitation(medianLoss)}
            href={medianLoss.source.url}
            caveat={medianLoss.caveat}
          />
        )}
        {medianDuration && (
          <StatTile
            label="Median time to detection"
            value={medianDuration.value}
            detail={benchmarkCitation(medianDuration)}
            href={medianDuration.source.url}
          />
        )}
      </div>

      {lossRange && medianLoss && (
        <p className="rounded border border-border bg-elevated/40 p-3 text-xs leading-relaxed text-subtle">
          <span className="font-medium text-muted">Read these numbers as conditional. </span>
          Neither figure predicts your business. Both describe what happened once a fraud occurred
          and came to light. {medianLossValue ?? medianLoss.value} is the median across investigated
          cases{smallOrg ? " at organizations under 100 employees" : ""}.{" "}
          {comparison === "higher" &&
            `The case median above sits higher: a U.S. Attorney's Office prosecuted every case in this library, and the smallest loss in it is ${formatUsd(SMALLEST_CASE_LOSS)}. `}
          {comparison === "lower" &&
            `The case median above sits lower; it rests on ${count(lossRange.n, "case")}. `}
          Nothing here says how likely any of it is for you; that depends on the gaps listed at the
          top of this page.
        </p>
      )}

      {found.n > 0 && (
        <Card>
          <CardContent className="flex gap-3 pt-5">
            <Eye className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
            <div className="space-y-2">
              <p className="text-sm font-medium">How these cases came to light</p>
              <ul className="space-y-1 text-sm text-muted">
                {found.byRoute.map((r) => (
                  <li key={r.route}>
                    {DETECTION_LABEL[r.route]}: {r.count} {r.count === 1 ? "case" : "cases"}
                  </li>
                ))}
                <li className="text-subtle">
                  Not stated in the source: {found.unknown} of {found.n}
                </li>
              </ul>
              {found.known > 0 &&
                !found.byRoute.some((r) =>
                  ["reconciliation", "external-audit", "tip"].includes(r.route),
                ) && (
                  <p className="text-sm leading-relaxed text-muted">
                    Where the source says how the scheme came to light, it was{" "}
                    {joinClauses(found.byRoute.map((r) => ROUTE_CLAUSE[r.route] ?? r.route))}{" "}
                    &mdash; never a reconciliation, an audit, or a report from staff. That is what
                    the controls below change: they put someone in the position to look before the
                    business runs out of money.
                  </p>
                )}
            </div>
          </CardContent>
        </Card>
      )}

      {delayCurve && (
        <Card>
          <CardContent className="flex gap-3 pt-5">
            <Clock className="mt-0.5 size-4 shrink-0 text-warn" aria-hidden />
            <div className="space-y-1">
              <p className="text-sm font-medium">{delayCurve.value}</p>
              <p className="text-sm leading-relaxed text-muted">{delayCurve.soWhat}</p>
              <a
                href={delayCurve.source.url}
                target="_blank"
                rel="noreferrer noopener"
                className="inline-flex items-center gap-1.5 text-xs font-medium text-primary hover:underline"
              >
                {benchmarkCitation(delayCurve)}
                <ExternalLink className="size-3" aria-hidden />
              </a>
            </div>
          </CardContent>
        </Card>
      )}
    </section>
  );
}

/** The smallest stated loss in the case library, quoted when the case median sits above the study's. */
const SMALLEST_CASE_LOSS = Math.min(
  ...CASE_LIBRARY.filter((c) => c.lossUsd > 0).map((c) => c.lossUsd),
);
