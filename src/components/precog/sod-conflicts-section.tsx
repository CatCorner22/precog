import { useState } from "react";
import { FileText, Shield } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { NavFn } from "@/lib/precog/navigation";
import { useTemplate } from "@/lib/precog/practice-context";
import { conflictProcedureLink } from "@/lib/precog/procedures/rule-procedures";
import { useTabName } from "@/lib/precog/presentation";
import { worksAt } from "@/lib/precog/person-location";
import type { DetectedConflict } from "@/lib/precog/sod/detect";
import { count, joinWithAnd } from "@/lib/precog/text";
import { cn } from "@/lib/utils";
import { RuleCaseCard } from "./case-card";
import { IndexBasis } from "./index-basis";
import { ConflictDecision } from "./sod-conflict-decision";
import { ConflictSummary } from "./sod-conflict-summary";
import { conflictsByPerson, SEVERITY_FILTERS } from "./sod-conflict-view";
import type { SodPanelModel } from "./use-sod-panel";

/** Cards shown per person before "Show more". */
const CARDS_PER_PERSON = 3;

export function SodConflictsSection({
  model,
  onNavigate,
}: {
  model: SodPanelModel;
  onNavigate?: NavFn;
}) {
  const { report, filterSeverity, setFilterSeverity, locations, placesOf, filtered } = model;
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(new Set());

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Shield className="size-4" />
          Detected conflicts
        </CardTitle>
        <CardDescription>
          Each pair of duties one person holds, whether dual release narrows it, and whether you
          have accepted the risk. Precog lists the most severe first; each card names who holds the
          pair and the staffing that leaves it open.
        </CardDescription>
        <IndexBasis />
        <div
          role="group"
          aria-label="Show duty conflicts of one severity"
          className="flex flex-wrap gap-1.5 pt-2"
        >
          {SEVERITY_FILTERS.map((option) => (
            <button
              key={option.id}
              type="button"
              aria-pressed={filterSeverity === option.id}
              onClick={() => setFilterSeverity(option.id)}
              className={cn(
                "rounded-full border px-2.5 py-0.5 text-xs",
                filterSeverity === option.id
                  ? "border-primary/40 bg-primary/10"
                  : "border-border bg-elevated text-muted",
              )}
            >
              {option.label}
            </button>
          ))}
        </div>
        {locations.length > 1 && <LocationFilter model={model} />}
      </CardHeader>
      <CardContent className="space-y-4">
        {report.recommendations.length > 0 && (
          <div className="rounded-lg border border-border bg-panel p-3">
            <p className="text-xs font-medium tracking-wide text-subtle uppercase">
              What to do first
            </p>
            <ul className="mt-2 space-y-1 text-sm text-muted">
              {report.recommendations.map((r) => (
                <li key={r}>· {r}</li>
              ))}
            </ul>
          </div>
        )}
        {filtered.length === 0 && (
          <p className="text-sm text-muted">No duty conflicts in this filter.</p>
        )}
        {conflictsByPerson(filtered).map((group) => {
          const open = expanded.has(group.personId);
          const shown = open ? group.conflicts : group.conflicts.slice(0, CARDS_PER_PERSON);
          const hidden = group.conflicts.length - shown.length;
          const places = placesOf.get(group.personId);
          return (
            <section key={group.personId} aria-label={group.personName} className="space-y-2">
              <h3 className="text-sm font-semibold">
                {group.personName}
                <span className="font-normal text-muted">
                  {" "}
                  · {group.role}
                  {places && places.length > 0 && ` · ${joinWithAnd(places)}`} ·{" "}
                  {count(group.conflicts.length, "conflict")}
                </span>
              </h3>
              {shown.map((c) => (
                <ConflictCardDetails
                  key={c.id}
                  conflict={c}
                  model={model}
                  onNavigate={onNavigate}
                />
              ))}
              {hidden > 0 && (
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 text-xs"
                  onClick={() => setExpanded((current) => new Set(current).add(group.personId))}
                >
                  Show {hidden} more for {group.personName}
                </Button>
              )}
            </section>
          );
        })}
      </CardContent>
    </Card>
  );
}

/** One conflict with what is in place, what to do until the duties are split, the case, and links. */
function ConflictCardDetails({
  conflict: c,
  model,
  onNavigate,
}: {
  conflict: DetectedConflict;
  model: SodPanelModel;
  onNavigate?: NavFn;
}) {
  const stillToDo = c.compensatingControls.filter((x) => !c.controlsInPlace.includes(x));
  const tabName = useTabName();
  const tpl = useTemplate();
  // The written procedure for this pair: the business's own once started, else
  // the recommendation, which the Procedures tab highlights ready to start.
  const procedure = conflictProcedureLink(
    c.ruleId,
    model.profile.procedures ?? [],
    tpl.knowledge,
    model.profile.industry,
  );
  return (
    <ConflictSummary
      conflict={c}
      staff={model.profile.staff}
      dualRelease={model.profile.dualRelease}
    >
      <p className="mt-1 text-xs text-subtle">Fraud path: {c.fraudPath}</p>
      {c.controlsInPlace.length > 0 && (
        <p className="mt-2 text-xs text-ok">Already in place: {c.controlsInPlace.join("; ")}</p>
      )}
      {stillToDo.length > 0 && (
        <p className="mt-2 text-xs text-muted">
          Until different people hold the duties: {stillToDo.join("; ")}
        </p>
      )}
      {procedure && (
        <button
          type="button"
          className="mt-1 inline-flex items-center gap-1 text-left text-xs text-primary underline-offset-2 [overflow-wrap:anywhere] hover:underline"
          onClick={() => onNavigate?.("procedures", procedure.item)}
        >
          <FileText className="size-3.5 shrink-0" aria-hidden />
          Written procedure: {procedure.title}
        </button>
      )}
      {/*
        The case that makes this duty conflict concrete. Without it a duty conflict
        reads as an auditor's preference; with it, the owner can see what the
        same arrangement cost a real business and how long it ran before
        anyone noticed.
      */}
      <RuleCaseCard ruleId={c.ruleId} industryId={model.profile.industry} className="mt-2" />
      <div className="mt-2 flex flex-wrap gap-1">
        {c.linkedScenarioId && (
          <Button
            size="sm"
            variant="secondary"
            className="h-7 text-xs"
            onClick={() => onNavigate?.("precog", c.linkedScenarioId)}
          >
            Open the scenario
          </Button>
        )}
        {c.processIds[0] && (
          <Button
            size="sm"
            variant="ghost"
            className="h-7 text-xs"
            onClick={() => onNavigate?.("map", c.processIds[0])}
          >
            {tabName("map")}
          </Button>
        )}
        {!c.dualReleaseMitigated && model.narrowable.has(c.ruleId) && (
          <Button
            size="sm"
            variant="outline"
            className="h-7 text-xs"
            onClick={() => model.setView("dual")}
          >
            Configure dual release
          </Button>
        )}
      </div>
      <ConflictDecision conflict={c} model={model} />
    </ConflictSummary>
  );
}

function LocationFilter({ model }: { model: SodPanelModel }) {
  const { report, locations, placesOf, unplaced, shownLocation, setLocation } = model;
  return (
    <div
      role="group"
      aria-label="Show duty conflicts for one location"
      className="flex flex-wrap items-center gap-1.5 pt-1"
    >
      <span className="text-xs text-muted">Location:</span>
      {[
        { key: "all", label: "All locations", value: "all" as const },
        ...locations.map((place) => ({ key: place, label: place, value: place })),
        ...(unplaced ? [{ key: "none", label: "No location given", value: null }] : []),
      ].map((option) => {
        const count =
          option.value === "all"
            ? report.conflicts.length
            : report.conflicts.filter((c) => worksAt(placesOf.get(c.personId), option.value))
                .length;
        return (
          <button
            key={option.key}
            type="button"
            aria-pressed={shownLocation === option.value}
            onClick={() => setLocation(option.value)}
            className={cn(
              "rounded-full border px-2.5 py-0.5 text-xs",
              shownLocation === option.value
                ? "border-primary/40 bg-primary/10"
                : "border-border bg-elevated text-muted",
            )}
          >
            {option.label} ({count})
          </button>
        );
      })}
    </div>
  );
}
