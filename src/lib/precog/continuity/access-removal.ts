import type { IndustryId } from "../industry";
import {
  MAX_LEAVER_CHECKS,
  makeDecisionId,
  type DecisionEntry,
  type LeaverAccessCheck,
} from "../practice-profile";
import type { Person } from "../types";
import { nameKey, uid } from "../text";
import { formatDay } from "../dates";

/**
 * Someone who has left keeps whatever access nobody took away: a login, card
 * or PIN that still works lets them move money or copy records. So each
 * leaver gets one check: are they off payroll, and are their logins gone?
 * The owner confirms it once; the confirmation goes in the decisions log
 * with the day.
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

/** Whether a check is about this person: the same team member, or the same name when either has no id. */
function samePerson(check: LeaverAccessCheck, who: Departure): boolean {
  if (check.personId && who.personId) return check.personId === who.personId;
  return nameKey(check.name) === nameKey(who.name);
}

/**
 * Adds a check for each person who has left, unless one already exists for
 * them in this industry: open (still to confirm) or confirmed (asked once is
 * enough, even when the same roster is pasted again). A team member marked
 * as left again after coming back (a rehire) is a new departure with new
 * logins: a confirmed check gets a new one beside it, and an open one is
 * dated to this departure. Returns the same array when nothing changed.
 */
export function noteDepartures(
  checks: readonly LeaverAccessCheck[],
  departures: readonly Departure[],
  source: LeaverAccessCheck["source"],
  industry: IndustryId,
  today: string,
): LeaverAccessCheck[] {
  const added: LeaverAccessCheck[] = [];
  const redated = new Map<string, LeaverAccessCheck>();
  for (const who of departures) {
    if (!who.name.trim()) continue;
    // Only the owner marking a known team member as left is a fresh departure;
    // a roster pasted again describes the same one.
    const leftAgain = source === "marked" && Boolean(who.personId);
    const prior = [...added, ...checks].find(
      (check) => check.industry === industry && samePerson(check, who),
    );
    if (prior && !leftAgain) continue;
    if (prior && !prior.confirmedOn) {
      if (prior.notedOn !== today || prior.source !== source) {
        const { prompted: _prompted, ...rest } = redated.get(prior.id) ?? prior;
        redated.set(prior.id, { ...rest, notedOn: today, source });
      }
      continue;
    }
    added.push({
      id: uid("lac"),
      ...(who.personId ? { personId: who.personId } : {}),
      name: who.name.trim().slice(0, 80),
      ...(who.role?.trim() ? { role: who.role.trim().slice(0, 120) } : {}),
      industry,
      notedOn: today,
      source,
    });
  }
  if (added.length === 0 && redated.size === 0) return checks as LeaverAccessCheck[];
  // Newest first; the oldest confirmed checks drop off past the cap, never an open one.
  const all = [...added, ...checks.map((check) => redated.get(check.id) ?? check)];
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
      note: `On ${formatDay(today)} you confirmed that ${leaverLabel(check)} is off payroll and that their logins are removed: bank, payroll, point of sale, and practice or business software. ${
        check.source === "roster"
          ? `Noted as left from a roster on ${formatDay(check.notedOn)}.`
          : `Marked as left on ${formatDay(check.notedOn)}.`
      }`,
      linkedTab: "knowledge",
      ...(check.personId ? { linkedPersonId: check.personId } : {}),
      status: "closed",
    });
    return { ...check, prompted: true as const, confirmedOn: today };
  });
  return { checks: next, decisions };
}

/** How a leaver is named to the owner: "Jordan Lee (Keyholder)", or the name alone. */
export function leaverLabel(check: Pick<LeaverAccessCheck, "name" | "role">): string {
  return check.role ? `${check.name} (${check.role})` : check.name;
}
