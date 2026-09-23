import type { EntitlementId } from "../sod/conflict-rules";
import {
  entitlementsForTitle,
  matchJobTitle,
  seatDuties,
  type JobCatalogEntry,
} from "./job-catalog";
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

/**
 * Duties a row can add beyond the grid's columns, in the rulebook's order:
 * every duty the rulebook defines that is not a column, not view-only, and
 * not already held, so a practice manager's user administration or an
 * estimator's pricing can be entered before the findings.
 */
export function addableDuties(duties: readonly EntitlementId[]): EntitlementId[] {
  return ENTITLEMENTS.map((e) => e.id).filter(
    (d) => !GRID.has(d) && d !== "view_reports_only" && !duties.includes(d),
  );
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
  /** The pasted roster says this person is on leave; they stay on the team and are recorded as out. */
  onLeave?: boolean;
}

/** The catalog's usual duties for a title, every one of them: columns and chips alike. */
export function coreDutiesForTitle(title: string, industry?: string): EntitlementId[] {
  return entitlementsForTitle(title, industry).filter((d) => d !== "view_reports_only");
}

/** The first row of a fresh grid: the owner, with an owner's usual duties already ticked. */
export function ownerRow(): OwnTeamRow {
  return { name: "", role: "Owner", duties: coreDutiesForTitle("Owner"), suggestedFor: "Owner" };
}

/** True when a title names the owner's seat ("Owner", "Owner/President", "CEO"). */
export function isOwnerTitle(role: string): boolean {
  return matchJobTitle(role)?.entry.id === "owner";
}

/**
 * The rows to keep when people are added from a paste or by job title: every
 * row with a name or with duties ticked, so nothing the owner entered is
 * dropped. The grid's first row, while it is still the unnamed Owner row,
 * gives way when the added rows bring their own owner; the result says what
 * happened to it so the caller can tell the owner.
 */
export function rowsKeptForAdding(
  rows: readonly OwnTeamRow[],
  addedRowsHaveOwner: boolean,
): { kept: OwnTeamRow[]; ownerRow: "kept" | "replaced" | "none" } {
  const first = rows[0];
  const blankOwner =
    first !== undefined &&
    !first.name.trim() &&
    first.duties.length > 0 &&
    isOwnerTitle(first.role);
  const replaced = blankOwner && addedRowsHaveOwner;
  const kept = rows.filter(
    (row, index) =>
      (row.name.trim().length > 0 || row.duties.length > 0) && !(replaced && index === 0),
  );
  return { kept, ownerRow: blankOwner ? (replaced ? "replaced" : "kept") : "none" };
}

/** The index of the first row with duties ticked but no name, which finishing would drop; -1 when none. */
export function firstUnnamedWithDuties(rows: readonly OwnTeamRow[]): number {
  return rows.findIndex((row) => !row.name.trim() && row.duties.length > 0);
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

/**
 * Longest job title kept, in characters: long enough for real titles such as
 * "Site Director / Physical Therapist - Riverside" and cut nowhere else.
 */
export const MAX_ROLE_LENGTH = 80;

/** Maximum people the grid accepts; larger teams continue in the register. */
export const OWN_TEAM_MAX = 60;

/** The rows that become people, in order: named, and no more than the grid holds. */
function teamRows(rows: readonly OwnTeamRow[]): OwnTeamRow[] {
  return rows.filter((row) => row.name.trim().length > 0).slice(0, OWN_TEAM_MAX);
}

/** The person ids `buildOwnTeam` gives the rows marked as on leave. */
export function onLeavePersonIds(rows: readonly OwnTeamRow[]): string[] {
  return teamRows(rows).flatMap((row, index) => (row.onLeave ? [`own-${index + 1}`] : []));
}

/**
 * Turns the grid rows into people the engines can read. Empty names are
 * dropped, names and roles are trimmed and bounded, and each person carries
 * the duties ticked for them so duty-conflict detection reads them directly
 * instead of guessing from a job title.
 */
export function buildOwnTeam(rows: readonly OwnTeamRow[]): Person[] {
  const allowed = new Set<string>(ENTITLEMENTS.map((e) => e.id));
  return teamRows(rows)
    .map((row) => ({
      name: row.name.trim().slice(0, 60),
      role: row.role.trim().slice(0, MAX_ROLE_LENGTH) || "Team member",
      duties: row.duties.filter((d) => allowed.has(d)),
      tenureYears:
        typeof row.tenureYears === "number" && Number.isFinite(row.tenureYears)
          ? Math.min(60, Math.max(0, row.tenureYears))
          : undefined,
      department: row.department?.trim().slice(0, 60) || undefined,
    }))
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

/** The name an own business gets when the owner leaves the name blank. */
export const OWN_BUSINESS_FALLBACK_NAME = "My business";

/**
 * A fresh profile for the owner's own business: their name, their people, no
 * sample relations, no sample dual-release exceptions, and staff figures
 * derived from the team they entered.
 */
export function ownBusinessProfile(
  base: PracticeProfile,
  input: { practiceName: string; people: Person[] },
): PracticeProfile {
  // A blank name stays neutral; the sample business's name is not this business's.
  const practiceName = input.practiceName.trim().slice(0, 80) || OWN_BUSINESS_FALLBACK_NAME;
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
