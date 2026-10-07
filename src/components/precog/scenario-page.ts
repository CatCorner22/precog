/**
 * Pure rules behind the What could happen page: which scenario is showing,
 * what "This could happen here" records, which prosecuted cases sit beside a
 * scenario, and how a change against the baseline reads.
 */
import type { DecisionInput } from "@/lib/precog/profile-actions";
import type { ScenarioTemplate, StaffComposition } from "@/lib/precog/types";
import { citingCaseStats, isOwnSector, type CaseStudy } from "@/lib/precog/evidence";
import { casesBehindScenario } from "@/lib/precog/evidence/scenario-cases";
import { dateAfter } from "@/lib/precog/dates";
import { count } from "@/lib/precog/text";
import { formatEstimateUsdDelta, formatUsd, formatUsdDelta } from "@/lib/utils";
import { scenarioRuleIds } from "@/lib/precog/scenario-watch";
export { scenarioRuleIds, scenarioWatch, teamClosesPath } from "@/lib/precog/scenario-watch";
export type { ScenarioWatch } from "@/lib/precog/scenario-watch";

export interface ScenarioCases {
  /** Up to three cases to show: cases that cite a linked rule first, the owner's sector first within each group. */
  shown: CaseStudy[];
  /** Every case that cites a linked rule or shares its scheme. */
  total: number;
  /** Only the cases that cite a linked rule; counts and medians rest on these. */
  citing: ReturnType<typeof citingCaseStats>;
  ownSectorIds: ReadonlySet<string>;
}

/** The scenario on screen: the owner's pick when the template has it, else the first. */
export function pickScenario(
  scenarios: readonly ScenarioTemplate[],
  picked: string | null | undefined,
): ScenarioTemplate {
  return scenarios.find((s) => s.id === picked) ?? scenarios[0];
}

/** The decision "This could happen here" logs; confirmedScenarioIds reads it back. */
export function scenarioConfirmation(scenario: ScenarioTemplate, now: Date): DecisionInput {
  return {
    subject: `Scenario: ${scenario.title}`,
    kind: "monitor",
    note: "Confirmed this sample scenario could happen here. Its losses and timelines are still the sample's assumptions; review them against your own figures.",
    reviewBy: dateAfter(now, 90),
    linkedTab: "precog",
    linkedId: scenario.id,
  };
}

/**
 * The prosecuted cases behind a scenario, or null when it has none (a key
 * person leaving gets no case list rather than a loosely related one). The
 * list is `casesBehindScenario` (evidence/scenario-cases: cases the scenario
 * names, then cases showing a duty pair it plays out, whether the rule links
 * to the scenario or the scenario names the rule). Counts and medians use
 * only the cases that cite one of those rules; named cases show first, then
 * citing cases, the owner's line of business first within each group.
 */
export function scenarioCases(
  scenario: Pick<ScenarioTemplate, "id" | "sodRuleIds" | "caseIds">,
  industryId: string,
): ScenarioCases | null {
  const related = casesBehindScenario(scenario);
  if (related.length === 0) return null;
  const ruleIds = scenarioRuleIds(scenario);
  const citing = citingCaseStats(ruleIds);
  const citingIds = new Set(citing.cases.map((c) => c.id));
  const namedIds = new Set(scenario.caseIds ?? []);
  const ownSectorIds = new Set(related.filter((c) => isOwnSector(c, industryId)).map((c) => c.id));
  const rank = (c: CaseStudy) =>
    (namedIds.has(c.id) ? 4 : 0) + (citingIds.has(c.id) ? 2 : 0) + (ownSectorIds.has(c.id) ? 1 : 0);
  const ordered = [...related].sort((a, b) => rank(b) - rank(a));
  return { shown: ordered.slice(0, 3), total: related.length, citing, ownSectorIds };
}

/**
 * Colour for a change against the baseline: lower is better, and a change
 * that rounds to nothing is neutral, never red.
 */
export function deltaTone(delta: number): "ok" | "danger" | "muted" {
  const whole = Math.round(delta);
  return whole < 0 ? "ok" : whole > 0 ? "danger" : "muted";
}

/** A change in scenario dollars: "about -$1,200", "about +$300", or "no change". */
export function formatMoneyChange(delta: number): string {
  return Math.round(delta) === 0 ? "no change" : formatEstimateUsdDelta(delta);
}

/**
 * The change between two scenario dollar figures as their printed estimates
 * give it: "about $29,000" to "about $37,000" reads "about +$8,000", not the
 * exact difference ("about +$7,800"), so a line printed beside the two
 * figures matches a reader's subtraction (estimateUsdChange).
 */
export function formatEstimateChange(change: number): string {
  return change === 0 ? "no change" : `about ${formatUsdDelta(change)}`;
}

/** "-56 days", "+1 day", or "no change". */
export function formatDaysChange(delta: number): string {
  if (delta === 0) return "no change";
  return `${delta > 0 ? "+" : "-"}${count(Math.abs(delta), "day")}`;
}

/** The staffing figures the scenario page lets the owner try without saving. */
const WHAT_IF_FIELDS = [
  "teamSize",
  "soleOwnerKnowledgeCount",
  "segregationScore",
  "dualControlPayments",
  "independentBankRec",
] as const satisfies readonly (keyof StaffComposition)[];

/** True when the what-if differs from the saved staffing in any field the page edits. */
export function whatIfDiffers(saved: StaffComposition, whatIf: StaffComposition): boolean {
  return WHAT_IF_FIELDS.some((field) => saved[field] !== whatIf[field]);
}

/** Figures an own team's duties decide: tried in the what-if, never applied. */
const DUTY_FIELDS: ReadonlySet<(typeof WHAT_IF_FIELDS)[number]> = new Set([
  "segregationScore",
  "independentBankRec",
]);

/**
 * The saved staffing with the what-if's edited fields laid over it; nothing
 * else changes. On the owner's own team the segregation score and the bank
 * reconciliation answer stay as saved: both come from the team's duties, and
 * a tried figure saved over either would move the priority and residual
 * figures with no change in who does what.
 */
export function applyWhatIf(
  saved: StaffComposition,
  whatIf: StaffComposition,
  opts: { ownBusiness: boolean },
): StaffComposition {
  const next = { ...saved };
  for (const field of WHAT_IF_FIELDS) {
    if (opts.ownBusiness && DUTY_FIELDS.has(field)) continue;
    Object.assign(next, { [field]: whatIf[field] });
  }
  return next;
}

/** True when applying the what-if would change the saved staffing (not only a figure the duties decide). */
export function whatIfApplies(
  saved: StaffComposition,
  whatIf: StaffComposition,
  opts: { ownBusiness: boolean },
): boolean {
  return whatIfDiffers(saved, applyWhatIf(saved, whatIf, opts));
}

/**
 * A mitigation's riskReduction is a coefficient the scenario author set, not a
 * measured effect, so it is shown as a size rather than a percentage.
 */
export function reductionPhrase(r: number): string {
  const size = r >= 0.6 ? "large" : r >= 0.4 ? "moderate" : "modest";
  return `${size} assumed reduction`;
}

/** A mitigation's yearly cost as the scenario author assumed it; zero means staff time, not cash. */
export function mitigationCostPhrase(costAnnual: number): string {
  return costAnnual > 0
    ? `Assumed yearly cost ${formatUsd(costAnnual)}`
    : "No cash cost assumed (staff time)";
}

/**
 * Below the `md` breakpoint the scenario cards stack in one column, so the
 * figures of the scenario just picked render several screens below the card.
 */
export const NARROW_SCENARIO_QUERY = "(max-width: 767.98px)";

/**
 * After a scenario card is picked on a narrow screen, bring its figures into
 * view: otherwise only the card's outline changes and the figures sit below
 * every card. Smooth unless the reader asks for reduced motion. Returns
 * whether it scrolled; a wider screen stays where it is.
 */
export function revealScenarioFigures(
  el: Pick<HTMLElement, "scrollIntoView"> | null,
  win: { matchMedia: (query: string) => { matches: boolean } },
): boolean {
  if (!el || !win.matchMedia(NARROW_SCENARIO_QUERY).matches) return false;
  const reduce = win.matchMedia("(prefers-reduced-motion: reduce)").matches;
  el.scrollIntoView({ block: "start", behavior: reduce ? "auto" : "smooth" });
  return true;
}
