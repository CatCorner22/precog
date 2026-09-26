/**
 * Calendar days and how the app prints them.
 *
 * Two calendars live here. The owner's local calendar (`localDateKey`,
 * `dateAfter`, `localDaysBetween`) is what every screen in the browser uses
 * for "today". The UTC calendar (`utcDay`, `daysBetween`, `shiftDay`,
 * `utcDateKey`, `serverUtcDay`) is for arithmetic on stored "YYYY-MM-DD"
 * strings and for server code that has no owner's clock to read.
 *
 * Every date the customer sees is printed by one of the `formatDay*`
 * functions: US English, month first ("Nov 3, 2026").
 */

/** One day in milliseconds, for arithmetic on timestamps. */
export const DAY_MS = 86_400_000;

/** The owner's local calendar day of `date`, as "YYYY-MM-DD". */
export function localDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/** The local calendar day `days` after `date`, in the same YYYY-MM-DD form `localDateKey` uses. */
export function dateAfter(date: Date, days: number): string {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return localDateKey(next);
}

/** Whole local calendar days from `from` to `to` (negative when `to` is earlier). */
export function localDaysBetween(from: Date, to: Date): number {
  return Math.round((startOfLocalDay(to).getTime() - startOfLocalDay(from).getTime()) / DAY_MS);
}

/** The UTC calendar day of `date`, as "YYYY-MM-DD". For arithmetic done in UTC, not for "today" in the browser. */
export function utcDateKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** Today on the server's clock (UTC). Browser code uses `localDateKey(new Date())` instead. */
export function serverUtcDay(now: Date = new Date()): string {
  return utcDateKey(now);
}

/** The UTC midnight of a "YYYY-MM-DD" string in milliseconds, or null when it is not a real calendar date. */
export function utcDay(value: string): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const [year, month, day] = value.split("-").map(Number);
  const time = Date.UTC(year, month - 1, day);
  if (Number.isNaN(time)) return null;
  const date = new Date(time);
  return date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
    ? time
    : null;
}

export function isCalendarDate(value: string, today?: string): boolean {
  const date = utcDay(value);
  if (date === null) return false;
  if (today === undefined) return true;
  const current = utcDay(today);
  return current !== null && date <= current;
}

/**
 * Calendar day a server-side check should treat as "today". Register dates
 * are written in the owner's local calendar, so a client-supplied day is
 * honoured when it is a real date within a day of the server clock (any
 * timezone offset); otherwise the server's UTC day is used.
 */
export function resolveClientDate(value: unknown, now: Date = new Date()): string {
  const serverDay = serverUtcDay(now);
  if (typeof value !== "string") return serverDay;
  const client = utcDay(value);
  const server = utcDay(serverDay);
  if (client === null || server === null) return serverDay;
  return Math.abs(client - server) <= DAY_MS ? value : serverDay;
}

/** Whole calendar days from `from` to `to` (negative when `to` is earlier); null when either is not a calendar date. */
export function daysBetween(from: string, to: string): number | null {
  const start = utcDay(from);
  const end = utcDay(to);
  if (start === null || end === null) return null;
  return Math.round((end - start) / DAY_MS);
}

/** The "YYYY-MM-DD" day `delta` days after `day` (before it when negative). */
export function shiftDay(day: string, delta: number): string {
  const date = new Date(`${day}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + delta);
  return utcDateKey(date);
}

/** "Nov 3, 2026". A "YYYY-MM-DD" day prints as that day; a timestamp prints in the owner's time zone. */
export function formatDay(value: string | Date): string {
  const date = toDate(value);
  return date ? DAY.format(date) : String(value);
}

/** "Nov 3". */
export function formatDayShort(value: string | Date): string {
  const date = toDate(value);
  return date ? DAY_SHORT.format(date) : String(value);
}

/** "Nov 3, 2026, 4:05 PM". */
export function formatDayTime(value: string | Date): string {
  const date = toDate(value);
  return date ? DAY_TIME.format(date) : String(value);
}

/** "Nov 3", "Nov 3–10", "Oct 28 – Nov 3", or "Dec 30, 2025 – Jan 2, 2026" when the range crosses a year. */
export function formatDayRange(from: string, to: string): string {
  const start = toDate(from);
  const end = toDate(to);
  if (!start || !end) return `${from} – ${to}`;
  if (from === to) return DAY_SHORT.format(start);
  if (start.getFullYear() !== end.getFullYear()) {
    return `${DAY.format(start)} – ${DAY.format(end)}`;
  }
  if (start.getMonth() === end.getMonth()) {
    return `${DAY_SHORT.format(start)}–${end.getDate()}`;
  }
  return `${DAY_SHORT.format(start)} – ${DAY_SHORT.format(end)}`;
}

function startOfLocalDay(date: Date): Date {
  const day = new Date(date);
  day.setHours(0, 0, 0, 0);
  return day;
}

/** A "YYYY-MM-DD" day becomes local midnight of that day, so it prints as itself in any time zone. */
function toDate(value: string | Date): Date | null {
  let date: Date;
  if (value instanceof Date) date = value;
  else if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const [year, month, day] = value.split("-").map(Number);
    date = new Date(year, month - 1, day);
  } else date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

const DAY = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" });
const DAY_SHORT = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" });
const DAY_TIME = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
  hour: "numeric",
  minute: "2-digit",
});
