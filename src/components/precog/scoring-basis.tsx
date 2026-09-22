import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { IndexBasis } from "@/components/precog/index-basis";
import type { IndustryTemplate } from "@/lib/precog/templates";
import type { StaffComposition } from "@/lib/precog/types";
import { HEALTH_SCALE, RISK_SCALE } from "@/lib/precog/scoring/bands";
import {
  DEFAULT_WEIGHTS,
  SCORING_VERSION,
  WEIGHT_DESCRIPTIONS,
} from "@/lib/precog/scoring/weights";
import type { SensitivityReport } from "@/lib/precog/scoring/sensitivity";
import { cn } from "@/lib/utils";

interface ScoringBasisProps {
  template: IndustryTemplate;
  staff: StaffComposition;
  sensitivity: SensitivityReport;
}

const GROUPS = [
  { key: "inherent", label: "Inherent risk", values: DEFAULT_WEIGHTS.inherent },
  { key: "control", label: "Control effectiveness", values: DEFAULT_WEIGHTS.control },
  { key: "staff", label: "Staff modifiers", values: DEFAULT_WEIGHTS.staff },
  { key: "scenario", label: "Scenario model", values: DEFAULT_WEIGHTS.scenario },
  { key: "knowledge", label: "Written procedures", values: DEFAULT_WEIGHTS.knowledge },
] as const;

function humanize(key: string) {
  return key.replace(/([a-z])([A-Z])/g, "$1 $2").replace(/^./, (letter) => letter.toUpperCase());
}

function formatWeight(value: number) {
  return value >= 1000 ? value.toLocaleString() : value.toFixed(2);
}

function signed(value: number) {
  return `${value >= 0 ? "+" : ""}${value.toFixed(1)}`;
}

function WeightTable({ group }: { group: (typeof GROUPS)[number] }) {
  const entries = Object.entries(group.values) as [string, number][];
  const maximum = Math.max(
    ...entries.filter(([, value]) => value <= 1).map(([, value]) => value),
    0.01,
  );

  return (
    <div className="space-y-2">
      <h4 className="text-sm font-semibold">{group.label}</h4>
      <div className="space-y-2">
        {entries.map(([key, value]) => (
          <div key={key} className="grid gap-1 sm:grid-cols-[10rem_4rem_1fr] sm:items-center">
            <div className="text-xs text-muted">{humanize(key)}</div>
            <div className="text-xs tabular">{formatWeight(value)}</div>
            <div className="h-1.5 overflow-hidden rounded-full bg-elevated">
              {value <= 1 && (
                <div
                  className="h-full rounded-full bg-primary"
                  style={{ width: `${(value / maximum) * 100}%` }}
                />
              )}
            </div>
            <p className="text-[11px] leading-relaxed text-subtle sm:col-span-3">
              {WEIGHT_DESCRIPTIONS[`${group.key}.${key}`]}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}

export function ScoringBasis({ sensitivity }: ScoringBasisProps) {
  const [open, setOpen] = useState(false);

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between gap-3">
        <CardTitle>How these numbers are made</CardTitle>
        <Button
          size="sm"
          variant="ghost"
          aria-expanded={open}
          onClick={() => setOpen((current) => !current)}
        >
          {open ? "Hide details" : "Show details"}
        </Button>
      </CardHeader>
      {open && (
        <CardContent className="space-y-6">
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
            <h4 className="text-sm font-semibold">Band cutoffs</h4>
            <div className="grid gap-3 text-xs sm:grid-cols-2">
              <div className="rounded-lg border border-border bg-elevated p-3">
                <p className="font-medium">Risk scale · higher is worse</p>
                <p className="mt-1 text-muted">
                  Mitigate {RISK_SCALE.mitigate} · Act now {RISK_SCALE.actNow} · Critical path{" "}
                  {RISK_SCALE.critical}
                </p>
              </div>
              <div className="rounded-lg border border-border bg-elevated p-3">
                <p className="font-medium">Health scale · higher is better</p>
                <p className="mt-1 text-muted">
                  Weak {HEALTH_SCALE.weak} · Adequate {HEALTH_SCALE.adequate} · Strong{" "}
                  {HEALTH_SCALE.strong}
                </p>
              </div>
            </div>
          </div>

          <div className="space-y-3">
            <h4 className="text-sm font-semibold">Sensitivity</h4>
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
                    {entry.group}.{entry.key} {entry.direction === "up" ? "↑" : "↓"}{" "}
                    <span className="tabular">{signed(entry.delta)}</span>
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
