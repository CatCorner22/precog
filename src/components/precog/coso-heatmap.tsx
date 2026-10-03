import { IndexBasis } from "@/components/precog/index-basis";
import { useMemo, useState } from "react";
import { usePractice } from "@/lib/precog/practice-context";
import {
  assessCoso,
  COSO_PRINCIPLE_COUNT,
  type CosoComponentAssessment,
  type CosoComponentId,
  type CosoStatus,
  type DeepLinkTarget,
} from "@/lib/precog/coso";
import type { HealthLevel } from "@/lib/precog/scoring/bands";
import { usePresentation } from "@/lib/precog/presentation";
import { count } from "@/lib/precog/text";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { confirmedScenarioIds } from "@/lib/precog/scoring/scope";
import { ArrowRight, CheckCircle2, CircleAlert, TriangleAlert } from "lucide-react";

/** Gap, in place, or not assessed: no score, so nothing averages a gap away. */
const STATUS_META: Record<
  CosoStatus,
  { label: string; badge: "ok" | "danger" | "default"; dot: string; cell: string }
> = {
  gap: {
    label: "Gap",
    badge: "danger",
    dot: "bg-danger",
    cell: "border-danger/40 bg-danger/10",
  },
  in_place: {
    label: "In place",
    badge: "ok",
    dot: "bg-ok",
    cell: "border-ok/40 bg-ok/10",
  },
  not_assessed: {
    label: "Not assessed",
    badge: "default",
    dot: "bg-subtle",
    cell: "border-border bg-elevated",
  },
};

/** Gaps first, then what Precog cannot see, then what is in place. */
const STATUS_ORDER: Record<CosoStatus, number> = { gap: 0, not_assessed: 1, in_place: 2 };

export function CosoHeatmap({ onNavigate }: { onNavigate: (target: DeepLinkTarget) => void }) {
  const { template, profile } = usePractice();
  const { say } = usePresentation();
  const assessment = useMemo(
    () =>
      assessCoso(template, profile.staff, {
        riskVariables: profile.riskVariables,
        confirmedScenarioIds: confirmedScenarioIds(profile.decisions, profile.industry),
        dualRelease: profile.dualRelease,
        accessReconciliation: profile.accessReconciliation,
      }),
    [
      template,
      profile.staff,
      profile.riskVariables,
      profile.decisions,
      profile.industry,
      profile.dualRelease,
      profile.accessReconciliation,
    ],
  );
  // Opens on the first component with a gap, picked once.
  const [activeId, setActiveId] = useState<CosoComponentId>(
    () =>
      assessment.components
        .slice()
        .sort((a, b) => STATUS_ORDER[a.status] - STATUS_ORDER[b.status])[0]?.id ??
      "control_activities",
  );

  const active = assessment.components.find((c) => c.id === activeId) ?? assessment.components[0];

  return (
    <div className="space-y-4">
      <div className="grid gap-3 lg:grid-cols-[1fr_280px]">
        <Card className="overflow-hidden">
          <CardHeader>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <CardTitle>
                  {say("Coverage check", `COSO checklist (${COSO_PRINCIPLE_COUNT} principles)`)}
                </CardTitle>
                <CardDescription>
                  {say(
                    `Five parts · ${COSO_PRINCIPLE_COUNT} checks, each read from your controls, register, team and scenarios. A part shows a gap when any of its checks has one.`,
                    `Five components · ${COSO_PRINCIPLE_COUNT} principles, each read from your controls, register, team profile and confirmed scenarios. A component is a gap when any principle is; no score offsets it.`,
                  )}
                </CardDescription>
                <IndexBasis className="mt-1" />
              </div>
              <div className="text-right">
                <p className="text-sm font-semibold tabular">
                  {assessment.notAssessed} of {COSO_PRINCIPLE_COUNT} not assessed
                </p>
                <p className="mt-1 text-xs text-muted tabular">
                  {count(assessment.gaps, say("check", "principle"))} with a gap
                </p>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {/* Heat strip */}
            <div
              className="grid grid-cols-2 gap-2 sm:grid-cols-5"
              role="group"
              aria-label={say("Coverage areas", "COSO components")}
            >
              {assessment.components.map((c) => {
                const meta = STATUS_META[c.status];
                const selected = c.id === activeId;
                return (
                  <button
                    key={c.id}
                    type="button"
                    aria-pressed={selected}
                    onClick={() => setActiveId(c.id)}
                    className={cn(
                      "rounded-xl border p-3 text-left transition-colors",
                      meta.cell,
                      selected && "ring-2 ring-primary/50",
                    )}
                  >
                    <span className="block text-xs font-medium tracking-wide text-subtle uppercase">
                      {c.shortName}
                    </span>
                    <span className="mt-2 block text-sm font-semibold">{meta.label}</span>
                    <span className="mt-1 block text-xs text-muted tabular">
                      {c.principles.filter((p) => p.status === "gap").length} of{" "}
                      {c.principles.length} with a gap
                    </span>
                    <span className="mt-2 block text-xs font-medium">
                      {selected ? "Shown below" : "Show"}
                    </span>
                  </button>
                );
              })}
            </div>

            <div className="mt-4 flex flex-wrap gap-3 text-xs text-muted">
              {(Object.keys(STATUS_META) as CosoStatus[]).map((s) => (
                <span key={s} className="inline-flex items-center gap-1.5">
                  <span className={cn("size-2 rounded-full", STATUS_META[s].dot)} />
                  {STATUS_META[s].label}
                </span>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Priority gaps</CardTitle>
            <CardDescription>Open each one where you can fix it</CardDescription>
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
        </div>
        <CardDescription>{component.description}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <div>
          <p className="mb-2 text-xs font-medium tracking-wide text-subtle uppercase">Principles</p>
          <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {component.principles.map((p) => (
              <li key={p.number} className="rounded-lg border border-border bg-elevated px-3 py-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs text-subtle">P{p.number}</span>
                  <Badge variant={STATUS_META[p.status].badge} className="text-xs">
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
          <p className="mb-2 text-xs font-medium tracking-wide text-subtle uppercase">Gaps</p>
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
            <Button key={a.label} variant="secondary" size="sm" onClick={() => onNavigate(a.link)}>
              {a.label}
              <ArrowRight className="size-3.5" />
            </Button>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function SeverityIcon({ status }: { status: HealthLevel }) {
  if (status === "strong" || status === "adequate") {
    return <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-ok" />;
  }
  if (status === "weak") {
    return <TriangleAlert className="mt-0.5 size-4 shrink-0 text-warn" />;
  }
  return <CircleAlert className="mt-0.5 size-4 shrink-0 text-danger" />;
}
