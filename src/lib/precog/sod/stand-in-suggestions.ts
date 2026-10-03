/**
 * Stand-in suggestions for the money duties only one person holds, as Who
 * knows what shows them: the duty coverage, one plan per candidate, and the
 * whole programme applied in turn. One selector, so every screen that offers
 * a stand-in for a duty reads the same plans. The line of business says
 * whether the team has an owner to count on (a nonprofit has none). Pure.
 */
import { analyzeDutyCoverage } from "./coverage-analysis";
import { buildCoveragePlans, buildCoverageProgram } from "./coverage-planner";
import type { RoleAssignment } from "./detect";

export function dutyStandInSuggestions(
  assignments: RoleAssignment[],
  industry: string | undefined,
) {
  return {
    coverage: analyzeDutyCoverage(assignments),
    plans: buildCoveragePlans(assignments, industry),
    program: buildCoverageProgram(assignments, industry),
  };
}
