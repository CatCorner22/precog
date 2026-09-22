import type { EntitlementId } from "../sod/conflict-rules";
import { ENTITLEMENTS } from "../sod/conflict-rules";
import { mitigatedSodRuleIds } from "../controls/dual-release";
import { resolveTemplate } from "../active-template";
import { deriveStaffFromTeam } from "../sod/derive-staff";
import type { PracticeProfile } from "../practice-profile";
import type { Person } from "../types";

/**
 * The eight money duties the onboarding grid asks about. Together they cover
 * the conflict rules behind most of the case library: cash in, cash out,
 * payroll, and the reconciliation that should sit with someone else.
 */
export const CORE_DUTIES: readonly EntitlementId[] = [
  "collect_cash",
  "post_payments",
  "prepare_deposit",
  "bank_reconcile",
  "create_vendor",
  "release_payment",
  "enter_payroll",
  "approve_payroll",
];

export function coreDutyLabel(id: EntitlementId): string {
  return ENTITLEMENTS.find((e) => e.id === id)?.label ?? id;
}

export interface OwnTeamRow {
  name: string;
  role: string;
  duties: EntitlementId[];
}

/** Maximum people the grid accepts; larger teams continue in the register. */
export const OWN_TEAM_MAX = 12;

/**
 * Turns the grid rows into people the engines can read. Empty names are
 * dropped, names and roles are trimmed and bounded, and each person carries
 * the duties ticked for them so duty-conflict detection reads them directly
 * instead of guessing from a job title.
 */
export function buildOwnTeam(rows: readonly OwnTeamRow[]): Person[] {
  const allowed = new Set<string>(CORE_DUTIES);
  return rows
    .map((row) => ({
      name: row.name.trim().slice(0, 60),
      role: row.role.trim().slice(0, 40) || "Team member",
      duties: row.duties.filter((d) => allowed.has(d)),
    }))
    .filter((row) => row.name.length > 0)
    .slice(0, OWN_TEAM_MAX)
    .map((row, index) => ({
      id: `own-${index + 1}`,
      name: row.name,
      role: row.role,
      active: true,
      entitlements: Array.from(new Set<string>([...row.duties, "view_reports_only"])),
    }));
}

/**
 * A fresh profile for the owner's own business: their name, their people, no
 * sample relations, no sample dual-release exceptions, and staff figures
 * derived from the team they entered.
 */
export function ownBusinessProfile(
  base: PracticeProfile,
  input: { practiceName: string; people: Person[] },
): PracticeProfile {
  const practiceName = input.practiceName.trim().slice(0, 80) || base.practiceName;
  const withTeam: PracticeProfile = {
    ...base,
    practiceName,
    customPeople: input.people,
    customRelations: [],
    dualRelease: { ...base.dualRelease, exceptions: [] },
    onboardingComplete: true,
  };
  const staff = deriveStaffFromTeam(resolveTemplate(withTeam), base.staff, {
    dualReleaseMitigatedRuleIds: mitigatedSodRuleIds(withTeam.dualRelease),
  });
  return { ...withTeam, staff };
}
