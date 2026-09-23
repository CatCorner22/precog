import type { EntitlementId } from "../sod/conflict-rules";
import {
  entitlementsForTitle,
  matchJobTitle,
  seatDuties,
  type JobCatalogEntry,
} from "./job-catalog";
import { ENTITLEMENTS } from "../sod/conflict-rules";
import { isOwnerRole } from "../sod/owner-role";
import { isCalendarDate } from "../continuity/coverage";
import { defaultDualReleasePolicy, mitigatedSodRuleIds } from "../controls/dual-release";
import { resolveTemplate } from "../active-template";
import { deriveStaffFromTeam, independentReconciliationFromTeam } from "../sod/derive-staff";
import type { PracticeProfile } from "../practice-profile";
import type { Person } from "../types";
import type { PeopleImportResult } from "../import/people-csv";
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
  approve_writeoffs: "Approve write-offs",
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

/** Whether a grid row owns the business: its mark when set, otherwise its title. */
export function rowOwnsBusiness(row: Pick<OwnTeamRow, "role" | "owner">): boolean {
  return row.owner ?? isOwnerRole(row.role);
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
 * Whether a row's ticks are still exactly the usual duties for its title:
 * the title that ticked them is the row's title now, and nobody has added or
 * removed a duty since. A row with no duties at all has nothing guessed.
 */
export function dutiesStillFromTitle(row: OwnTeamRow, industry?: string): boolean {
  const role = row.role.trim();
  if (!role || row.duties.length === 0) return false;
  if ((row.suggestedFor ?? "").trim() !== role) return false;
  const usual = suggestedDuties(role, rowOwnsBusiness(row), industry);
  return row.duties.length === usual.length && row.duties.every((d) => usual.includes(d));
}

/** Which catalog seat a row's title was read as, and whether only part of the title matched. */
export interface SeatReading {
  /** The catalog title, or undefined when the title is not in the catalog. */
  title?: string;
  partial: boolean;
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

function titleKey(role: string): string {
  return role.trim().toLowerCase().replace(/\s+/g, " ");
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
    (first.owner ?? isOwnerTitle(first.role));
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
 * Longest job title kept, in characters: long enough for real titles such as
 * "Site Director / Physical Therapist - Riverside" and cut nowhere else.
 */
export const MAX_ROLE_LENGTH = 80;

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

/** Maximum people the grid accepts; larger teams continue in the team editor. */
export const OWN_TEAM_MAX = 60;

/** Where an owner adds people once the setup table is full. */
export const MORE_PEOPLE_PLACE = "How work flows > Build > Team";

/**
 * Grid rows for the active people in a pasted roster, each with the catalog
 * seat the importer read its title as and its on-leave mark, plus the names
 * of the people left out as inactive.
 */
export function pastedRows(
  result: Pick<PeopleImportResult, "people" | "titles" | "onLeave">,
  industry?: string,
): { rows: OwnTeamRow[]; inactiveNames: string[] } {
  const onLeave = new Set(result.onLeave ?? []);
  const rows = result.people
    .filter((person) => person.active)
    .map((person) => {
      const mapping = result.titles.find((t) => t.name === person.name);
      return {
        ...rowFromImportedPerson(person, industry, onLeave.has(person.id)),
        readAs: {
          role: person.role,
          ...(mapping?.catalogTitle ? { title: mapping.catalogTitle } : {}),
          ...(mapping?.confidence === "partial" ? { partial: true } : {}),
        },
      };
    });
  const inactiveNames = result.people.filter((p) => !p.active).map((p) => p.name);
  return { rows, inactiveNames };
}

/**
 * Adds pasted rows to the rows already in the grid. Someone already there
 * (same employee id, or same name) is updated in place and never counts
 * against the limit; only new people do, up to `max` rows in all.
 */
export function addPastedRows(
  kept: readonly OwnTeamRow[],
  incoming: readonly OwnTeamRow[],
  max = OWN_TEAM_MAX,
): { rows: OwnTeamRow[]; added: OwnTeamRow[]; matched: number; notAdded: number } {
  const merged = mergeTeamRows(kept, incoming);
  const room = Math.max(0, max - kept.length);
  const added = merged.added.slice(0, room);
  return {
    rows: [...merged.rows.slice(0, kept.length), ...added],
    added,
    matched: incoming.length - merged.added.length,
    notAdded: merged.added.length - added.length,
  };
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** "Ana, Ben and Cal", or the first five and how many more. */
function nameList(names: readonly string[]): string {
  const shown = names.slice(0, 5);
  const more = names.length - shown.length;
  if (more > 0) return `${shown.join(", ")} and ${more} more`;
  if (shown.length < 2) return shown.join("");
  return `${shown.slice(0, -1).join(", ")} and ${shown[shown.length - 1]}`;
}

/**
 * The note under "Fill the table", and whether the paste stays in the box.
 * The headline counts every person pasted, including rows past the
 * importer's read limit; anyone left out keeps the paste in the box and is
 * pointed to where more people can be added.
 */
export function pasteSummary(input: {
  added: number;
  matched: number;
  notAdded: number;
  /** Rows past the importer's read limit that were not read at all. */
  dropped: number;
  /** The importer's row limit, named when rows were dropped. */
  readLimit?: number;
  recognised: number;
  partial: number;
  unmatched: number;
  inactiveNames: readonly string[];
  ownerRow: "kept" | "replaced" | "none";
  onLeaveNames: readonly string[];
  max?: number;
}): { note: string; keepPaste: boolean } {
  const max = input.max ?? OWN_TEAM_MAX;
  const { added, matched, notAdded, dropped } = input;
  const pasted = added + matched + notAdded + dropped;
  const leftOut = notAdded + dropped;
  const keepPaste = leftOut > 0 || added + matched === 0;
  const already =
    matched > 0
      ? `${plural(matched, "person", "people")} already in the table ${matched === 1 ? "was" : "were"} updated, not added again`
      : "";
  const sentences: string[] = [];
  if (leftOut > 0) {
    const limits = [
      dropped > 0 ? `one paste reads the first ${input.readLimit ?? 250} rows` : "",
      notAdded > 0 ? `this table holds ${max} people` : "",
    ].filter(Boolean);
    sentences.push(
      `Added ${added === 0 && matched === 0 ? "none" : added} of the ${pasted.toLocaleString("en-US")} people${already ? `; ${already}` : ""}.`,
      `${leftOut.toLocaleString("en-US")} not added because ${limits.join(" and ")}. The paste stays in the box: add ${added + matched === 0 ? "them" : "the rest"} in ${MORE_PEOPLE_PLACE} after setup.`,
    );
  } else if (added === 0 && matched > 0) {
    sentences.push(
      matched === 1
        ? "The person in the paste is already in the table; their row was updated, not added again."
        : `All ${matched} people in the paste are already in the table; their rows were updated, not added again.`,
    );
  } else {
    sentences.push(`Added ${plural(added, "person", "people")}${already ? `; ${already}` : ""}.`);
  }
  if (added + matched > 0) {
    const partial =
      input.partial > 0 ? `, ${input.partial} of them only partly (marked in the Role column)` : "";
    const unmatched = input.unmatched
      ? `; ${input.unmatched} not recognised, tick their duties below`
      : "";
    sentences.push(
      `${plural(input.recognised, "title", "titles")} recognised and duties ticked from the catalog${partial}${unmatched}.`,
    );
  }
  if (input.inactiveNames.length > 0) {
    sentences.push(
      `${plural(input.inactiveNames.length, "person", "people")} marked inactive ${input.inactiveNames.length === 1 ? "was" : "were"} left out: ${nameList(input.inactiveNames)}.`,
    );
  }
  if (added + matched === 0) {
    // Nothing changed in the table: the rest of the note would describe rows that are not there.
  } else if (input.ownerRow === "kept") {
    sentences.push("The Owner row stays at the top with its duties ticked: type your name in it.");
  } else if (input.ownerRow === "replaced") {
    sentences.push("The owner in your paste takes the place of the empty Owner row.");
  }
  if (input.onLeaveNames.length > 0) {
    sentences.push(
      `${nameList(input.onLeaveNames)} ${input.onLeaveNames.length === 1 ? "is" : "are"} on leave: kept on the team and recorded as out today in Who knows what when you finish; extend the absence there until they return.`,
    );
  }
  if (added + matched > 0) {
    sentences.push("Check every row: a title is a starting point, not a fact about your business.");
  }
  return { note: sentences.join(" "), keepPaste };
}

/**
 * The grid after adding `count` people with one catalog job and placeholder
 * names. Placeholder numbers continue after every name already in the grid,
 * and no more rows are added than the grid holds.
 */
export function addRowsByTitle(
  rows: readonly OwnTeamRow[],
  entry: JobCatalogEntry,
  count: number,
  industry?: string,
  max = OWN_TEAM_MAX,
): { rows: OwnTeamRow[]; added: number; notAdded: number } {
  const { kept } = rowsKeptForAdding(rows, entry.id === "owner");
  const wanted = Math.max(0, Math.floor(count));
  const room = Math.max(0, max - kept.length);
  const added = rowsForJobTitle(
    entry,
    Math.min(wanted, room),
    kept.map((r) => r.name),
    industry,
  );
  return { rows: [...kept, ...added], added: added.length, notAdded: wanted - added.length };
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
  const allowed = new Set<string>(ENTITLEMENTS.map((e) => e.id));
  return teamRows(rows)
    .map((row) => ({
      fromTitle: dutiesStillFromTitle(row, industry),
      name: row.name.trim().slice(0, 60),
      role: row.role.trim().slice(0, MAX_ROLE_LENGTH) || "Team member",
      duties: row.duties.filter((d) => allowed.has(d)),
      tenureYears:
        typeof row.tenureYears === "number" && Number.isFinite(row.tenureYears)
          ? Math.min(60, Math.max(0, row.tenureYears))
          : undefined,
      department: row.department?.trim().slice(0, 120) || undefined,
      employeeId: row.employeeId?.trim().slice(0, 40) || undefined,
      lastDay: row.lastDay && isCalendarDate(row.lastDay) ? row.lastDay : undefined,
      owner: rowOwnsBusiness(row),
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

/**
 * People whose duties are still the usual ones for their job title, not
 * ones the owner confirmed, among the active team.
 */
export function peopleWithTitleDuties(people: readonly Person[]): Person[] {
  return people.filter((person) => person.active && person.dutiesFromTitle === true);
}

/**
 * One plain sentence saying how many of the active people carry duties
 * guessed from their job title, or an empty string when none do.
 */
export function titleDutiesSentence(people: readonly Person[]): string {
  const total = people.filter((person) => person.active).length;
  const guessed = peopleWithTitleDuties(people).length;
  if (guessed === 0 || total === 0) return "";
  if (total === 1) {
    return "Duties for your one person are the usual ones for their job title, not ones you confirmed.";
  }
  if (guessed === total) {
    return `Duties for all ${total} of your people are the usual ones for their job titles, not ones you confirmed.`;
  }
  return `Duties for ${guessed} of your ${total} people are the usual ones for their job ${
    guessed === 1 ? "title" : "titles"
  }, not ones you confirmed.`;
}

/** The team with every "duties from the job title" mark cleared: the owner has checked them. */
export function confirmTitleDuties(people: readonly Person[]): Person[] {
  return people.map((person) => {
    if (!person.dutiesFromTitle) return person;
    const rest: Person = { ...person };
    delete rest.dutiesFromTitle;
    return rest;
  });
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
