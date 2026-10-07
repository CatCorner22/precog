import type { IndustryId } from "../industry";
import {
  trimLeaverChecks,
  makeDecisionId,
  type DecisionEntry,
  type LeaverAccessCheck,
} from "../practice-profile";
import type { Person } from "../types";
import { joinWithAnd, nameKey, uid } from "../text";
import { formatDay, formatDayNear, isCalendarDate } from "../dates";

/**
 * Someone who has left keeps whatever access nobody took away: a login, card
 * or PIN that still works lets them move money or copy records. So each
 * leaver gets one check: are they off payroll, and are their logins gone?
 * The owner confirms it once; the confirmation goes in the decisions log
 * with the day.
 */

/**
 * One thing to check for someone who has left: its id, and how the decisions
 * log names it ("donor database"). The checklist's longer wording for each
 * line of business is in `leaver-access-items.ts`, loaded only by the Team
 * tab's checklist.
 */
export interface LeaverAccessItemKey {
  id: string;
  short: string;
}

const OFF_PAYROLL: LeaverAccessItemKey = { id: "payroll", short: "pay" };
const PAYROLL_LOGIN: LeaverAccessItemKey = { id: "payroll_login", short: "payroll" };
const BANK: LeaverAccessItemKey = { id: "bank", short: "bank" };
const KEYS: LeaverAccessItemKey = { id: "keys", short: "keys" };
const EMAIL: LeaverAccessItemKey = { id: "email", short: "email" };
/** Email together with other software, under the id "software". */
const EMAIL_SOFTWARE: LeaverAccessItemKey = { id: "software", short: "email" };

/**
 * What each line of business checks when someone leaves: a restaurant's safe
 * combination and POS PIN, a nonprofit's PO box, donor database and online
 * giving platform. Pay and the bank come first everywhere.
 */
const ITEMS_BY_INDUSTRY: Record<IndustryId, readonly LeaverAccessItemKey[]> = {
  dental: [
    OFF_PAYROLL,
    BANK,
    PAYROLL_LOGIN,
    { id: "practice_software", short: "practice software" },
    { id: "insurance", short: "insurance portals" },
    KEYS,
    EMAIL,
  ],
  retail: [
    OFF_PAYROLL,
    BANK,
    PAYROLL_LOGIN,
    { id: "pos", short: "point of sale" },
    { id: "online_store", short: "online store" },
    { id: "keys", short: "store keys" },
    EMAIL,
  ],
  professional_services: [
    OFF_PAYROLL,
    { id: "bank", short: "bank and trust accounts" },
    PAYROLL_LOGIN,
    { id: "billing", short: "billing software" },
    { id: "agency", short: "tax agency access" },
    KEYS,
    EMAIL,
  ],
  restaurant: [
    OFF_PAYROLL,
    BANK,
    PAYROLL_LOGIN,
    { id: "pos", short: "POS PIN" },
    { id: "safe", short: "safe combination" },
    KEYS,
    { id: "ordering", short: "delivery apps" },
    EMAIL,
  ],
  construction: [
    OFF_PAYROLL,
    BANK,
    PAYROLL_LOGIN,
    { id: "cards", short: "fuel cards" },
    { id: "equipment", short: "job site keys" },
    { id: "software", short: "project software" },
  ],
  automotive: [
    OFF_PAYROLL,
    BANK,
    PAYROLL_LOGIN,
    { id: "shop_system", short: "shop management system" },
    { id: "parts", short: "parts accounts" },
    KEYS,
    EMAIL,
  ],
  nonprofit: [
    OFF_PAYROLL,
    BANK,
    PAYROLL_LOGIN,
    { id: "donors", short: "donor database" },
    { id: "giving", short: "online giving platform" },
    { id: "mail", short: "PO box" },
    EMAIL_SOFTWARE,
  ],
  general: [OFF_PAYROLL, BANK, PAYROLL_LOGIN, KEYS, EMAIL_SOFTWARE],
};

/** The checklist's ids and short names for someone who has left this line of business. */
export function leaverAccessKeys(industry: IndustryId): readonly LeaverAccessItemKey[] {
  return ITEMS_BY_INDUSTRY[industry] ?? ITEMS_BY_INDUSTRY.general;
}

/** Whether someone whose last day is `lastDay` has left by `today` (both YYYY-MM-DD). */
export function hasLeftBy(lastDay: string, today: string): boolean {
  return lastDay <= today;
}

/** One person leaving: who, and how Precog learned. */
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
  return trimLeaverChecks([...added, ...checks.map((check) => redated.get(check.id) ?? check)]);
}

/**
 * Whether marking `person` as left raises a pay-and-sign-ins check: a sample
 * team's person (same id and name as `sample`) is nobody's staff and never does.
 */
export function raisesLeaverCheck(person: Person, sample: readonly Person[]): boolean {
  return !sample.some((s) => s.id === person.id && nameKey(s.name) === nameKey(person.name));
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
  return after
    .filter((person) => !person.active && (was.get(person.id)?.active ?? true))
    .filter((person) => raisesLeaverCheck(person, sample))
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

/**
 * The names of the people whose pay-and-sign-ins checklist is on screen
 * (the open checks), each once, in checklist order. The "Leaving the team"
 * card names exactly these people when it points at the checklist.
 */
export function leaverAccessNames(
  checks: readonly LeaverAccessCheck[] | undefined,
  industry: IndustryId,
  people: readonly Person[],
): string[] {
  return [...new Set(openAccessChecks(checks, industry, people).map((check) => check.name))];
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
      subject: `${check.name} has left: pay and sign-ins stopped`.slice(0, 120),
      kind: "remediate",
      note: `On ${formatDay(today)} you confirmed that ${leaverLabel(check)} is off payroll and that you have removed their access: ${joinWithAnd(
        leaverAccessKeys(check.industry)
          .filter((item) => item.id !== OFF_PAYROLL.id)
          .map((item) => item.short),
      )}. ${
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

/**
 * The owner says someone left the business, with their last day. A last
 * day today or earlier marks them as left: kept for history, holding no live
 * duty. A later one keeps them at work on notice until then. A date that is
 * not a calendar day changes nothing.
 */
export function recordLastDay(
  people: readonly Person[],
  personId: string,
  lastDay: string,
  today: string,
): Person[] {
  if (!isCalendarDate(lastDay) || !isCalendarDate(today)) return people as Person[];
  const gone = hasLeftBy(lastDay, today);
  return people.map((person) =>
    person.id === personId ? { ...person, active: !gone, lastDay } : person,
  );
}

/** Undo: puts one person back exactly as they were, leaving every other change on the team. */
export function restorePerson(people: readonly Person[], prior: Person): Person[] {
  return people.map((person) => (person.id === prior.id ? prior : person));
}

/** "last day Oct 3, marked as left Oct 7": when they went, and when Precog was told. */
export function leaverLine(
  check: Pick<LeaverAccessCheck, "notedOn" | "source">,
  person: Pick<Person, "lastDay"> | undefined,
  today: string,
): string {
  const lastDay =
    person?.lastDay && isCalendarDate(person.lastDay)
      ? `last day ${formatDayNear(person.lastDay, today)}, `
      : "";
  return check.source === "roster"
    ? `${lastDay}listed as no longer working here in the roster you pasted on ${formatDayNear(check.notedOn, today)}`
    : `${lastDay}marked as left ${formatDayNear(check.notedOn, today)}`;
}
