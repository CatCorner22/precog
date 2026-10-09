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
import type { Person } from "../types";
import { stripInvisibleControls, titleKey } from "../text";
import { clamp } from "../number";
import { MAX_ROLE_LENGTH, OWN_TEAM_MAX } from "./own-business";
import { dutiesOffTeam, hiddenDuties, type SetupAnswers } from "./setup-answers";

// Kept with the catalog-free setup pieces (./own-business); re-exported for existing importers.
export {
  MAX_ROLE_LENGTH,
  OWN_BUSINESS_FALLBACK_NAME,
  OWN_TEAM_MAX,
  ownBusinessProfile,
} from "./own-business";

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
  /**
   * Duties the job title ticked that the setup answers then left out (no
   * payroll, an outside bank reconciliation, no cash). They have no column
   * while left out, so the owner cannot have changed them by hand; when the
   * answers bring one back onto the team it is ticked again (see
   * fitDutiesToAnswers).
   */
  answersUnticked?: EntitlementId[];
  /**
   * Duties the owner confirmed for this person: a suggested duty they kept,
   * or a duty they ticked or added by hand. A duty the job title suggested
   * (see unconfirmedDuties) does not count until it is here; typing a new
   * title clears the list with the ticks it replaces.
   */
  keptDuties?: EntitlementId[];
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

/** A duty's short name, as its grid column heads it; a duty with no column uses its full wording. */
export function dutyShortName(id: EntitlementId): string {
  return GRID_DUTY_HEADING[id] ?? coreDutyLabel(id);
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

/**
 * The catalog's usual duties for a title, every one of them: columns and
 * chips alike. With the setup answers, a duty the answers place outside the
 * team (no payroll, an outside bank reconciliation, no cash) is left out.
 */
export function coreDutiesForTitle(
  title: string,
  industry?: string,
  answers?: SetupAnswers,
): EntitlementId[] {
  return withoutOffTeam(
    entitlementsForTitle(title, industry).filter((d) => d !== "view_reports_only"),
    answers,
  );
}

/**
 * The duties the grid ticks for a row's title. A row that owns the business
 * keeps the owner's usual duties (approving, signing) whatever the owner calls
 * their job ("Dentist", "Head Chef"), plus any the title adds. A duty the
 * setup answers place outside the team is never ticked.
 */
export function suggestedDuties(
  role: string,
  owns: boolean,
  industry?: string,
  answers?: SetupAnswers,
): EntitlementId[] {
  const title = coreDutiesForTitle(role, industry, answers);
  if (!owns) return title;
  const owner = coreDutiesForTitle("Owner", industry, answers);
  return [...owner, ...title.filter((d) => !owner.includes(d))];
}

/** The duties without those the setup answers place outside the team. */
export function withoutOffTeam(
  duties: readonly EntitlementId[],
  answers: SetupAnswers | undefined,
): EntitlementId[] {
  const off = dutiesOffTeam(answers);
  return duties.filter((d) => !off.has(d));
}

/**
 * Whether a row's ticks are still exactly a title's suggestion, leaving
 * aside duties the setup answers place outside the team: a row ticked before
 * the answers changed still counts as the suggestion. `suggestion` comes from
 * `suggestedDuties` with the same answers, so it holds none of those duties
 * already.
 */
export function stillSuggested(
  duties: readonly EntitlementId[],
  suggestion: readonly EntitlementId[],
  answers: SetupAnswers | undefined,
): boolean {
  return sameDuties(withoutOffTeam(duties, answers), suggestion);
}

/** One row without the duties in `off`, remembering them as left out by the answers. */
function dropOffTeam(row: OwnTeamRow, off: ReadonlySet<EntitlementId>): OwnTeamRow {
  const removed = row.duties.filter((d) => off.has(d));
  if (removed.length === 0) return row;
  const remembered = row.answersUnticked ?? [];
  return {
    ...row,
    duties: row.duties.filter((d) => !off.has(d)),
    answersUnticked: [...remembered, ...removed.filter((d) => !remembered.includes(d))],
  };
}

/**
 * The rows with every duty the setup answers place outside the team
 * unticked, for rows a paste or "Add people by job title" just filled. The
 * grid's untouched first row keeps its ticks so it stays recognizable as
 * untouched; those duties have no column and Finish drops them. Each row
 * remembers what the answers unticked (`answersUnticked`). Returns the same
 * array when nothing changed.
 */
export function withoutDutiesOffTeam(
  rows: OwnTeamRow[],
  answers: SetupAnswers | undefined,
): OwnTeamRow[] {
  const off = dutiesOffTeam(answers);
  if (off.size === 0) return rows;
  let changed = false;
  const next = rows.map((row) => {
    // The fresh first row keeps its ticks (see above).
    if (isUntouchedLeaderRow(row)) return row;
    const fitted = dropOffTeam(row, off);
    if (fitted !== row) changed = true;
    return fitted;
  });
  return changed ? next : rows;
}

/**
 * The rows fitted to the setup answers, run when the owner leaves the "How
 * money moves here" step. Duties the answers place outside the team are
 * unticked (withoutDutiesOffTeam). A duty the answers unticked earlier and
 * now bring back onto the team is ticked again, on a row whose ticks still
 * come from its job title (the title that ticked them is the row's title
 * now) and whose title still ticks that duty. A duty the owner unticked by
 * hand was never unticked by the answers, so it stays unticked. Returns the
 * same array when nothing changed.
 */
export function fitDutiesToAnswers(
  rows: OwnTeamRow[],
  answers: SetupAnswers | undefined,
  industry?: string,
): OwnTeamRow[] {
  const off = dutiesOffTeam(answers);
  const hidden = answers ? hiddenDuties(answers) : new Set<EntitlementId>();
  let changed = false;
  const restored = rows.map((row) => {
    if (!row.answersUnticked) return row;
    const role = row.role.trim();
    const fromTitle = Boolean(role) && (row.suggestedFor ?? "").trim() === role;
    const usual = fromTitle ? suggestedDuties(role, rowOwnsBusiness(row, industry), industry) : [];
    // The title's duties the answers unticked and nobody has ticked since:
    // back on the team now, or still left out (or hidden) and remembered.
    const candidates = row.answersUnticked.filter(
      (d) => usual.includes(d) && !row.duties.includes(d),
    );
    const back = candidates.filter((d) => !off.has(d) && !hidden.has(d));
    const waiting = candidates.filter((d) => off.has(d) || hidden.has(d));
    if (back.length === 0 && waiting.length === row.answersUnticked.length) return row;
    changed = true;
    const held = new Set([...row.duties, ...back]);
    const { answersUnticked: _forgotten, ...rest } = row;
    return {
      ...rest,
      // In the title's order, then any duty ticked by hand.
      duties: [
        ...usual.filter((d) => held.has(d)),
        ...row.duties.filter((d) => !usual.includes(d)),
      ],
      ...(waiting.length > 0 ? { answersUnticked: waiting } : {}),
    };
  });
  const fitted = withoutDutiesOffTeam(restored, answers);
  return changed || fitted !== restored ? fitted : rows;
}

/**
 * A row with its job title's usual duties ticked, as typing a title does:
 * duties the setup answers place outside the team are left unticked and
 * remembered (`answersUnticked`), so changing the answer back ticks them.
 */
export function titleTicksFor(
  row: OwnTeamRow,
  industry?: string,
  answers?: SetupAnswers,
): OwnTeamRow {
  const role = row.role.trim();
  // A new title's ticks are new suggestions: nothing about them is confirmed yet.
  const { answersUnticked: _old, keptDuties: _kept, ...rest } = row;
  const ticked: OwnTeamRow = {
    ...rest,
    duties: suggestedDuties(role, rowOwnsBusiness(row, industry), industry),
    suggestedFor: role,
  };
  return dropOffTeam(ticked, dutiesOffTeam(answers));
}

/**
 * The duties a row holds because its job title ticked them, in the grid's
 * column order and then the title's other duties: empty when the ticks were
 * set by hand under another title. Duties the setup answers hide are left
 * out, since they have no column and Finish drops them.
 */
export function titleTickedDuties(
  row: Pick<OwnTeamRow, "role" | "duties" | "suggestedFor" | "owner">,
  industry?: string,
  answers?: SetupAnswers,
): EntitlementId[] {
  const role = row.role.trim();
  if (!role || (row.suggestedFor ?? "").trim() !== role) return [];
  const usual = new Set(suggestedDuties(role, rowOwnsBusiness(row, industry), industry));
  const hidden = answers ? hiddenDuties(answers) : new Set<EntitlementId>();
  const held = row.duties.filter((d) => usual.has(d) && !hidden.has(d));
  return [...CORE_DUTIES, ...extraDuties(held)].filter((d) => held.includes(d));
}

/**
 * The duties a row holds because a job title ticked them and the owner has
 * not yet kept: in the grid's column order, then the duties with no column.
 * They count like any other tick; this is the "from the job title" mark the
 * grid, Team and the findings show until the owner keeps or unticks them.
 * They come from the title that ticked them (`suggestedFor`), even after
 * the title was retyped, so a retyped title never confirms the old title's
 * guesses. With the setup answers, duties the answers hide are left out:
 * they have no column and do not count either way.
 */
export function unconfirmedDuties(
  row: Pick<OwnTeamRow, "role" | "duties" | "suggestedFor" | "owner" | "keptDuties">,
  industry?: string,
  answers?: SetupAnswers,
): EntitlementId[] {
  const from = (row.suggestedFor ?? "").trim();
  if (!from) return [];
  // Both readings of the title, with and without the owner's duties, so
  // ticking or clearing "Owns the business" afterwards confirms nothing.
  const usual = new Set([
    ...suggestedDuties(from, true, industry),
    ...suggestedDuties(from, false, industry),
  ]);
  const kept = new Set(row.keptDuties ?? []);
  const hidden = answers ? hiddenDuties(answers) : new Set<EntitlementId>();
  const waiting = row.duties.filter((d) => usual.has(d) && !kept.has(d) && !hidden.has(d));
  return [...CORE_DUTIES, ...extraDuties(waiting)].filter((d) => waiting.includes(d));
}

/** The row with these suggested duties kept: they count from now on. */
export function keepDuties(row: OwnTeamRow, duties: readonly EntitlementId[]): OwnTeamRow {
  const kept = row.keptDuties ?? [];
  const added = duties.filter((d) => row.duties.includes(d) && !kept.includes(d));
  return added.length === 0 ? row : { ...row, keptDuties: [...kept, ...added] };
}

/**
 * The row with one duty ticked or unticked by hand. A duty ticked by hand
 * is the owner's own entry and counts at once; unticking removes it.
 */
export function toggleDutyByHand(row: OwnTeamRow, duty: EntitlementId): OwnTeamRow {
  if (row.duties.includes(duty)) return { ...row, duties: row.duties.filter((d) => d !== duty) };
  return keepDuties({ ...row, duties: [...row.duties, duty] }, [duty]);
}

/**
 * The duties the grid shows as ticked: everything the row holds, including
 * the duties its job title ticked. Those carry the "from the job title" mark
 * (see unconfirmedDuties) until the owner keeps them or unticks them, and
 * they count from the start: setup does not wait on a second pass.
 */
export function chosenDuties(
  row: Pick<OwnTeamRow, "role" | "duties" | "suggestedFor" | "owner" | "keptDuties">,
  _industry?: string,
): EntitlementId[] {
  return [...row.duties];
}

/**
 * A tick or untick by hand in the grid. Unticking a duty the job title
 * ticked removes it like any other; ticking a duty is the owner's own entry
 * and is confirmed at once (see toggleDutyByHand).
 */
export function tickDutyByHand(
  row: OwnTeamRow,
  duty: EntitlementId,
  _industry?: string,
): OwnTeamRow {
  return toggleDutyByHand(row, duty);
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
 * instead of guessing from a job title. A duty a job title suggested counts
 * only once the owner kept it (see unconfirmedDuties): setup does not finish
 * while one waits, and nothing the owner did not confirm reaches the map.
 * Duties the setup answers hide are left to ownBusinessProfile, which drops
 * them; `_answers` stays for callers that pass them.
 */
export function buildOwnTeam(
  rows: readonly OwnTeamRow[],
  industry?: string,
  _answers?: SetupAnswers,
): Person[] {
  return teamRows(rows)
    .map((row) => {
      // Duties the job title ticked count, marked so Team and the findings
      // say how many rest on a title until the owner confirms them.
      const fromTitle = unconfirmedDuties(row, industry).length > 0;
      return {
        name: row.name.trim().slice(0, 60),
        role: row.role.trim().slice(0, MAX_ROLE_LENGTH) || "Team member",
        duties: row.duties.filter((d) => ENTITLEMENT_IDS.has(d)),
        fromTitle,
        tenureYears:
          typeof row.tenureYears === "number" && Number.isFinite(row.tenureYears)
            ? clamp(row.tenureYears, 0, 60)
            : undefined,
        department: row.department?.trim().slice(0, 120) || undefined,
        employeeId: row.employeeId?.trim().slice(0, 40) || undefined,
        lastDay: row.lastDay && isCalendarDate(row.lastDay) ? row.lastDay : undefined,
        owner: rowOwnsBusiness(row, industry),
      };
    })
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
      ...(row.fromTitle ? { dutiesFromTitle: true as const } : {}),
      entitlements: Array.from(new Set<string>([...row.duties, "view_reports_only"])),
    }));
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
      sameDuties(fresh.duties, row.duties),
  );
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

/** The same duties, in any order. */
export function sameDuties(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((d) => b.includes(d));
}

/** The title of a nonprofit's first row: it has no owner, and its executive director runs it. */
const NONPROFIT_LEADER_TITLE = "Executive Director";

const GRID = new Set<string>(CORE_DUTIES);

const ENTITLEMENT_IDS = new Set<string>(ENTITLEMENTS.map((e) => e.id));
