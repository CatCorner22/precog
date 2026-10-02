import { useMemo } from "react";
import { Link } from "@tanstack/react-router";
import { Crosshair, FileText, Hammer } from "lucide-react";
import { HEALTH_SCALE, RISK_SCALE, segregationLevel } from "@/lib/precog/scoring/bands";
import { rankDangerousScenarios } from "@/lib/precog/engine";
import { criticalSinglePoints } from "@/lib/precog/continuity/coverage";
import { registerAssessed } from "@/lib/precog/continuity/register-state";
import { OWN_TEAM_MAX } from "@/lib/precog/onboarding/own-business";
import { assessCoso } from "@/lib/precog/coso";
import { confirmedScenarioIds, residualScope } from "@/lib/precog/scoring/scope";
import { DEFAULT_WEIGHTS } from "@/lib/precog/scoring/weights";
import { portfolioSummary } from "@/lib/precog/scoring/residual-engine";
import { scoreLeadingIndicators } from "@/lib/precog/ml/leading-indicators";
import type { detectSodConflicts } from "@/lib/precog/sod/detect";
import { openSeverityCounts, openSodHint } from "@/lib/precog/sod/open-findings";
import { useScoredMap } from "@/lib/precog/builder/use-scored-map";
import { industryMeta, pluralTeamLabel } from "@/lib/precog/industry";
import { mapAssessed } from "@/lib/precog/builder/map-state";
import { usePractice, useTemplate } from "@/lib/precog/practice-context";
import { usePresentation } from "@/lib/precog/presentation";
import { tabLabel } from "@/lib/precog/navigation";
import { count } from "@/lib/precog/text";
import { buildDriftActions } from "@/lib/precog/integrations/drift-signals";
import { formatUsd } from "@/lib/utils";
import { IndexBasis } from "@/components/precog/index-basis";
import { MapHealthCard } from "@/components/precog/map-health-card";
import { ControlCalendarCard } from "@/components/precog/control-calendar";
import { PracticeSetup } from "@/components/precog/practice-setup";
import { WeeklyActionPlan } from "@/components/precog/weekly-action-plan";
import { MetricCard } from "@/components/precog/home-shell-parts";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { buttonClass } from "@/components/ui/button-variants";

/**
 * Opens a tab, optionally on one item, and How work flows in view or build
 * mode. Like `NavFn` it takes the tab as a string (a `NavTarget`); the shell
 * checks it.
 */
type OpenTab = (tab: string, item?: string | null, build?: boolean | "validate") => void;

/**
 * The Dashboard tab: the headline, the six scores, this week's plan, and the
 * top risks. Its engine runs live here, so they cost nothing while another
 * tab is open. The duty-conflict report comes from the shell, which also
 * needs it for the tab strip's badge.
 */
export function Dashboard({
  sodReport,
  onOpen,
}: {
  sodReport: ReturnType<typeof detectSodConflicts>;
  onOpen: OpenTab;
}) {
  const tpl = useTemplate();
  const { profile } = usePractice();
  const { say } = usePresentation();
  const industry = industryMeta(profile.industry);

  const ranked = useMemo(
    () =>
      rankDangerousScenarios(tpl, {
        staff: profile.staff,
        riskVariables: profile.riskVariables,
      }),
    [tpl, profile.staff, profile.riskVariables],
  );
  // The same inputs as the COSO tab, so the tile and the tab show one score.
  const coso = useMemo(
    () =>
      assessCoso(tpl, profile.staff, {
        riskVariables: profile.riskVariables,
        confirmedScenarioIds: confirmedScenarioIds(profile.decisions, profile.industry),
        dualRelease: profile.dualRelease,
      }),
    [
      tpl,
      profile.staff,
      profile.riskVariables,
      profile.decisions,
      profile.industry,
      profile.dualRelease,
    ],
  );
  // Scoped as the Residual page scopes it, so the tile matches the page it links to.
  const scope = useMemo(
    () =>
      residualScope({
        decisions: profile.decisions,
        industry: profile.industry,
        riskVariables: profile.riskVariables,
      }),
    [profile.decisions, profile.industry, profile.riskVariables],
  );
  const portfolio = useMemo(
    () => portfolioSummary(tpl, profile.staff, DEFAULT_WEIGHTS, scope),
    [tpl, profile.staff, scope],
  );
  const leading = useMemo(
    () =>
      scoreLeadingIndicators(tpl, profile.staff, profile.riskVariables, scope.confirmedScenarioIds),
    [tpl, profile.staff, profile.riskVariables, scope],
  );
  // One sole-owner figure on the whole Dashboard: the card shows the value the
  // business profile shows and the residual index uses, which for an owner's
  // register is the critical single points Who knows what counts.
  const registerReady = registerAssessed(tpl);
  const singlePoints = useMemo(() => criticalSinglePoints(tpl), [tpl]);
  const soleOwnerFigure = profile.staff.soleOwnerKnowledgeCount;
  const sodGaps = tpl.controls.filter((c) => !c.segregated).length;
  const top = ranked[0];
  const conflicts = sodReport.conflicts.length;
  // Coloured by the capped band word, as on the duty-conflict screen, and
  // hinted with the open findings that cap it.
  const sodOpen = openSeverityCounts(sodReport.conflicts, profile.dualRelease);
  const sodLevel = segregationLevel(sodReport.summary.segregationHealth, sodOpen);

  // Scored as the map page scores it: untouched starter processes are left out.
  const scoredMap = useScoredMap();
  const mapHealth = scoredMap.health;
  // A starter map nobody has assigned, or an empty map, has no health to show.
  const mapReady = mapAssessed(profile);
  const driftActions = useMemo(
    () =>
      buildDriftActions({
        summary: profile.integrationDriftSummary,
        accessReconciliation: profile.accessReconciliation,
      }),
    [profile.integrationDriftSummary, profile.accessReconciliation],
  );

  return (
    <div className="space-y-6 overflow-x-hidden">
      <section className="matrix-grid rounded-2xl border border-border bg-surface p-6">
        <Badge variant="accent">{industry.label} · internal controls</Badge>
        <h1 className="mt-3 max-w-2xl text-2xl font-semibold tracking-tight sm:text-3xl">
          {say(
            "Know the exposure that remains before it becomes a loss",
            "Know your residual risk before it becomes a loss",
          )}
        </h1>
        <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted sm:text-base">
          {industry.tagline}.{" "}
          {say(
            "Precog Pioneer finds where one person can move or hide money alone, which know-how only one person holds, and what each scenario could cost — then tells you what to fix this week.",
            "Precog Pioneer scores SoD gaps, knowledge single points of failure, and financial scenarios — then tells you what to fix this week.",
          )}{" "}
          Built for owner-operated {pluralTeamLabel(profile.industry)} of 2 to {OWN_TEAM_MAX}{" "}
          people.
        </p>
        <div className="mt-5 flex flex-wrap gap-2">
          <Button onClick={() => onOpen("sod")}>
            {say(
              `Open Who controls what (${count(conflicts, "duty conflict")})`,
              `Review SoD (${conflicts})`,
            )}
          </Button>
          <Button variant="secondary" onClick={() => onOpen("map")}>
            {tabLabel("map", say)}
          </Button>
          <Button variant="secondary" onClick={() => onOpen("map", null, true)}>
            <Hammer className="size-4" />
            Build your map
          </Button>
          <Button variant="outline" onClick={() => onOpen("pioneer")}>
            {tabLabel("pioneer", say)}
          </Button>
          <Link
            to="/threat"
            className={buttonClass({
              variant: "outline",
              className: "h-9 text-muted hover:text-fg",
            })}
          >
            <Crosshair className="size-4" />
            Threat view
          </Link>
          <Link
            to="/report"
            className={buttonClass({
              variant: "outline",
              className: "h-9 text-muted hover:text-fg",
            })}
          >
            <FileText className="size-4" />
            PDF report
          </Link>
        </div>
      </section>

      <MapHealthCard
        map={scoredMap}
        onOpenMap={(id) => onOpen("map", id)}
        onBuildMap={() => onOpen("map", null, true)}
        onFixIssues={() => onOpen("map", null, "validate")}
      />

      {driftActions.length > 0 && (
        <Card className="border-warn/40 bg-warn/5">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Books vs map</CardTitle>
            <CardDescription>
              QuickBooks or an access export disagrees with your duty map — resolve it before you
              rely on segregation checks.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            {driftActions.slice(0, 3).map((d) => (
              <p key={d.id}>
                <span className="font-medium text-fg">{d.title}.</span> {d.why}
              </p>
            ))}
            <Link to="/firm" className={buttonClass({ variant: "secondary", size: "sm" })}>
              Open firm workspace
            </Link>
          </CardContent>
        </Card>
      )}

      <IndexBasis />
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        <MetricCard
          label="Map health score"
          value={mapReady ? String(mapHealth.score) : "—"}
          hint={mapReady ? mapHealth.bandLabel : "Not assessed yet"}
          tone={
            !mapReady || mapHealth.score >= HEALTH_SCALE.adequate
              ? "primary"
              : mapHealth.score >= HEALTH_SCALE.weak
                ? "warn"
                : "danger"
          }
          onClick={() => onOpen("map", null, true)}
        />
        <MetricCard
          label={say("Risk left after controls", "Avg residual")}
          value={String(portfolio.averageResidual)}
          hint={`${portfolio.criticalPath} critical`}
          tone={
            portfolio.averageResidual >= RISK_SCALE.actNow
              ? "danger"
              : portfolio.averageResidual >= RISK_SCALE.mitigate
                ? "warn"
                : "primary"
          }
          onClick={() => onOpen("residual")}
        />
        <MetricCard
          label={say("Duties kept apart", "SoD health")}
          value={String(sodReport.summary.segregationHealth)}
          hint={openSodHint(sodOpen)}
          tone={sodLevel === "critical" ? "danger" : sodLevel === "weak" ? "warn" : "primary"}
          onClick={() => onOpen("sod")}
        />
        <MetricCard
          label={say("Coverage check", "COSO")}
          value={String(coso.overall)}
          hint={coso.overallStatus}
          tone="primary"
          onClick={() => onOpen("coso")}
        />
        <MetricCard
          label={say("Know-how only one person holds", "Critical SPOFs")}
          value={registerReady ? String(soleOwnerFigure) : "—"}
          hint={
            !registerReady
              ? "Not assessed yet"
              : soleOwnerFigure === singlePoints.count
                ? `${singlePoints.nobody} with nobody, ${singlePoints.onePerson} with one person`
                : `${soleOwnerFigure} from your business profile; the Who knows what register counts ${singlePoints.count}. Open it to reconcile.`
          }
          tone={!registerReady || soleOwnerFigure === 0 ? "primary" : "danger"}
          onClick={() => onOpen("knowledge")}
        />
        <MetricCard
          label={say("Biggest loss you would carry (assumed)", "Largest assumed retained loss")}
          value={
            top
              ? formatUsd(
                  top.result.retainedImpact?.expected ?? top.result.financialImpact.expected,
                )
              : "—"
          }
          hint={
            top
              ? say(
                  `An assumption for the riskiest scenario, over about ${top.result.timelineDays.p50} days`,
                  `scenario assumption · about ${top.result.timelineDays.p50} days out`,
                )
              : ""
          }
          tone="warn"
          onClick={() => onOpen("precog", top?.scenario.id)}
        />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 [&>*]:min-w-0">
        <WeeklyActionPlan onNavigate={onOpen} />
        <ControlCalendarCard
          onOpenProcess={(id) => onOpen("map", id, true)}
          onOpenJournal={() => onOpen("journal")}
          onOpenBuilder={() => onOpen("map", null, true)}
        />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 [&>*]:min-w-0">
        <PracticeSetup onOpenDualRelease={() => onOpen("sod")} />
        <Card>
          <CardHeader>
            <CardTitle>{say("Biggest risks left", "Top residual risks")}</CardTitle>
            <CardDescription>
              {say(
                `Based on your business profile: ${count(sodGaps, "control")} not split between two people, ${count(conflicts, "duty conflict")} found, team pressure ${leading.band}.`,
                `Profile-driven · ${sodGaps} static gaps · ${conflicts} detected conflicts · pressure ${leading.band}`,
              )}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {portfolio.top.slice(0, 5).map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => onOpen("residual")}
                className="flex w-full items-center justify-between gap-3 rounded-xl border border-border bg-elevated px-3 py-2.5 text-left hover:border-border-strong"
              >
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium">{item.name}</span>
                  <span className="text-xs text-muted">{item.bandLabel}</span>
                </span>
                <span className="text-lg font-semibold tabular">{item.residual}</span>
              </button>
            ))}
            <Button className="w-full" variant="secondary" onClick={() => onOpen("sod")}>
              {say("Open Who controls what", "Open SoD detector")}
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
