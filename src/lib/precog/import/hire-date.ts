import { isCalendarDate } from "../dates";

const MONTHS = [
  "january",
  "february",
  "march",
  "april",
  "may",
  "june",
  "july",
  "august",
  "september",
  "october",
  "november",
  "december",
];

function monthFromName(text: string): number {
  const key = text.toLowerCase().replace(/\.$/, "");
  if (key.length < 3) return 0;
  return MONTHS.findIndex((month) => month.startsWith(key)) + 1;
}

function stripTime(value: string): string {
  return value.replace(
    /[T\s]\d{1,2}:\d{2}(:\d{2}(\.\d+)?)?\s*([AaPp][Mm])?\s*(Z|[+-]\d{2}:?\d{2})?$/,
    "",
  );
}

/** A two-digit year above next year's two digits is last century, as Excel reads it. */
function fullYear(text: string, today: Date): number {
  if (text.length === 4) return Number(text);
  const short = Number(text);
  return short > (today.getUTCFullYear() % 100) + 1 ? 1900 + short : 2000 + short;
}

function isoDay(year: number, month: number, day: number): string | undefined {
  const iso = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  return isCalendarDate(iso) ? iso : undefined;
}

export interface HireDateOptions {
  /** Read "10/01/2020" as 10 January; set when the file's other dates only fit that order. */
  dayFirst?: boolean;
  /** Pivot for two-digit years; defaults to now. */
  today?: Date;
}

/**
 * Reads a hire date as written by the common exports and returns an ISO day,
 * or undefined. Handles ISO with or without a time part, "03/15/2019",
 * "3/15/19 0:00", "15-Mar-2019", "Mar 15, 2019", "15 March 2019",
 * "2019/03/15", "15.03.2019" (dotted dates are day first) and "20190315".
 */
export function readHireDate(raw: string, opts: HireDateOptions = {}): string | undefined {
  const value = stripTime(raw.trim());
  if (!value) return undefined;
  const today = opts.today ?? new Date();
  const iso = value.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/);
  if (iso) return isoDay(Number(iso[1]), Number(iso[2]), Number(iso[3]));
  const packed = value.match(/^(\d{4})(\d{2})(\d{2})$/);
  if (packed) return isoDay(Number(packed[1]), Number(packed[2]), Number(packed[3]));
  const numeric = value.match(/^(\d{1,2})([/.-])(\d{1,2})\2(\d{2}|\d{4})$/);
  if (numeric) {
    const dayFirst = opts.dayFirst || numeric[2] === ".";
    const [first, second] = [Number(numeric[1]), Number(numeric[3])];
    const year = fullYear(numeric[4], today);
    return dayFirst ? isoDay(year, second, first) : isoDay(year, first, second);
  }
  const dayName = value.match(/^(\d{1,2})[ -]([A-Za-z]{3,9})\.?[ ,-]+(\d{2}|\d{4})$/);
  if (dayName) {
    const month = monthFromName(dayName[2]);
    return month ? isoDay(fullYear(dayName[3], today), month, Number(dayName[1])) : undefined;
  }
  const nameDay = value.match(/^([A-Za-z]{3,9})\.?\s+(\d{1,2}),?\s+(\d{2}|\d{4})$/);
  if (nameDay) {
    const month = monthFromName(nameDay[1]);
    return month ? isoDay(fullYear(nameDay[3], today), month, Number(nameDay[2])) : undefined;
  }
  return undefined;
}

/** Reads a hire date written month first, with today as the two-digit year pivot. */
export function parseHireDate(raw: string): string | undefined {
  return readHireDate(raw);
}

/** True when any slash or dash date in the column can only be day first ("15/03/2019"). */
export function datesAreDayFirst(values: readonly string[]): boolean {
  return values.some((value) => {
    const parts = stripTime(value.trim()).match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2}|\d{4})$/);
    return parts !== null && Number(parts[1]) > 12 && Number(parts[2]) <= 12;
  });
}

/** Whole and tenth years between a hire date and today, never negative. */
export function tenureFromHireDate(hireDate: string, today: Date = new Date()): number {
  const start = new Date(`${hireDate}T00:00:00Z`).getTime();
  const years = (today.getTime() - start) / (365.25 * 86_400_000);
  return Math.max(0, Math.min(60, Math.round(years * 10) / 10));
}
