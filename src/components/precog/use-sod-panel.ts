import { useCallback, useMemo, useState } from "react";
import type { NavFn } from "@/lib/precog/navigation";
import {
  detectSodConflicts,
  sodDetectionOptions,
  type SodDetectionReport,
} from "@/lib/precog/sod/detect";
import { usePractice, useTemplate } from "@/lib/precog/practice-context";
import { teamSource } from "@/lib/precog/team-source";
import { getIndustryCopy } from "@/lib/precog/templates/industry-copy";
import {
  confirmTitleDuties,
  peopleWithTitleDuties,
  titleDutiesSentence,
} from "@/lib/precog/sod/title-duties";
import { businessLocations, locationsById, worksAt } from "@/lib/precog/person-location";
import { findingsWithoutDecision } from "@/lib/precog/decisions/not-valid";
import { openSeverityCountsOf, partialDualReleaseCoverage } from "@/lib/precog/sod/open-findings";
import { openConflictHeadline } from "@/lib/precog/headline/open-conflicts";
import { rulesDualReleaseCanNarrow, type ConflictSeverity } from "./sod-conflict-view";

/** The six views an address can name (`?tab=sod&item=matrix`); every one keeps working. */
export type SodView = "conflicts" | "matrix" | "roles" | "dual" | "power" | "controls";

const SOD_VIEWS: readonly SodView[] = ["conflicts", "matrix", "roles", "dual", "power", "controls"];

/**
 * The three sub-tabs on screen, one per question: who holds which duties,
 * which pairs conflict, and what stops a person acting alone.
 */
export type SodGroup = "duties" | "conflicts" | "safeguards";

export const SOD_GROUP_OF: Record<SodView, SodGroup> = {
  power: "duties",
  roles: "duties",
  conflicts: "conflicts",
  matrix: "conflicts",
  controls: "safeguards",
  dual: "safeguards",
};

/** The view a sub-tab opens on; the other views in the group are sections below it. */
export const SOD_GROUP_HOME: Record<SodGroup, SodView> = {
  duties: "power",
  conflicts: "conflicts",
  safeguards: "controls",
};

/** The view an address names (`?tab=sod&item=controls`), or null for any other item. */
export function sodViewFrom(item: string | null | undefined): SodView | null {
  return item && (SOD_VIEWS as readonly string[]).includes(item) ? (item as SodView) : null;
}

/** The section an address scrolls to: a view that is not its sub-tab's first one. */
export function sodSectionFrom(item: string | null | undefined): SodView | null {
  const view = sodViewFrom(item);
  return view && SOD_GROUP_HOME[SOD_GROUP_OF[view]] !== view ? view : null;
}

/**
 * The duty-conflict tab's state and the report every view reads. The shell
 * passes the report it already computed from the same template, staff and
 * dual release, so one edit runs the check once, not twice.
 */
export function useSodPanel(
  shellReport?: SodDetectionReport,
  initialView?: string | null,
  onNavigate?: NavFn,
) {
  const tpl = useTemplate();
  const { profile, setCustomPeople, addDecision } = usePractice();
  // People and their duty pairs first; the dual-release policy is one step away.
  const [view, setShownView] = useState<SodView>(() => sodViewFrom(initialView) ?? "conflicts");
  // A later link (?tab=sod&item=controls) switches the view in place, so the
  // severity and location filters stay as the owner left them.
  // The matrix sits folded under the conflict list; a link to it opens the fold.
  const [matrixOpen, setMatrixOpen] = useState(sodViewFrom(initialView) === "matrix");
  const [viewFor, setViewFor] = useState(initialView ?? null);
  if ((initialView ?? null) !== viewFor) {
    setViewFor(initialView ?? null);
    const next = sodViewFrom(initialView) ?? "conflicts";
    setShownView(next);
    if (next === "matrix") setMatrixOpen(true);
  }
  // Every view change also goes into the address, so a reload or a copied
  // link opens the view on screen.
  const setView = useCallback(
    (next: SodView) => {
      setShownView(next);
      if (next === "matrix") setMatrixOpen(true);
      onNavigate?.("sod", next);
    },
    [onNavigate],
  );
  const group = SOD_GROUP_OF[view];
  const openGroup = useCallback((next: SodGroup) => setView(SOD_GROUP_HOME[next]), [setView]);
  const [filterSeverity, setFilterSeverity] = useState<ConflictSeverity | "all">("all");
  // null: people with no location on record.
  const [location, setLocation] = useState<string | null | "all">("all");

  const report = useMemo(
    () =>
      shellReport ??
      detectSodConflicts(tpl, profile.staff, sodDetectionOptions(tpl, profile.dualRelease)),
    [shellReport, tpl, profile.staff, profile.dualRelease],
  );
  // Rules dual release covers only above a threshold: their pairs stay open.
  const partial = useMemo(
    () => partialDualReleaseCoverage(profile.dualRelease, report.conflicts),
    [profile.dualRelease, report.conflicts],
  );
  // The open count every screen gives (headline/open-conflicts), with its
  // parts and its findings: the tile, the sub-tab, the location filter and the
  // list under them all read this one object.
  const headline = useMemo(() => openConflictHeadline(report, partial), [report, partial]);
  // The open critical and high findings that cap the band word, from the same findings.
  const openSeverity = useMemo(() => openSeverityCountsOf(headline.findings), [headline]);
  // Open findings nobody has logged a decision on: the "No decision yet" tile.
  // It reads the same decided-on rule as the pilot metrics, so the two move together.
  const withoutDecision = useMemo(
    () =>
      findingsWithoutDecision(report.conflicts, partial, profile.decisions, profile.industry)
        .length,
    [report.conflicts, partial, profile.decisions, profile.industry],
  );
  const narrowable = useMemo(
    () => rulesDualReleaseCanNarrow(profile.dualRelease),
    [profile.dualRelease],
  );

  // Duties still guessed from job titles: the findings rest on them.
  const titleDuties = teamSource(profile) === "own" ? titleDutiesSentence(tpl.people) : "";
  const titleDutyNames = peopleWithTitleDuties(tpl.people).map((person) => person.name);

  // A business with two or more locations: say where each person works, and
  // let the owner look at one location at a time.
  const locations = useMemo(() => businessLocations(tpl.people), [tpl.people]);
  const placesOf = useMemo(() => locationsById(tpl.people), [tpl.people]);
  const unplaced = report.conflicts.some((c) => !placesOf.has(c.personId));
  const shownLocation =
    location === "all" || location === null || locations.includes(location) ? location : "all";

  const filtered = report.conflicts
    .filter((c) => filterSeverity === "all" || c.severity === filterSeverity)
    .filter(
      (c) =>
        locations.length < 2 ||
        shownLocation === "all" ||
        worksAt(placesOf.get(c.personId), shownLocation),
    );
  // The list under the open count shows the open findings first, the ones the
  // count and the location buttons count; the owner's own pairs and pairs dual
  // release covers at every amount follow in a folded group of their own.
  const openSet = new Set(headline.findings);
  const filteredOpen = filtered.filter((c) => openSet.has(c));
  const filteredNotOpen = filtered.filter((c) => !openSet.has(c));

  function confirmTitleGuesses() {
    setCustomPeople((people) => confirmTitleDuties(people));
  }

  return {
    profile,
    report,
    headline,
    openSeverity,
    withoutDecision,
    addDecision,
    narrowable,
    sodExamples: getIndustryCopy(profile.industry).sodExamples,
    titleDuties,
    titleDutyNames,
    view,
    setView,
    group,
    openGroup,
    matrixOpen,
    setMatrixOpen,
    filterSeverity,
    setFilterSeverity,
    locations,
    placesOf,
    unplaced,
    shownLocation,
    setLocation,
    filteredOpen,
    filteredNotOpen,
    confirmTitleGuesses,
  };
}

export type SodPanelModel = ReturnType<typeof useSodPanel>;
