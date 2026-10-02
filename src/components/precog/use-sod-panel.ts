import { useMemo, useState } from "react";
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

export type SodView = "conflicts" | "matrix" | "roles" | "dual" | "power";

/**
 * The duty-conflict tab's state and the report every view reads. The shell
 * passes the report it already computed from the same template, staff and
 * dual release, so one edit runs the check once, not twice.
 */
export function useSodPanel(shellReport?: SodDetectionReport) {
  const tpl = useTemplate();
  const { profile, setCustomPeople } = usePractice();
  // People and their duty pairs first; the dual-release policy is one step away.
  const [view, setView] = useState<SodView>("conflicts");
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
