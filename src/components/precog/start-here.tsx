import { useMemo } from "react";
import { ArrowRight, Clock, ExternalLink, ShieldAlert, TrendingDown } from "lucide-react";
import { usePractice } from "@/lib/precog/practice-context";
import { detectSodConflicts } from "@/lib/precog/sod/detect";
import { mitigatedSodRuleIds } from "@/lib/precog/controls/dual-release";
import { findKnowledgeRisks } from "@/lib/precog/engine";
import {
  BENCHMARK_BY_ID,
  METHOD_CAVEATS,
  casesForSodRules,
  observedDurationMonths,
  observedLossRange,
  recommendedStepsForRules,
  type CaseStudy,
} from "@/lib/precog/evidence";
import { CaseCard } from "./case-card";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatUsd } from "@/lib/utils";

/**
 * The first screen an owner sees.
 *
 * It answers three questions in order, in plain words, and nothing else:
 *
 *   1. Where is this business exposed right now?
 *   2. What has that exposure actually cost organizations like it?
 *   3. What should be done first?
 *
 * Every claim on this screen resolves to a prosecuted case or a published
 * study. Where the application cannot support a claim, it says so rather than
 * filling the space.
 */
export function StartHere({ onOpenDetail }: { onOpenDetail?: (tab: string) => void }) {
  const { profile } = usePractice();

  const sod = useMemo(
    () =>
      detectSodConflicts(profile.staff, {
        dualReleaseMitigatedRuleIds: mitigatedSodRuleIds(profile.dualRelease),
      }),
    [profile.staff, profile.dualRelease],
  );

  /** Live gaps only: anything already mitigated or consciously accepted is out. */
  const openConflicts = useMemo(
    () =>
      sod.conflicts
        .filter((c) => !c.dualReleaseMitigated && !c.residualRiskAccepted)
        .sort((a, b) => b.score - a.score),
    [sod.conflicts],
  );

  /**
   * Group by the gap, not by the person.
   *
   * The detector reports one conflict per person per rule, so a practice where
   * two people can both approve their own write-offs produces two identical
   * findings. Listing them separately triples the apparent workload and buries
   * the point: the fix is one change to how that duty is assigned, not one
   * conversation per employee. Grouping also keeps the screen honest — the
   * owner sees how many distinct decisions they face, which is the number that
   * determines whether they act at all.
   */
  const gaps = useMemo(() => {
    const byRule = new Map<string, { people: string[]; conflict: (typeof openConflicts)[number] }>();
    for (const c of openConflicts) {
      const existing = byRule.get(c.ruleId);
      if (existing) {
        if (!existing.people.includes(c.personName)) existing.people.push(c.personName);
      } else {
        byRule.set(c.ruleId, { people: [c.personName], conflict: c });
      }
    }
    return [...byRule.values()].sort((a, b) => b.conflict.score - a.conflict.score);
  }, [openConflicts]);

  const topThree = gaps.slice(0, 3);
  const openRuleIds = useMemo(() => gaps.map((g) => g.conflict.ruleId), [gaps]);

  const evidence = useMemo(() => casesForSodRules(openRuleIds), [openRuleIds]);
  const lossRange = useMemo(() => observedLossRange(evidence), [evidence]);
  const duration = useMemo(() => observedDurationMonths(evidence), [evidence]);
  const steps = useMemo(() => recommendedStepsForRules(openRuleIds), [openRuleIds]);

  const soleKnowledge = useMemo(
    () => findKnowledgeRisks().filter((r) => r.soleOwner),
    [],
  );

  const medianLoss = BENCHMARK_BY_ID["bm-median-loss"];
  const medianDuration = BENCHMARK_BY_ID["bm-median-duration"];
  const delayCurve = BENCHMARK_BY_ID["bm-duration-cost-curve"];
  const tips = BENCHMARK_BY_ID["bm-tips"];

  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">Start here</h1>
        <p className="max-w-2xl text-sm leading-relaxed text-muted">
          This page shows where your business is exposed, what that same exposure has
          cost real organizations, and what to do about it first. Every figure links to
          the case or study it came from.
        </p>
      </header>

      {/* 1. Where you are exposed. */}
      <section className="space-y-3">
        <SectionHeading
          icon={<ShieldAlert className="size-4" aria-hidden />}
          title="Where one person controls too much"
          subtitle={
            gaps.length === 0
              ? "Nothing open right now."
              : `${gaps.length} distinct ${gaps.length === 1 ? "gap" : "gaps"} across ${openConflicts.length} ${openConflicts.length === 1 ? "finding" : "findings"}, worst first.`
          }
        />

        {gaps.length === 0 ? (
          <Card>
            <CardContent className="pt-5 text-sm leading-relaxed text-muted">
              No unmitigated conflicts remain in the current setup. That is the right
              outcome, and it is worth re-checking whenever someone joins, leaves, or
              changes role — these gaps reopen through ordinary staffing changes far
              more often than through any decision to remove a control.
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {topThree.map(({ conflict, people }) => {
              const worst = casesForSodRules([conflict.ruleId])[0];
              return (
                <Card key={conflict.ruleId}>
                  <CardHeader className="pb-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge
                        variant={
                          conflict.severity === "critical"
                            ? "danger"
                            : conflict.severity === "high"
                              ? "warn"
                              : "default"
                        }
                      >
                        {conflict.severity === "critical"
                          ? "Fix first"
                          : conflict.severity === "high"
                            ? "Fix soon"
                            : "Worth doing"}
                      </Badge>
                      <span className="text-xs text-subtle">
                        {people.length === 1
                          ? people[0]
                          : `${people.length} people: ${people.join(", ")}`}
                      </span>
                    </div>
                    <CardTitle className="leading-snug">
                      {people.length === 1 ? `${people[0]} can` : "These people each can"}{" "}
                      both {lower(conflict.labelA)} and {lower(conflict.labelB)}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3 text-sm">
                    <p className="leading-relaxed text-muted">{conflict.why}</p>

                    {conflict.compensatingControls.length > 0 && (
                      <div>
                        <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-subtle">
                          What closes it
                        </p>
                        <ul className="space-y-1">
                          {conflict.compensatingControls.map((c) => (
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

                    {worst && (
                      <div>
                        <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-subtle">
                          This exact gap, somewhere real
                        </p>
                        <CaseCard study={worst} />
                      </div>
                    )}
                  </CardContent>
                </Card>
              );
            })}

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
      </section>

      {/* 2. What it has cost. */}
      <section className="space-y-3">
        <SectionHeading
          icon={<TrendingDown className="size-4" aria-hidden />}
          title="What these gaps have cost other organizations"
          subtitle={
            evidence.length > 0
              ? `Drawn from ${evidence.length} prosecuted cases matching your open gaps.`
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
              detail={`Longest in this set: ${Math.round(duration.longest / 12)} years`}
            />
          )}
          {medianLoss && (
            <StatTile
              label="Median loss, all cases studied"
              value={medianLoss.value}
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
            <span className="font-medium text-muted">Read these two numbers together. </span>
            The case figures above come from federal prosecutions, and federal
            prosecutors do not charge small thefts. That selection pushes the case
            median far above what a business should actually expect. Treat{" "}
            {medianLoss.value} — the median across every case in the study, charged or
            not — as the realistic figure, and the case range as what the same gap can
            reach when nobody is watching for years.
          </p>
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

      {/* 3. What to do first. */}
      <section className="space-y-3">
        <SectionHeading
          icon={<ArrowRight className="size-4" aria-hidden />}
          title="Do these first"
          subtitle="Ordered by how many of the real cases above each one would have stopped."
        />

        <Card>
          <CardContent className="pt-5">
            {steps.length === 0 ? (
              <p className="text-sm leading-relaxed text-muted">
                Nothing outstanding from the duty-conflict findings. The two items below
                still apply to every business regardless.
              </p>
            ) : (
              <ol className="space-y-3">
                {steps.slice(0, 6).map((s, i) => (
                  <li key={s.step} className="flex gap-3">
                    <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-elevated font-mono text-[11px] text-muted">
                      {i + 1}
                    </span>
                    <div className="min-w-0">
                      <p className="text-sm leading-relaxed">{s.step}</p>
                      <p className="mt-0.5 text-xs text-subtle">
                        Would have addressed {s.supportingCaseIds.length}{" "}
                        {s.supportingCaseIds.length === 1 ? "case" : "cases"} above
                      </p>
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
                Give your staff a way to raise a concern that does not run through the
                person they are worried about.
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
                {soleKnowledge.length}{" "}
                {soleKnowledge.length === 1 ? "task depends" : "tasks depend"} on exactly
                one person.
              </p>
              <p className="text-sm leading-relaxed text-muted">
                This is a continuity problem and an oversight problem at the same time.
                Nobody can review work they do not understand, so sole knowledge quietly
                removes the second pair of eyes as well.
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

      {/* 4. Limits, stated up front rather than buried. */}
      <section className="space-y-3">
        <SectionHeading title="What this cannot tell you" />
        <Card>
          <CardContent className="pt-5">
            <ul className="space-y-2">
              {METHOD_CAVEATS.map((c) => (
                <li key={c} className="flex gap-2 text-sm leading-relaxed text-muted">
                  <span
                    aria-hidden
                    className="mt-1.5 size-1.5 shrink-0 rounded-full bg-subtle"
                  />
                  <span>{c}</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      </section>

      <EvidenceFooter cases={evidence} />
    </div>
  );
}

function EvidenceFooter({ cases }: { cases: CaseStudy[] }) {
  if (cases.length === 0) return null;
  return (
    <section className="space-y-3">
      <SectionHeading
        title="Every case behind this page"
        subtitle="Open any one to read what happened and confirm it at the source."
      />
      <div className="space-y-2">
        {cases.map((c) => (
          <CaseCard key={c.id} study={c} />
        ))}
      </div>
    </section>
  );
}

function SectionHeading({
  icon,
  title,
  subtitle,
}: {
  icon?: React.ReactNode;
  title: string;
  subtitle?: string;
}) {
  return (
    <div className="space-y-0.5">
      <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-muted">
        {icon}
        {title}
      </h2>
      {subtitle && <p className="text-xs text-subtle">{subtitle}</p>}
    </div>
  );
}

function StatTile({
  label,
  value,
  detail,
  href,
}: {
  label: string;
  value: string;
  detail?: string;
  href?: string;
}) {
  return (
    <div className="rounded-lg border border-border bg-panel/60 p-4">
      <p className="text-xs text-subtle">{label}</p>
      <p className="mt-1 font-mono text-lg font-semibold tracking-tight">{value}</p>
      {detail &&
        (href ? (
          <a
            href={href}
            target="_blank"
            rel="noreferrer noopener"
            className="mt-1 inline-flex items-center gap-1 text-xs text-primary hover:underline"
          >
            {detail}
            <ExternalLink className="size-2.5" aria-hidden />
          </a>
        ) : (
          <p className="mt-1 text-xs text-subtle">{detail}</p>
        ))}
    </div>
  );
}

/** Lower-cases an entitlement label for mid-sentence use, keeping acronyms. */
function lower(label: string): string {
  return label.replace(/^([A-Z])(?=[a-z])/, (m) => m.toLowerCase());
}
