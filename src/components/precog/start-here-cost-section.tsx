import { Clock, Eye, ExternalLink, TrendingDown } from "lucide-react";
import { SectionHeading, StatTile } from "./start-here-parts";
import { DETECTION_PHRASE, joinClauses, ROUTE_CLAUSE } from "./start-here-copy";
import { durationPhrase } from "@/lib/precog/evidence";
import { Card, CardContent } from "@/components/ui/card";
import { formatUsd } from "@/lib/utils";
import type { StartHereModel } from "./use-start-here";

export function StartHereCostSection({ model }: { model: StartHereModel }) {
  const {
    citing,
    evidence,
    lossRange,
    duration,
    found,
    smallOrg,
    medianLoss,
    medianLossValue,
    medianDuration,
    delayCurve,
  } = model;

  return (
    <section className="space-y-3">
      <SectionHeading
        icon={<TrendingDown className="size-4" aria-hidden />}
        title="What these gaps have cost other organizations"
        subtitle={
          citing.count > 0
            ? `Drawn from ${citing.count} prosecuted ${citing.count === 1 ? "case" : "cases"} whose records show the gaps above.`
            : evidence.length > 0
              ? "No prosecuted case in the library shows these exact gaps; the cases below share their schemes."
              : "No matching cases, because no gaps are open."
        }
      />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {lossRange && (
          <StatTile
            label="Median loss in these prosecuted cases"
            value={formatUsd(lossRange.median)}
            detail={`${formatUsd(lossRange.low)} to ${formatUsd(lossRange.high)} across ${lossRange.n} cases`}
          />
        )}
        {duration && (
          <StatTile
            label="How long they ran undetected"
            value={`${Math.round(duration.median)} months`}
            detail={`Longest in this set: ${durationPhrase(duration.longest)}`}
          />
        )}
        {medianLoss && (
          <StatTile
            label={
              smallOrg
                ? "Median loss, organizations under 100 employees"
                : "Median loss, given an investigated fraud"
            }
            value={medianLossValue ?? medianLoss.value}
            detail={medianLoss.study}
            href={medianLoss.source.url}
          />
        )}
        {medianDuration && (
          <StatTile
            label="Median time to detection"
            value={medianDuration.value}
            detail={medianDuration.study}
            href={medianDuration.source.url}
          />
        )}
      </div>

      {lossRange && medianLoss && (
        <p className="rounded border border-border bg-elevated/40 p-3 text-xs leading-relaxed text-subtle">
          <span className="font-medium text-muted">Read these numbers as conditional. </span>
          Neither figure is a forecast for your business. Both describe what happened <em>
            given
          </em>{" "}
          that a fraud occurred and was found: {medianLossValue ?? medianLoss.value} is the median
          across investigated cases
          {smallOrg ? " at organizations under 100 employees" : ""}, and the case range above is
          higher still because federal prosecutors do not charge small thefts. Nothing here
          estimates how likely any of it is to happen to you — that depends on the gaps listed at
          the top of this page, not on a median.
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
                    {DETECTION_PHRASE[r.route] ?? r.route}: {r.count}{" "}
                    {r.count === 1 ? "case" : "cases"}
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
                    Where the source says how the scheme was found, it was{" "}
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
                {delayCurve.study}
                <ExternalLink className="size-3" aria-hidden />
              </a>
            </div>
          </CardContent>
        </Card>
      )}
    </section>
  );
}
