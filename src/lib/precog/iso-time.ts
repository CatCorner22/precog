/**
 * A timestamptz column as ISO 8601 with milliseconds. Both drivers hand back
 * a Date; `String(date)` would give "Wed Sep 23 2026 19:09:49 GMT+0000 …",
 * which drops the milliseconds the client compares against its own ISO
 * timestamps. A string that does not parse is returned unchanged.
 */
export function toIsoTimestamp(value: unknown): string {
  const date = value instanceof Date ? value : new Date(String(value));
  return Number.isNaN(date.getTime()) ? String(value) : date.toISOString();
}

/** As `toIsoTimestamp`, keeping SQL null as null. */
export function toIsoTimestampOrNull(value: unknown): string | null {
  return value === null || value === undefined ? null : toIsoTimestamp(value);
}
