import { resolveTemplate } from "../active-template";
import { caseForRule, durationPhrase } from "../evidence";
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
  /** All conflicts the typed team would produce, worst first. */
  conflictCount: number;
  first: {
    conflict: DetectedConflict;
    study: CaseStudy | null;
    citesRule: boolean;
    lossPhrase: string | null;
    durationPhrase: string | null;
  } | null;
}

export function formatLoss(study: CaseStudy): string {
  const amount = `$${Math.round(study.lossUsd).toLocaleString("en-US")}`;
  return study.lossIsFloor ? `more than ${amount}` : amount;
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
    conflictCount: report.conflicts.length,
    first: {
      conflict,
      study: matched?.study ?? null,
      citesRule: matched?.citesRule ?? false,
      lossPhrase: matched ? formatLoss(matched.study) : null,
      durationPhrase:
        matched && typeof matched.study.durationMonths === "number"
          ? durationPhrase(matched.study.durationMonths)
          : null,
    },
  };
}
