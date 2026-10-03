import { CoverageList } from "./power-map-parts";
import { StatTile } from "@/components/ui/stat-tile";
import { roleWithPlaces } from "@/lib/precog/person-location";
import { AlertTriangle, ShieldCheck, UserRoundCheck, Users } from "lucide-react";
import { JOB_CATALOG } from "@/lib/precog/onboarding/job-catalog";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { riskTone } from "@/lib/precog/scoring/bands";
import { usePresentation, useTabName } from "@/lib/precog/presentation";
import type { PowerMapBuilderModel } from "./use-power-map-builder";

export function PowerMapOverviewSection({ model }: { model: PowerMapBuilderModel }) {
  const { say } = usePresentation();
  const tabName = useTabName();
  const {
    assignments,
    coverage,
    report,
    criticalCount,
    setSelectedId,
    powerIndex,
    selectedId,
    placesOf,
  } = model;

  return (
    <>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile
          icon={Users}
          label="People / jobs"
          value={String(assignments.length)}
          hint={`${JOB_CATALOG.length} job titles to simulate a hire`}
        />
        <StatTile
          icon={UserRoundCheck}
          label="Stand-in cover (Precog's index, 0 to 100)"
          value={String(coverage.resilienceScore)}
          hint={`${coverage.singlePoints.length} high-risk duties with one holder · ${coverage.unassigned.length} duties nobody holds. Counts only duties that need a stand-in, and assumes your own staff do every duty.`}
          tone={coverage.unassigned.length > 0 ? "danger" : "primary"}
        />
        <StatTile
          icon={AlertTriangle}
          label="All pairs found, including the owner's own"
          value={String(report.conflicts.length)}
          hint={`${report.summary.peopleWithConflicts} people with an open one`}
          tone={report.conflicts.length > 0 ? "danger" : "primary"}
        />
        <StatTile
          icon={ShieldCheck}
          label="Critical open"
          value={String(criticalCount)}
          hint={`${say("Duties kept apart", "Duty separation")} ${report.summary.segregationHealth}/100`}
          tone={criticalCount > 0 ? "danger" : "primary"}
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">How much each person can do alone</CardTitle>
          <CardDescription>
            How much one person can do alone: Precog&apos;s index, 0 to 100, from how many heavily
            weighted duties they hold, across how many kinds of work, how many only they hold, and
            how many conflicts. Red from 75, amber from 50. Use it to decide whose work to review,
            not as a finding.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-2 lg:grid-cols-2">
          {powerIndex.slice(0, 8).map((person) => (
            <button
              key={person.personId}
              type="button"
              onClick={() => setSelectedId(person.personId)}
              className={cn(
                "rounded-xl border p-3 text-left",
                selectedId === person.personId
                  ? "border-primary/50 bg-primary/10"
                  : "border-border bg-elevated",
              )}
            >
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-medium">{person.personName}</p>
                  <p className="text-xs text-subtle">
                    {roleWithPlaces(person.role, placesOf.get(person.personId))}
                  </p>
                </div>
                <span
                  className={cn(
                    "text-lg font-semibold tabular",
                    AUTHORITY_TEXT[riskTone(person.authorityIndex)],
                  )}
                >
                  {person.authorityIndex}
                </span>
              </div>
              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-bg">
                <div
                  className={cn(
                    "h-full rounded-full",
                    AUTHORITY_BAR[riskTone(person.authorityIndex)],
                  )}
                  style={{ width: `${person.authorityIndex}%` }}
                />
              </div>
              <p className="mt-2 text-xs text-subtle">
                {person.familyCount} kinds of work · {person.exclusiveDutyCount} duties only they
                hold · {person.conflictCount} conflicts
              </p>
            </button>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Coverage & continuity</CardTitle>
          <CardDescription>
            Separation asks whether one person can move and hide money. Stand-in cover asks whether
            each duty has a trained stand-in. Fix both before you change anyone&apos;s access.
            Stand-in suggestions for these duties are under {tabName("knowledge")}.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 lg:grid-cols-2 xl:grid-cols-4">
          <CoverageList
            title="Unassigned duties"
            empty="Every duty has an owner."
            items={coverage.unassigned.map((item) => ({
              id: item.entitlementId,
              label: item.label,
              detail: `Weight ${item.riskWeight} of 5 · assign someone, or leave it if nobody does this here`,
            }))}
            danger
          />
          <CoverageList
            title="Critical single points"
            empty="Every high-risk duty has a stand-in."
            items={coverage.singlePoints.map((item) => ({
              id: item.entitlementId,
              label: item.label,
              detail: `${item.assignees[0]?.personName} is the only assignee · name a trained stand-in`,
            }))}
          />
          <CoverageList
            title="Many heavy duties in one person"
            empty="Nobody holds four or more duties of weight 4 or 5."
            items={coverage.highRiskConcentration.map((item) => ({
              id: item.personId,
              label: item.personName,
              detail: `${item.count} duties of weight 4 or 5 · review what they do and who checks it`,
            }))}
          />
          <CoverageList
            title="Keep to as few people as possible"
            empty="Nobody holds bulk export, access, admin, backup or log duties."
            items={coverage.keepFew.map((item) => ({
              id: item.entitlementId,
              label: item.label,
              detail:
                item.assignees.length > 1
                  ? `Held by ${item.assignees.length}: ${item.assignees.map((a) => a.personName).join(", ")} · check each one needs it`
                  : `Held by 1: ${item.assignees[0]?.personName}`,
            }))}
            danger={coverage.keepFew.some((item) => item.assignees.length > 1)}
          />
        </CardContent>
      </Card>
    </>
  );
}

/** A person's authority on RISK_SCALE; below "Worth doing" it stays the plain accent. */
const AUTHORITY_TEXT: Record<ReturnType<typeof riskTone>, string> = {
  danger: "text-danger",
  warn: "text-warn",
  ok: "text-primary",
};

const AUTHORITY_BAR: Record<ReturnType<typeof riskTone>, string> = {
  danger: "bg-danger",
  warn: "bg-warn",
  ok: "bg-primary",
};
