/** Status and active/leave detection for roster cells. */

const INACTIVE_WORDS = [
  "no",
  "n",
  "false",
  "0",
  "i",
  "t",
  "inactive",
  "inactif",
  "terminated",
  "term",
  "termed",
  "former",
  "former employee",
  "ex employee",
  "left",
  "separated",
  "retired",
  "withdrawn",
  "resigned",
  "ended",
  "deactivated",
  "archived",
  "deleted",
  "deceased",
  "suspended",
  "furlough",
  "furloughed",
  "laid off",
  "not active",
  "non active",
  "dormant",
  "discarded",
  "reported no show",
  "not on payroll",
  "sorti",
  "sortie",
];

/** Status words that mean the person works here today, including anyone on leave. */
const ACTIVE_WORDS = [
  "yes",
  "y",
  "true",
  "1",
  "a",
  "l",
  "loa",
  "active",
  "actif",
  "employed",
  "current",
  "regular",
  "full time",
  "fulltime",
  "part time",
  "parttime",
  "temporary",
  "temp",
  "seasonal",
  "contractor",
  "contingent",
  "contingent worker",
  "intern",
  "employee",
  "hired",
  "rehired",
];

const TRUE_WORDS = ["1", "true", "yes", "y", "t", "x"];

export function statusKey(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

/** True when the status is one of the words, or starts with a word of four letters or more ("Terminated - Voluntary"). */
function matchesStatusWord(key: string, words: readonly string[]): boolean {
  return words.some((word) => key === word || (word.length > 3 && key.startsWith(`${word} `)));
}

/**
 * Codes and yes/no words that mean inactive only in a status column. In an
 * employment type column "T" is temporary, "I" may be intern, and "Term" a
 * fixed-term contract.
 */
const STATUS_ONLY_CODES = new Set(["no", "n", "false", "0", "i", "t", "term"]);
const TYPE_INACTIVE_WORDS = INACTIVE_WORDS.filter((word) => !STATUS_ONLY_CODES.has(word));

export function isInactive(value: string, typeColumn = false): boolean {
  const key = statusKey(value);
  if (!key) return false;
  return (
    matchesStatusWord(key, typeColumn ? TYPE_INACTIVE_WORDS : INACTIVE_WORDS) ||
    /terminat/.test(key)
  );
}

/** Words that mean someone is away but still employed: on leave, suspended or furloughed. */
const LEAVE_PATTERN = /\b(leave|loa|fmla|suspended|suspension|furlough|furloughed|sabbatical)\b/;

/** Words that mean someone has gone for good; they outrank a leave word ("Terminated - On Leave"). */
const EXIT_PATTERN =
  /terminat|\b(retired|deceased|resigned|separated|laid off|former|ex employee|left|withdrawn|discarded|deleted|archived|deactivated|reported no show|not on payroll|sortie?)\b/;

/**
 * A status that says the person is away but still employed: "Leave", "On
 * Leave", "LOA", "FMLA", ADP's "L", Oracle's "Inactive - Leave of Absence"
 * and "Suspended - Payroll Eligible", SuccessFactors' "Furlough". The leave
 * word outranks "Inactive": the person still works here.
 */
export function isOnLeave(value: string): boolean {
  const key = statusKey(value);
  if (!key || key.startsWith("active") || EXIT_PATTERN.test(key)) return false;
  return key === "l" || LEAVE_PATTERN.test(key);
}

export function isKnownActive(value: string): boolean {
  const key = statusKey(value);
  return matchesStatusWord(key, ACTIVE_WORDS) || /\b(leave|loa)\b/.test(key);
}

export function isTrue(value: string): boolean {
  return TRUE_WORDS.includes(value.trim().toLowerCase());
}
