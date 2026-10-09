import { useMemo, useState } from "react";
import { ChevronDown, FileText, Shield } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { NavFn } from "@/lib/precog/navigation";
import { useTemplate } from "@/lib/precog/practice-context";
import { conflictProcedureLink, RULE_PROCEDURE } from "@/lib/precog/procedures/rule-procedures";
import { useTabName } from "@/lib/precog/presentation";
import { worksAt } from "@/lib/precog/person-location";
import type { DetectedConflict } from "@/lib/precog/sod/detect";
import { teamOwnerId } from "@/lib/precog/sod/owner-role";
import { moneyCycleHolders } from "@/lib/precog/sod/recommendations";
import { count, joinWithAnd } from "@/lib/precog/text";
import { cn } from "@/lib/utils";
import { RuleCaseCard } from "./case-card";
import { IndexBasis } from "./index-basis";
import { ConflictDecision } from "./sod-conflict-decision";
import { ConflictSummary } from "./sod-conflict-summary";
import { conflictsByPerson, listOrderNote, SEVERITY_FILTERS } from "./sod-conflict-view";
import type { SodPanelModel } from "./use-sod-panel";

/** Cards shown per person before "Show more". */
const CARDS_PER_PERSON = 3;
/**
 * How many recommendations the What to do first box shows under the first
 * step before folding the rest: Start here lists three actions, and this box
 * leads with the first of them, so two more explain the findings without
 * restating the page.
 */
const SHOWN_RECOMMENDATIONS = 2;

export function SodConflictsSection({
  model,
  onNavigate,
}: {
  model: SodPanelModel;
  onNavigate?: NavFn;
}) {
  const { report, filterSeverity, setFilterSeverity, locations, filteredOpen, filteredNotOpen } =
    model;
  const tpl = useTemplate();
  const { procedures, industry } = model.profile;
  // The written procedure each pair leads to: the business's own once
  // started, else the recommendation, which the Procedures tab highlights
  // ready to start. Worked out once per rule, not on every card.
  const procedureLinks = useMemo(
    () =>
      new Map(
        Object.keys(RULE_PROCEDURE).map((ruleId) => [
          ruleId,
          conflictProcedureLink(ruleId, procedures ?? [], tpl.knowledge, industry),
        ]),
      ),
    [procedures, tpl.knowledge, industry],
  );
  const orderNote = listOrderNote(
    filteredOpen,
    moneyCycleHolders(report.assignments, teamOwnerId(report.assignments, industry)),
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Shield className="size-4" />
          Detected conflicts
        </CardTitle>
        <CardDescription>
          {orderNote ??
            "Each pair of duties one person holds, most severe first: who holds it, whether dual release narrows it, and whether you accepted the risk."}
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
                "rounded-full border px-2.5 py-0.5 text-xs pointer-coarse:min-h-11",
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
        {(model.firstStep || report.recommendations.length > 0) && (
          <div className="rounded-lg border border-border bg-panel p-3">
            <p className="text-xs font-medium tracking-wide text-subtle uppercase">
              What to do first
            </p>
            {/*
              One first step on every screen: the step Start here lists first
              leads, and the recommendations under it explain the findings.
            */}
            <ul data-box="what-to-do-first" className="mt-2 space-y-1 text-sm text-muted">
              {model.firstStep && (
                <li className="text-fg">
                  · <span className="font-medium">First, as on Start here:</span> {model.firstStep}
                </li>
              )}
              {report.recommendations.slice(0, SHOWN_RECOMMENDATIONS).map((r) => (
                <li key={r}>· {r}</li>
              ))}
            </ul>
            {report.recommendations.length > SHOWN_RECOMMENDATIONS && (
              <details className="mt-2 text-sm text-muted">
                <summary className="cursor-pointer text-xs font-medium text-primary">
                  {`Show the other ${count(report.recommendations.length - SHOWN_RECOMMENDATIONS, "recommendation")}`}
                </summary>
                <ul className="mt-2 space-y-1">
                  {report.recommendations.slice(SHOWN_RECOMMENDATIONS).map((r) => (
                    <li key={r}>· {r}</li>
                  ))}
                </ul>
              </details>
            )}
          </div>
        )}
        {filteredOpen.length === 0 && (
          <p className="text-sm text-muted">
            {filteredNotOpen.length === 0
              ? "No duty conflicts in this filter."
              : "No open duty conflicts in this filter."}
          </p>
        )}
        <div data-list="open" aria-label="Open duty conflicts" className="space-y-4">
          <ConflictsByPerson
            conflicts={filteredOpen}
            model={model}
            procedureLinks={procedureLinks}
            onNavigate={onNavigate}
          />
        </div>
        {filteredNotOpen.length > 0 && (
          <details data-list="not-open" className="group rounded-xl border border-border">
            <summary className="flex cursor-pointer items-center gap-2 px-4 py-2 text-sm font-medium">
              <ChevronDown
                className="size-4 transition-transform group-open:rotate-180"
                aria-hidden
              />
              Not counted as open ({filteredNotOpen.length}): your own pairs and pairs dual release
              covers at every amount
            </summary>
            <div className="space-y-4 px-4 pb-4">
              <ConflictsByPerson
                conflicts={filteredNotOpen}
                model={model}
                procedureLinks={procedureLinks}
                onNavigate={onNavigate}
              />
            </div>
          </details>
        )}
      </CardContent>
    </Card>
  );
}

/** Conflicts grouped by the person who holds them, a few cards each until "Show more". */
function ConflictsByPerson({
  conflicts,
  model,
  procedureLinks,
  onNavigate,
}: {
  conflicts: readonly DetectedConflict[];
  model: SodPanelModel;
  procedureLinks: ReadonlyMap<string, ReturnType<typeof conflictProcedureLink>>;
  onNavigate?: NavFn;
}) {
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(new Set());
  return conflictsByPerson(conflicts).map((group) => {
    const open = expanded.has(group.personId);
    const shown = open ? group.conflicts : group.conflicts.slice(0, CARDS_PER_PERSON);
    const hidden = group.conflicts.length - shown.length;
    const places = model.placesOf.get(group.personId);
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
            procedure={procedureLinks.get(c.ruleId) ?? null}
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
  });
}

/** One conflict with what is in place, what to do until the duties are split, the case, and links. */
function ConflictCardDetails({
  conflict: c,
  model,
  procedure,
  onNavigate,
}: {
  conflict: DetectedConflict;
  model: SodPanelModel;
  /** The written procedure for this pair (conflictProcedureLink). */
  procedure: ReturnType<typeof conflictProcedureLink>;
  onNavigate?: NavFn;
}) {
  const stillToDo = c.compensatingControls.filter((x) => !c.controlsInPlace.includes(x));
  const tabName = useTabName();
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
          Until you split the duties: {stillToDo.join("; ")}
        </p>
      )}
      {procedure && (
        <button
          type="button"
          className="mt-1 inline-flex items-center gap-1 text-left text-xs text-primary underline-offset-2 [overflow-wrap:anywhere] hover:underline pointer-coarse:min-h-11"
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

/**
 * One button per location, each with its open duty conflicts counted as the
 * tile above counts them (headline/open-conflicts): the owner's own pairs and
 * pairs dual release covers at every amount are left out of every count, as
 * they are left out of the open list under the buttons.
 */
function LocationFilter({ model }: { model: SodPanelModel }) {
  const { headline, locations, placesOf, unplaced, shownLocation, setLocation } = model;
  const open = headline.findings;
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
            ? open.length
            : open.filter((c) => worksAt(placesOf.get(c.personId), option.value)).length;
        return (
          <button
            key={option.key}
            type="button"
            aria-pressed={shownLocation === option.value}
            onClick={() => setLocation(option.value)}
            className={cn(
              "rounded-full border px-2.5 py-0.5 text-xs pointer-coarse:min-h-11",
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
