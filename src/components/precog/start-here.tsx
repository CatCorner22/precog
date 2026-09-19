import { useMemo } from "react";
import { ArrowRight, Clock, ExternalLink, ShieldAlert, TrendingDown } from "lucide-react";
import { usePractice } from "@/lib/precog/practice-context";
import { industryMeta } from "@/lib/precog/industry";
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
  sectorForIndustry,
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
  /**
   * Whether the findings describe this business or the loaded sample.
   *
   * The conflict detector works from the named people in the active
   * template. Staff settings such as team size feed the scoring but cannot
   * generate an assignment table — you cannot derive who does what from a
   * headcount — so until someone edits the team, these are the sample's
   * people and saying otherwise would misrepresent them.
   */
  const isSampleTeam = !profile.customPeople;
  const sector = sectorForIndustry(profile.industry);

  const sod = useMemo(
    () =>
      detectSodConflicts(profile.staff, {
        dualReleaseMitigatedRuleIds: mitigatedSodRuleIds(profile.dualRelease),
      }),
    [profile.staff, profile.dualRelease],
  );

  /**
   * Gaps still open.
   *
   * A dual-release policy is treated as reducing a gap, not closing it. Its
   * rules carry a threshold, so a policy requiring two people above $500 still
   * leaves one person able to act alone below it, and exceptions can raise or
   * waive the threshold entirely. Filtering those conflicts out would let this
   * page report a gap as closed while the same person can still move smaller
   * amounts unaccompanied. They stay, ranked below the unmitigated ones, with
   * the remaining exposure named.
   *
   * A gap the owner has explicitly accepted is a decision they already made,
   * so it does not reappear here as a finding.
   */
  const openConflicts = useMemo(
    () =>
      sod.conflicts
        .filter((c) => !c.residualRiskAccepted)
        .sort(
          (a, b) =>
            Number(a.dualReleaseMitigated) - Number(b.dualReleaseMitigated) || b.score - a.score,
        ),
    [sod.conflicts],
  );

  /**
   * Which segregation-of-duties rules the dual-release policy only narrows.
   *
   * A policy rule with `thresholdUsd: 0` requires two people at every amount
   * and genuinely closes what it covers. A rule with a threshold leaves a band
   * beneath it where one person still acts alone. A duty conflict is therefore
   * fully covered only when every policy rule addressing it has no threshold;
   * otherwise a residual band remains, and the lowest such threshold is where
   * it starts.
   */
  const partialCoverage = useMemo(() => {
    const byRuleId = new Map<string, number[]>();
    if (profile.dualRelease.enabled) {
      for (const r of profile.dualRelease.rules) {
        if (!r.enabled) continue;
        for (const id of r.mitigatesRuleIds) {
          const list = byRuleId.get(id) ?? [];
          list.push(r.thresholdUsd);
          byRuleId.set(id, list);
        }
      }
    }
    const partial = new Map<string, number>();
    for (const [ruleId, thresholds] of byRuleId) {
      const gapThresholds = thresholds.filter((t) => t > 0);
      // Covered at every amount by at least one rule → nothing left beneath.
      if (gapThresholds.length === thresholds.length && gapThresholds.length > 0) {
        partial.set(ruleId, Math.min(...gapThresholds));
      }
    }
    return partial;
  }, [profile.dualRelease]);

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
    const byRule = new Map<
      string,
      { people: string[]; conflict: (typeof openConflicts)[number] }
    >();
    for (const c of openConflicts) {
      const existing = byRule.get(c.ruleId);
      if (existing) {
        if (!existing.people.includes(c.personName)) existing.people.push(c.personName);
        // Keep the worst representative: an unmitigated instance outranks a
        // mitigated one, so a gap is never shown as softer than it is.
        if (existing.conflict.dualReleaseMitigated && !c.dualReleaseMitigated) {
          existing.conflict = c;
        }
      } else {
        byRule.set(c.ruleId, { people: [c.personName], conflict: c });
      }
    }
    return [...byRule.values()].sort((a, b) => b.conflict.score - a.conflict.score);
  }, [openConflicts]);

  const topThree = gaps.slice(0, 3);
  /**
   * Gaps a dual-release policy narrows but does not close.
   *
   * They sort below the unmitigated ones and so rarely reach the top three,
   * which would leave the residual band invisible on this page — the exact
   * overstatement of safety that dropping them entirely used to cause. They
   * get their own short section instead, outside the main ranking, so an owner
   * sees what the policy still leaves open without having to go looking.
   */
  const narrowed = useMemo(
    () =>
      gaps.filter(
        (g) =>
          partialCoverage.has(g.conflict.ruleId) &&
          !topThree.some((t) => t.conflict.ruleId === g.conflict.ruleId),
      ),
    [gaps, partialCoverage, topThree],
  );
  const narrowedCount = gaps.filter((g) => partialCoverage.has(g.conflict.ruleId)).length;
  const openRuleIds = useMemo(() => gaps.map((g) => g.conflict.ruleId), [gaps]);

  const evidence = useMemo(() => casesForSodRules(openRuleIds), [openRuleIds]);
  const lossRange = useMemo(() => observedLossRange(evidence), [evidence]);
  const duration = useMemo(() => observedDurationMonths(evidence), [evidence]);
  const steps = useMemo(() => recommendedStepsForRules(openRuleIds), [openRuleIds]);

  const soleKnowledge = useMemo(() => findKnowledgeRisks().filter((r) => r.soleOwner), []);

  const medianLoss = BENCHMARK_BY_ID["bm-median-loss"];
  const medianDuration = BENCHMARK_BY_ID["bm-median-duration"];
  const delayCurve = BENCHMARK_BY_ID["bm-duration-cost-curve"];
  const tips = BENCHMARK_BY_ID["bm-tips"];

  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">Start here</h1>
        <p className="max-w-2xl text-sm leading-relaxed text-muted">
          This page shows where a business like yours is exposed, what that same exposure has cost
          real organizations, and what to do about it first. Every figure links to the case or study
          it came from.
        </p>
      </header>

      {isSampleTeam && (
        <div className="rounded-lg border border-warn/40 bg-warn/5 p-4">
          <p className="text-sm font-medium text-warn">
            These findings describe the sample team, not yours yet.
          </p>
          <p className="mt-1 text-sm leading-relaxed text-muted">
            The names and duty assignments below come from the loaded{" "}
            {industryMeta(profile.industry).label.toLowerCase()} example. Staff settings such as
            team size affect the scoring but cannot say who does what, so the conflicts shown are
            the example&rsquo;s until you enter your own people and their duties.
          </p>
          {onOpenDetail && (
            <button
              type="button"
              onClick={() => onOpenDetail("map")}
              className="mt-2 inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline"
            >
              Enter your own team
              <ArrowRight className="size-3.5" aria-hidden />
            </button>
          )}
        </div>
      )}

      {/* 1. Where you are exposed. */}
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
                  : "")
          }
        />

        {gaps.length === 0 ? (
          <Card>
            <CardContent className="pt-5 text-sm leading-relaxed text-muted">
              No unmitigated conflicts remain in the current setup. That is the right outcome, and
              it is worth re-checking whenever someone joins, leaves, or changes role — these gaps
              reopen through ordinary staffing changes far more often than through any decision to
              remove a control.
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
                          partialCoverage.has(conflict.ruleId)
                            ? "primary"
                            : conflict.severity === "critical"
                              ? "danger"
                              : conflict.severity === "high"
                                ? "warn"
                                : "default"
                        }
                      >
                        {partialCoverage.has(conflict.ruleId)
                          ? "Reduced, not closed"
                          : conflict.severity === "critical"
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
                      {people.length === 1 ? `${people[0]} can` : "These people each can"} both{" "}
                      {lower(conflict.labelA)} and {lower(conflict.labelB)}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3 text-sm">
                    <p className="leading-relaxed text-muted">{conflict.why}</p>

                    {partialCoverage.has(conflict.ruleId) && (
                      <p className="rounded border border-primary/30 bg-primary/5 p-3 text-sm leading-relaxed text-muted">
                        Your dual-release policy covers this above{" "}
                        {formatUsd(partialCoverage.get(conflict.ruleId) ?? 0)}. Below that, and
                        wherever an exception raises or waives the threshold, one person can still
                        act alone. Treat this as narrowed rather than closed.
                      </p>
                    )}

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
                  {narrowed.map(({ conflict, people }) => (
                    <li key={conflict.ruleId} className="text-sm">
                      <span className="text-fg">
                        {people.join(", ")} — {conflict.labelA} with {conflict.labelB}
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
      </section>

      {/* 2. What it has cost. */}
      <section className="space-y-3">
        <SectionHeading
          icon={<TrendingDown className="size-4" aria-hidden />}
          title="What these gaps have cost other organizations"
          subtitle={
            evidence.length > 0
              ? `Drawn from ${evidence.length} prosecuted cases matching the gaps above.`
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
              label="Median loss, given an investigated fraud"
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
            <span className="font-medium text-muted">Read these numbers as conditional. </span>
            Neither figure is a forecast for your business. Both describe what happened{" "}
            <em>given</em> that a fraud occurred and was found: {medianLoss.value} is the median
            across investigated cases, and the case range above is higher still because federal
            prosecutors do not charge small thefts. Nothing here estimates how likely any of it is
            to happen to you — that depends on the gaps listed at the top of this page, not on a
            median.
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
          subtitle="Ordered by how many of the real cases above each one would plausibly have caught. Most of these are detective controls: they shorten how long a scheme runs, which is where the loss is decided."
        />

        <Card>
          <CardContent className="pt-5">
            {steps.length === 0 ? (
              <p className="text-sm leading-relaxed text-muted">
                Nothing outstanding from the duty-conflict findings. The two items below still apply
                to every business regardless.
              </p>
            ) : (
              <ol className="space-y-3">
                {steps.slice(0, 6).map((s, i) => (
                  <li key={s.control.id} className="flex gap-3">
                    <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-elevated font-mono text-[11px] text-muted">
                      {i + 1}
                    </span>
                    <div className="min-w-0">
                      <p className="text-sm leading-relaxed">{s.control.label}</p>
                      <p className="mt-0.5 text-sm leading-relaxed text-muted">{s.control.why}</p>
                      <p className="mt-1 text-xs text-subtle">
                        Takes {s.control.effort} · would plausibly have caught{" "}
                        {s.supportingCaseIds.length}{" "}
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
                Give your staff a way to raise a concern that does not run through the person they
                are worried about.
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
                {soleKnowledge.length === 1 ? "task depends" : "tasks depend"} on exactly one
                person.
              </p>
              <p className="text-sm leading-relaxed text-muted">
                This is a continuity problem and an oversight problem at the same time. Nobody can
                review work they do not understand, so sole knowledge quietly removes the second
                pair of eyes as well.
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
                  <span aria-hidden className="mt-1.5 size-1.5 shrink-0 rounded-full bg-subtle" />
                  <span>{c}</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      </section>

      <EvidenceFooter cases={evidence} sector={sector} />
    </div>
  );
}

function EvidenceFooter({ cases, sector }: { cases: CaseStudy[]; sector: string }) {
  if (cases.length === 0) return null;
  // Cases from the reader's own trade lead, because they land harder. The rest
  // stay, because the mechanism of a scheme does not change between industries
  // and the mechanism is the part worth learning.
  const ordered = [
    ...cases.filter((c) => c.sector === sector),
    ...cases.filter((c) => c.sector !== sector),
  ];
  return (
    <section className="space-y-3">
      <SectionHeading
        title="Every case behind this page"
        subtitle="Open any one to read what happened and confirm it at the source."
      />
      <div className="space-y-2">
        {ordered.map((c) => (
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
