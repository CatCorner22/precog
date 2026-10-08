/**
 * Calendar days and how the app prints them.
 *
 * Two calendars live here. The owner's local calendar (`localDateKey`,
 * `dateAfter`, `localDaysBetween`) is what every screen in the browser uses
 * for "today". The UTC calendar (`isCalendarDate`, `daysBetween`, `shiftDay`,
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

/**
 * The latest calendar day any client may call today: the server's UTC day
 * plus one, the limit resolveClientDate allows. Dates checked on the server
 * against it hold for every client that later loads them.
 */
export function latestClientDay(now: Date = new Date()): string {
  return shiftDay(serverUtcDay(now), 1);
}

/** True when `value` is a real "YYYY-MM-DD" day, and not later than `today` when one is given. */
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
  const calendar = calendarDay(value);
  if (calendar) return CALENDAR_DAY.format(calendar);
  const date = toDate(value);
  return date ? DAY.format(date) : String(value);
}

/** "Nov 3". */
export function formatDayShort(value: string | Date): string {
  const calendar = calendarDay(value);
  if (calendar) return CALENDAR_DAY_SHORT.format(calendar);
  const date = toDate(value);
  return date ? DAY_SHORT.format(date) : String(value);
}

/** "Nov 3" for a day in the same year as `today`, "Nov 3, 2027" otherwise. */
export function formatDayNear(value: string, today: string): string {
  return value.slice(0, 4) === today.slice(0, 4) ? formatDayShort(value) : formatDay(value);
}

/** "March 2026" for a "YYYY-MM" month; anything else prints as given. */
export function formatMonth(value: string): string {
  const match = /^(\d{4})-(0[1-9]|1[0-2])$/.exec(value);
  return match
    ? MONTH.format(new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, 1)))
    : value;
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

/** The UTC midnight of a "YYYY-MM-DD" string in milliseconds, or null when it is not a real calendar date. */
function utcDay(value: string): number | null {
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

/** Date-only values are calendar facts, not instants in the viewer's zone. */
function calendarDay(value: string | Date): Date | null {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isNaN(date.getTime()) ? null : date;
}

const CALENDAR_DAY = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
  timeZone: "UTC",
});
const CALENDAR_DAY_SHORT = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  timeZone: "UTC",
});
const DAY = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" });
const MONTH = new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric", timeZone: "UTC" });
const DAY_SHORT = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" });
const DAY_TIME = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
  hour: "numeric",
  minute: "2-digit",
});
