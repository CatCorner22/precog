import { bandForScore } from "@/lib/precog/scoring/weights";
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
import type { DeepLinkTarget } from "@/lib/precog/coso";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatUsd, cn } from "@/lib/utils";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

function bandVariant(band: string): "ok" | "primary" | "warn" | "danger" {
  if (band === "critical_path") return "danger";
  if (band === "act_now") return "warn";
  if (band === "mitigate") return "primary";
  return "ok";
}

export function ResidualRadar({ onNavigate }: { onNavigate: (target: DeepLinkTarget) => void }) {
  const { profile, template } = usePractice();
  const summary = useMemo(
    () => portfolioSummary(template, profile.staff),
    [template, profile.staff],
  );
  const tornado = useMemo(
    () => tornadoSensitivity(template, profile.staff),
    [template, profile.staff],
  );
  const sensitivity = useMemo(
    () => weightSensitivity(template, profile.staff),
    [template, profile.staff],
  );
  const [selected, setSelected] = useState<ResidualRiskScore | null>(null);
  const active = selected ?? summary.top[0] ?? null;

  const tornadoData = tornado.levers.map((l) => ({
    name: l.label.length > 28 ? l.label.slice(0, 27) + "…" : l.label,
    full: l.label,
    delta: Math.round(l.delta * 10) / 10,
  }));

  function openLinked(item: ResidualRiskScore) {
    if (item.linkedScenarioId) {
      onNavigate({ type: "precog", scenarioId: item.linkedScenarioId });
      return;
    }
    if (item.linkedKnowledgeId) {
      onNavigate({ type: "knowledge", knowledgeId: item.linkedKnowledgeId });
      return;
    }
    if (item.category === "control") {
      onNavigate({ type: "sod" });
    }
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-4">
        <Stat
          label="Scoring engine"
          value={summary.scoringVersion.replace("precog-", "")}
          hint="Transparent weights"
        />
        <Stat
          label="Avg residual"
          value={bandForScore(summary.averageResidual).label}
          subvalue={`${summary.averageResidual} (range ${sensitivity.averageLow}–${sensitivity.averageHigh} across ±20% weight trials)`}
          hint="This app's index, from your profile"
        />
        <Stat
          label="Critical path"
          value={String(summary.criticalPath)}
          hint={`Index ≥ ${RISK_SCALE.critical}`}
        />
        <Stat
          label="Act now"
          value={String(summary.actNow)}
          hint={`Index ${RISK_SCALE.actNow}–${RISK_SCALE.critical - 1}`}
        />
      </div>
      <IndexBasis />

      <div className="grid gap-4 lg:grid-cols-[1.15fr_0.85fr]">
        <Card>
          <CardHeader>
            <CardTitle>Residual risk register</CardTitle>
            <CardDescription>
              Inherent × (1 − control effectiveness) × staff modifiers, each a weight this app chose
              — sorted by the resulting index
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {summary.top.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setSelected(item)}
                className={cn(
                  "flex w-full flex-col gap-2 rounded-xl border px-3 py-3 text-left transition-colors sm:flex-row sm:items-center sm:justify-between",
                  active?.id === item.id
                    ? "border-primary/50 bg-primary/10"
                    : "border-border bg-elevated hover:border-border-strong",
                )}
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="default">{item.category}</Badge>
                    <Badge variant={bandVariant(item.band)}>{item.bandLabel}</Badge>
                  </div>
                  <p className="mt-1 font-medium leading-snug">{item.name}</p>
                </div>
                <div className="flex items-center gap-3">
                  <div className="text-right">
                    <p className="text-xl font-semibold tabular">{item.residual}</p>
                    <p className="text-[10px] text-subtle">residual</p>
                    <ItemSensitivityMeta sensitivity={sensitivity} id={item.id} />
                  </div>
                  <div className="hidden w-24 sm:block">
                    <div className="h-1.5 overflow-hidden rounded-full bg-bg">
                      <div
                        className={cn(
                          "h-full rounded-full",
                          item.residual >= 80
                            ? "bg-danger"
                            : item.residual >= 60
                              ? "bg-warn"
                              : item.residual >= 40
                                ? "bg-primary"
                                : "bg-ok",
                        )}
                        style={{ width: `${item.residual}%` }}
                      />
                    </div>
                    <p className="mt-1 text-[10px] text-muted">
                      I {item.inherent} · E {item.controlEffectiveness}
                    </p>
                  </div>
                </div>
              </button>
            ))}
          </CardContent>
        </Card>

        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Selected risk anatomy</CardTitle>
              <CardDescription>Drivers that move this residual score</CardDescription>
            </CardHeader>
            <CardContent>
              {active ? (
                <div className="space-y-3">
                  <p className="font-medium">{active.name}</p>
                  <p className="text-sm text-muted">{active.bandGuidance}</p>
                  <div className="grid grid-cols-3 gap-2 text-center">
                    <Mini n={active.inherent} l="Inherent" />
                    <Mini n={active.controlEffectiveness} l="Effectiveness" />
                    <Mini n={active.residual} l="Residual" />
                  </div>
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
                  {(active.expectedLoss || active.linkedScenarioId || active.linkedKnowledgeId) && (
                    <Button size="sm" variant="secondary" onClick={() => openLinked(active)}>
                      Open linked evidence
                    </Button>
                  )}
                  {active.expectedLoss != null && (
                    <p className="text-xs text-subtle">
                      Scenario assumes a loss of {formatUsd(active.expectedLoss)}
                      {active.p50Days != null ? ` about ${active.p50Days} days out` : ""}
                    </p>
                  )}
                </div>
              ) : (
                <p className="text-sm text-muted">Select a residual risk.</p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Tornado — highest leverage</CardTitle>
              <CardDescription>
                Approximate drop in average residual if each lever is pulled
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="h-56 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={tornadoData} layout="vertical" margin={{ left: 8, right: 12 }}>
                    <CartesianGrid stroke="var(--color-border)" strokeDasharray="3 3" />
                    <XAxis type="number" tick={{ fill: "var(--color-muted)", fontSize: 11 }} />
                    <YAxis
                      type="category"
                      dataKey="name"
                      width={120}
                      tick={{ fill: "var(--color-muted)", fontSize: 10 }}
                    />
                    <Tooltip
                      contentStyle={{
                        background: "var(--color-elevated)",
                        border: "1px solid var(--color-border)",
                        borderRadius: 8,
                        fontSize: 12,
                      }}
                      formatter={(v: number) => [`−${v} pts`, "Residual drop"]}
                      labelFormatter={(_, payload) =>
                        (payload?.[0]?.payload as { full?: string })?.full ?? ""
                      }
                    />
                    <Bar dataKey="delta" fill="var(--color-primary)" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <p className="mt-2 text-xs text-subtle">
                Base average residual {tornado.baseAverage}. Pull the longest bar first.
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
      <ScoringBasis template={template} staff={profile.staff} sensitivity={sensitivity} />
    </div>
  );
}

function Stat({
  label,
  value,
  subvalue,
  hint,
}: {
  label: string;
  value: string;
  subvalue?: string;
  hint: string;
}) {
  return (
    <Card>
      <CardContent className="p-4">
        <p className="text-[11px] tracking-wide text-subtle uppercase">{label}</p>
        <p className="mt-1 truncate text-lg font-semibold tabular tracking-tight">{value}</p>
        {subvalue && <p className="mt-1 text-xs text-muted">{subvalue}</p>}
        <p className="mt-1 text-xs text-muted">{hint}</p>
      </CardContent>
    </Card>
  );
}

function Mini({ n, l }: { n: number; l: string }) {
  return (
    <div className="rounded-lg border border-border bg-elevated p-2">
      <p className="text-lg font-semibold tabular">{n}</p>
      <p className="text-[10px] text-subtle">{l}</p>
    </div>
  );
}

function ItemSensitivityMeta({
  sensitivity,
  id,
}: {
  sensitivity: ReturnType<typeof weightSensitivity>;
  id: string;
}) {
  const item = sensitivity.items.find((candidate) => candidate.id === id);
  if (!item) return null;

  return (
    <>
      <p className="text-[10px] tabular text-muted">
        range {item.low}–{item.high}
      </p>
      {!item.bandStable && (
        <Badge variant="warn" className="mt-1">
          band sensitive
        </Badge>
      )}
    </>
  );
}
