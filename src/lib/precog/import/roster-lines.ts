/** Headerless roster lines: "Ana Ruiz, Front Desk" and "Smith, John - Bookkeeper". */
import { matchJobTitle } from "../onboarding/job-catalog";
import { parseRows } from "./csv";
import { looksLikeGivenNames, looksLikeSurname, NAME_SUFFIXES, wordKey } from "./roster-names";

const LIST_MARKER = /^(\(\d+\)|\d+[.)]|[-*•·–—])\s+/;

const SPACED_DASH = /\s[-–—]\s/;

/**
 * True when the text before a dash or a bracket is a "Last, First" name
 * rather than a name and a title: "Smith, John", "Roe, Jane, DDS". The part
 * after the comma must not be a known title, and either the surname is one
 * word or the part after the dash is a known title ("Ruiz Lopez, Ana - Cook").
 */
function leadsWithLastFirst(head: string, next: string): boolean {
  const pieces = head.split(",").map((piece) => piece.trim());
  if (pieces.length < 2 || pieces.length > 3) return false;
  const [last, given, credential] = pieces;
  if (credential !== undefined && !NAME_SUFFIXES.has(wordKey(credential))) return false;
  if (!looksLikeGivenNames(given) || matchJobTitle(given)) return false;
  return looksLikeSurname(last, true) || (looksLikeSurname(last) && Boolean(matchJobTitle(next)));
}

/**
 * "Ana Ruiz (Front Desk)" as ["Ana Ruiz", "Front Desk"]: the text before the
 * last bracket and the text inside it, when the line ends with that bracket
 * and nothing inside it is a bracket. A scan, not a regular expression: the
 * pattern it replaces retried from every character of a long run of spaces
 * and froze the page on a pasted line such as "Ana, Clerk (" followed by
 * thousands of spaces.
 */
function trailingBracket(source: string): [string, string, string] | null {
  if (!source.endsWith(")")) return null;
  const open = source.lastIndexOf("(", source.length - 2);
  if (open <= 0) return null;
  const inner = source.slice(open + 1, -1);
  if (inner.length === 0 || inner.includes(")")) return null;
  const before = source.slice(0, open).trimEnd();
  if (before.length === 0) return null;
  return [source, before, inner];
}

/**
 * Splits one line of a headerless list into name, title and department: on
 * tabs first, then " | ", then ": ", then commas or spaced dashes, whichever
 * separates the name ("Ana Ruiz, Front Desk - Evenings" keeps its title whole;
 * "Smith, John - Bookkeeper" is a "Last, First" name), then a bracket.
 */
export function splitListLine(line: string): string[] {
  const source = line.trim().replace(LIST_MARKER, "");
  let parts: string[];
  if (source.includes("\t")) parts = source.split("\t");
  else if (source.includes(" | ")) parts = source.split(" | ");
  else if (source.includes(": ")) parts = source.split(": ");
  else {
    const dash = source.search(SPACED_DASH);
    const comma = source.indexOf(",");
    const parenthetical = trailingBracket(source);
    if (dash >= 0 && (comma < 0 || comma > dash)) parts = source.split(SPACED_DASH);
    else if (
      dash >= 0 &&
      leadsWithLastFirst(source.slice(0, dash), source.slice(dash).split(SPACED_DASH)[1] ?? "")
    ) {
      parts = source.split(SPACED_DASH);
    } else if (
      parenthetical &&
      (comma < 0 || leadsWithLastFirst(parenthetical[1], parenthetical[2]))
    ) {
      parts = [parenthetical[1], parenthetical[2]];
    } else if (comma >= 0) parts = parseRows(source, ",")[0] ?? [source];
    else parts = [source];
  }
  return parts.map((part) => part.trim());
}
