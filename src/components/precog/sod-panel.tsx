import { AlertTriangle, Grid3x3, Network, ShieldCheck, Users, type LucideIcon } from "lucide-react";
import { HEALTH_SCALE, healthLevel } from "@/lib/precog/scoring/bands";
import { CONFLICT_RULES, entitlementLabel } from "@/lib/precog/sod/conflict-rules";
import type { NavFn } from "@/lib/precog/navigation";
import { DualReleasePanel } from "@/components/precog/dual-release-panel";
import { PowerMapBuilder } from "@/components/precog/power-map-builder";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { StatTile } from "@/components/ui/stat-tile";
import { joinWithAnd } from "@/lib/precog/text";
import { SodConflictsSection } from "./sod-conflicts-section";
import { SodMatrixSection } from "./sod-matrix-section";
import { SodRolesSection } from "./sod-roles-section";
import { useSodPanel, type SodPanelModel, type SodView } from "./use-sod-panel";

export function SodPanel({ onNavigate }: { onNavigate?: NavFn }) {
  const model = useSodPanel();
  const { profile, report, sodExamples, titleDuties, titleDutyNames, view, setView } = model;
  const health = report.summary.segregationHealth;

  return (
    <div className="space-y-4">
      <section className="matrix-grid rounded-2xl border border-border bg-surface p-6">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="accent">Duty conflicts</Badge>
          <Badge variant={profile.dualRelease.enabled ? "ok" : "warn"}>
            Dual release {profile.dualRelease.enabled ? "on" : "off"}
          </Badge>
        </div>
        <h1 className="mt-3 text-xl font-semibold tracking-tight">
          Who can move money, or hide it, on their own
        </h1>
        <p className="mt-2 max-w-2xl text-sm text-muted">
          We check every pair of duties a person holds against {CONFLICT_RULES.length} named rules,
          plus a catch-all for related duties in the same process. Turning on dual release puts a
          second person on the payment channels you choose; the conflicts it covers drop in rank and
          say so.
        </p>
      </section>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
        <StatTile
          label="Segregation health"
          value={String(health)}
          hint={`0 to 100 · ${healthLevel(health)} · this app's index`}
          tone={
            health < HEALTH_SCALE.weak ? "danger" : health < HEALTH_SCALE.adequate ? "warn" : "ok"
          }
        />
        <StatTile
          label="Critical open"
          value={String(report.summary.critical)}
          hint="Not narrowed"
          tone="danger"
        />
        <StatTile
          label="High open"
          value={String(report.summary.high)}
          hint="Not narrowed"
          tone="warn"
        />
        <StatTile
          label="Narrowed by dual release"
          value={String(report.summary.dualReleaseMitigated)}
          hint="Two people needed above the threshold"
          tone="ok"
        />
        <StatTile
          label="People"
          value={String(report.summary.peopleWithConflicts)}
          hint={`of ${report.assignments.length}`}
          tone="primary"
        />
        <StatTile
          label="Open, no decision"
          value={String(report.summary.openWithoutAcceptance)}
          hint="Not accepted or narrowed"
          tone="warn"
        />
      </div>
      {report.summary.unheldDuties.length > 0 && (
        <p className="rounded-md border border-warn/30 bg-warn/5 px-3 py-2 text-xs text-muted">
          Nobody active is marked for:{" "}
          {report.summary.unheldDuties.map(entitlementLabel).join(", ")}. Somebody does each of
          these in every business that handles money; mark who, or the map cannot see that seat.
        </p>
      )}

      {titleDuties && (
        <div className="rounded-md border border-warn/30 bg-warn/5 px-3 py-2 text-sm leading-relaxed text-muted">
          <p>
            {titleDuties} Check them in the power map: {joinWithAnd(titleDutyNames, 6)}.
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            <Button size="sm" onClick={() => setView("power")}>
              <Network className="size-3.5" aria-hidden />
              Open the power map
            </Button>
            <Button size="sm" variant="secondary" onClick={model.confirmTitleGuesses}>
              I checked them: they are right
            </Button>
          </div>
        </div>
      )}

      <div className="grid gap-3 md:grid-cols-4">
        {FRAMEWORK_DUTIES.map((f, i) => (
          <Card key={f.duty}>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">{f.duty}</CardTitle>
              <CardDescription>{f.meaning}</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-xs text-muted">{sodExamples[i]}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <ViewSwitcher model={model} />

      <div role="tabpanel" id={`sod-view-${view}`} aria-labelledby={`sod-tab-${view}`}>
        {view === "dual" && <DualReleasePanel onOpenSod={() => setView("conflicts")} />}
        {view === "power" && <PowerMapBuilder />}
        {view === "conflicts" && <SodConflictsSection model={model} onNavigate={onNavigate} />}
        {view === "matrix" && <SodMatrixSection report={report} />}
        {view === "roles" && <SodRolesSection model={model} />}
      </div>
    </div>
  );
}

function ViewSwitcher({ model }: { model: SodPanelModel }) {
  const { view, setView, report } = model;
  const views: { id: SodView; label: string; icon: LucideIcon }[] = [
    { id: "power", label: "Power map", icon: Network },
    { id: "dual", label: "Dual release", icon: ShieldCheck },
    { id: "conflicts", label: `Conflicts (${report.conflicts.length})`, icon: AlertTriangle },
    { id: "matrix", label: "Conflict matrix", icon: Grid3x3 },
    { id: "roles", label: "Duties by person", icon: Users },
  ];
  return (
    <div role="tablist" aria-label="Duty conflict views" className="flex flex-wrap gap-2">
      {views.map(({ id, label, icon: Icon }) => (
        <Button
          key={id}
          id={`sod-tab-${id}`}
          role="tab"
          aria-selected={view === id}
          aria-controls={`sod-view-${id}`}
          size="sm"
          variant={view === id ? "default" : "secondary"}
          onClick={() => setView(id)}
        >
          <Icon className="size-3.5" aria-hidden />
          {label}
        </Button>
      ))}
    </div>
  );
}

const FRAMEWORK_DUTIES = [
  { duty: "Authorization", meaning: "Approve before money or adjustments move" },
  { duty: "Custody", meaning: "Handle assets (cash, checks, bank release)" },
  { duty: "Recording", meaning: "Post transactions in books / systems" },
  { duty: "Reconciliation", meaning: "Independent verification" },
] as const;
