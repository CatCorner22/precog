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

/** One thing to check for someone who has left, in the words the checklist uses. */
export interface LeaverAccessItemDef {
  id: string;
  label: string;
  /** How the decisions log names it: "donor database". */
  short: string;
}

const OFF_PAYROLL: LeaverAccessItemDef = {
  id: "payroll",
  label: "Off payroll: no more pay runs or direct deposits to them",
  short: "pay",
};
const PAYROLL_LOGIN: LeaverAccessItemDef = {
  id: "payroll_login",
  label: "Payroll system sign-in removed",
  short: "payroll",
};
const BANK: LeaverAccessItemDef = {
  id: "bank",
  label: "Bank sign-ins and cards removed, and their name off the bank's signer list",
  short: "bank",
};

/**
 * What each line of business checks when someone leaves, in that business's
 * own words: a restaurant's safe combination and POS PIN, a nonprofit's PO
 * box, donor database and online giving platform. Pay and the bank come
 * first everywhere.
 */
const ITEMS_BY_INDUSTRY: Record<IndustryId, readonly LeaverAccessItemDef[]> = {
  dental: [
    OFF_PAYROLL,
    BANK,
    PAYROLL_LOGIN,
    {
      id: "practice_software",
      label: "Practice software sign-in removed (scheduling, billing and patient records)",
      short: "practice software",
    },
    {
      id: "insurance",
      label: "Insurance portal and claims clearinghouse sign-ins removed",
      short: "insurance portals",
    },
    {
      id: "keys",
      label: "Office keys returned and the alarm code changed",
      short: "keys",
    },
    {
      id: "email",
      label: "Email and bookkeeping sign-ins removed",
      short: "email",
    },
  ],
  retail: [
    OFF_PAYROLL,
    BANK,
    PAYROLL_LOGIN,
    {
      id: "pos",
      label: "Point-of-sale sign-in, PIN and any manager override code removed",
      short: "point of sale",
    },
    {
      id: "online_store",
      label: "Online store and supplier account sign-ins removed",
      short: "online store",
    },
    {
      id: "keys",
      label: "Store keys returned, and the alarm code and safe combination changed",
      short: "store keys",
    },
    {
      id: "email",
      label: "Email and bookkeeping sign-ins removed",
      short: "email",
    },
  ],
  professional_services: [
    OFF_PAYROLL,
    {
      id: "bank",
      label:
        "Bank sign-ins and cards removed, including the client trust account, and their name off every signer list",
      short: "bank and trust accounts",
    },
    PAYROLL_LOGIN,
    {
      id: "billing",
      label: "Time and billing, document and client portal sign-ins removed",
      short: "billing software",
    },
    {
      id: "agency",
      label: "Their access to tax agency and other government accounts through the firm removed",
      short: "tax agency access",
    },
    {
      id: "keys",
      label: "Office keys returned and the alarm code changed",
      short: "keys",
    },
    {
      id: "email",
      label: "Email and accounting software sign-ins removed",
      short: "email",
    },
  ],
  restaurant: [
    OFF_PAYROLL,
    BANK,
    PAYROLL_LOGIN,
    { id: "pos", label: "POS PIN and manager card removed", short: "POS PIN" },
    { id: "safe", label: "Safe combination changed", short: "safe combination" },
    {
      id: "keys",
      label: "Keys returned and the alarm code changed",
      short: "keys",
    },
    {
      id: "ordering",
      label: "Delivery app, online ordering and supplier account sign-ins removed",
      short: "delivery apps",
    },
    {
      id: "email",
      label: "Email and accounting software sign-ins removed",
      short: "email",
    },
  ],
  construction: [
    OFF_PAYROLL,
    BANK,
    PAYROLL_LOGIN,
    {
      id: "cards",
      label: "Fuel cards and supplier or lumber yard accounts closed to them",
      short: "fuel cards",
    },
    {
      id: "equipment",
      label:
        "Company vehicle, tools and equipment returned, and job site keys and lockbox codes changed",
      short: "job site keys",
    },
    {
      id: "software",
      label: "Email, estimating, project and accounting software sign-ins removed",
      short: "project software",
    },
  ],
  automotive: [
    OFF_PAYROLL,
    BANK,
    PAYROLL_LOGIN,
    {
      id: "shop_system",
      label: "Shop or dealer management system sign-in removed",
      short: "shop management system",
    },
    {
      id: "parts",
      label: "Parts supplier, warranty portal and fuel card access removed",
      short: "parts accounts",
    },
    {
      id: "keys",
      label: "Building keys returned, the alarm code changed, and the customer key cabinet checked",
      short: "keys",
    },
    {
      id: "email",
      label: "Email and accounting software sign-ins removed",
      short: "email",
    },
  ],
  nonprofit: [
    OFF_PAYROLL,
    {
      id: "bank",
      label:
        "Bank sign-ins and organization cards removed, and their name off the bank's signer list",
      short: "bank",
    },
    PAYROLL_LOGIN,
    { id: "donors", label: "Donor database sign-in removed", short: "donor database" },
    {
      id: "giving",
      label:
        "Online giving platform sign-in removed, and its payouts still going to the organization's bank account",
      short: "online giving platform",
    },
    {
      id: "mail",
      label: "Mail and PO box key returned, and someone still here now receives the mailed checks",
      short: "PO box",
    },
    {
      id: "software",
      label: "Email and organization software sign-ins removed (accounting, grants)",
      short: "email",
    },
  ],
  general: [
    OFF_PAYROLL,
    BANK,
    PAYROLL_LOGIN,
    {
      id: "keys",
      label: "Keys returned, and any alarm code or safe combination they knew changed",
      short: "keys",
    },
    {
      id: "software",
      label: "Email and accounting software sign-ins removed",
      short: "email",
    },
  ],
};

/** The checklist for someone who has left this line of business. */
export function leaverAccessItems(industry: IndustryId): readonly LeaverAccessItemDef[] {
  return ITEMS_BY_INDUSTRY[industry] ?? ITEMS_BY_INDUSTRY.general;
}

/** The checklist for a business of no particular line. */
export const LEAVER_ACCESS_ITEMS = leaverAccessItems("general");

export type LeaverAccessItem = LeaverAccessItemDef["id"];

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
        leaverAccessItems(check.industry)
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
  const gone = lastDay <= today;
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
