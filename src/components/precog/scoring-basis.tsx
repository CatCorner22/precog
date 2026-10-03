import { useId, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { IndexBasis } from "@/components/precog/index-basis";
import {
  HEALTH_SCALE,
  PRIORITY_BAND_LABEL,
  PRIORITY_SCALE,
  RISK_SCALE,
} from "@/lib/precog/scoring/bands";
import {
  DEFAULT_WEIGHTS,
  SCORING_VERSION,
  WEIGHT_DESCRIPTIONS,
} from "@/lib/precog/scoring/weights";
import type { SensitivityReport } from "@/lib/precog/scoring/sensitivity";
import { cn } from "@/lib/utils";
import { usePresentation } from "@/lib/precog/presentation";
import { formatWeight, UNIT, weightLabel } from "./scoring-basis-copy";

/** The customer-facing disclosure of how the residual indices are weighted. */
export function ScoringBasis({ sensitivity }: { sensitivity: SensitivityReport }) {
  const [open, setOpen] = useState(false);
  const detailsId = useId();
  const { say } = usePresentation();

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between gap-3">
        <CardTitle>How Precog makes these numbers</CardTitle>
        <Button
          size="sm"
          variant="ghost"
          aria-expanded={open}
          aria-controls={detailsId}
          onClick={() => setOpen((current) => !current)}
        >
          {open ? "Hide details" : "Show details"}
        </Button>
      </CardHeader>
      {open && (
        <CardContent id={detailsId} className="space-y-6">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="primary">Scoring version</Badge>
            <span className="text-sm font-medium">{SCORING_VERSION}</span>
          </div>

          <div className="grid gap-5 lg:grid-cols-2">
            {GROUPS.map((group) => (
              <WeightTable key={group.key} group={group} />
            ))}
          </div>

          <div className="space-y-3">
            <h3 className="text-sm font-semibold">Band cutoffs</h3>
            <div className="grid gap-3 text-xs sm:grid-cols-2">
              <div className="rounded-lg border border-border bg-elevated p-3">
                <p className="font-medium">Risk scale · higher is worse</p>
                <p className="mt-1 text-muted">
                  Watch under {RISK_SCALE.mitigate} · Worth doing {RISK_SCALE.mitigate}–
                  {RISK_SCALE.actNow - 1} · Fix soon {RISK_SCALE.actNow}–{RISK_SCALE.critical - 1} ·
                  Fix first {RISK_SCALE.critical}+
                </p>
                <p className="mt-1 text-muted">
                  The share of must-do work that stops when someone is out reads amber above{" "}
                  {100 - HEALTH_SCALE.strong}% and red from {RISK_SCALE.mitigate}%.
                </p>
              </div>
              <div className="rounded-lg border border-border bg-elevated p-3">
                <p className="font-medium">Health scale · higher is better</p>
                <p className="mt-1 text-muted">
                  Critical under {HEALTH_SCALE.weak} · Weak {HEALTH_SCALE.weak}–
                  {HEALTH_SCALE.adequate - 1} · Adequate {HEALTH_SCALE.adequate}–
                  {HEALTH_SCALE.strong - 1} · Strong {HEALTH_SCALE.strong}+
                </p>
                <p className="mt-1 text-muted">
                  {say("Duties kept apart", "Duty separation")} reads at best Weak while a critical
                  duty conflict is open, and at best Adequate while a high one is. A conflict dual
                  release covers only above a threshold still counts as open.
                </p>
              </div>
              <div className="rounded-lg border border-border bg-elevated p-3">
                <p className="font-medium">Priority scale · higher is worse</p>
                <p className="mt-1 text-muted">
                  {PRIORITY_BAND_LABEL.cold} under {PRIORITY_SCALE.low} ·{" "}
                  {PRIORITY_BAND_LABEL.watch} {PRIORITY_SCALE.low}–{PRIORITY_SCALE.medium - 1} ·{" "}
                  {PRIORITY_BAND_LABEL.elevated} {PRIORITY_SCALE.medium}–{PRIORITY_SCALE.high - 1} ·{" "}
                  {PRIORITY_BAND_LABEL.critical} {PRIORITY_SCALE.high}–{PRIORITY_SCALE.top - 1} ·{" "}
                  {PRIORITY_BAND_LABEL.white_hot} {PRIORITY_SCALE.top}+
                </p>
                <p className="mt-1 text-muted">
                  The process map&apos;s heat, the priority list and workload read this scale.
                </p>
              </div>
            </div>
          </div>

          <div className="space-y-3">
            <h3 className="text-sm font-semibold">Sensitivity</h3>
            <p className="text-xs text-muted">
              Base average {sensitivity.baseAverage} · range {sensitivity.averageLow}–
              {sensitivity.averageHigh} across ±{sensitivity.perturbation * 100}% weight trials.
            </p>
            <div className="flex items-center gap-2 text-xs text-muted">
              Top-3 ordering stable under ±{sensitivity.perturbation * 100}% weight changes:{" "}
              <Badge
                className={cn(sensitivity.topOrderStable ? "text-ok" : "text-warn")}
                variant={sensitivity.topOrderStable ? "ok" : "warn"}
              >
                {sensitivity.topOrderStable ? "yes" : "no"}
              </Badge>
            </div>
            {sensitivity.mostSensitive.length > 0 && (
              <ul className="space-y-1 text-xs text-muted">
                {sensitivity.mostSensitive.map((entry) => (
                  <li key={`${entry.group}.${entry.key}.${entry.direction}`}>
                    {GROUP_LABEL[entry.group] ?? entry.group}: {weightLabel(entry.key)},{" "}
                    {entry.direction === "up" ? "raised" : "lowered"}:{" "}
                    <span className="tabular">{signed(entry.delta)}</span> on the average
                  </li>
                ))}
              </ul>
            )}
          </div>

          <IndexBasis />
        </CardContent>
      )}
    </Card>
  );
}

function WeightTable({ group }: { group: (typeof GROUPS)[number] }) {
  const entries = Object.entries(group.values) as [string, number][];
  const maximum = Math.max(
    ...entries.filter(([key]) => !(key in UNIT)).map(([, value]) => value),
    0.01,
  );

  return (
    <div className="space-y-2">
      <h3 className="text-sm font-semibold">{group.label}</h3>
      <div className="space-y-2">
        {entries.map(([key, value]) => (
          <div key={key} className="grid gap-1 sm:grid-cols-[10rem_4rem_1fr] sm:items-center">
            <div className="text-xs text-muted">{weightLabel(key)}</div>
            <div className="text-xs tabular">{formatWeight(key, value)}</div>
            <div className="h-1.5 overflow-hidden rounded-full bg-elevated" aria-hidden>
              {!(key in UNIT) && (
                <div
                  className="h-full rounded-full bg-primary"
                  style={{ width: `${(value / maximum) * 100}%` }}
                />
              )}
            </div>
            <p className="text-xs leading-relaxed text-subtle sm:col-span-3">
              {WEIGHT_DESCRIPTIONS[`${group.key}.${key}`]}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}

function signed(value: number) {
  return `${value >= 0 ? "+" : ""}${value.toFixed(1)}`;
}

const GROUPS = [
  { key: "inherent", label: "Inherent risk", values: DEFAULT_WEIGHTS.inherent },
  { key: "control", label: "Control effectiveness", values: DEFAULT_WEIGHTS.control },
  { key: "controlLevels", label: "Control levels", values: DEFAULT_WEIGHTS.controlLevels },
  { key: "staff", label: "Staff modifiers", values: DEFAULT_WEIGHTS.staff },
  { key: "scenario", label: "Scenario levels", values: DEFAULT_WEIGHTS.scenario },
  {
    key: "scenarioStaff",
    label: "Scenario staffing multipliers",
    values: DEFAULT_WEIGHTS.scenarioStaff,
  },
  { key: "likelihood", label: "Likelihood model", values: DEFAULT_WEIGHTS.likelihood },
  { key: "knowledge", label: "Written procedures", values: DEFAULT_WEIGHTS.knowledge },
  { key: "knowledgeLevels", label: "Know-how levels", values: DEFAULT_WEIGHTS.knowledgeLevels },
  { key: "knowledgeIndex", label: "Know-how index", values: DEFAULT_WEIGHTS.knowledgeIndex },
] as const;

const GROUP_LABEL: Record<string, string> = Object.fromEntries(GROUPS.map((g) => [g.key, g.label]));
