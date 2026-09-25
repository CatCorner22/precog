/**
 * Calendar-day arithmetic in UTC, for dates the app stores as "YYYY-MM-DD".
 * The local-day family (`localDateKey`, `dateAfter`) lives in
 * decisions/follow-through: it reads the owner's clock, this one does not.
 */
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

const DAY_MS = 86_400_000;

/**
 * Calendar day a server-side check should treat as "today". Register dates
 * are written in the owner's local calendar, so a client-supplied day is
 * honoured when it is a real date within a day of the server clock (any
 * timezone offset); otherwise the server's UTC day is used.
 */
export function resolveClientDate(value: unknown, now: Date = new Date()): string {
  const serverDay = now.toISOString().slice(0, 10);
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
