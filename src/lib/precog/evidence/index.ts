/**
 * Evidence lookup — the join between what the app recommends and what actually
 * happened to real organizations.
 *
 * The product claim this supports: when the app tells an owner to split a duty
 * or add an approval, it can name the cases that control would have stopped,
 * with the amount and the time it ran undetected. That is a different kind of
 * argument from a risk rating.
 */
import { CASE_LIBRARY } from "./cases";
import { BENCHMARKS, BENCHMARK_BY_ID, METHOD_CAVEATS } from "./benchmarks";
import type { CaseStudy, IndustrySector, SchemeKind } from "./types";

export * from "./types";
export { CASE_LIBRARY, BENCHMARKS, BENCHMARK_BY_ID, METHOD_CAVEATS };

/** Cases demonstrating the failure of a given segregation-of-duties rule. */
export function casesForSodRule(ruleId: string): CaseStudy[] {
  return CASE_LIBRARY.filter((c) => c.sodRuleIds.includes(ruleId));
}

/** Cases for any of several rules, de-duplicated, worst loss first. */
export function casesForSodRules(ruleIds: readonly string[]): CaseStudy[] {
  const wanted = new Set(ruleIds);
  return CASE_LIBRARY.filter((c) =>
    c.sodRuleIds.some((id) => wanted.has(id)),
  ).sort(byLossDescending);
}

/**
 * Cases relevant to a sector, with cross-sector cases included.
 *
 * Cross-sector inclusion is deliberate: the mechanism of a fake-vendor scheme
 * does not change between a dental practice and a restaurant, and an owner
 * learns more from the mechanism than from the industry label.
 */
export function casesForSector(sector: IndustrySector): CaseStudy[] {
  return CASE_LIBRARY.filter(
    (c) => c.sector === sector || c.sector === "any",
  ).sort(byLossDescending);
}

export function casesForScheme(scheme: SchemeKind): CaseStudy[] {
  return CASE_LIBRARY.filter((c) => c.schemes.includes(scheme)).sort(
    byLossDescending,
  );
}

export function caseById(id: string): CaseStudy | undefined {
  return CASE_LIBRARY.find((c) => c.id === id);
}

function byLossDescending(a: CaseStudy, b: CaseStudy): number {
  return b.lossUsd - a.lossUsd;
}

/**
 * Observed loss range across cases carrying a recorded amount.
 *
 * Cases with `lossUsd === 0` are placeholders where the source did not state a
 * reliable total; they are excluded so they cannot drag a range to zero.
 */
export function observedLossRange(cases: readonly CaseStudy[]): {
  low: number;
  median: number;
  high: number;
  n: number;
} | null {
  const amounts = cases
    .map((c) => c.lossUsd)
    .filter((n) => n > 0)
    .sort((a, b) => a - b);
  if (amounts.length === 0) return null;
  const mid = Math.floor(amounts.length / 2);
  return {
    low: amounts[0],
    median:
      amounts.length % 2 === 0
        ? (amounts[mid - 1] + amounts[mid]) / 2
        : amounts[mid],
    high: amounts[amounts.length - 1],
    n: amounts.length,
  };
}

/**
 * Median months a scheme ran before it stopped, across cases that record a
 * duration. This is the number that argues for detective controls: it is the
 * window an owner is choosing to leave open.
 */
export function observedDurationMonths(
  cases: readonly CaseStudy[],
): { median: number; longest: number; n: number } | null {
  const months = cases
    .map((c) => c.durationMonths)
    .filter((n): n is number => typeof n === "number" && n > 0)
    .sort((a, b) => a - b);
  if (months.length === 0) return null;
  const mid = Math.floor(months.length / 2);
  return {
    median:
      months.length % 2 === 0 ? (months[mid - 1] + months[mid]) / 2 : months[mid],
    longest: months[months.length - 1],
    n: months.length,
  };
}

/**
 * The concrete steps that recur across the cases matching these rules, ordered
 * by how many cases each one would have addressed.
 *
 * This is the app's answer to "what do I actually do on Monday." It is derived
 * from the case library rather than from a control framework checklist, so
 * every item on it has already failed somewhere for real.
 */
export function recommendedStepsForRules(
  ruleIds: readonly string[],
): { step: string; supportingCaseIds: string[] }[] {
  const relevant = casesForSodRules(ruleIds);
  const tally = new Map<string, string[]>();
  for (const c of relevant) {
    for (const step of c.wouldHaveCaughtIt) {
      const existing = tally.get(step);
      if (existing) existing.push(c.id);
      else tally.set(step, [c.id]);
    }
  }
  return [...tally.entries()]
    .map(([step, supportingCaseIds]) => ({ step, supportingCaseIds }))
    .sort((a, b) => b.supportingCaseIds.length - a.supportingCaseIds.length);
}
