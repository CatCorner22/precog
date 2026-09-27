/**
 * Adding people to the setup grid: from a pasted roster, where someone
 * already in the grid is updated rather than added twice, or by job title
 * with placeholder names.
 */

import type { Departure } from "../continuity/access-removal";
import type { PeopleImportResult } from "../import/people-csv";
import { industryHasOwner } from "../industry";
import type { Person } from "../types";
import { count, joinWithAnd, nameKey, titleKey, verb } from "../text";
import { clamp } from "../number";
import { aliasKey, entitlementsForTitle, type JobCatalogEntry } from "./job-catalog";
import {
  OWN_TEAM_MAX,
  gridDuties,
  isLeaderTitle,
  rowOwnsBusiness,
  rowsKeptForAdding,
  suggestedDuties,
  type FirstRowOutcome,
  type OwnTeamRow,
} from "./own-team";

/** What pasting a roster did: the new grid (null when unchanged), the note, and who it left out. */
export interface PasteOutcome {
  rows: OwnTeamRow[] | null;
  /** The note under "Fill the table". */
  note: string;
  /** Anyone not added keeps the paste in the box, to add later. */
  keepPaste: boolean;
  /**
   * Everyone a paste so far marked terminated or inactive, each person once:
   * finishing asks the owner to confirm their pay and logins are stopped.
   */
  leftOut: Departure[];
}

/** Where an owner adds people once the setup table is full. */
export const MORE_PEOPLE_PLACE = "How work flows > Build > Team";

/**
 * Fills the grid from a pasted HR or payroll export, or a plain "Name,
 * Title" list, already read by the importer. Someone already in the grid
 * (same employee id or name) is updated, not added twice; only new people
 * count toward the limit. The unnamed Owner or Executive Director row stays
 * at the top unless the paste brings its own. People the paste marks
 * inactive are left out of the grid and added to `leftOut`.
 */
export function applyPaste(
  rows: readonly OwnTeamRow[],
  result: PeopleImportResult,
  industry: string,
  leftOut: readonly Departure[] = [],
): PasteOutcome {
  const { rows: incoming, inactiveNames } = pastedRows(result, industry);
  const known = new Set(leftOut.map((who) => nameKey(who.name)));
  const departures = [...leftOut];
  for (const person of result.people.filter((p) => !p.active)) {
    if (known.has(nameKey(person.name))) continue;
    known.add(nameKey(person.name));
    departures.push({ name: person.name, role: person.role });
  }
  if (incoming.length === 0) {
    const note =
      result.people.length > 0
        ? `The paste marks all ${count(result.people.length, "person", "people")} as having left, so the table adds none of them: ${joinWithAnd(inactiveNames, 5)}.`
        : (result.issues[0]?.message ?? "No names found. One person per line: Name, Title.");
    return { rows: null, note, keepPaste: true, leftOut: departures };
  }
  const { kept, ownerRow } = rowsKeptForAdding(
    rows,
    incoming.some((r) => rowOwnsBusiness(r, industry)),
    incoming.some((r) => isLeaderTitle(r.role)),
  );
  const outcome = addPastedRows(kept, incoming);
  const inGrid = new Set(outcome.rows.map((r) => r.name));
  const pasted = new Set(incoming.map((r) => r.name));
  const titlesRead = result.titles.filter((t) => inGrid.has(t.name) && pasted.has(t.name));
  const recognised = titlesRead.filter((t) => t.catalogTitle).length;
  const summary = pasteSummary({
    added: outcome.added.length,
    matched: outcome.matched,
    notAdded: outcome.notAdded,
    dropped: result.dropped ?? 0,
    recognised,
    partial: titlesRead.filter((t) => t.catalogTitle && t.confidence === "partial").length,
    unmatched: titlesRead.length - recognised,
    inactiveNames,
    ownerRow,
    onLeaveNames: incoming.filter((r) => r.onLeave && inGrid.has(r.name)).map((r) => r.name),
  });
  return { rows: outcome.rows, ...summary, leftOut: departures };
}

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
  const unread = [...result.titles];
  // Two people may share a name: each takes the first reading not yet taken
  // with their name and title, else with their name.
  const readingFor = (person: Person) => {
    const index = [
      unread.findIndex((t) => t.name === person.name && nameKey(t.title) === nameKey(person.role)),
      unread.findIndex((t) => t.name === person.name),
    ].find((i) => i >= 0);
    return index === undefined ? undefined : unread.splice(index, 1)[0];
  };
  const rows = result.people
    .filter((person) => person.active)
    .map((person) => {
      const mapping = readingFor(person);
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
    duties: gridDuties(person.entitlements ?? entitlementsForTitle(person.role, industry)),
    ...(person.tenureYears !== undefined ? { tenureYears: person.tenureYears } : {}),
    ...(person.department ? { department: person.department } : {}),
    ...(person.employeeId ? { employeeId: person.employeeId } : {}),
    ...(person.lastDay ? { lastDay: person.lastDay } : {}),
    suggestedFor: person.role,
    ...(onLeave ? { onLeave: true } : {}),
  };
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
): { rows: OwnTeamRow[]; added: OwnTeamRow[] } {
  const rows = [...current];
  const matched = new Set<number>();
  const added: OwnTeamRow[] = [];
  for (const row of incoming) {
    const id = row.employeeId ? nameKey(row.employeeId) : "";
    const name = nameKey(row.name);
    let index = id
      ? rows.findIndex((r, i) => !matched.has(i) && r.employeeId && nameKey(r.employeeId) === id)
      : -1;
    if (index < 0 && name) {
      index = rows.findIndex(
        (r, i) =>
          !matched.has(i) &&
          nameKey(r.name) === name &&
          !(id && r.employeeId && nameKey(r.employeeId) !== id),
      );
    }
    if (index < 0) {
      added.push(row);
      continue;
    }
    matched.add(index);
    const before = rows[index];
    const sameTitle = nameKey(before.role) === nameKey(row.role);
    rows[index] = {
      ...before,
      ...row,
      ...(sameTitle ? { duties: before.duties, suggestedFor: before.suggestedFor } : {}),
    };
  }
  return { rows: [...rows, ...added], added };
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
  /** Titles found in the catalog, of the people added or updated. */
  recognised: number;
  partial: number;
  unmatched: number;
  inactiveNames: readonly string[];
  ownerRow: FirstRowOutcome;
  onLeaveNames: readonly string[];
  max?: number;
}): { note: string; keepPaste: boolean } {
  const max = input.max ?? OWN_TEAM_MAX;
  const { added, matched, notAdded, dropped } = input;
  const changed = added + matched;
  const leftOut = notAdded + dropped;
  const keepPaste = leftOut > 0 || changed === 0;
  const sentences = [
    headline(input, max),
    changed > 0 ? titlesSentence(input) : "",
    input.inactiveNames.length > 0
      ? `Left out ${count(input.inactiveNames.length, "person", "people")} the roster marks inactive: ${joinWithAnd(input.inactiveNames, 5)}.`
      : "",
    // Nothing changed in the table: the rest of the note would describe rows that are not there.
    changed > 0 ? FIRST_ROW_SENTENCE[input.ownerRow] : "",
    input.onLeaveNames.length > 0
      ? `${joinWithAnd(input.onLeaveNames, 5)} ${verb(input.onLeaveNames.length, "is", "are")} on leave: finishing keeps them on the team and records them as out today in Who knows what; extend the absence there until they return.`
      : "",
    changed > 0
      ? "Check every row: a title is a starting point, not a fact about your business."
      : "",
  ];
  return { note: sentences.filter(Boolean).join(" "), keepPaste };
}

/**
 * The grid after adding `count` people with one catalog job and placeholder
 * names. Placeholder numbers continue after every name already in the grid,
 * and no more rows are added than the grid holds.
 */
export function addRowsByTitle(
  rows: readonly OwnTeamRow[],
  entry: JobCatalogEntry,
  wanted: number,
  industry?: string,
  max = OWN_TEAM_MAX,
): { rows: OwnTeamRow[]; added: number; notAdded: number } {
  const { kept } = rowsKeptForAdding(
    rows,
    industryHasOwner(industry) && entry.id === "owner",
    entry.id === "executive-director",
  );
  const n = Math.max(0, Math.floor(wanted));
  const room = Math.max(0, max - kept.length);
  const added = rowsForJobTitle(
    entry,
    Math.min(n, room),
    kept.map((r) => r.name),
    industry,
  );
  return { rows: [...kept, ...added], added: added.length, notAdded: n - added.length };
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
  wanted: number,
  existing: number | readonly string[] = 0,
  industry?: string,
): OwnTeamRow[] {
  const n = clamp(Math.floor(wanted), 0, OWN_TEAM_MAX);
  // The same duties typing the title ticks, so the rows keep their "duties
  // from the title" mark.
  const duties = suggestedDuties(
    entry.title,
    rowOwnsBusiness({ role: entry.title }, industry),
    industry,
  );
  const base = placeholderBase(entry);
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
 * `count` placeholder names for one job ("Server 4", "Server 5"), numbered
 * after the highest number already used with that word and never repeating
 * a name in `taken`, so removing "Server 2" and adding one more gives
 * "Server 4", not a second "Server 3".
 */
export function placeholderNames(base: string, wanted: number, taken: readonly string[]): string[] {
  const used = new Set(taken.map(titleKey));
  const pattern = new RegExp(`^${titleKey(base).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")} (\\d+)$`);
  let next =
    Math.max(0, ...taken.map((name) => Number(titleKey(name).match(pattern)?.[1] ?? 0))) + 1;
  const names: string[] = [];
  while (names.length < wanted) {
    const name = `${base} ${next++}`;
    if (!used.has(titleKey(name))) names.push(name);
  }
  return names;
}

/**
 * The word a job's placeholder names start with: the catalog title without
 * its bracket, and of a title listing several names, the first name when it
 * is a job on its own ("Chef" of "Chef / Kitchen Manager") and otherwise the
 * first word with the shared noun ("General Manager" of "General /
 * Operations Manager", "Bus Driver" of "Bus / Van Driver").
 */
function placeholderBase(entry: JobCatalogEntry): string {
  const title = entry.title.replace(/\s*\([^)]*\)\s*/g, " ").trim();
  const parts = title.split(/\s*\/\s*/);
  const first = parts[0];
  if (parts.length === 1 || /\s/.test(first)) return first;
  const names = new Set([entry.title, ...entry.aliases].map(aliasKey));
  const noun = parts[parts.length - 1].split(/\s+/);
  return names.has(aliasKey(first)) || noun.length === 1
    ? first
    : `${first} ${noun[noun.length - 1]}`;
}

/** The first sentence: how many people the paste added and updated, and who it could not add. */
function headline(
  input: { added: number; matched: number; notAdded: number; dropped: number; readLimit?: number },
  max: number,
): string {
  const { added, matched, notAdded, dropped } = input;
  const pasted = added + matched + notAdded + dropped;
  const leftOut = notAdded + dropped;
  const updated =
    matched > 0 ? ` and updated ${count(matched, "person", "people")} already in the table` : "";
  if (leftOut > 0) {
    const limits = [
      dropped > 0 ? `one paste reads the first ${input.readLimit ?? 250} rows` : "",
      notAdded > 0 ? `this table holds ${max} people` : "",
    ].filter(Boolean);
    return [
      `Added ${added === 0 && matched === 0 ? "none" : added} of the ${pasted.toLocaleString("en-US")} people${updated}.`,
      `Could not add ${leftOut.toLocaleString("en-US")} because ${limits.join(" and ")}. The paste stays in the box: add ${added + matched === 0 ? "them" : "the rest"} in ${MORE_PEOPLE_PLACE} after setup.`,
    ].join(" ");
  }
  if (added === 0 && matched > 0) {
    return matched === 1
      ? "Updated the row of the person already in the table instead of adding them again."
      : `Updated the rows of all ${matched} people already in the table instead of adding them again.`;
  }
  return `Added ${count(added, "person", "people")}${updated}.`;
}

/** How many titles the catalog knew, how many only partly, and how many it did not. */
function titlesSentence(input: { recognised: number; partial: number; unmatched: number }): string {
  const partial =
    input.partial > 0 ? `, ${input.partial} of them only partly (marked in the Role column)` : "";
  const unmatched =
    input.unmatched > 0
      ? `; ${count(input.unmatched, "title is", "titles are")} not in the catalog: tick those duties below`
      : "";
  return `Found ${count(input.recognised, "title", "titles")} in the catalog and ticked their duties${partial}${unmatched}.`;
}

/** What the note says about the grid's first row after a paste. */
const FIRST_ROW_SENTENCE: Record<FirstRowOutcome, string> = {
  kept: "The Owner row stays at the top with its duties ticked: type your name in it.",
  replaced: "The owner in your paste takes the place of the empty Owner row.",
  "leader-kept":
    "The Executive Director row stays at the top with its duties ticked: type their name in it.",
  "leader-replaced":
    "The executive director in your paste takes the place of the empty Executive Director row.",
  none: "",
};
