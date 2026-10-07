import {
  DEFAULT_WEIGHTS,
  RESIDUAL_BAND_LABEL,
  type ActionBand,
} from "@/lib/precog/scoring/weights";
import { ILLUSTRATIVE_LABEL } from "@/lib/precog/scoring/scenario-level";
import {
  REGISTER_NOT_ASSESSED,
  confirmedScenarioIds,
  starterScenarioNote,
} from "@/lib/precog/scoring/scope";
import { RISK_SCALE } from "@/lib/precog/scoring/bands";
import { IndexBasis } from "@/components/precog/index-basis";
import { ScoringBasis } from "@/components/precog/scoring-basis";
import { useMemo, useState } from "react";
import {
  portfolioSummary,
  tornadoSensitivity,
  type ResidualRiskScore,
} from "@/lib/precog/scoring/residual-engine";
import { weightSensitivity } from "@/lib/precog/scoring/sensitivity";
import { usePractice } from "@/lib/precog/practice-context";
import { usePresentation } from "@/lib/precog/presentation";
import type { DeepLinkTarget } from "@/lib/precog/coso";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn, formatEstimateUsd, formatPct } from "@/lib/utils";
import { FigureTile } from "./figure-tile";

/** Rows shown before "Show all". */
const REGISTER_PREVIEW = 8;

/** How a scenario row blends its two levels. */
const SCENARIO_SHARES = DEFAULT_WEIGHTS.scenario;

export function ResidualRadar({ onNavigate }: { onNavigate: (target: DeepLinkTarget) => void }) {
  const { profile, template } = usePractice();
  const { say } = usePresentation();
  const confirmed = useMemo(
    () => confirmedScenarioIds(profile.decisions, profile.industry),
    [profile.decisions, profile.industry],
  );
  const scope = useMemo(
    () => ({ confirmedScenarioIds: confirmed, riskVariables: profile.riskVariables }),
    [confirmed, profile.riskVariables],
  );
  const summary = useMemo(
    () => portfolioSummary(template, profile.staff, DEFAULT_WEIGHTS, scope),
    [template, profile.staff, scope],
  );
  const tornado = useMemo(
    () => tornadoSensitivity(template, profile.staff, scope),
    [template, profile.staff, scope],
  );
  const sensitivity = useMemo(
    () => weightSensitivity(template, profile.staff, 0.2, scope),
    [template, profile.staff, scope],
  );
  const scenarioNote = useMemo(
    () => starterScenarioNote(template, confirmed),
    [template, confirmed],
  );
  const [selected, setSelected] = useState<ResidualRiskScore | null>(null);
  const [showAll, setShowAll] = useState(false);
  const active = selected ?? summary.all[0] ?? null;
  const rows = showAll ? summary.all : summary.all.slice(0, REGISTER_PREVIEW);

  const tornadoData = tornado.levers.map((l) => ({
    name: l.label,
    delta: Math.round(l.delta * 10) / 10,
  }));

  function openLinked(item: ResidualRiskScore) {
    if (item.linkedScenarioId) {
      onNavigate({ type: "precog", scenarioId: item.linkedScenarioId });
    } else if (item.linkedKnowledgeId) {
      onNavigate({ type: "knowledge", knowledgeId: item.linkedKnowledgeId });
    }
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-4">
        <FigureTile
          className="bg-surface p-4"
          label="Risks scored"
          value={String(summary.all.length)}
          hint="Controls, scenarios and know-how in your register"
        />
        <FigureTile
          className="bg-surface p-4"
          label={RESIDUAL_BAND_LABEL.critical_path}
          value={String(summary.criticalPath)}
          hint={`Residual ${RISK_SCALE.critical} or more`}
        />
        <FigureTile
          className="bg-surface p-4"
          label={RESIDUAL_BAND_LABEL.act_now}
          value={String(summary.actNow)}
          hint={`Residual ${RISK_SCALE.actNow}–${RISK_SCALE.critical - 1}`}
        />
        <FigureTile
          className="bg-surface p-4"
          label={RESIDUAL_BAND_LABEL.mitigate}
          value={String(summary.mitigate)}
          hint={`Residual ${RISK_SCALE.mitigate}–${RISK_SCALE.actNow - 1}; ${summary.watch} more ${RESIDUAL_BAND_LABEL.accept_monitor}`}
        />
      </div>
      <IndexBasis />

      <div className="grid gap-4 lg:grid-cols-[1.15fr_0.85fr]">
        <Card>
          <CardHeader>
            <CardTitle>{say("Risks left after your controls", "Residual risk register")}</CardTitle>
            <CardDescription>
              {say(
                "Each risk starts from the harm it could do, drops for each control you have, and rises for a small or new team. Precog chose these weights. Scenario rows already include your controls and team, so they get no more credit.",
                "Inherent × (1 − control effectiveness) × staff modifiers, each a weight Precog chose, sorted by the resulting index. Scenario rows blend a likelihood level and a severity level that already include your controls and staffing, so they take no further credit.",
              )}{" "}
              A scenario&rsquo;s dollar and day figures are examples, not from your books, and never
              change its place in the list.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {!summary.knowledgeAssessed && (
              <NotCounted onClick={() => onNavigate({ type: "knowledge" })}>
                {REGISTER_NOT_ASSESSED}
              </NotCounted>
            )}
            {scenarioNote && (
              <NotCounted onClick={() => onNavigate({ type: "precog" })}>{scenarioNote}</NotCounted>
            )}
            {summary.starterControlsLeftOut.length > 0 && (
              <NotCounted onClick={() => onNavigate({ type: "controls" })}>
                {`Precog leaves out sample controls (${summary.starterControlsLeftOut.length}): nobody has confirmed they run in your business. Confirm one in Who controls what, under Controls, with "This runs here" and it counts.`}
              </NotCounted>
            )}
            <p className="text-xs text-subtle">
              {showAll
                ? `All ${summary.all.length} risks, highest residual risk first.`
                : `Top ${rows.length} of ${summary.all.length} risks, highest residual risk first.`}{" "}
              {say(
                "Each row shows the risk before and after your controls, and how far its score moves if Precog's weights change.",
                "Each row shows inherent risk, control effectiveness, and the range across weight trials.",
              )}
            </p>
            <div
              role="group"
              aria-label={say("Risks left after your controls", "Residual risk register")}
              className="space-y-2"
            >
              {rows.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  aria-pressed={active?.id === item.id}
                  onClick={() => setSelected(item)}
                  className={cn(
                    "flex w-full flex-col gap-2 rounded-xl border px-3 py-3 text-left transition-colors sm:flex-row sm:items-center sm:justify-between",
                    active?.id === item.id
                      ? "border-primary/50 bg-primary/10"
                      : "border-border bg-elevated hover:border-border-strong",
                  )}
                >
                  <span className="block min-w-0">
                    <span className="flex flex-wrap items-center gap-2">
                      <Badge variant="default">{item.category}</Badge>
                      <Badge variant={BAND_VARIANT[item.band]}>{item.bandLabel}</Badge>
                    </span>
                    <span className="mt-1 block font-medium leading-snug">{item.name}</span>
                  </span>
                  <span className="flex items-center gap-3">
                    <span className="block text-right">
                      <span className="block text-xl font-semibold tabular">{item.residual}</span>
                      <span className="block text-xs text-subtle">residual</span>
                      <ItemSensitivityMeta sensitivity={sensitivity} id={item.id} />
                    </span>
                    <span className="hidden w-32 sm:block">
                      <span className="block h-1.5 overflow-hidden rounded-full bg-bg">
                        <span
                          className={cn("block h-full rounded-full", BAND_BAR[item.band])}
                          style={{ width: `${item.residual}%` }}
                        />
                      </span>
                      <span className="mt-1 block text-xs text-muted">
                        {item.likelihoodLevel != null && item.severityLevel != null
                          ? `Likelihood ${item.likelihoodLevel} · Severity ${item.severityLevel}`
                          : `Inherent ${item.inherent} · Effectiveness ${item.controlEffectiveness}`}
                      </span>
                    </span>
                  </span>
                </button>
              ))}
            </div>
            {summary.all.length > REGISTER_PREVIEW && (
              <Button
                size="sm"
                variant="secondary"
                aria-expanded={showAll}
                onClick={() => setShowAll((v) => !v)}
              >
                {showAll ? `Show the top ${REGISTER_PREVIEW}` : `Show all ${summary.all.length}`}
              </Button>
            )}
          </CardContent>
        </Card>

        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">
                {say("How this risk is scored", "Selected risk anatomy")}
              </CardTitle>
              <CardDescription>Drivers that move this residual risk</CardDescription>
            </CardHeader>
            <CardContent>
              {active ? (
                <div className="space-y-3">
                  <p className="font-medium">{active.name}</p>
                  <p className="text-sm text-muted">{active.bandGuidance}</p>
                  <div className="grid grid-cols-3 gap-2 text-center">
                    {active.likelihoodLevel != null && active.severityLevel != null ? (
                      <>
                        <FigureTile size="sm" label="Likelihood" value={active.likelihoodLevel} />
                        <FigureTile size="sm" label="Severity" value={active.severityLevel} />
                      </>
                    ) : (
                      <>
                        <FigureTile size="sm" label="Inherent" value={active.inherent} />
                        <FigureTile
                          size="sm"
                          label="Effectiveness"
                          value={active.controlEffectiveness}
                        />
                      </>
                    )}
                    <FigureTile size="sm" label="Residual risk" value={active.residual} />
                  </div>
                  {active.likelihoodLevel != null && active.severityLevel != null && (
                    <p className="text-xs text-subtle">
                      Likelihood level {active.likelihoodLevel} and severity level{" "}
                      {active.severityLevel}, blended {formatPct(SCENARIO_SHARES.severityShare)}{" "}
                      severity and {formatPct(SCENARIO_SHARES.likelihoodShare)} likelihood. Your
                      controls are already in both levels, so the row takes no further credit.
                    </p>
                  )}
                  <ul className="space-y-2">
                    {active.drivers.map((d) => (
                      <li
                        key={d.id}
                        className="rounded-lg border border-border bg-elevated px-3 py-2 text-sm"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-medium">{d.label}</span>
                          <Badge variant={d.direction === "increases" ? "danger" : "ok"}>
                            {d.direction}
                          </Badge>
                        </div>
                        <p className="mt-1 text-xs text-muted">{d.detail}</p>
                      </li>
                    ))}
                  </ul>
                  {(active.linkedScenarioId || active.linkedKnowledgeId) && (
                    <Button size="sm" variant="secondary" onClick={() => openLinked(active)}>
                      Open linked evidence
                    </Button>
                  )}
                  {active.expectedLoss != null && (
                    <p className="text-xs text-subtle">
                      {ILLUSTRATIVE_LABEL}: a loss of {formatEstimateUsd(active.expectedLoss)}
                      {active.p50Days != null
                        ? ` and about ${active.p50Days} days until found`
                        : ""}
                      .
                    </p>
                  )}
                </div>
              ) : (
                <p className="text-sm text-muted">Pick a risk in the register.</p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Which lever moves it most</CardTitle>
              <CardDescription>
                Approximate drop in the average residual risk if you pull each lever
              </CardDescription>
            </CardHeader>
            <CardContent>
              {tornadoData.length === 0 ? (
                <p className="text-sm text-muted">
                  No lever in this chart would lower the average: each one is already in place for
                  your team.
                </p>
              ) : (
                <TornadoBars rows={tornadoData} />
              )}
              <p className="mt-2 text-xs text-subtle">
                Average residual risk now: {tornado.baseAverage}.
                {tornadoData.length > 0 ? " Pull the longest bar first." : ""}
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
      <ScoringBasis sensitivity={sensitivity} />
    </div>
  );
}

/** One row per lever, as text, so the name and the number read in full. */
function TornadoBars({ rows }: { rows: { name: string; delta: number }[] }) {
  const max = Math.max(...rows.map((row) => Math.abs(row.delta)), 0.1);
  return (
    <ol className="space-y-2" aria-label="Drop in average residual risk for each lever">
      {rows.map((row) => (
        <li key={row.name} className="text-xs">
          <span className="flex justify-between gap-2">
            <span className="text-muted">{row.name}</span>
            <span className="shrink-0 tabular text-muted">{Math.abs(row.delta)} points lower</span>
          </span>
          <span className="mt-1 block h-3 overflow-hidden rounded bg-border/40" aria-hidden="true">
            <span
              className="block h-3 rounded bg-primary"
              style={{ width: `${(Math.abs(row.delta) / max) * 100}%` }}
            />
          </span>
        </li>
      ))}
    </ol>
  );
}

/** A note where rows would have been, for inputs that do not describe the business yet. */
function NotCounted({ children, onClick }: { children: React.ReactNode; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full rounded-xl border border-dashed border-border bg-panel/60 px-3 py-2.5 text-left text-sm text-muted hover:border-border-strong"
    >
      {children}
    </button>
  );
}

function ItemSensitivityMeta({
  sensitivity,
  id,
}: {
  sensitivity: ReturnType<typeof weightSensitivity>;
  id: string;
}) {
  const { say } = usePresentation();
  const item = sensitivity.items.find((candidate) => candidate.id === id);
  if (!item) return null;

  return (
    <>
      <span className="block text-xs tabular text-muted">
        {item.low}–{item.high} {say("if the weights change", "across weight trials")}
      </span>
      {!item.bandStable && (
        <Badge variant="warn" className="mt-1">
          {say("band could change", "band sensitive")}
        </Badge>
      )}
    </>
  );
}

/** One colour per action band, used by the badge and the bar alike. */
const BAND_VARIANT: Record<ActionBand, "ok" | "primary" | "warn" | "danger"> = {
  critical_path: "danger",
  act_now: "warn",
  mitigate: "primary",
  accept_monitor: "ok",
};

const BAND_BAR: Record<ActionBand, string> = {
  critical_path: "bg-danger",
  act_now: "bg-warn",
  mitigate: "bg-primary",
  accept_monitor: "bg-ok",
};
