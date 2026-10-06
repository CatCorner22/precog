import { useMemo } from "react";
import { CheckCircle2, GitBranch, GitCompare, SlidersHorizontal } from "lucide-react";
import type { IndustryTemplate } from "@/lib/precog/templates";
import type { MatrixLayerId, PrecogResult, ScenarioTemplate } from "@/lib/precog/types";
import {
  insuranceBasis,
  insuranceFigureNote,
  NOT_INSURED_LOSS,
  scenarioFlags,
  type RiskVariableState,
} from "@/lib/precog/scoring/dynamic-variables";
import { confirmedScenarioIds, starterScenarioLabel } from "@/lib/precog/scoring/scope";
import { industryNoun } from "@/lib/precog/industry";
import { usePractice } from "@/lib/precog/practice-context";
import { useTabName } from "@/lib/precog/presentation";
import { DEFAULT_FRAUD_STATS } from "@/lib/precog/templates/shared-controls";
import { ILLUSTRATIVE_LABEL, ILLUSTRATIVE_RANK_NOTE } from "@/lib/precog/scoring/scenario-level";
import { CaseCard } from "@/components/precog/case-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn, formatUsd } from "@/lib/utils";
import { count, verb } from "@/lib/precog/text";
import { FigureTile } from "./figure-tile";
import {
  mitigationCostPhrase,
  reductionPhrase,
  scenarioCases,
  scenarioConfirmation,
  type ScenarioCases,
} from "./scenario-page";
import type { ScenarioView } from "./scenario-runner";
import { StaffWhatIfCard, type StaffWhatIf } from "./staff-what-if";

/** One scenario: its assumed figures, the real cases behind it, staffing to try, and mitigations. */
export function SingleScenarioView({
  tpl,
  scenario,
  result,
  riskVariables,
  ownBusiness,
  mitigations,
  onPick,
  onToggleMitigation,
  onClearMitigations,
  onView,
  staffWhatIf,
}: {
  tpl: IndustryTemplate;
  scenario: ScenarioTemplate;
  result: PrecogResult | null;
  riskVariables: RiskVariableState;
  ownBusiness: boolean;
  mitigations: readonly string[];
  onPick: (id: string) => void;
  onToggleMitigation: (id: string) => void;
  onClearMitigations: () => void;
  onView: (view: ScenarioView) => void;
  staffWhatIf: StaffWhatIf;
}) {
  const tabName = useTabName();
  const { profile, addDecision } = usePractice();
  const confirmed = useMemo(
    () => confirmedScenarioIds(profile.decisions, profile.industry),
    [profile.decisions, profile.industry],
  );
  const cases = useMemo(
    () => scenarioCases(scenario, profile.industry),
    [scenario, profile.industry],
  );
  if (!result) return null;
  const scenarioIsStarter = ownBusiness && !confirmed.has(scenario.id);
  const noPolicy = insuranceBasis(riskVariables, ownBusiness) === "none";
  // A crime policy pays nothing toward a scenario that is not theft or fraud.
  const insuredLoss = scenarioFlags(scenario.id).fraudRelated;
  const policyNote = insuranceFigureNote(riskVariables, ownBusiness, scenario.id);
  const withPolicyNote = (text: string) => (policyNote ? `${text} · ${policyNote}` : text);
  const teamLabel = industryNoun(profile.industry);
  const dynamic = result.dynamic;

  return (
    <>
      {ownBusiness && (
        <div className="rounded-lg border border-warn/40 bg-warn/5 p-4">
          <p className="text-sm font-medium text-warn">{starterScenarioLabel(profile.industry)}</p>
          <p className="mt-1 text-sm leading-relaxed text-muted">
            These scenarios come with the sample business. Their losses and timelines are the
            example&rsquo;s assumptions, not facts about your business, so they stay out of the
            priority list and your totals until you pick one and choose &ldquo;This could happen
            here&rdquo;.
          </p>
        </div>
      )}
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4" role="group" aria-label="Scenarios">
        {tpl.scenarios.map((s) => (
          <button
            key={s.id}
            type="button"
            aria-pressed={scenario.id === s.id}
            onClick={() => onPick(s.id)}
            className={cn(
              "rounded-xl border p-4 text-left",
              scenario.id === s.id
                ? "border-primary/50 bg-primary/10 glow-primary"
                : "border-border bg-surface hover:border-border-strong",
            )}
          >
            {ownBusiness && (
              <Badge variant={confirmed.has(s.id) ? "ok" : "default"} className="mb-2">
                {confirmed.has(s.id) ? "Yours" : "Starter"}
              </Badge>
            )}
            <span className="block text-sm font-semibold leading-snug">{s.title}</span>
            <span className="mt-2 line-clamp-2 block text-xs text-muted">{s.description}</span>
          </button>
        ))}
      </div>

      {scenarioIsStarter && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-panel p-3 text-sm">
          <p className="max-w-2xl text-muted">
            &ldquo;{scenario.title}&rdquo; is a sample scenario. If it could happen in your
            business, make it yours: Precog logs it in your {tabName("journal")} with a review date
            and starts counting in the priority list and your totals.
          </p>
          <Button size="sm" onClick={() => addDecision(scenarioConfirmation(scenario, new Date()))}>
            <CheckCircle2 className="size-3.5" />
            This could happen here
          </Button>
        </div>
      )}

      {cases && <RealCasesCard cases={cases} />}

      <div className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
        <Card>
          <CardHeader>
            <CardTitle>What this scenario assumes</CardTitle>
            <CardDescription>
              Change a staffing, detection, or insurance setting and the assumed figures move with
              it
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <p className="rounded-lg border border-border bg-panel p-3 text-xs leading-relaxed text-muted">
              <strong className="text-fg">{ILLUSTRATIVE_LABEL}.</strong> {ILLUSTRATIVE_RANK_NOTE}{" "}
              These figures are assumptions written into this scenario, scaled by your settings.
              They are not predictions, and nobody measured them at any business. For what failures
              like this one actually cost, see the prosecuted cases on Start here.
            </p>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              <FigureTile
                size="lg"
                label="Assumed days until found"
                value={`about ${result.timelineDays.p50} days`}
                hint={`assumed range ${result.timelineDays.p95Low}–${result.timelineDays.p95High} days`}
              />
              <FigureTile
                size="lg"
                label="Basis of these figures"
                value="Assumption"
                hint={result.confidenceLabel}
              />
              <FigureTile
                size="lg"
                label="Assumed loss if it happens"
                value={formatUsd(result.financialImpact.expected)}
                hint={`assumed range ${formatUsd(result.financialImpact.low)} – ${formatUsd(result.financialImpact.high)}`}
              />
              <FigureTile
                size="lg"
                label={`Assumed loss retained by ${teamLabel}`}
                value={formatUsd(result.retainedImpact.expected)}
                hint={
                  insuredLoss
                    ? withPolicyNote(
                        noPolicy
                          ? "all of the assumed loss"
                          : `assumed range ${formatUsd(result.retainedImpact.low)} – ${formatUsd(result.retainedImpact.high)}`,
                      )
                    : `all of the assumed loss · ${NOT_INSURED_LOSS}`
                }
              />
              <FigureTile
                size="lg"
                label="Net premium a year"
                value={formatUsd(dynamic?.premiumAnnualNet ?? 0)}
                hint={withPolicyNote(
                  noPolicy ? "no premium" : `after ${dynamic?.discountPctApplied ?? 0}% of credits`,
                )}
              />
            </div>

            {dynamic && (
              <div className="flex flex-wrap gap-2">
                <Badge variant="primary">
                  Likelihood multiplier versus the base case ×
                  {dynamic.likelihoodMultiplier.toFixed(2)}
                  {dynamic.likelihoodMultiplier < 1 ? " (less likely than the base case)" : ""}
                </Badge>
                <Badge variant="warn">
                  Loss size ×{dynamic.grossSeverityMultiplier.toFixed(2)}
                </Badge>
                <Badge variant="default">
                  Time until found ×{dynamic.detectionLagMultiplier.toFixed(2)}
                </Badge>
                {insuredLoss ? (
                  <Badge variant="ok">
                    Paid by insurance {formatUsd(dynamic.transferredExpected)}
                  </Badge>
                ) : (
                  <Badge variant="default">{NOT_INSURED_LOSS}</Badge>
                )}
              </div>
            )}

            <div>
              <p className="text-xs font-medium tracking-wide text-subtle uppercase">
                Where the effects land
              </p>
              <ul className="mt-2 space-y-2">
                {result.cascade.map((c) => (
                  <li
                    key={c.layer}
                    className="flex gap-3 rounded-lg border border-border bg-elevated px-3 py-2 text-sm"
                  >
                    <Badge variant="primary">{LAYER_PLAIN_NAME[c.layer]}</Badge>
                    <span className="text-muted">{c.effect}</span>
                  </li>
                ))}
              </ul>
            </div>

            <div className="flex flex-wrap gap-2">
              <Button variant="secondary" size="sm" onClick={() => onView("variables")}>
                <SlidersHorizontal className="size-3.5" />
                Change a setting
              </Button>
              <Button variant="secondary" size="sm" onClick={() => onView("cascades")}>
                <GitBranch className="size-3.5" />
                See what else moves
              </Button>
              <Button variant="secondary" size="sm" onClick={() => onView("compare")}>
                <GitCompare className="size-3.5" />
                Compare what-ifs
              </Button>
            </div>
          </CardContent>
        </Card>

        <div className="space-y-4">
          <StaffWhatIfCard {...staffWhatIf} />

          <Card>
            <CardHeader>
              <CardTitle>Reference figures and insurance</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <ul className="space-y-1 text-xs text-muted">
                {result.crimeModifiers.map((m) => (
                  <li key={m}>· {m}</li>
                ))}
              </ul>
              {scenarioFlags(scenario.id).fraudRelated && (
                <p className="text-xs text-subtle">
                  Fraud figures:{" "}
                  <a
                    href={DEFAULT_FRAUD_STATS.sourceUrl}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="text-primary hover:underline"
                  >
                    {DEFAULT_FRAUD_STATS.source}
                  </a>
                </p>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Controls</CardTitle>
          <CardDescription>
            Costs and reductions are this scenario&rsquo;s assumptions, not quotes.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 md:grid-cols-3">
            {scenario.mitigations.map((m) => {
              const on = mitigations.includes(m.id);
              return (
                <button
                  key={m.id}
                  type="button"
                  aria-pressed={on}
                  onClick={() => onToggleMitigation(m.id)}
                  className={cn(
                    "rounded-xl border p-4 text-left",
                    on
                      ? "border-ok/40 bg-ok/10"
                      : "border-border bg-elevated hover:border-border-strong",
                  )}
                >
                  <span className="flex items-center justify-between gap-2">
                    <Badge variant={on ? "ok" : "default"}>
                      {on ? "Added · " : ""}
                      {m.effort} effort
                    </Badge>
                    <span className="text-xs text-muted">{reductionPhrase(m.riskReduction)}</span>
                  </span>
                  <span className="mt-2 block text-sm font-medium">{m.label}</span>
                  <span className="mt-1 block text-xs text-subtle">
                    {mitigationCostPhrase(m.costAnnual)}
                  </span>
                </button>
              );
            })}
          </div>
          <p className="mt-4 rounded-lg border border-border bg-panel p-3 text-sm text-muted">
            {result.residualIfNothing}
          </p>
          <div className="mt-4">
            <Button variant="secondary" size="sm" onClick={onClearMitigations}>
              Clear controls
            </Button>
          </div>
        </CardContent>
      </Card>
    </>
  );
}

/** The prosecuted cases behind the scenario; counts and medians rest on citing cases only. */
function RealCasesCard({ cases }: { cases: ScenarioCases }) {
  const { citing, total } = cases;
  const related = total - citing.count;
  const loss = citing.loss;
  return (
    <Card>
      <CardHeader>
        <CardTitle>What this looked like somewhere real</CardTitle>
        <CardDescription>
          {citing.count > 0
            ? `${count(citing.count, "prosecuted case")} ${verb(citing.count, "shows", "show")} the duty conflicts this scenario models${
                loss
                  ? `; median stated loss ${formatUsd(loss.median)}, from ${formatUsd(loss.low)} to ${formatUsd(loss.high)}`
                  : ""
              }.`
            : "No prosecuted case in the library shows these exact duty conflicts."}
          {related > 0
            ? ` ${count(related, "more case")} ${verb(related, "shows", "show")} a related scheme and ${verb(related, "is", "are")} not counted.`
            : ""}{" "}
          The assumed figures below do not come from these cases; the cases are what the same
          failure cost other businesses.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {cases.shown.map((c) => (
          <div key={c.id}>
            {cases.ownSectorIds.has(c.id) && (
              <p className="mb-1 text-xs font-semibold tracking-wide text-subtle uppercase">
                From your line of business
              </p>
            )}
            <CaseCard study={c} />
          </div>
        ))}
        {total > cases.shown.length && (
          <p className="text-xs text-subtle">
            {total - cases.shown.length} more on Start here, under &ldquo;Every case behind this
            page&rdquo;.
          </p>
        )}
      </CardContent>
    </Card>
  );
}

/** Plain names for the layers a scenario's effects reach. */
const LAYER_PLAIN_NAME: Record<MatrixLayerId, string> = {
  surface: "Customers and daily work",
  process: "Workflows",
  knowledge: "Know-how",
  control: "Controls",
  source: "Systems and vendors",
  continuity: "Continuity",
};
