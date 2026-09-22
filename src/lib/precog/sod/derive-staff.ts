import type { IndustryTemplate } from "../templates/types";
import type { StaffComposition } from "../types";
import { detectSodConflicts } from "./detect";
import { soleOwnerCriticalCount } from "../continuity/coverage";

export function deriveStaffFromTeam(
  tpl: IndustryTemplate,
  staff: StaffComposition,
  opts: { dualReleaseMitigatedRuleIds?: Set<string> } = {},
): StaffComposition {
  const activePeople = tpl.people.filter((person) => person.active);
  const knownTenures = activePeople
    .map((person) => person.tenureYears)
    .filter((tenure): tenure is number => typeof tenure === "number");
  const next: StaffComposition = {
    ...staff,
    teamSize: Math.max(1, activePeople.length),
    soleOwnerKnowledgeCount: soleOwnerCriticalCount(tpl),
    avgTenureYears: knownTenures.length
      ? Math.round(
          (knownTenures.reduce((total, tenure) => total + tenure, 0) / knownTenures.length) * 10,
        ) / 10
      : staff.avgTenureYears,
  };
  if (staff.segregationSource !== "manual") {
    next.segregationScore = detectSodConflicts(tpl, undefined, {
      dualReleaseMitigatedRuleIds: opts.dualReleaseMitigatedRuleIds,
    }).summary.segregationHealth;
    next.segregationSource = "derived";
  }
  return next;
}
