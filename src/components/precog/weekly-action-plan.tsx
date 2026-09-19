import { RISK_SCALE } from "@/lib/precog/scoring/bands";
import { useMemo } from "react";
import { usePractice } from "@/lib/precog/practice-context";
import { portfolioSummary, tornadoSensitivity } from "@/lib/precog/scoring/residual-engine";
import { detectSodConflicts } from "@/lib/precog/sod/detect";
import { mitigatedSodRuleIds } from "@/lib/precog/controls/dual-release";
import { findKnowledgeRisks } from "@/lib/precog/engine";
import type { IndustryTemplate } from "@/lib/precog/templates/types";
import {
  buildProcessMapGraph,
  HEAT_BANDS,
  type ProcessMapSnapshot,
} from "@/lib/precog/process-graph";
import {
  casesForControl,
  casesForSodRules,
  type CaseStudy,
  type ControlId,
} from "@/lib/precog/evidence";
import { formatUsd } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { CheckCircle2, CircleAlert, ListChecks } from "lucide-react";

export interface WeeklyAction {
  id: string;
  title: string;
  why: string;
  effort: "low" | "medium" | "high";
  tab: string;
  priority: number;
  /** Deep-link to a process on the map tab. */
  processId?: string;
  /** The prosecuted cases this action rests on, where the library has any. */
  evidence?: ActionEvidence;
}

export interface ActionEvidence {
  caseCount: number;
  /** The largest recorded loss among those cases. */
  worst: { title: string; lossUsd: number; lossIsFloor: boolean } | null;
}

/** Summarise a case list for one action; null when nothing backs it. */
function evidenceFor(cases: readonly CaseStudy[]): ActionEvidence | undefined {
  if (cases.length === 0) return undefined;
  const withLoss = cases.filter((c) => c.lossUsd > 0);
  const worst = withLoss.reduce<CaseStudy | null>(
    (best, c) => (best === null || c.lossUsd > best.lossUsd ? c : best),
    null,
  );
  return {
    caseCount: cases.length,
    worst: worst
      ? { title: worst.title, lossUsd: worst.lossUsd, lossIsFloor: worst.lossIsFloor }
      : null,
  };
}

/** Union of the cases behind several controls, each case once. */
function casesForControls(ids: readonly ControlId[]): CaseStudy[] {
  const seen = new Map<string, CaseStudy>();
  for (const id of ids) for (const c of casesForControl(id)) seen.set(c.id, c);
  return [...seen.values()];
}

export function buildWeeklyActions(input: {
  tpl: IndustryTemplate;
  staff: ReturnType<typeof usePractice>["profile"]["staff"];
  dualRelease: ReturnType<typeof usePractice>["profile"]["dualRelease"];
  mapSnapshots?: ProcessMapSnapshot[];
}): WeeklyAction[] {
  const { tpl } = input;
  const portfolio = portfolioSummary(tpl, input.staff);
  const sod = detectSodConflicts(tpl, input.staff, {
    dualReleaseMitigatedRuleIds: mitigatedSodRuleIds(input.dualRelease),
  });
  const spofs = findKnowledgeRisks(tpl).filter(
    (r) => r.soleOwner && r.riskScore >= RISK_SCALE.actNow,
  );
  const tornado = tornadoSensitivity(tpl, input.staff);
  const actions: WeeklyAction[] = [];

  if (!input.staff.independentBankRec) {
    actions.push({
      id: "bank-rec",
      title: "Start owner weekly bank reconciliation",
      why: "Owner sees the bank's record without going through the person who posts payments — catches errors and diverted payments early.",
      effort: "low",
      tab: "sod",
      priority: 95,
      evidence: evidenceFor(
        casesForControls(["owner-opens-bank-statement", "independent-bank-reconciliation"]),
      ),
    });
  }

  if (!input.staff.dualControlPayments) {
    actions.push({
      id: "dual-control",
      title: "Enable dual control on payments",
      why: "Separates payment release from vendor setup, so an invented supplier needs a second person to get paid. Narrows the path above the threshold; does not close it below.",
      effort: "medium",
      tab: "sod",
      priority: 90,
      evidence: evidenceFor(
        casesForControls(["dual-release-above-threshold", "new-payee-second-approval"]),
      ),
    });
  }

  for (const c of sod.conflicts.filter((x) => x.severity === "critical").slice(0, 2)) {
    actions.push({
      id: `sod-${c.ruleId}`,
      title: `Split ${c.labelA.toLowerCase()} from ${c.labelB.toLowerCase()}`,
      why: c.why || "Incompatible duties are concentrated on one role.",
      effort: "medium",
      tab: "sod",
      priority: 88,
      evidence: evidenceFor(casesForSodRules([c.ruleId])),
    });
  }

  for (const s of spofs.slice(0, 2)) {
    actions.push({
      id: `spof-${s.knowledgeId}`,
      title: `Cross-train backup for ${s.name}`,
      why: "Single-person knowledge creates continuity and fraud-detection blind spots.",
      effort: "medium",
      tab: "knowledge",
      priority: 82,
    });
  }

  const topRisk = portfolio.top[0];
  if (topRisk && topRisk.residual >= 60) {
    actions.push({
      id: `residual-${topRisk.id}`,
      title: `Review ${topRisk.name}`,
      why: topRisk.bandGuidance,
      effort: topRisk.band === "critical_path" ? "high" : "medium",
      tab: "residual",
      priority: topRisk.residual,
    });
  }

  const bestLever = tornado.levers[0];
  if (bestLever && bestLever.delta >= 3) {
    actions.push({
      id: `tornado-${bestLever.id}`,
      title: bestLever.label,
      why: `Could lower average residual by ~${Math.round(bestLever.delta)} points.`,
      effort: bestLever.id === "bank" || bestLever.id === "dual" ? "low" : "medium",
      tab: "residual",
      priority: 70 + Math.min(20, bestLever.delta),
    });
  }

  if (input.mapSnapshots?.length) {
    for (const snap of input.mapSnapshots.filter((s) => s.heat >= HEAT_BANDS.hot).slice(0, 2)) {
      const gaps = snap.controlGaps.filter((c) => !c.segregated).length;
      actions.push({
        id: `map-heat-${snap.process.id}`,
        title: `Review hot process: ${snap.process.name}`,
        why: `Heat ${snap.heat} — ${snap.risks.length} risk(s)${gaps ? `, ${gaps} SoD gap(s)` : ""}. Open the map builder to assign owners and controls.`,
        effort: gaps > 0 ? "medium" : "low",
        tab: "map",
        processId: snap.process.id,
        priority: Math.min(92, snap.heat + 5),
      });
    }

    const unowned = input.mapSnapshots.filter((s) => !s.owners.length).slice(0, 1);
    for (const snap of unowned) {
      actions.push({
        id: `map-owner-${snap.process.id}`,
        title: `Assign owner: ${snap.process.name}`,
        why: "Processes without owners don't get SoD or continuity scoring — assign someone on your team.",
        effort: "low",
        tab: "map",
        processId: snap.process.id,
        priority: 75,
      });
    }
  }

  const seen = new Set<string>();
  return actions
    .filter((a) => {
      const key = a.title.toLowerCase().slice(0, 40);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((a, b) => b.priority - a.priority)
    .slice(0, 5);
}

export function WeeklyActionPlan({
  onNavigate,
}: {
  onNavigate: (tab: string, processId?: string) => void;
}) {
  const { profile, template } = usePractice();
  const actions = useMemo(() => {
    const { snapshots } = buildProcessMapGraph(template, profile.staff);
    return buildWeeklyActions({
      tpl: template,
      staff: profile.staff,
      dualRelease: profile.dualRelease,
      mapSnapshots: snapshots,
    });
  }, [template, profile.staff, profile.dualRelease]);

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <ListChecks className="size-4 text-primary" />
          This week&apos;s control priorities
        </CardTitle>
        <CardDescription>
          Actionable steps ranked by residual impact — not a compliance checklist.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        {actions.length === 0 ? (
          <p className="flex items-center gap-2 text-sm text-ok">
            <CheckCircle2 className="size-4" />
            Core controls look solid. Monitor leading indicators and journal reviews.
          </p>
        ) : (
          actions.map((a, i) => (
            <button
              key={a.id}
              type="button"
              onClick={() => onNavigate(a.tab, a.processId)}
              className="flex w-full items-start gap-3 rounded-xl border border-border bg-elevated px-3 py-2.5 text-left transition-colors hover:border-border-strong"
            >
              <span className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
                {i + 1}
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-medium">{a.title}</span>
                  <Badge
                    variant={a.effort === "low" ? "ok" : a.effort === "high" ? "warn" : "default"}
                  >
                    {a.effort} effort
                  </Badge>
                </span>
                <span className="mt-0.5 block text-xs text-muted">{a.why}</span>
                {a.evidence && (
                  <span className="mt-1 block text-xs text-subtle">
                    {a.evidence.caseCount} prosecuted{" "}
                    {a.evidence.caseCount === 1 ? "case" : "cases"} in the library
                    {a.evidence.worst
                      ? `; the largest cost ${a.evidence.worst.lossIsFloor ? "at least " : ""}${formatUsd(a.evidence.worst.lossUsd)}.`
                      : "."}
                  </span>
                )}
              </span>
              <CircleAlert className="mt-0.5 size-4 shrink-0 text-muted" />
            </button>
          ))
        )}
        <Button className="w-full" variant="secondary" onClick={() => onNavigate("pioneer")}>
          Ask Pioneer for a tailored brief
        </Button>
      </CardContent>
    </Card>
  );
}
