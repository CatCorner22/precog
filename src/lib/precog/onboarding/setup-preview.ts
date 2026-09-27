import { resolveTemplate } from "../active-template";
import { caseDurationPhrase, caseForRule, lossPhrase } from "../evidence";
import type { CaseStudy } from "../evidence/types";
import type { IndustryId } from "../industry";
import { defaultProfile } from "../practice-profile";
import { detectSodConflicts, type DetectedConflict } from "../sod/detect";
import { buildOwnTeam, type OwnTeamRow } from "./own-team";

/**
 * The first finding, while setup is still open: as soon as two duties on one
 * row form a conflict the engine would report, name it and the case that
 * shows what the same arrangement cost someone. Nothing here is stored; it
 * is the same detection the map runs, on the rows as typed.
 */
export interface SetupPreview {
  /** People with at least one duty ticked. */
  peopleWithDuties: number;
  /**
   * The conflicts of the same kind as the first finding: those an employee
   * holds, or, when only the owner holds any, the owner's. The owner's own
   * pairs are a lesser finding after setup, so they do not swell the count
   * of employee findings.
   */
  conflictCount: number;
  first: {
    conflict: DetectedConflict;
    study: CaseStudy | null;
    citesRule: boolean;
    lossPhrase: string | null;
    durationPhrase: string | null;
  } | null;
}

export function previewSetup(rows: readonly OwnTeamRow[], industry: IndustryId): SetupPreview {
  const people = buildOwnTeam(rows, industry);
  const peopleWithDuties = people.filter((p) =>
    (p.entitlements ?? []).some((e) => e !== "view_reports_only"),
  ).length;
  if (peopleWithDuties === 0) return { peopleWithDuties, conflictCount: 0, first: null };

  const tpl = resolveTemplate({ industry, customPeople: people });
  const report = detectSodConflicts(tpl, defaultProfile(industry).staff);
  // Employees' conflicts first: an owner holding both duties is a different,
  // lesser finding, and not the one to open a demo with.
  const ranked = [...report.conflicts].sort(
    (a, b) => Number(a.ownerHeld) - Number(b.ownerHeld) || b.score - a.score,
  );
  const conflict = ranked[0];
  if (!conflict) return { peopleWithDuties, conflictCount: 0, first: null };
  const matched = caseForRule(conflict.ruleId, industry);
  return {
    peopleWithDuties,
    conflictCount: ranked.filter((c) => c.ownerHeld === conflict.ownerHeld).length,
    first: {
      conflict,
      study: matched?.study ?? null,
      citesRule: matched?.citesRule ?? false,
      // A record with no stated loss has no amount to print.
      lossPhrase: matched && matched.study.lossUsd > 0 ? lossPhrase(matched.study) : null,
      durationPhrase: matched ? caseDurationPhrase(matched.study) : null,
    },
  };
}
