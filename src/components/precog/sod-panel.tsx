import { useEffect, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { dutiesOffTeam } from "@/lib/precog/onboarding/setup-answers";
import { AlertTriangle, Network, ShieldCheck, type LucideIcon } from "lucide-react";
import { segregationLevel } from "@/lib/precog/scoring/bands";
import { CONFLICT_RULES, entitlementLabel } from "@/lib/precog/sod/conflict-rules";
import { belowThresholdNote } from "@/lib/precog/sod/open-findings";
import { openConflictBreakdown } from "@/lib/precog/headline/open-conflicts";
import { sodScopeLine } from "@/lib/precog/integrations/drift-signals";
import type { NavFn } from "@/lib/precog/navigation";
import { usePresentation } from "@/lib/precog/presentation";
import type { SodDetectionReport } from "@/lib/precog/sod/detect";
import { DualReleasePanel } from "@/components/precog/dual-release-panel";
import { HowThisWorks, PageIntro } from "@/components/precog/page-intro";
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
import {
  sodSectionFrom,
  useSodPanel,
  type SodGroup,
  type SodPanelModel,
  type SodView,
} from "./use-sod-panel";

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
  const { profile, report, headline, openSeverity: open } = model;
  const { sodExamples, titleDuties, titleDutyNames, group, setView } = model;
  // A view that is a section of its sub-tab (matrix, roles, dual) comes into
  // view and takes focus when the address names it, as a tab landing would.
  useEffect(() => {
    const section = sodSectionFrom(initialView);
    if (!section) return;
    const frame = requestAnimationFrame(() => {
      const el = document.getElementById(`sod-section-${section}`);
      el?.scrollIntoView({ block: "start" });
      el?.focus({ preventScroll: true });
    });
    return () => cancelAnimationFrame(frame);
  }, [initialView]);
  const dutiesMarked = report.summary.dutiesMarked;
  const health = report.summary.segregationHealth;
  // Never "strong" or "adequate" while a critical or high finding is open.
  const level = segregationLevel(health, open);
  // The open tiles count what dual release covers only above a threshold; say why.
  const belowNote = belowThresholdNote(open);
  const reduced = headline.reducedNotClosed;
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

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <StatTile
          label={say("Duties kept apart", "Duty separation")}
          value={dutiesMarked ? String(health) : "—"}
          hint={
            dutiesMarked
              ? `0 to 100 · ${level} · Precog's index`
              : "Not assessed: nobody holds a money duty yet"
          }
          tone={
            !dutiesMarked
              ? "default"
              : level === "critical"
                ? "danger"
                : level === "weak"
                  ? "warn"
                  : "ok"
          }
        />
        <StatTile
          label="Open duty conflicts"
          value={String(headline.open)}
          hint={openConflictBreakdown(headline)}
          tone={headline.critical > 0 ? "danger" : headline.open > 0 ? "warn" : "primary"}
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

      <div
        role="tabpanel"
        id={`sod-view-${group}`}
        aria-labelledby={`sod-tab-${group}`}
        className="space-y-4"
      >
        {group === "duties" && (
          <>
            <PowerMapBuilder />
            <Section id="roles" label="Who holds which duties">
              <SodRolesSection model={model} />
            </Section>
          </>
        )}
        {group === "conflicts" && (
          <>
            <SodConflictsSection model={model} onNavigate={onNavigate} />
            <Section id="matrix" label="Duty conflict matrix">
              <HowThisWorks
                summary="Duty conflict matrix: every pair of duties"
                className="max-w-none"
                bodyClassName="text-fg"
                open={model.matrixOpen}
                onToggle={model.setMatrixOpen}
              >
                <SodMatrixSection report={report} />
              </HowThisWorks>
            </Section>
          </>
        )}
        {group === "safeguards" && (
          <>
            <SodControlsSection onNavigate={onNavigate} />
            <Section id="dual" label="Dual release">
              <DualReleasePanel
                onOpenSod={() => setView("conflicts")}
                onOpenFailure={() => onNavigate?.("precog", "failure:safeguard:dual_release")}
              />
            </Section>
          </>
        )}
      </div>
    </div>
  );
}

/** A view below its sub-tab's first one, addressable (`?tab=sod&item=dual`) and focusable. */
function Section({
  id,
  label,
  children,
}: {
  id: Exclude<SodView, "power" | "conflicts" | "controls">;
  label: string;
  children: ReactNode;
}) {
  return (
    <section id={`sod-section-${id}`} tabIndex={-1} aria-label={label} className="scroll-mt-4">
      {children}
    </section>
  );
}

/** The three sub-tabs; Duty conflicts carries the open count, as the tile above it does. */
function ViewSwitcher({ model }: { model: SodPanelModel }) {
  const { group, openGroup } = model;
  const { open } = model.headline;
  const groups: { id: SodGroup; label: string; icon: LucideIcon }[] = [
    { id: "conflicts", label: `Duty conflicts (${open})`, icon: AlertTriangle },
    { id: "duties", label: "Duty assignments", icon: Network },
    { id: "safeguards", label: "Controls", icon: ShieldCheck },
  ];
  return (
    <div role="tablist" aria-label="Who controls what views" className="flex flex-wrap gap-2">
      {groups.map(({ id, label, icon: Icon }) => (
        <Button
          key={id}
          id={`sod-tab-${id}`}
          role="tab"
          aria-selected={group === id}
          aria-controls={`sod-view-${id}`}
          size="sm"
          variant={group === id ? "default" : "secondary"}
          onClick={() => openGroup(id)}
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
