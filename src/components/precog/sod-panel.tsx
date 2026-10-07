import { Link } from "@tanstack/react-router";
import { dutiesOffTeam } from "@/lib/precog/onboarding/setup-answers";
import {
  AlertTriangle,
  Grid3x3,
  ListChecks,
  Network,
  ShieldCheck,
  Users,
  type LucideIcon,
} from "lucide-react";
import { segregationLevel } from "@/lib/precog/scoring/bands";
import { CONFLICT_RULES, entitlementLabel } from "@/lib/precog/sod/conflict-rules";
import {
  belowThresholdNote,
  dualReleaseSplit,
  openSeverityCounts,
  partialDualReleaseCoverage,
} from "@/lib/precog/sod/open-findings";
import { sodScopeLine } from "@/lib/precog/integrations/drift-signals";
import type { NavFn } from "@/lib/precog/navigation";
import { usePresentation } from "@/lib/precog/presentation";
import type { SodDetectionReport } from "@/lib/precog/sod/detect";
import { DualReleasePanel } from "@/components/precog/dual-release-panel";
import { PageIntro } from "@/components/precog/page-intro";
import { PowerMapBuilder } from "@/components/precog/power-map-builder";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { buttonClass } from "@/components/ui/button-variants";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { StatTile } from "@/components/ui/stat-tile";
import { joinWithAnd } from "@/lib/precog/text";
import { TeamLink } from "@/components/precog/team-link";
import { SodConflictsSection } from "./sod-conflicts-section";
import { SodControlsSection } from "./sod-controls-section";
import { SodMatrixSection } from "./sod-matrix-section";
import { SodRolesSection } from "./sod-roles-section";
import { useSodPanel, type SodPanelModel, type SodView } from "./use-sod-panel";

export function SodPanel({
  onNavigate,
  report: shellReport,
  initialView,
}: {
  onNavigate?: NavFn;
  /** The shell's report for this business, so the tab does not run the check again. */
  report?: SodDetectionReport;
  /** The view the address names (`?tab=sod&item=controls`); any other value opens Duty conflicts. */
  initialView?: string | null;
}) {
  const { say } = usePresentation();
  const model = useSodPanel(shellReport, initialView, onNavigate);
  const { profile, report, sodExamples, titleDuties, titleDutyNames, view, setView } = model;
  const health = report.summary.segregationHealth;
  // Never "strong" or "adequate" while a critical or high finding is open.
  const open = openSeverityCounts(report.conflicts, profile.dualRelease);
  const level = segregationLevel(health, open);
  // The open tiles count what dual release covers only above a threshold; say why.
  const belowNote = belowThresholdNote(open);
  const { reduced } = dualReleaseSplit(
    report.conflicts,
    partialDualReleaseCoverage(profile.dualRelease, report.conflicts),
  );
  // The findings cover only the people on the map; say so when the books show more.
  const scope = sodScopeLine(profile.integrationDriftSummary);
  const offTeamDuties = dutiesOffTeam(profile.setupAnswers);
  const unheldDuties = report.summary.unheldDuties.filter((d) => !offTeamDuties.has(d));

  return (
    <div className="space-y-4">
      <section className="matrix-grid rounded-2xl border border-border bg-surface p-6">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="accent">Duty conflicts</Badge>
          <Badge variant={profile.dualRelease.enabled ? "ok" : "warn"}>
            Dual release {profile.dualRelease.enabled ? "on" : "off"}
          </Badge>
          <Link
            to="/"
            search={{ tab: "team" }}
            className={buttonClass({ variant: "secondary", size: "sm", className: "ml-auto" })}
          >
            Edit the team
          </Link>
        </div>
        <PageIntro
          tab="sod"
          className="mt-3"
          purpose="Who can move money, or hide it, on their own, and where a second person stops them."
          method={
            <>
              <p>
                Precog checks every pair of duties a person holds against {CONFLICT_RULES.length}{" "}
                named rules, plus a catch-all for related duties in the same process. Turning on
                dual release puts a second person on the payment channels you choose; the conflicts
                it covers drop in rank and say so.
              </p>
              <div className="grid gap-3 md:grid-cols-2">
                {FRAMEWORK_DUTIES.map((f) => (
                  <Card key={f.duty}>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm">{f.duty}</CardTitle>
                      <CardDescription>{f.meaning}</CardDescription>
                    </CardHeader>
                    <CardContent>
                      <p className="text-xs text-muted">{sodExamples[f.key]}</p>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </>
          }
        />
      </section>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
        <StatTile
          label={say("Duties kept apart", "Duty separation")}
          value={String(health)}
          hint={`0 to 100 · ${level} · Precog's index`}
          tone={level === "critical" ? "danger" : level === "weak" ? "warn" : "ok"}
        />
        <StatTile
          label="Critical open"
          value={String(report.summary.critical)}
          hint="Not closed by dual release"
          tone="danger"
        />
        <StatTile
          label="High open"
          value={String(report.summary.high)}
          hint="Not closed by dual release"
          tone="warn"
        />
        <StatTile
          label="Narrowed by dual release"
          value={String(report.summary.dualReleaseMitigated)}
          hint={
            reduced > 0
              ? `${reduced} still open below the threshold`
              : "Two people needed above the threshold"
          }
          tone="ok"
        />
        <StatTile
          label="People"
          value={String(report.summary.peopleWithConflicts)}
          hint={`of ${report.assignments.length}`}
          tone="primary"
        />
        <StatTile
          label="No decision yet"
          value={String(model.withoutDecision)}
          hint="Open, with no logged decision"
          tone="warn"
        />
      </div>
      {belowNote && (
        <p className="rounded-md border border-warn/30 bg-warn/5 px-3 py-2 text-xs text-muted">
          {say("Duties kept apart", "Duty separation")} reads {level}. {belowNote}
        </p>
      )}
      {unheldDuties.length > 0 && (
        <p className="rounded-md border border-warn/30 bg-warn/5 px-3 py-2 text-xs text-muted">
          You have marked nobody still working here for:{" "}
          {unheldDuties.map(entitlementLabel).join(", ")}. Somebody does each of these in every
          business that handles money; mark who, or the map cannot see that seat.
        </p>
      )}
      {scope && (
        <p className="rounded-md border border-warn/30 bg-warn/5 px-3 py-2 text-xs text-muted">
          {scope}
        </p>
      )}

      {titleDuties && (
        <div className="rounded-md border border-warn/30 bg-warn/5 px-3 py-2 text-sm leading-relaxed text-muted">
          <p>
            {titleDuties} Confirm them under Team: {joinWithAnd(titleDutyNames, 6)}.
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            <TeamLink className={buttonClass({ size: "sm" })}>
              <Network className="size-3.5" aria-hidden />
              Open Team
            </TeamLink>
            <Button size="sm" variant="secondary" onClick={model.confirmTitleGuesses}>
              I checked them: they are right
            </Button>
          </div>
        </div>
      )}

      <ViewSwitcher model={model} />

      <div role="tabpanel" id={`sod-view-${view}`} aria-labelledby={`sod-tab-${view}`}>
        {view === "dual" && (
          <DualReleasePanel
            onOpenSod={() => setView("conflicts")}
            onOpenFailure={() => onNavigate?.("precog", "failure:safeguard:dual_release")}
          />
        )}
        {view === "power" && <PowerMapBuilder />}
        {view === "conflicts" && <SodConflictsSection model={model} onNavigate={onNavigate} />}
        {view === "matrix" && <SodMatrixSection report={report} />}
        {view === "roles" && <SodRolesSection model={model} />}
        {view === "controls" && <SodControlsSection onNavigate={onNavigate} />}
      </div>
    </div>
  );
}

function ViewSwitcher({ model }: { model: SodPanelModel }) {
  const { view, setView, report } = model;
  const views: { id: SodView; label: string; icon: LucideIcon }[] = [
    { id: "power", label: "Duty assignments", icon: Network },
    { id: "dual", label: "Dual release", icon: ShieldCheck },
    { id: "conflicts", label: `Duty conflicts (${report.conflicts.length})`, icon: AlertTriangle },
    { id: "matrix", label: "Duty conflict matrix", icon: Grid3x3 },
    { id: "roles", label: "Duties by person", icon: Users },
    { id: "controls", label: "Controls", icon: ListChecks },
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
  {
    key: "authorization",
    duty: "Authorization",
    meaning: "Approve before money or adjustments move",
  },
  { key: "custody", duty: "Custody", meaning: "Handle assets (cash, checks, bank release)" },
  { key: "recording", duty: "Recording", meaning: "Post transactions in books / systems" },
  { key: "reconciliation", duty: "Reconciliation", meaning: "Independent verification" },
] as const;
