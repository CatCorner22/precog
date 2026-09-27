import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowLeft, ListOrdered, ListChecks, Target } from "lucide-react";
import { buildThreatAssessment } from "@/lib/precog/threat-scoring";
import { usePractice } from "@/lib/precog/practice-context";
import { isSampleBusiness, printedBusinessName } from "@/lib/precog/business-lifecycle";
import { PRIORITY_BAND_LABEL } from "@/lib/precog/map-vision";
import { industryNoun } from "@/lib/precog/industry";
import { cn, formatUsd } from "@/lib/utils";
import { confirmedScenarioIds, isOwnBusiness } from "@/lib/precog/scoring/scope";
import { insuranceFigureNote } from "@/lib/precog/scoring/dynamic-variables";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { IndexBasis } from "@/components/precog/index-basis";
import { FigureTile } from "./figure-tile";
import {
  BAND_VARIANT,
  DOMAIN_LABEL,
  LEADING_BAND_LABEL,
  isUrgent,
  overallBand,
} from "./threat-bands";

/**
 * The priority list: every exposure the app ranks, most urgent first, with
 * why each one ranks where it does and what to do first. One band scale
 * (priorityBand) labels the overall index and every item.
 */
export function ThreatAssessmentPanel() {
  const { profile, template } = usePractice();
  // The sample's figures are labelled as the sample's, under its own name
  // until a business is set up.
  const sample = isSampleBusiness(profile);
  const businessName = printedBusinessName(profile);
  const teamLabel = industryNoun(profile.industry);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const report = useMemo(
    () =>
      buildThreatAssessment({
        tpl: template,
        practiceName: businessName,
        staff: profile.staff,
        riskVariables: profile.riskVariables,
        dualRelease: profile.dualRelease,
        confirmedScenarioIds: confirmedScenarioIds(profile.decisions, profile.industry),
      }),
    [
      template,
      businessName,
      profile.staff,
      profile.riskVariables,
      profile.dualRelease,
      profile.decisions,
      profile.industry,
    ],
  );

  const selected =
    report.targetDeck.find((t) => t.id === selectedId) ?? report.targetDeck[0] ?? null;
  const urgent = report.targetDeck.filter((t) => isUrgent(t.band)).length;
  const overall = overallBand(report.overallThreatIndex);
  const scenarioNote = insuranceFigureNote(profile.riskVariables, isOwnBusiness(template));

  return (
    <div className="min-h-[calc(100dvh-var(--grok-banner-h,0px))] bg-bg text-fg">
      <header className="border-b border-border bg-surface">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <div className="flex items-center gap-3">
            <Link
              to="/"
              className="inline-flex items-center gap-1.5 rounded-md border border-border bg-elevated px-2.5 py-1 text-xs text-muted hover:border-border-strong hover:text-fg"
            >
              <ArrowLeft className="size-3" />
              Back to Dashboard
            </Link>
            <div>
              <h1 className="text-base font-semibold">Priority list</h1>
              <p className="text-xs text-muted">
                {report.ao} · what to fix first in your {teamLabel}
              </p>
            </div>
          </div>
          <Badge variant={BAND_VARIANT[overall]}>
            Priority index {report.overallThreatIndex} · {PRIORITY_BAND_LABEL[overall]}
          </Badge>
        </div>
        {sample && (
          <p
            className="mx-auto max-w-7xl px-4 pb-2 text-xs font-medium text-warn sm:px-6"
            role="note"
          >
            Sample business: sample people and figures, not your business.{" "}
            <Link to="/" className="underline underline-offset-2">
              Set up your own
            </Link>
          </p>
        )}
        <IndexBasis className="mx-auto max-w-7xl px-4 pb-2 sm:px-6" />
      </header>

      <main className="mx-auto max-w-7xl space-y-4 px-4 py-5 sm:px-6">
        <section className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          <FigureTile
            size="lg"
            label="Priority index"
            value={String(report.overallThreatIndex)}
            hint={`${PRIORITY_BAND_LABEL[overall]}: the average of the five highest items`}
          />
          <FigureTile
            size="lg"
            label="Early-warning pressure"
            value={String(report.leadingPressure)}
            hint={LEADING_BAND_LABEL[report.leadingBand] ?? report.leadingBand}
          />
          <FigureTile
            size="lg"
            label="White hot or critical"
            value={String(urgent)}
            hint="Look at these first"
          />
          <FigureTile
            size="lg"
            label="Items ranked"
            value={String(report.targetDeck.length)}
            hint="Control gaps, residual risks and know-how one person holds"
          />
        </section>

        <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)]">
          <Card className="min-w-0">
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-base">
                <ListOrdered className="size-4 text-primary" />
                Most urgent first
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ol className="space-y-1.5" aria-label="Priority list">
                {report.targetDeck.map((t, i) => (
                  <li key={t.id}>
                    <button
                      type="button"
                      aria-pressed={selected?.id === t.id}
                      onClick={() => setSelectedId(t.id)}
                      className={cn(
                        "flex w-full items-start gap-3 rounded-lg border px-3 py-2.5 text-left transition-colors",
                        selected?.id === t.id
                          ? "border-primary/50 bg-primary/10"
                          : "border-border bg-elevated hover:border-border-strong",
                      )}
                    >
                      <span className="w-5 shrink-0 text-xs text-subtle tabular">{i + 1}</span>
                      <span className="min-w-0 flex-1">
                        <span className="flex flex-wrap items-center gap-2">
                          <Badge variant={BAND_VARIANT[t.band]}>
                            {PRIORITY_BAND_LABEL[t.band]}
                          </Badge>
                          <span className="text-xs text-subtle">{DOMAIN_LABEL[t.domain]}</span>
                        </span>
                        <span className="mt-0.5 block text-sm font-medium">{t.label}</span>
                      </span>
                      <span className="text-right">
                        <span className="block text-lg font-semibold tabular">{t.priority}</span>
                        <span className="block text-xs text-subtle">priority</span>
                      </span>
                    </button>
                  </li>
                ))}
              </ol>
            </CardContent>
          </Card>

          <div className="min-w-0 space-y-4">
            {selected && (
              <Card>
                <CardHeader className="pb-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant={BAND_VARIANT[selected.band]}>
                      {PRIORITY_BAND_LABEL[selected.band]}
                    </Badge>
                    <span className="text-xs text-subtle">
                      {DOMAIN_LABEL[selected.domain]} · priority {selected.priority}
                    </span>
                  </div>
                  <CardTitle className="text-base">{selected.label}</CardTitle>
                  <CardDescription>{selected.impactHint}</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3 text-sm">
                  <div>
                    <p className="text-xs font-medium tracking-wide text-subtle uppercase">
                      Why it ranks here
                    </p>
                    <ul className="mt-1 space-y-1 text-muted">
                      {selected.reasons.map((r) => (
                        <li key={r}>· {r}</li>
                      ))}
                    </ul>
                  </div>
                  <div className="rounded-lg border border-border bg-elevated px-3 py-2">
                    <p className="flex items-center gap-1.5 text-xs font-medium tracking-wide text-subtle uppercase">
                      <Target className="size-3.5" />
                      What to do first
                    </p>
                    <ul className="mt-1 space-y-1">
                      {selected.roe.map((r) => (
                        <li key={r}>· {r}</li>
                      ))}
                    </ul>
                  </div>
                  {selected.expectedLoss != null && (
                    <p className="text-xs text-subtle">
                      {selected.domain === "scenario" ? "Assumed retained loss" : "Assumed loss"}{" "}
                      {formatUsd(selected.expectedLoss)}
                      {selected.p50Days != null
                        ? ` · about ${selected.p50Days} assumed days until found`
                        : ""}
                      {selected.domain === "scenario" && scenarioNote ? ` · ${scenarioNote}` : ""}
                    </p>
                  )}
                </CardContent>
              </Card>
            )}

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-base">
                  <ListChecks className="size-4 text-primary" />
                  How to work the list
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ol className="list-decimal space-y-1.5 pl-5 text-sm text-muted">
                  {report.roeSummary.map((r) => (
                    <li key={r}>{r}</li>
                  ))}
                </ol>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Summary</CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="space-y-1.5 text-sm text-muted">
                  {report.missionBrief.map((line) => (
                    <li key={line}>· {line}</li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          </div>
        </div>

        <p className="pb-6 text-center text-xs text-subtle">
          Educational decision support. Not a forensic opinion and not legal advice; it never labels
          a person as a threat.
        </p>
      </main>
    </div>
  );
}
