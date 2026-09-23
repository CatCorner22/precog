import type { EntitlementId } from "../sod/conflict-rules";
import {
  entitlementsForTitle,
  matchJobTitle,
  seatDuties,
  type JobCatalogEntry,
} from "./job-catalog";
import { ENTITLEMENTS } from "../sod/conflict-rules";
import { isCalendarDate } from "../continuity/coverage";
import { defaultDualReleasePolicy, mitigatedSodRuleIds } from "../controls/dual-release";
import { resolveTemplate } from "../active-template";
import { deriveStaffFromTeam, independentReconciliationFromTeam } from "../sod/derive-staff";
import type { PracticeProfile } from "../practice-profile";
import type { Person } from "../types";
import { stripInvisibleControls } from "../import/csv";

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
  /** The employee id the pasted roster gave this person, kept so a later import can match them. */
  employeeId?: string;
  /** Last working day the roster gave, for someone who has given notice. */
  lastDay?: string;
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
 * `count` placeholder names for one job ("Server 4", "Server 5"), numbered
 * after the highest number already used with that word and never repeating
 * a name in `taken`, so removing "Server 2" and adding one more gives
 * "Server 4", not a second "Server 3".
 */
export function placeholderNames(base: string, count: number, taken: readonly string[]): string[] {
  const key = (value: string) => value.trim().toLowerCase().replace(/\s+/g, " ");
  const used = new Set(taken.map(key));
  const pattern = new RegExp(`^${key(base).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")} (\\d+)$`);
  let next = Math.max(0, ...taken.map((name) => Number(key(name).match(pattern)?.[1] ?? 0))) + 1;
  const names: string[] = [];
  while (names.length < count) {
    const name = `${base} ${next++}`;
    if (!used.has(key(name))) names.push(name);
  }
  return names;
}

/**
 * Grid rows for `count` people with the same job, when the owner has no
 * roster to paste: "Server 1", "Server 2", … with the title's core duties in
 * this line of business ticked. Names are placeholders the owner replaces.
 * Pass the names already in the grid as `existing` so numbering continues
 * after the highest number and never repeats a name; a number is still
 * read as how many rows already have this title.
 */
export function rowsForJobTitle(
  entry: JobCatalogEntry,
  count: number,
  existing: number | readonly string[] = 0,
  industry?: string,
): OwnTeamRow[] {
  const n = Math.max(0, Math.min(OWN_TEAM_MAX, Math.floor(count)));
  const duties = seatDuties(entry, industry).filter((d) => d !== "view_reports_only");
  const base = entry.title.split(" / ")[0];
  const names =
    typeof existing === "number"
      ? Array.from({ length: n }, (_, i) => `${base} ${existing + i + 1}`)
      : placeholderNames(base, n, existing);
  return names.map((name) => ({
    name,
    role: entry.title,
    duties: [...duties],
    suggestedFor: entry.title,
  }));
}

/**
 * A grid row for a person read from a pasted roster: the duties the importer
 * found (or the catalog's for the title), years of service, department,
 * employee id, last day, and whether they are on leave.
 */
export function rowFromImportedPerson(
  person: Person,
  industry?: string,
  onLeave = false,
): OwnTeamRow {
  return {
    name: person.name,
    role: person.role,
    duties: (person.entitlements ?? entitlementsForTitle(person.role, industry)).filter(
      (d): d is EntitlementId => d !== "view_reports_only" && ENTITLEMENT_IDS.has(d),
    ),
    ...(person.tenureYears !== undefined ? { tenureYears: person.tenureYears } : {}),
    ...(person.department ? { department: person.department } : {}),
    ...(person.employeeId ? { employeeId: person.employeeId } : {}),
    ...(person.lastDay ? { lastDay: person.lastDay } : {}),
    suggestedFor: person.role,
    ...(onLeave ? { onLeave: true } : {}),
  };
}

const ENTITLEMENT_IDS = new Set<string>(ENTITLEMENTS.map((e) => e.id));

function rowKey(value: string): string {
  return stripInvisibleControls(value)
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]/gu, "");
}

/**
 * Adds pasted rows to the grid without doubling anyone: a pasted row with
 * the employee id or, failing that, the name of a row already in the grid
 * updates that row, and the rest are added. An updated row keeps the duties
 * ticked for it when its title is unchanged; a new title brings its own.
 * Each grid row is matched once.
 */
export function mergeTeamRows(
  current: readonly OwnTeamRow[],
  incoming: readonly OwnTeamRow[],
): { rows: OwnTeamRow[]; added: OwnTeamRow[]; updated: OwnTeamRow[] } {
  const rows = [...current];
  const matched = new Set<number>();
  const added: OwnTeamRow[] = [];
  const updated: OwnTeamRow[] = [];
  for (const row of incoming) {
    const id = row.employeeId ? rowKey(row.employeeId) : "";
    const name = rowKey(row.name);
    let index = id
      ? rows.findIndex((r, i) => !matched.has(i) && r.employeeId && rowKey(r.employeeId) === id)
      : -1;
    if (index < 0 && name) {
      index = rows.findIndex(
        (r, i) =>
          !matched.has(i) &&
          rowKey(r.name) === name &&
          !(id && r.employeeId && rowKey(r.employeeId) !== id),
      );
    }
    if (index < 0) {
      added.push(row);
      continue;
    }
    matched.add(index);
    const before = rows[index];
    const sameTitle = rowKey(before.role) === rowKey(row.role);
    const next: OwnTeamRow = {
      ...before,
      ...row,
      ...(sameTitle ? { duties: before.duties, suggestedFor: before.suggestedFor } : {}),
    };
    rows[index] = next;
    if (JSON.stringify(next) !== JSON.stringify(before)) updated.push(next);
  }
  return { rows: [...rows, ...added], added, updated };
}

/** Maximum people the grid accepts; larger teams continue in the register. */
export const OWN_TEAM_MAX = 60;

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
      role: row.role.trim().slice(0, 40) || "Team member",
      duties: row.duties.filter((d) => allowed.has(d)),
      tenureYears:
        typeof row.tenureYears === "number" && Number.isFinite(row.tenureYears)
          ? Math.min(60, Math.max(0, row.tenureYears))
          : undefined,
      department: row.department?.trim().slice(0, 120) || undefined,
      employeeId: row.employeeId?.trim().slice(0, 40) || undefined,
      lastDay: row.lastDay && isCalendarDate(row.lastDay) ? row.lastDay : undefined,
    }))
    .map((row, index) => ({
      id: `own-${index + 1}`,
      name: row.name,
      role: row.role,
      active: true,
      ...(row.tenureYears !== undefined ? { tenureYears: row.tenureYears } : {}),
      ...(row.department ? { department: row.department } : {}),
      ...(row.employeeId ? { employeeId: row.employeeId } : {}),
      ...(row.lastDay ? { lastDay: row.lastDay } : {}),
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
