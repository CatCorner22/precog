import type { IndustryId } from "../industry";
import {
  MAX_LEAVER_CHECKS,
  makeDecisionId,
  type DecisionEntry,
  type LeaverAccessCheck,
} from "../practice-profile";
import type { Person } from "../types";

/**
 * Someone who has left keeps whatever access nobody took away. Former staff
 * using a login that still works is a documented path to fraud and data
 * theft, so each leaver gets one check: are they off payroll, and are their
 * logins gone? The owner confirms it once; the confirmation goes in the
 * decisions log with the day.
 */

/** The logins the owner confirms are removed, in the words the prompt uses. */
export const LEAVER_ACCESS_ITEMS = [
  { id: "payroll", label: "Off payroll: no more pay runs or direct deposits to them" },
  { id: "bank", label: "Bank logins and cards removed, and their name off the bank's signer list" },
  { id: "payroll_login", label: "Payroll system login removed" },
  { id: "pos", label: "Point-of-sale or till login and PIN removed" },
  {
    id: "software",
    label: "Practice or business software logins removed (email, bookkeeping, scheduling)",
  },
] as const;

export type LeaverAccessItem = (typeof LEAVER_ACCESS_ITEMS)[number]["id"];

/** One person leaving: who, and how the app learned. */
export interface Departure {
  personId?: string;
  name: string;
  role?: string;
}

const nameKey = (name: string) => name.trim().toLowerCase().replace(/\s+/g, " ");

/** Whether a check is about this person: the same team member, or the same name when either has no id. */
function samePerson(check: LeaverAccessCheck, who: Departure): boolean {
  if (check.personId && who.personId) return check.personId === who.personId;
  return nameKey(check.name) === nameKey(who.name);
}

function makeCheckId(): string {
  return `lac_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}

/**
 * Adds a check for each person who has left, unless one already exists for
 * them in this industry: open (still to confirm) or confirmed (asked once is
 * enough, even when the same roster is pasted again). Returns the same array
 * when nothing was added.
 */
export function noteDepartures(
  checks: readonly LeaverAccessCheck[],
  departures: readonly Departure[],
  source: LeaverAccessCheck["source"],
  industry: IndustryId,
  today: string,
): LeaverAccessCheck[] {
  const added: LeaverAccessCheck[] = [];
  for (const who of departures) {
    if (!who.name.trim()) continue;
    const known = [...checks, ...added].some(
      (check) => check.industry === industry && samePerson(check, who),
    );
    if (known) continue;
    added.push({
      id: makeCheckId(),
      ...(who.personId ? { personId: who.personId } : {}),
      name: who.name.trim().slice(0, 80),
      ...(who.role?.trim() ? { role: who.role.trim().slice(0, 120) } : {}),
      industry,
      notedOn: today,
      source,
    });
  }
  if (added.length === 0) return checks as LeaverAccessCheck[];
  // Newest first; the oldest confirmed checks drop off past the cap, never an open one.
  const all = [...added, ...checks];
  while (all.length > MAX_LEAVER_CHECKS) {
    let lastConfirmed = all.length - 1;
    while (lastConfirmed >= 0 && !all[lastConfirmed].confirmedOn) lastConfirmed--;
    if (lastConfirmed < 0) break;
    all.splice(lastConfirmed, 1);
  }
  return all;
}

/**
 * People on the team who went from working here to left in this change,
 * or who arrive already marked as left (an imported roster's terminated
 * rows). The sample team's people are not anyone's staff and never count.
 */
export function departuresBetween(
  before: readonly Person[] | null | undefined,
  after: readonly Person[] | null | undefined,
  sample: readonly Person[] = [],
): Departure[] {
  if (!after) return [];
  const was = new Map((before ?? []).map((person) => [person.id, person]));
  const isSample = (person: Person) =>
    sample.some((s) => s.id === person.id && nameKey(s.name) === nameKey(person.name));
  return after
    .filter((person) => !person.active && (was.get(person.id)?.active ?? true))
    .filter((person) => !isSample(person))
    .map((person) => ({ personId: person.id, name: person.name, role: person.role }));
}

/**
 * Checks the owner still has to confirm for this business. A person marked
 * as left and then back at work (an undo, a rehire) has nothing to confirm.
 */
export function openAccessChecks(
  checks: readonly LeaverAccessCheck[] | undefined,
  industry: IndustryId,
  people: readonly Person[],
): LeaverAccessCheck[] {
  const working = new Set(people.filter((person) => person.active).map((person) => person.id));
  return (checks ?? []).filter(
    (check) =>
      check.industry === industry &&
      !check.confirmedOn &&
      !(check.personId && working.has(check.personId)),
  );
}

/** Open checks the owner has not been prompted about yet: the prompt shows each person once. */
export function unpromptedAccessChecks(
  checks: readonly LeaverAccessCheck[] | undefined,
  industry: IndustryId,
  people: readonly Person[],
): LeaverAccessCheck[] {
  return openAccessChecks(checks, industry, people).filter((check) => !check.prompted);
}

/** Marks checks as prompted, so the prompt does not come back for them. */
export function markPrompted(
  checks: readonly LeaverAccessCheck[],
  ids: readonly string[],
): LeaverAccessCheck[] {
  const set = new Set(ids);
  return checks.map((check) =>
    set.has(check.id) && !check.prompted ? { ...check, prompted: true as const } : check,
  );
}

/** "Jordan Lee (Keyholder)", or the name alone. */
function who(check: LeaverAccessCheck): string {
  return check.role ? `${check.name} (${check.role})` : check.name;
}

/**
 * The owner confirmed, on `today`, that these people are off payroll and
 * their logins are removed. Closes their checks and returns one decisions-log
 * entry per person, dated, saying what was confirmed.
 */
export function confirmAccessRemoved(
  checks: readonly LeaverAccessCheck[],
  ids: readonly string[],
  today: string,
  now: Date = new Date(),
): { checks: LeaverAccessCheck[]; decisions: DecisionEntry[] } {
  const set = new Set(ids);
  const decisions: DecisionEntry[] = [];
  const next = checks.map((check) => {
    if (!set.has(check.id) || check.confirmedOn) return check;
    decisions.push({
      id: makeDecisionId(),
      createdAt: now.toISOString(),
      subject: `${check.name} has left: pay and logins stopped`.slice(0, 120),
      kind: "remediate",
      note: `On ${today} you confirmed that ${who(check)} is off payroll and that their logins are removed: bank, payroll, point of sale, and practice or business software. ${
        check.source === "roster"
          ? `Noted as left from a roster on ${check.notedOn}.`
          : `Marked as left on ${check.notedOn}.`
      }`,
      linkedTab: "knowledge",
      ...(check.personId ? { linkedPersonId: check.personId } : {}),
      status: "closed",
    });
    return { ...check, prompted: true as const, confirmedOn: today };
  });
  return { checks: next, decisions };
}

/** "Jordan Lee" / "Jordan Lee and Pat Kim" / "Jordan Lee, Pat Kim and 3 more". */
export function leaverNames(checks: readonly LeaverAccessCheck[]): string {
  const names = checks.map((check) => check.name);
  if (names.length <= 2) return names.join(" and ");
  if (names.length === 3) return `${names[0]}, ${names[1]} and ${names[2]}`;
  return `${names.slice(0, 2).join(", ")} and ${names.length - 2} more`;
}
