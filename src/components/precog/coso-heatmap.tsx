import { useMemo, useState } from "react";
import {
  assessCoso,
  type CosoComponentAssessment,
  type CosoComponentId,
  type DeepLinkTarget,
  type HealthStatus,
} from "@/lib/precog/coso";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { ArrowRight, CheckCircle2, CircleAlert, TriangleAlert } from "lucide-react";

const STATUS_META: Record<
  HealthStatus,
  { label: string; badge: "ok" | "primary" | "warn" | "danger"; bar: string; cell: string }
> = {
  strong: {
    label: "Strong",
    badge: "ok",
    bar: "bg-ok",
    cell: "border-ok/40 bg-ok/10",
  },
  adequate: {
    label: "Adequate",
    badge: "primary",
    bar: "bg-primary",
    cell: "border-primary/35 bg-primary/10",
  },
  weak: {
    label: "Weak",
    badge: "warn",
    bar: "bg-warn",
    cell: "border-warn/40 bg-warn/10",
  },
  critical: {
    label: "Critical",
    badge: "danger",
    bar: "bg-danger",
    cell: "border-danger/40 bg-danger/10",
  },
};

export function CosoHeatmap({
  onNavigate,
  initialComponentId,
}: {
  onNavigate: (target: DeepLinkTarget) => void;
  initialComponentId?: CosoComponentId;
}) {
  const assessment = useMemo(() => assessCoso(), []);
  const [activeId, setActiveId] = useState<CosoComponentId>(
    initialComponentId ??
      assessment.components.slice().sort((a, b) => a.score - b.score)[0]?.id ??
      "control_activities",
  );

  const active =
    assessment.components.find((c) => c.id === activeId) ?? assessment.components[0];

  return (
    <div className="space-y-4">
      <div className="grid gap-3 lg:grid-cols-[1fr_280px]">
        <Card className="overflow-hidden">
          <CardHeader>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <CardTitle>COSO internal control heat map</CardTitle>
                <CardDescription>
                  Five components · 17 principles · scored from this practice's controls,
                  knowledge, staff composition, and Precog risk
                </CardDescription>
              </div>
              <div className="text-right">
                <p className="text-[11px] tracking-wide text-subtle uppercase">Overall</p>
                <p className="text-2xl font-semibold tabular tracking-tight">
                  {assessment.overall}
                  <span className="text-sm font-normal text-muted">/100</span>
                </p>
                <Badge variant={STATUS_META[assessment.overallStatus].badge} className="mt-1">
                  {STATUS_META[assessment.overallStatus].label}
                </Badge>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {/* Heat strip */}
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
              {assessment.components.map((c) => {
                const meta = STATUS_META[c.status];
                const selected = c.id === activeId;
                return (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => setActiveId(c.id)}
                    className={cn(
                      "rounded-xl border p-3 text-left transition-colors",
                      meta.cell,
                      selected && "ring-2 ring-primary/50",
                    )}
                  >
                    <p className="text-[10px] font-medium tracking-wide text-subtle uppercase">
                      {c.shortName}
                    </p>
                    <p className="mt-2 text-2xl font-semibold tabular">{c.score}</p>
                    <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-bg/50">
                      <div
                        className={cn("h-full rounded-full", meta.bar)}
                        style={{ width: `${c.score}%` }}
                      />
                    </div>
                    <p className="mt-2 text-xs font-medium">{meta.label}</p>
                  </button>
                );
              })}
            </div>

            <div className="mt-4 flex flex-wrap gap-3 text-xs text-muted">
              {(Object.keys(STATUS_META) as HealthStatus[]).map((s) => (
                <span key={s} className="inline-flex items-center gap-1.5">
                  <span className={cn("size-2 rounded-full", STATUS_META[s].bar)} />
                  {STATUS_META[s].label}
                </span>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Priority findings</CardTitle>
            <CardDescription>Deep-link into the working surface</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {assessment.priorityFindings.map((f) => (
              <button
                key={f.id}
                type="button"
                onClick={() => onNavigate(f.link)}
                className="flex w-full items-start gap-2 rounded-lg border border-border bg-elevated px-3 py-2 text-left transition-colors hover:border-border-strong"
              >
                <SeverityIcon status={f.severity} />
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium leading-snug">{f.label}</span>
                  <span className="mt-0.5 block text-xs text-muted line-clamp-2">{f.detail}</span>
                </span>
                <ArrowRight className="mt-0.5 size-3.5 shrink-0 text-subtle" />
              </button>
            ))}
          </CardContent>
        </Card>
      </div>

      <ComponentDetail component={active} onNavigate={onNavigate} />
    </div>
  );
}

function ComponentDetail({
  component,
  onNavigate,
}: {
  component: CosoComponentAssessment;
  onNavigate: (target: DeepLinkTarget) => void;
}) {
  const meta = STATUS_META[component.status];

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center gap-2">
          <CardTitle>{component.name}</CardTitle>
          <Badge variant={meta.badge}>{meta.label}</Badge>
          <span className="text-sm tabular text-muted">{component.score}/100</span>
        </div>
        <CardDescription>{component.description}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <div>
          <p className="mb-2 text-[11px] font-medium tracking-wide text-subtle uppercase">
            Principles
          </p>
          <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {component.principles.map((p) => (
              <li
                key={p.number}
                className="rounded-lg border border-border bg-elevated px-3 py-2"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs text-subtle">P{p.number}</span>
                  <Badge variant={STATUS_META[p.status].badge} className="text-[10px]">
                    {STATUS_META[p.status].label}
                  </Badge>
                </div>
                <p className="mt-1 text-sm font-medium">{p.name}</p>
                <p className="mt-1 text-xs text-muted">{p.note}</p>
              </li>
            ))}
          </ul>
        </div>

        <div>
          <p className="mb-2 text-[11px] font-medium tracking-wide text-subtle uppercase">
            Findings
          </p>
          <ul className="space-y-2">
            {component.findings.map((f) => (
              <li key={f.id}>
                <button
                  type="button"
                  onClick={() => onNavigate(f.link)}
                  className="flex w-full items-start gap-3 rounded-xl border border-border bg-panel px-3 py-3 text-left transition-colors hover:border-border-strong"
                >
                  <SeverityIcon status={f.severity} />
                  <span className="min-w-0 flex-1">
                    <span className="font-medium">{f.label}</span>
                    <span className="mt-0.5 block text-sm text-muted">{f.detail}</span>
                  </span>
                  <span className="inline-flex items-center gap-1 text-xs text-primary">
                    Open <ArrowRight className="size-3" />
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>

        <div className="flex flex-wrap gap-2">
          {component.primaryActions.map((a) => (
            <Button
              key={a.label}
              variant="secondary"
              size="sm"
              onClick={() => onNavigate(a.link)}
            >
              {a.label}
              <ArrowRight className="size-3.5" />
            </Button>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function SeverityIcon({ status }: { status: HealthStatus }) {
  if (status === "strong" || status === "adequate") {
    return <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-ok" />;
  }
  if (status === "weak") {
    return <TriangleAlert className="mt-0.5 size-4 shrink-0 text-warn" />;
  }
  return <CircleAlert className="mt-0.5 size-4 shrink-0 text-danger" />;
}
