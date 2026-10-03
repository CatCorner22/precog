import { useCallback, useMemo, useState } from "react";
import type { NavFn } from "@/lib/precog/navigation";
import {
  detectSodConflicts,
  sodDetectionOptions,
  type SodDetectionReport,
} from "@/lib/precog/sod/detect";
import { usePractice, useTemplate } from "@/lib/precog/practice-context";
import { getIndustryCopy } from "@/lib/precog/templates/industry-copy";
import {
  confirmTitleDuties,
  peopleWithTitleDuties,
  titleDutiesSentence,
} from "@/lib/precog/sod/title-duties";
import { businessLocations, locationsById, worksAt } from "@/lib/precog/person-location";
import { rulesDualReleaseCanNarrow, type ConflictSeverity } from "./sod-conflict-view";

export type SodView = "conflicts" | "matrix" | "roles" | "dual" | "power" | "controls";

const SOD_VIEWS: readonly SodView[] = ["conflicts", "matrix", "roles", "dual", "power", "controls"];

/** The view an address names (`?tab=sod&item=controls`), or null for any other item. */
export function sodViewFrom(item: string | null | undefined): SodView | null {
  return item && (SOD_VIEWS as readonly string[]).includes(item) ? (item as SodView) : null;
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
  const { profile, setCustomPeople } = usePractice();
  // People and their duty pairs first; the dual-release policy is one step away.
  const [view, setShownView] = useState<SodView>(() => sodViewFrom(initialView) ?? "conflicts");
  // A later link (?tab=sod&item=controls) switches the view in place, so the
  // severity and location filters stay as the owner left them.
  const [viewFor, setViewFor] = useState(initialView ?? null);
  if ((initialView ?? null) !== viewFor) {
    setViewFor(initialView ?? null);
    setShownView(sodViewFrom(initialView) ?? "conflicts");
  }
  // Every view change also goes into the address, so a reload or a copied
  // link opens the view on screen.
  const setView = useCallback(
    (next: SodView) => {
      setShownView(next);
      onNavigate?.("sod", next);
    },
    [onNavigate],
  );
  const [filterSeverity, setFilterSeverity] = useState<ConflictSeverity | "all">("all");
  // null: people with no location on record.
  const [location, setLocation] = useState<string | null | "all">("all");

  const report = useMemo(
    () =>
      shellReport ??
      detectSodConflicts(tpl, profile.staff, sodDetectionOptions(tpl, profile.dualRelease)),
    [shellReport, tpl, profile.staff, profile.dualRelease],
  );
  const narrowable = useMemo(
    () => rulesDualReleaseCanNarrow(profile.dualRelease),
    [profile.dualRelease],
  );

  // Duties still guessed from job titles: the findings rest on them.
  const titleDuties = profile.customPeople ? titleDutiesSentence(tpl.people) : "";
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

  function confirmTitleGuesses() {
    setCustomPeople((people) => confirmTitleDuties(people));
  }

  return {
    profile,
    report,
    narrowable,
    sodExamples: getIndustryCopy(profile.industry).sodExamples,
    titleDuties,
    titleDutyNames,
    view,
    setView,
    filterSeverity,
    setFilterSeverity,
    locations,
    placesOf,
    unplaced,
    shownLocation,
    setLocation,
    filtered,
    confirmTitleGuesses,
  };
}

export type SodPanelModel = ReturnType<typeof useSodPanel>;
