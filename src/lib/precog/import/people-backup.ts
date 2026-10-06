import { ENTITLEMENTS } from "../sod/conflict-rules";
import { isCalendarDate } from "../dates";
import type { Person } from "../types";
import { MAX_ROLE_LENGTH } from "../onboarding/own-business";
import { stripInvisibleControls } from "../text";
import { clamp } from "../number";

const KNOWN_DUTIES = new Set<string>(ENTITLEMENTS.map((e) => e.id));

function text(value: unknown, max: number): string | undefined {
  if (typeof value !== "string") return undefined;
  const clean = stripInvisibleControls(value).trim().slice(0, max);
  return clean || undefined;
}

/**
 * The people in a JSON backup, every field the backup carries kept and
 * checked: id and name are required; role, active, the owner mark, tenure
 * (0 to 60 years), last day (a calendar date), duties (known duty ids),
 * department, employee id, the duties-from-title mark and the household mark
 * are kept when they are well formed and dropped when not. Repeated ids keep
 * their first person.
 */
export function peopleFromBackup(raw: unknown): Person[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const people: Person[] = [];
  for (const item of raw as unknown[]) {
    if (!item || typeof item !== "object") continue;
    const p = item as Record<string, unknown>;
    const id = text(p.id, 80);
    const name = text(p.name, 60);
    if (!id || !name || seen.has(id)) continue;
    seen.add(id);
    const tenure =
      typeof p.tenureYears === "number" && Number.isFinite(p.tenureYears)
        ? clamp(p.tenureYears, 0, 60)
        : undefined;
    const lastDay =
      typeof p.lastDay === "string" && isCalendarDate(p.lastDay) ? p.lastDay : undefined;
    const duties = Array.isArray(p.entitlements)
      ? p.entitlements.filter((d): d is string => typeof d === "string" && KNOWN_DUTIES.has(d))
      : undefined;
    const department = text(p.department, 120);
    const employeeId = text(p.employeeId, 40);
    const householdKey = householdMark(p.householdKey);
    people.push({
      id,
      name,
      role: text(p.role, MAX_ROLE_LENGTH) ?? "Team member",
      active: typeof p.active === "boolean" ? p.active : true,
      ...(typeof p.owner === "boolean" ? { owner: p.owner } : {}),
      ...(tenure !== undefined ? { tenureYears: tenure } : {}),
      ...(lastDay ? { lastDay } : {}),
      ...(duties?.length ? { entitlements: duties } : {}),
      ...(department ? { department } : {}),
      ...(employeeId ? { employeeId } : {}),
      ...(p.dutiesFromTitle === true ? { dutiesFromTitle: true as const } : {}),
      ...(householdKey ? { householdKey } : {}),
    });
  }
  return people;
}

/** Longest household mark, as the team editor's field allows. */
export const MAX_HOUSEHOLD_MARK = 40;

/**
 * A household mark as Precog stores it: invisible controls removed, trimmed,
 * at most 40 characters; undefined when nothing is left. People with the same
 * mark share a household, so two of them never count as dual control.
 */
export function householdMark(value: unknown): string | undefined {
  return text(value, Number.MAX_SAFE_INTEGER)?.slice(0, MAX_HOUSEHOLD_MARK).trim() || undefined;
}
