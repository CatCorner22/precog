/**
 * The setup grid: one row per person, the money duties ticked for each, the
 * first row every grid starts with, and the people the finished grid becomes.
 * Adding rows from a paste or by job title is in ./add-people.
 */

import { ENTITLEMENTS, type EntitlementId } from "../sod/conflict-rules";
import { entitlementsForTitle, matchJobTitle } from "./job-catalog";
import { isOwnerRole } from "../sod/owner-role";
import { industryHasOwner } from "../industry";
import { isCalendarDate } from "../dates";
import { defaultDualReleasePolicy, mitigatedSodRuleIds } from "../controls/dual-release";
import { resolveTemplate } from "../active-template";
import { deriveStaffFromTeam, independentReconciliationFromTeam } from "../sod/derive-staff";
import type { PracticeProfile } from "../practice-profile";
import type { Person } from "../types";
import { stripInvisibleControls, titleKey } from "../text";
import { clamp } from "../number";

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
  /**
   * The owner's mark: this person owns the business. Unset, the title
   * decides (see rowOwnsBusiness); once ticked or cleared, the mark stands
   * whatever the title says.
   */
  owner?: boolean;
  /** The employee id the pasted roster gave this person, kept so a later import can match them. */
  employeeId?: string;
  /** Last working day the roster gave, for someone who has given notice. */
  lastDay?: string;
  /**
   * How the pasted roster read this row's title: the catalog seat and
   * whether that was a partial match. Kept with the role it was read for,
   * so a title typed later is read again (see rowSeat).
   */
  readAs?: { role: string; title?: string; partial?: boolean };
  /** A key for this row that survives edits and removals above it; never saved on the person. */
  rowId?: string;
}

/** Which catalog seat a row's title was read as, and whether only part of the title matched. */
export interface SeatReading {
  /** The catalog title, or undefined when the title is not in the catalog. */
  title?: string;
  partial: boolean;
}

/**
 * What adding people did to the grid's unnamed first row: the Owner row, or a
 * nonprofit's Executive Director row ("leader-").
 */
export type FirstRowOutcome = "kept" | "replaced" | "leader-kept" | "leader-replaced" | "none";

/** Maximum people the grid accepts; larger teams continue in the team editor. */
export const OWN_TEAM_MAX = 60;

/**
 * Longest job title kept, in characters: long enough for real titles such as
 * "Site Director / Physical Therapist - Riverside" and cut nowhere else.
 */
export const MAX_ROLE_LENGTH = 80;

/**
 * The twelve money duties the onboarding grid shows as columns. Together they
 * reach the conflict rules behind most of the case library: cash in, bills
 * and payments out, the company card, payroll, refunds and write-offs, and
 * the reconciliation that should sit with someone else. A title's other
 * duties ride along as chips the owner can remove.
 */
export const CORE_DUTIES: readonly EntitlementId[] = [
  "collect_cash",
  "post_payments",
  "prepare_deposit",
  "bank_reconcile",
  "enter_invoices",
  "create_vendor",
  "release_payment",
  "hold_company_card",
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
  hold_company_card: "Company card",
  enter_payroll: "Enter payroll",
  approve_payroll: "Approve payroll",
  issue_refunds: "Issue refunds",
  approve_writeoffs: "Approve write-offs and voids",
};

export function coreDutyLabel(id: EntitlementId): string {
  return ENTITLEMENTS.find((e) => e.id === id)?.label ?? id;
}

/** A row's duties that are not grid columns: shown as chips so nothing a title carries is hidden. */
export function extraDuties(duties: readonly EntitlementId[]): EntitlementId[] {
  return duties.filter((d) => !GRID.has(d) && d !== "view_reports_only");
}

/** The duties a grid row can hold: every rulebook duty but view-only, and nothing unknown. */
export function gridDuties(duties: readonly string[]): EntitlementId[] {
  return duties.filter(
    (d): d is EntitlementId => d !== "view_reports_only" && ENTITLEMENT_IDS.has(d),
  );
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

/**
 * Whether a grid row owns the business: nobody in a nonprofit; otherwise the
 * row's mark when set, else its title. A title names the owner when either
 * owner reader says so, the owner-title rule the engines use or the job
 * catalog that ticks the duties, so a "Dealer Principal" whose owner's duties
 * are ticked is also marked the owner.
 */
export function rowOwnsBusiness(
  row: Pick<OwnTeamRow, "role" | "owner">,
  industry?: string,
): boolean {
  if (!industryHasOwner(industry)) return false;
  return (
    row.owner ?? (isOwnerRole(row.role) || matchJobTitle(row.role, industry)?.entry.id === "owner")
  );
}

/** The catalog's usual duties for a title, every one of them: columns and chips alike. */
export function coreDutiesForTitle(title: string, industry?: string): EntitlementId[] {
  return entitlementsForTitle(title, industry).filter((d) => d !== "view_reports_only");
}

/**
 * The duties the grid ticks for a row's title. A row that owns the business
 * keeps the owner's usual duties (approving, signing) whatever the owner calls
 * their job ("Dentist", "Head Chef"), plus any the title adds.
 */
export function suggestedDuties(role: string, owns: boolean, industry?: string): EntitlementId[] {
  const title = coreDutiesForTitle(role, industry);
  if (!owns) return title;
  const owner = coreDutiesForTitle("Owner", industry);
  return [...owner, ...title.filter((d) => !owner.includes(d))];
}

/**
 * The catalog seat behind a row's ticks: what the pasted roster read the
 * title as, while the title is unchanged, and otherwise the catalog's own
 * reading of the title as typed. Undefined for a row with no title.
 */
export function rowSeat(
  row: Pick<OwnTeamRow, "role" | "readAs">,
  industry?: string,
): SeatReading | undefined {
  const role = row.role.trim();
  if (!role) return undefined;
  if (row.readAs && row.readAs.role.trim() === role) {
    return { title: row.readAs.title, partial: row.readAs.partial === true };
  }
  const match = matchJobTitle(role, industry);
  return match
    ? { title: match.entry.title, partial: match.confidence === "partial" }
    : { partial: false };
}

/**
 * Whether a row is one to review before finishing: it holds something (a
 * name, a title or a duty) and lacks a name or a title, or its title is not
 * in the catalog or only partly matched. The rows stay in the grid; the
 * review filter only shows these first.
 */
export function rowNeedsReview(row: OwnTeamRow, seat: SeatReading | undefined): boolean {
  const named = Boolean(row.name.trim());
  const hasWork = named || Boolean(row.role.trim()) || row.duties.length > 0;
  if (!hasWork) return false;
  return !named || !row.role.trim() || !seat?.title || seat.partial;
}

/**
 * Unticks one duty for everyone whose title is `role` (compared without case
 * or spacing), so "untick write-off approval for all 13 physical therapists"
 * is one step. Returns the new rows and how many rows changed.
 */
export function untickDutyForTitle(
  rows: readonly OwnTeamRow[],
  role: string,
  duty: EntitlementId,
): { rows: OwnTeamRow[]; changed: number } {
  const key = titleKey(role);
  let changed = 0;
  const next = rows.map((row) => {
    if (titleKey(row.role) !== key || !row.duties.includes(duty)) return row;
    changed += 1;
    return { ...row, duties: row.duties.filter((d) => d !== duty) };
  });
  return { rows: next, changed };
}

/**
 * Titles held by two or more rows, with how many hold each, most first: the
 * titles a bulk untick is worth offering for.
 */
export function sharedTitles(rows: readonly OwnTeamRow[]): { role: string; count: number }[] {
  const counts = new Map<string, { role: string; count: number }>();
  for (const row of rows) {
    const role = row.role.trim();
    if (!role) continue;
    const key = titleKey(role);
    const entry = counts.get(key);
    if (entry) entry.count += 1;
    else counts.set(key, { role, count: 1 });
  }
  return [...counts.values()]
    .filter((entry) => entry.count > 1)
    .sort((a, b) => b.count - a.count || a.role.localeCompare(b.role));
}

/** The first row of a fresh grid: the owner, with an owner's usual duties already ticked. */
export function ownerRow(): OwnTeamRow {
  return {
    name: "",
    role: "Owner",
    duties: coreDutiesForTitle("Owner"),
    suggestedFor: "Owner",
    owner: true,
  };
}

/**
 * The first row of a fresh grid in this line of business: the owner, or in a
 * nonprofit the executive director.
 */
export function leaderRow(industry?: string): OwnTeamRow {
  if (industryHasOwner(industry)) return ownerRow();
  return {
    name: "",
    role: NONPROFIT_LEADER_TITLE,
    duties: coreDutiesForTitle(NONPROFIT_LEADER_TITLE, industry),
    suggestedFor: NONPROFIT_LEADER_TITLE,
  };
}

/**
 * The grid with its first row set for this line of business, while the owner
 * has not touched it: a nonprofit starts with its executive director, every
 * other business with its owner. A first row the owner has named or changed
 * stays as it is.
 */
export function firstRowForIndustry(rows: OwnTeamRow[], industry?: string): OwnTeamRow[] {
  const first = rows[0];
  if (!isUntouchedLeaderRow(first)) return rows;
  const wanted = leaderRow(industry);
  if (wanted.role === first.role && Boolean(wanted.owner) === Boolean(first.owner)) return rows;
  return [{ ...wanted, ...(first.rowId ? { rowId: first.rowId } : {}) }, ...rows.slice(1)];
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
  addedRowsHaveLeader = false,
): { kept: OwnTeamRow[]; ownerRow: FirstRowOutcome } {
  const outcome = firstRowOutcome(rows[0], addedRowsHaveOwner, addedRowsHaveLeader);
  const replaced = outcome === "replaced" || outcome === "leader-replaced";
  const kept = rows.filter(
    (row, index) =>
      (row.name.trim().length > 0 || row.duties.length > 0) && !(replaced && index === 0),
  );
  return { kept, ownerRow: outcome };
}

/**
 * Whether a grid row's title reads as a nonprofit's executive director. Only
 * a nonprofit has that first row, so the title is read as a nonprofit reads
 * it: "CEO" and "President & CEO" are its executive director.
 */
export function isLeaderTitle(role: string): boolean {
  return matchJobTitle(role, "nonprofit")?.entry.id === "executive-director";
}

/** The index of the first row with duties ticked but no name, which finishing would drop; -1 when none. */
export function firstUnnamedWithDuties(rows: readonly OwnTeamRow[]): number {
  return rows.findIndex((row) => !row.name.trim() && row.duties.length > 0);
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
export function buildOwnTeam(rows: readonly OwnTeamRow[], industry?: string): Person[] {
  return teamRows(rows)
    .map((row) => ({
      fromTitle: dutiesStillFromTitle(row, industry),
      name: row.name.trim().slice(0, 60),
      role: row.role.trim().slice(0, MAX_ROLE_LENGTH) || "Team member",
      duties: row.duties.filter((d) => ENTITLEMENT_IDS.has(d)),
      tenureYears:
        typeof row.tenureYears === "number" && Number.isFinite(row.tenureYears)
          ? clamp(row.tenureYears, 0, 60)
          : undefined,
      department: row.department?.trim().slice(0, 120) || undefined,
      employeeId: row.employeeId?.trim().slice(0, 40) || undefined,
      lastDay: row.lastDay && isCalendarDate(row.lastDay) ? row.lastDay : undefined,
      owner: rowOwnsBusiness(row, industry),
    }))
    .map((row, index) => ({
      id: `own-${index + 1}`,
      name: row.name,
      role: row.role,
      active: true,
      // Every person carries the mark, so the engines read who owns the
      // business from setup, not from the title (see sod/owner-role).
      owner: row.owner,
      ...(row.tenureYears !== undefined ? { tenureYears: row.tenureYears } : {}),
      ...(row.department ? { department: row.department } : {}),
      ...(row.employeeId ? { employeeId: row.employeeId } : {}),
      ...(row.lastDay ? { lastDay: row.lastDay } : {}),
      entitlements: Array.from(new Set<string>([...row.duties, "view_reports_only"])),
      // The owner never changed these ticks from the title's usual duties.
      ...(row.fromTitle ? { dutiesFromTitle: true as const } : {}),
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

/**
 * What adding rows does to the grid's first row. The unnamed Owner row gives
 * way to an owner among the added rows; a nonprofit's untouched Executive
 * Director row gives way to an executive director (or an owner-titled row).
 */
function firstRowOutcome(
  first: OwnTeamRow | undefined,
  addedRowsHaveOwner: boolean,
  addedRowsHaveLeader: boolean,
): FirstRowOutcome {
  if (!first || first.name.trim() || first.duties.length === 0) return "none";
  if (first.owner ?? isOwnerTitle(first.role)) return addedRowsHaveOwner ? "replaced" : "kept";
  if (!isUntouchedLeaderRow(first) || first.role !== NONPROFIT_LEADER_TITLE) return "none";
  return addedRowsHaveLeader || addedRowsHaveOwner ? "leader-replaced" : "leader-kept";
}

/** True when a title names the owner's seat ("Owner", "Owner/President", "CEO"). */
function isOwnerTitle(role: string): boolean {
  return matchJobTitle(role)?.entry.id === "owner";
}

/** Whether a row is still exactly a fresh grid's first row, for any line of business. */
function isUntouchedLeaderRow(row: OwnTeamRow | undefined): row is OwnTeamRow {
  if (!row || row.name.trim()) return false;
  return [ownerRow(), leaderRow("nonprofit")].some(
    (fresh) =>
      fresh.role === row.role &&
      fresh.suggestedFor === row.suggestedFor &&
      // Drafts saved before the nonprofit row lost its mark carry owner: false.
      Boolean(fresh.owner) === Boolean(row.owner) &&
      sameDutyList(fresh.duties, row.duties),
  );
}

/**
 * Whether a row's ticks are still exactly the usual duties for its title:
 * the title that ticked them is the row's title now, and nobody has added or
 * removed a duty since. A row with no duties at all has nothing guessed.
 */
function dutiesStillFromTitle(row: OwnTeamRow, industry?: string): boolean {
  const role = row.role.trim();
  if (!role || row.duties.length === 0) return false;
  if ((row.suggestedFor ?? "").trim() !== role) return false;
  const usual = suggestedDuties(role, rowOwnsBusiness(row, industry), industry);
  return sameDutyList(row.duties, usual);
}

/**
 * The rows that become people, in order: named, and no more than the grid
 * holds. Direction-changing and invisible control characters are removed
 * first: a right-to-left override in a name reversed every sentence that
 * named the person.
 */
function teamRows(rows: readonly OwnTeamRow[]): OwnTeamRow[] {
  return rows
    .map((row) => ({
      ...row,
      name: stripInvisibleControls(row.name),
      role: stripInvisibleControls(row.role),
      ...(row.department !== undefined
        ? { department: stripInvisibleControls(row.department) }
        : {}),
    }))
    .filter((row) => row.name.trim().length > 0)
    .slice(0, OWN_TEAM_MAX);
}

function sameDutyList(a: readonly EntitlementId[], b: readonly EntitlementId[]): boolean {
  return a.length === b.length && a.every((d) => b.includes(d));
}

/** The title of a nonprofit's first row: it has no owner, and its executive director runs it. */
const NONPROFIT_LEADER_TITLE = "Executive Director";

const GRID = new Set<string>(CORE_DUTIES);

const ENTITLEMENT_IDS = new Set<string>(ENTITLEMENTS.map((e) => e.id));
