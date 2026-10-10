/**
 * Runs every golden case through the real engine, the same way the screens
 * do: the setup grid becomes a team (buildOwnTeam, ownBusinessProfile), the
 * detector finds the open findings (sod/detect, headline/open-conflicts), the
 * first step is ranked (actions/do-next), the Procedures tab is ranked
 * (procedures/library, rule-procedures) and the local brief is written
 * (coach/local-brief, which runs llm/agent-loop runLocalAgentLoop).
 *
 * A check a case marks as a known gap is reported as a todo with the reason,
 * so the expectation stays on record without failing the suite. Every other
 * check on that case still runs.
 */
import { describe, expect, it } from "vitest";
import { resolveTemplate } from "../active-template";
import { firstDoNextStep, stepFocus, type DutySplitStaff } from "../actions/do-next";
import { DEFAULT_COACH_QUESTION, localBrief } from "../coach/local-brief";
import { UNIVERSAL_FIX } from "../coach/first-steps";
import { openConflictHeadline } from "../headline/open-conflicts";
import { INDUSTRIES } from "../industry";
import { buildOwnTeam, ownBusinessProfile } from "../onboarding/own-team";
import { defaultProfile } from "../practice-profile";
import { libraryRows, RECOMMENDED_PROCEDURES } from "../procedures/library";
import { rankLibraryRowsByConflicts, RULE_PROCEDURE } from "../procedures/rule-procedures";
import { CONFLICT_RULES, ENTITLEMENTS } from "../sod/conflict-rules";
import { detectSodConflicts, sodDetectionOptions, type DetectedConflict } from "../sod/detect";
import { chooseDutySplit } from "../sod/duty-split";
import { partialDualReleaseCoverage } from "../sod/open-findings";
import { GOLDEN_CASES, type GoldenCase, type GoldenCheck } from "./cases";

const RULE_IDS = new Set(CONFLICT_RULES.map((r) => r.id));
const DUTY_IDS = new Set<string>(ENTITLEMENTS.map((e) => e.id));
const LIBRARY_IDS = new Set(RECOMMENDED_PROCEDURES.map((r) => r.id));
const RULE_LIBRARY_IDS = new Set(
  Object.values(RULE_PROCEDURE).flatMap((entry) => [entry.primary, ...(entry.also ?? [])]),
);

/** Everything the engine says about one case, computed once. */
interface EngineRun {
  open: DetectedConflict[];
  openRuleIds: Set<string>;
  firstStepControlId: string | null;
  firstStepFocusRuleId: string | null;
  /** The duty the split step moves, when the first step is the split step and a move lowers the open count. */
  firstStepDuty: string | null;
  fittingLibraryIds: string[];
  actions: string[];
  partialBrief: boolean;
}

function runEngine(c: GoldenCase): EngineRun {
  const people = buildOwnTeam(c.team, c.industry);
  const profile = ownBusinessProfile(defaultProfile(c.industry), {
    practiceName: c.business,
    people,
  });
  const tpl = resolveTemplate(profile);
  const sod = detectSodConflicts(tpl, profile.staff, sodDetectionOptions(tpl, profile.dualRelease));
  const open = openConflictHeadline(
    sod,
    partialDualReleaseCoverage(profile.dualRelease, sod.conflicts),
  ).findings;
  const staff: DutySplitStaff = { assignments: sod.assignments, teamSize: profile.staff.teamSize };
  const first = firstDoNextStep({
    open,
    industry: c.industry,
    integrationDriftSummary: null,
    accessReconciliation: null,
    staff,
  });
  const focus = first ? stepFocus(first, open, staff) : null;
  const split = chooseDutySplit(open, sod.assignments, profile.staff.teamSize);
  const firstStepDuty =
    first?.control.id === UNIVERSAL_FIX && split && split.net > 0 ? split.duty : null;
  const fittingLibraryIds = rankLibraryRowsByConflicts(libraryRows(tpl, [], c.industry), open)
    .filter((row) => row.fits)
    .map((row) => row.recommendation.id);
  const brief = localBrief(DEFAULT_COACH_QUESTION, { profile, today: c.today }, profile);
  return {
    open,
    openRuleIds: new Set(open.map((f) => f.ruleId)),
    firstStepControlId: first?.control.id ?? null,
    firstStepFocusRuleId: focus?.ruleId ?? null,
    firstStepDuty,
    fittingLibraryIds,
    actions: brief.brief.decisions.map((d) => d.action),
    partialBrief: brief.partial,
  };
}

/** `it`, or `it.todo` with the reason when the case marks this check as a known gap. */
function check(c: GoldenCase, name: GoldenCheck, title: string, body: () => void): void {
  const gap = c.knownGap?.[name];
  if (gap) {
    it.todo(`${title} (known gap: ${gap})`);
    return;
  }
  it(title, body);
}

function pairText(pair: readonly [string, string]): string {
  return `${pair[0]} + ${pair[1]}`;
}

function holdsPair(f: DetectedConflict, pair: readonly [string, string]): boolean {
  return (
    (f.entitlementA === pair[0] && f.entitlementB === pair[1]) ||
    (f.entitlementA === pair[1] && f.entitlementB === pair[0])
  );
}

describe("golden dataset shape", () => {
  it("holds three cases for each of the eight lines of business", () => {
    expect(GOLDEN_CASES).toHaveLength(24);
    for (const industry of INDUSTRIES) {
      expect(GOLDEN_CASES.filter((c) => c.industry === industry.id)).toHaveLength(3);
    }
  });

  it("uses unique ids and only ids the engine knows", () => {
    expect(new Set(GOLDEN_CASES.map((c) => c.id)).size).toBe(GOLDEN_CASES.length);
    for (const c of GOLDEN_CASES) {
      for (const id of [...c.expectOpenRuleIds, ...c.expectClosedRuleIds]) {
        expect(RULE_IDS.has(id), `${c.id}: unknown rule ${id}`).toBe(true);
      }
      if (c.expectFirstStepRuleId) {
        expect(RULE_IDS.has(c.expectFirstStepRuleId), `${c.id}: unknown rule`).toBe(true);
      }
      for (const id of c.expectRecommendedProcedureIds) {
        expect(LIBRARY_IDS.has(id), `${c.id}: unknown library id ${id}`).toBe(true);
        expect(RULE_LIBRARY_IDS.has(id), `${c.id}: ${id} is not reached through a rule`).toBe(true);
      }
      for (const pair of c.expectOpenPairs ?? []) {
        for (const duty of pair) expect(DUTY_IDS.has(duty), `${c.id}: unknown duty`).toBe(true);
      }
      const overlap = c.expectOpenRuleIds.filter((id) => c.expectClosedRuleIds.includes(id));
      expect(overlap, `${c.id}: a rule is expected both open and closed`).toEqual([]);
      expect(c.basis.length).toBeGreaterThan(40);
      expect(c.team.length).toBeGreaterThanOrEqual(2);
      expect(/should/i.test(`${c.name} ${c.basis}`), `${c.id}: wording rule`).toBe(false);
    }
  });
});

for (const c of GOLDEN_CASES) {
  describe(`${c.industry}: ${c.id}`, () => {
    const run = runEngine(c);

    check(c, "open", "opens every rule the research names", () => {
      const missing = c.expectOpenRuleIds.filter((id) => !run.openRuleIds.has(id));
      expect(missing, `open: ${[...run.openRuleIds].join(", ")}`).toEqual([]);
    });

    check(c, "closed", "leaves closed the owner's own pairs and the pairs nobody holds", () => {
      const wrongly = c.expectClosedRuleIds.filter((id) => run.openRuleIds.has(id));
      expect(wrongly).toEqual([]);
    });

    if (c.expectOpenPairs) {
      check(c, "pairs", "flags every duty pair the research names, under any rule", () => {
        const missing = (c.expectOpenPairs ?? []).filter(
          (pair) => !run.open.some((f) => holdsPair(f, pair)),
        );
        expect(missing.map(pairText)).toEqual([]);
      });
    }

    if (c.expectFirstStepRuleId || c.expectFirstStepDutyId) {
      check(c, "firstStep", "names the most severe open pair in its first step", () => {
        expect(run.firstStepControlId).not.toBeNull();
        if (c.expectFirstStepRuleId) {
          expect(run.firstStepFocusRuleId).toBe(c.expectFirstStepRuleId);
        }
        if (c.expectFirstStepDutyId) {
          expect(
            run.firstStepDuty,
            `first step is ${run.firstStepControlId} focused on ${run.firstStepFocusRuleId}`,
          ).toBe(c.expectFirstStepDutyId);
        }
      });
    }

    check(c, "procedures", "ranks the written procedures for the open pairs as fitting", () => {
      const missing = c.expectRecommendedProcedureIds.filter(
        (id) => !run.fittingLibraryIds.includes(id),
      );
      expect(missing, `fitting: ${run.fittingLibraryIds.join(", ")}`).toEqual([]);
    });

    if (c.expectActionPattern) {
      check(c, "action", "writes a brief whose decisions include the expected move", () => {
        expect(run.partialBrief).toBe(false);
        const pattern = c.expectActionPattern!;
        expect(
          run.actions.some((a) => pattern.test(a)),
          `actions: ${run.actions.join(" | ")}`,
        ).toBe(true);
      });
    }
  });
}
