import type { EntitlementId } from "../sod/conflict-rules";
import { entitlementsForTitle, seatDuties, type JobCatalogEntry } from "./job-catalog";
import { ENTITLEMENTS } from "../sod/conflict-rules";
import { defaultDualReleasePolicy, mitigatedSodRuleIds } from "../controls/dual-release";
import { resolveTemplate } from "../active-template";
import { deriveStaffFromTeam, independentReconciliationFromTeam } from "../sod/derive-staff";
import type { PracticeProfile } from "../practice-profile";
import type { Person } from "../types";

/**
 * The eleven money duties the onboarding grid shows as columns. Together they
 * reach the conflict rules behind most of the case library: cash in, bills
 * and payments out, payroll, refunds and write-offs, and the reconciliation
 * that should sit with someone else. A title's other duties ride along as
 * chips the owner can remove.
 */
export const CORE_DUTIES: readonly EntitlementId[] = [
  "collect_cash",
  "post_payments",
  "prepare_deposit",
  "bank_reconcile",
  "enter_invoices",
  "create_vendor",
  "release_payment",
  "enter_payroll",
  "approve_payroll",
  "issue_refunds",
  "approve_writeoffs",
];

/** Short column headings for the grid; the full duty wording stays on each checkbox. */
export const GRID_DUTY_HEADING: Record<string, string> = {
  collect_cash: "Take payments",
  post_payments: "Record payments",
  prepare_deposit: "Prepare deposits",
  bank_reconcile: "Reconcile bank",
  enter_invoices: "Enter bills",
  create_vendor: "Set up suppliers",
  release_payment: "Release payments",
  enter_payroll: "Enter payroll",
  approve_payroll: "Approve payroll",
  issue_refunds: "Issue refunds",
  approve_writeoffs: "Approve write-offs, voids",
};

export function coreDutyLabel(id: EntitlementId): string {
  return ENTITLEMENTS.find((e) => e.id === id)?.label ?? id;
}

const GRID = new Set<string>(CORE_DUTIES);

/** A row's duties that are not grid columns: shown as chips so nothing a title carries is hidden. */
export function extraDuties(duties: readonly EntitlementId[]): EntitlementId[] {
  return duties.filter((d) => !GRID.has(d) && d !== "view_reports_only");
}

export interface OwnTeamRow {
  name: string;
  role: string;
  duties: EntitlementId[];
  /** Years of service, read from a hire date in a pasted roster. */
  tenureYears?: number;
  /** Department or cost center, as the roster names it. */
  department?: string;
  /**
   * The role whose usual duties were ticked automatically. A later role
   * change re-ticks as long as the ticks are still that suggestion; ticks
   * the owner set by hand stay.
   */
  suggestedFor?: string;
}

/** The catalog's usual duties for a title, every one of them: columns and chips alike. */
export function coreDutiesForTitle(title: string, industry?: string): EntitlementId[] {
  return entitlementsForTitle(title, industry).filter((d) => d !== "view_reports_only");
}

/** The first row of a fresh grid: the owner, with an owner's usual duties already ticked. */
export function ownerRow(): OwnTeamRow {
  return { name: "", role: "Owner", duties: coreDutiesForTitle("Owner"), suggestedFor: "Owner" };
}

/**
 * Grid rows for `count` people with the same job, when the owner has no
 * roster to paste: "Server 1", "Server 2", … with the title's core duties in
 * this line of business ticked. Names are placeholders the owner replaces.
 */
export function rowsForJobTitle(
  entry: JobCatalogEntry,
  count: number,
  existing = 0,
  industry?: string,
): OwnTeamRow[] {
  const n = Math.max(0, Math.min(OWN_TEAM_MAX, Math.floor(count)));
  const duties = seatDuties(entry, industry).filter((d) => d !== "view_reports_only");
  return Array.from({ length: n }, (_, i) => ({
    name: `${entry.title.split(" / ")[0]} ${existing + i + 1}`,
    role: entry.title,
    duties: [...duties],
    suggestedFor: entry.title,
  }));
}

/** Maximum people the grid accepts; larger teams continue in the register. */
export const OWN_TEAM_MAX = 60;

/**
 * Turns the grid rows into people the engines can read. Empty names are
 * dropped, names and roles are trimmed and bounded, and each person carries
 * the duties ticked for them so duty-conflict detection reads them directly
 * instead of guessing from a job title.
 */
export function buildOwnTeam(rows: readonly OwnTeamRow[]): Person[] {
  const allowed = new Set<string>(ENTITLEMENTS.map((e) => e.id));
  return rows
    .map((row) => ({
      name: row.name.trim().slice(0, 60),
      role: row.role.trim().slice(0, 40) || "Team member",
      duties: row.duties.filter((d) => allowed.has(d)),
      tenureYears:
        typeof row.tenureYears === "number" && Number.isFinite(row.tenureYears)
          ? Math.min(60, Math.max(0, row.tenureYears))
          : undefined,
      department: row.department?.trim().slice(0, 60) || undefined,
    }))
    .filter((row) => row.name.length > 0)
    .slice(0, OWN_TEAM_MAX)
    .map((row, index) => ({
      id: `own-${index + 1}`,
      name: row.name,
      role: row.role,
      active: true,
      ...(row.tenureYears !== undefined ? { tenureYears: row.tenureYears } : {}),
      ...(row.department ? { department: row.department } : {}),
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
  const ownTemplate = resolveTemplate({ ...base, customPeople: input.people, customRelations: [] });
  // The dual-release approver roles are read off this team, not the sample's,
  // and no sample exception comes along.
  const dualRelease = { ...defaultDualReleasePolicy(ownTemplate, base.staff), exceptions: [] };
  const withTeam: PracticeProfile = {
    ...base,
    practiceName,
    customPeople: input.people,
    customRelations: [],
    dualRelease,
    onboardingComplete: true,
  };
  const staff = deriveStaffFromTeam(ownTemplate, base.staff, {
    dualReleaseMitigatedRuleIds: mitigatedSodRuleIds(dualRelease, ownTemplate),
  });
  // Whether someone independent reconciles is read off the duties the owner
  // ticked; the toggle in Business profile can still overrule it later.
  return {
    ...withTeam,
    staff: { ...staff, independentBankRec: independentReconciliationFromTeam(input.people) },
  };
}
