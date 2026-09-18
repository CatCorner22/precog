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
import { CONTROL_CATALOG, type ControlDefinition, type ControlId } from "./controls";

export * from "./types";
export * from "./controls";
export { CASE_LIBRARY, BENCHMARKS, BENCHMARK_BY_ID, METHOD_CAVEATS };

/** Cases demonstrating the failure of a given segregation-of-duties rule. */
export function casesForSodRule(ruleId: string): CaseStudy[] {
  return CASE_LIBRARY.filter((c) => c.sodRuleIds.includes(ruleId));
}

/**
 * The fraud schemes each segregation-of-duties conflict actually enables.
 *
 * This map is what makes case matching topical rather than arithmetic. Asking
 * "who can create a vendor and also pay it" is asking about shell-vendor
 * billing, so the cases worth showing are the shell-vendor cases — not
 * whichever case happens to cite the fewest rules or carry the largest number.
 */
const RULE_SCHEMES: Record<string, SchemeKind[]> = {
  "rule-cash-rec": ["skimming", "cash-larceny", "check-tampering"],
  "rule-custody-rec": ["skimming", "cash-larceny", "receivables-diversion"],
  "rule-collect-post": ["skimming", "cash-larceny"],
  "rule-deposit-post": ["receivables-diversion", "skimming"],
  "rule-writeoff": ["skimming", "receivables-diversion"],
  "rule-claims-writeoff": ["billing-shell-vendor", "financial-statement"],
  "rule-vendor-create-pay": ["billing-shell-vendor"],
  "rule-vendor-create-approve": ["billing-shell-vendor"],
  "rule-vendor-approve-pay": ["billing-shell-vendor", "corruption"],
  "rule-payroll": ["payroll", "expense-reimbursement"],
  "rule-admin-pay": ["check-tampering", "payroll", "corruption"],
  "rule-admin-writeoff": ["financial-statement", "receivables-diversion"],
};

/** The schemes a set of open conflicts exposes the business to. */
export function schemesForSodRules(ruleIds: readonly string[]): SchemeKind[] {
  const out = new Set<SchemeKind>();
  for (const id of ruleIds) for (const s of RULE_SCHEMES[id] ?? []) out.add(s);
  return [...out];
}

/**
 * Cases matching any of several rules, most relevant first.
 *
 * Ordering runs on three keys, in this priority:
 *
 *   1. Scheme overlap — does this case show the kind of fraud these conflicts
 *      actually enable. This dominates, because an owner asked about vendor
 *      payments learns nothing useful from an unrelated case that happens to
 *      touch the same rule.
 *   2. Rule overlap — how many of the asked-about rules the case demonstrates.
 *   3. Loss amount — among equally apt cases, the costlier one leads.
 *
 * Ranking by loss alone would surface the same few large cases against every
 * finding; ranking by rule count alone rewards cases for being narrow rather
 * than for being on point.
 */
export function casesForSodRules(ruleIds: readonly string[]): CaseStudy[] {
  const wantedRules = new Set(ruleIds);
  const wantedSchemes = new Set(schemesForSodRules(ruleIds));

  return CASE_LIBRARY.filter((c) => c.sodRuleIds.some((id) => wantedRules.has(id)))
    .map((c) => ({
      study: c,
      schemeHits: c.schemes.filter((s) => wantedSchemes.has(s)).length,
      ruleHits: c.sodRuleIds.filter((id) => wantedRules.has(id)).length,
    }))
    .sort(
      (a, b) =>
        b.schemeHits - a.schemeHits ||
        b.ruleHits - a.ruleHits ||
        byLossDescending(a.study, b.study),
    )
    .map((r) => r.study);
}

/**
 * Maps an industry template to the case-library sector.
 *
 * The template system and the case library were built against different
 * vocabularies — a template describes a product vertical, a case describes the
 * trade the victim was in — so the join is explicit rather than assumed.
 * "general" resolving to the cross-sector cases is the honest answer: a
 * business that has not named its trade should be shown the schemes that work
 * anywhere.
 */
export function sectorForIndustry(industryId: string): IndustrySector {
  switch (industryId) {
    case "dental":
      return "dental";
    case "retail":
      return "retail";
    case "restaurant":
      return "restaurant";
    case "professional_services":
      return "professional-services";
    default:
      return "any";
  }
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
 * Controls that recur across the cases matching these rules, ordered by how
 * many of those cases each one would have stopped.
 *
 * Aggregation runs on the canonical control id, not on the prose. Each case
 * phrases a control in its own terms — "the owner opens the bank statement
 * before the controller sees it" and "the bank statement goes to a partner,
 * not the administrator" are the same control — so counting the strings gave
 * every control a count of one and made the ordering meaningless.
 *
 * This is the app's answer to "what do I actually do on Monday", and it is
 * derived from the case library rather than from a framework checklist, so
 * every item on it has already failed somewhere for real.
 */
export function recommendedStepsForRules(
  ruleIds: readonly string[],
): {
  control: ControlDefinition;
  supportingCaseIds: string[];
  /** How this control was phrased in the most relevant supporting case. */
  asApplied: string;
}[] {
  const relevant = casesForSodRules(ruleIds);
  const tally = new Map<ControlId, { caseIds: string[]; asApplied: string }>();

  for (const c of relevant) {
    for (const step of c.wouldHaveCaughtIt) {
      const existing = tally.get(step.control);
      if (existing) {
        // One case can phrase the same control twice; count the case once.
        if (!existing.caseIds.includes(c.id)) existing.caseIds.push(c.id);
      } else {
        // `relevant` is already ordered most-relevant first, so the first
        // phrasing seen is the one from the most apt case.
        tally.set(step.control, { caseIds: [c.id], asApplied: step.asApplied });
      }
    }
  }

  return [...tally.entries()]
    .map(([control, v]) => ({
      control: CONTROL_CATALOG[control],
      supportingCaseIds: v.caseIds,
      asApplied: v.asApplied,
    }))
    .sort(
      (a, b) =>
        b.supportingCaseIds.length - a.supportingCaseIds.length ||
        a.control.label.localeCompare(b.control.label),
    );
}
