import { ENTITLEMENTS } from "../sod/conflict-rules";
import { isCalendarDate } from "../continuity/coverage";
import type { Person } from "../types";
import { stripInvisibleControls } from "./csv";
import { MAX_ROLE_LENGTH } from "../onboarding/own-team";

const KNOWN_DUTIES = new Set<string>(ENTITLEMENTS.map((e) => e.id));

function text(value: unknown, max: number): string | undefined {
  if (typeof value !== "string") return undefined;
  const clean = stripInvisibleControls(value).trim().slice(0, max);
  return clean || undefined;
}

/**
 * The people in a JSON backup, every field the backup carries kept and
 * checked: id and name are required; role, active, tenure (0 to 60 years),
 * last day (a calendar date), duties (known duty ids), department and
 * employee id are kept when they are well formed and dropped when not.
 * Repeated ids keep their first person.
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
        ? Math.min(60, Math.max(0, p.tenureYears))
        : undefined;
    const lastDay =
      typeof p.lastDay === "string" && isCalendarDate(p.lastDay) ? p.lastDay : undefined;
    const duties = Array.isArray(p.entitlements)
      ? p.entitlements.filter((d): d is string => typeof d === "string" && KNOWN_DUTIES.has(d))
      : undefined;
    const department = text(p.department, 120);
    const employeeId = text(p.employeeId, 40);
    people.push({
      id,
      name,
      role: text(p.role, MAX_ROLE_LENGTH) ?? "Team member",
      active: typeof p.active === "boolean" ? p.active : true,
      ...(tenure !== undefined ? { tenureYears: tenure } : {}),
      ...(lastDay ? { lastDay } : {}),
      ...(duties?.length ? { entitlements: duties } : {}),
      ...(department ? { department } : {}),
      ...(employeeId ? { employeeId } : {}),
    });
  }
  return people;
}
