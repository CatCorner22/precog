import { ENTITLEMENTS, type EntitlementId } from "../sod/conflict-rules";
import type { IndustryTemplate } from "../templates/types";
import type { Person } from "../types";
import { isCalendarDate } from "../continuity/coverage";
import { csvCell, locateTable, parseRows, sniffDelimiter, stripInvisibleControls } from "./csv";
import { entitlementsForTitle, matchJobTitle } from "../onboarding/job-catalog";

export interface PeopleImportIssue {
  row: number;
  message: string;
}

export interface TitleMapping {
  row: number;
  name: string;
  title: string;
  /** Catalog title the row's job title mapped to, or undefined when nothing matched. */
  catalogTitle?: string;
  confidence?: "exact" | "partial";
}

export interface PeopleImportResult {
  people: Person[];
  issues: PeopleImportIssue[];
  unknownEntitlements: string[];
  /** How each row's job title was read, for the review table after an import. */
  titles: TitleMapping[];
  /**
   * Current team members with no row in the file. Their ids are gone from
   * `people`, so register assignments and process ownerships pointing at them
   * will be dropped when the import is applied.
   */
  removed: Person[];
  /** Lines skipped because they were a report title, a repeated header, or a footer. */
  skipped?: number;
  /** Rows skipped because an earlier row already named the same person with the same title. */
  duplicates?: number;
  /** Rows past the row limit that were not read. */
  dropped?: number;
  /**
   * Ids of people whose status says they are on leave ("Leave", "LOA",
   * "On Leave", ADP's "L"). They stay on the team; the caller can record
   * the absence.
   */
  onLeave?: string[];
}

export const PEOPLE_CSV_HEADER = [
  "name",
  "role",
  "department",
  "tenure_years",
  "active",
  "last_day",
  "entitlements",
] as const;

/**
 * Column names accepted for each field, best first: when a file has two
 * columns for one field, the earlier alias wins whatever the column order.
 * The lists cover this app's own export plus the worker exports of Workday,
 * SAP SuccessFactors, Oracle HCM Cloud, ADP, BambooHR, Gusto, Paychex,
 * Paycom, Paylocity, QuickBooks, Rippling, Square, Homebase, 7shifts, Toast,
 * Dentrix, Open Dental, and a French export. A header also matches after a
 * trailing "s" or trailing digits are dropped ("Roles", "Cost Center 1").
 */
const HEADER_ALIASES = {
  name: [
    "name",
    "full name",
    "employee name",
    "employee full name",
    "worker name",
    "display name",
    "payroll name",
    "full legal name",
    "legal name",
    "person name",
    "name - full",
    "staff member",
    "worker",
    "employee",
    "person",
    "staff",
    "team member",
    "preferred name",
  ],
  first_name: [
    "first name",
    "first_name",
    "given name",
    "legal first name",
    "employee first name",
    "fname",
    "prénom",
    "prenom",
    "preferred first name",
    "first",
  ],
  last_name: [
    "last name",
    "last_name",
    "surname",
    "family name",
    "legal last name",
    "employee last name",
    "lname",
    "nom",
    "last",
  ],
  role: [
    "job title",
    "primary job title",
    "job title description",
    "position description",
    "job profile",
    "business title",
    "job name",
    "position name",
    "position title",
    "title",
    "job classification",
    "job code description",
    "occupation",
    "poste",
    "job",
    "position",
    "role",
  ],
  department: [
    "department",
    "department name",
    "dept",
    "home department",
    "home department description",
    "cost center",
    "cost centre",
    "supervisory organization",
    "organization",
    "org unit",
    "business unit",
    "division",
    "work location",
    "location",
    "team",
  ],
  employee_id: [
    "employee id",
    "employee_id",
    "employee number",
    "employee no",
    "employee num",
    "emp id",
    "emp no",
    "emp number",
    "employee code",
    "person number",
    "person id",
    "person id external",
    "worker id",
    "associate id",
    "file number",
    "payroll id",
    "staff id",
    "team member id",
    "user id",
    "position id",
    "id",
  ],
  hire_date: [
    "hire date",
    "hire_date",
    "original hire date",
    "most recent hire date",
    "date of hire",
    "date hired",
    "hired",
    "start date",
    "employment start date",
    "seniority date",
    "date d'entrée",
    "date d'embauche",
  ],
  tenure_years: ["tenure_years", "tenure", "years", "years of service", "years_employed"],
  active: [
    "status",
    "active",
    "active status",
    "employee status",
    "assignment status",
    "worker status",
    "position status",
    "employed",
    "is active",
    "statut",
    "employment status",
  ],
  /** Schedule or contract ("Full-Time", "F", "T" for temporary), not whether the person still works here. */
  worker_type: ["employment type", "employee type", "worker type"],
  inactive_flag: [
    "is hidden",
    "hidden",
    "is terminated",
    "is inactive",
    "is deleted",
    "is archived",
  ],
  last_day: [
    "last_day",
    "last day",
    "leaving date",
    "leaving",
    "end date",
    "final day",
    "termination date",
    "term date",
    "separation date",
  ],
  entitlements: ["entitlements", "permissions", "duties", "access", "rights"],
} as const;

type Field = keyof typeof HEADER_ALIASES;

const FIELDS = Object.keys(HEADER_ALIASES) as Field[];

/** Words that mark a cell as a column heading rather than a person's data. */
const HEADER_WORDS = new Set([
  "name",
  "id",
  "code",
  "number",
  "title",
  "position",
  "job",
  "department",
  "dept",
  "status",
  "hire",
  "date",
  "location",
  "role",
  "email",
  "phone",
]);

/** Status words that mean the person no longer works here, across the common exports. */
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

/** Name parts after a comma that are a credential or generation, not a first name. */
const NAME_SUFFIXES = new Set([
  "jr",
  "sr",
  "ii",
  "iii",
  "iv",
  "dds",
  "dmd",
  "md",
  "do",
  "od",
  "cpa",
  "rn",
  "np",
  "pa",
  "phd",
  "esq",
  "mba",
  "lpn",
  "cma",
  "ea",
]);

/** Generation suffixes stay part of the name ("Ana Ruiz Jr."); credentials follow a comma ("Ben Cole, CPA"). */
const GENERATION_SUFFIXES = new Set(["jr", "sr", "ii", "iii", "iv"]);

/** Lower-case words that begin a surname: "de la Cruz", "van Dyke". */
const SURNAME_PARTICLES = new Set([
  "de",
  "del",
  "della",
  "di",
  "da",
  "dos",
  "du",
  "la",
  "le",
  "van",
  "von",
  "der",
  "den",
  "ter",
  "st",
  "bin",
  "ibn",
  "al",
  "el",
]);

/** Words that make a cell a company's name, which is never reordered: "Acme Payroll, Inc.". */
const COMPANY_WORDS = new Set([
  "inc",
  "incorporated",
  "llc",
  "llp",
  "lp",
  "ltd",
  "limited",
  "co",
  "corp",
  "corporation",
  "company",
  "pc",
  "pllc",
  "plc",
  "gmbh",
  "group",
  "associates",
  "partners",
  "holdings",
  "services",
]);

/** First cell of a report footer row: totals, counts, page numbers, run stamps. */
const FOOTER_PATTERN =
  /^((grand |sub ?)?totals?\b|count[:\s]*\d+\b|page \d+|report (generated|date|run)|generated (on|by|at)|printed (on|by)|end of (report|list)|record count|(accrual|cash) basis\b|\d+ (records?|rows?|employees?|people|workers?)\b)/i;

/** What may stand beside a footer label: numbers, or a count such as "9 employees". */
const FOOTER_VALUE =
  /^([\d.,%\s-]+|\d[\d,]*\s+(employees?|people|persons?|records?|rows?|workers?|staff|members?))$/i;

/**
 * A report's run stamp on a line of its own, as QuickBooks and payroll
 * reports print it under the table: "Tuesday, Sep 23, 2026 09:14 AM
 * GMT-04:00", "Accrual basis Tuesday, September 23, 2026", "09/23/2026 9:14
 * AM". A person's row never reads as a date and time.
 */
const RUN_STAMP =
  /^((accrual|cash) basis\s+)?((mon|tues|wednes|thurs|fri|satur|sun)day,?\s+)?((jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+\d{1,2},?\s+\d{4}|\d{1,2}[/.-]\d{1,2}[/.-]\d{2,4}|\d{4}-\d{2}-\d{2})(,?\s+\d{1,2}:\d{2}(:\d{2})?\s*([ap]\.?m\.?)?)?(\s*(gmt|utc)\s*([+-]\d{1,2}(:?\d{2})?)?)?$/i;

const LIST_MARKER = /^(\(\d+\)|\d+[.)]|[-*•·–—])\s+/;

function normalizeHeader(cell: string): string {
  return cell
    .toLowerCase()
    .replace(/[#№]/g, " number ")
    .replace(/[^a-z0-9]/g, "");
}

const ALIAS_KEYS: Record<Field, string[]> = Object.fromEntries(
  FIELDS.map((field) => [field, HEADER_ALIASES[field].map(normalizeHeader)]),
) as Record<Field, string[]>;

/** Rank of the alias a header cell matches (0 is best), or -1 when it matches none. */
function aliasRank(cell: string, field: Field): number {
  const key = normalizeHeader(cell);
  const bare = key.replace(/\d+$/, "");
  for (const candidate of [key, bare, bare.replace(/s$/, "")]) {
    const rank = ALIAS_KEYS[field].indexOf(candidate);
    if (rank >= 0) return rank;
  }
  return -1;
}

function headerField(cell: string): Field | undefined {
  return FIELDS.find((field) => aliasRank(cell, field) >= 0);
}

function hasHeaderWord(cell: string): boolean {
  const tokens = cell
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .toLowerCase()
    .split(/[^a-z]+/);
  return tokens.some((token) => HEADER_WORDS.has(token.replace(/s$/, "")));
}

/** Letters and digits only, accents dropped, so "José" and "Jose" are one person. */
function nameKey(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]/gu, "");
}

function normalize(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function slug(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
}

/** A CSV cell guarded against formula injection (see `csvCell`). */
const escapeCsv = csvCell;

function canonicalRole(value: string, roleTemplates: Record<string, unknown>): string {
  const trimmed = value.trim();
  const match = Object.keys(roleTemplates).find(
    (role) => role.toLowerCase() === trimmed.toLowerCase(),
  );
  return match ?? trimmed;
}

function statusKey(value: string): string {
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

function isInactive(value: string, typeColumn = false): boolean {
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
function isOnLeave(value: string): boolean {
  const key = statusKey(value);
  if (!key || key.startsWith("active") || EXIT_PATTERN.test(key)) return false;
  return key === "l" || LEAVE_PATTERN.test(key);
}

function isKnownActive(value: string): boolean {
  const key = statusKey(value);
  return matchesStatusWord(key, ACTIVE_WORDS) || /\b(leave|loa)\b/.test(key);
}

function isTrue(value: string): boolean {
  return TRUE_WORDS.includes(value.trim().toLowerCase());
}

/** A name part as a lower-case word with its dots dropped: "Jr." is "jr". */
function wordKey(value: string): string {
  return value.toLowerCase().replace(/\./g, "").trim();
}

const NAME_WORD = /^\p{L}[\p{L}'’.-]*$/u;

/** One to three words of letters, as given names are written: "Ana", "Ana Maria", "Ana M.". */
function looksLikeGivenNames(value: string): boolean {
  const words = value.split(/\s+/).filter(Boolean);
  return words.length >= 1 && words.length <= 3 && words.every((w) => NAME_WORD.test(w));
}

/**
 * A surname: one to three words of letters ("Ruiz", "Ruiz Lopez", "de la
 * Cruz"). Strict allows only one word after any particles, for a list line
 * where "Ana Ruiz, Groomer" must stay a name and a title.
 */
function looksLikeSurname(value: string, strict = false): boolean {
  const words = value.split(/\s+/).filter(Boolean);
  if (words.length < 1 || words.length > 3 || !words.every((w) => NAME_WORD.test(w))) return false;
  return !strict || words.slice(0, -1).every((w) => SURNAME_PARTICLES.has(wordKey(w)));
}

function namesCompany(value: string): boolean {
  return value.includes("&") || value.split(/[\s,]+/).some((w) => COMPANY_WORDS.has(wordKey(w)));
}

/**
 * "Ruiz, Ana" becomes "Ana Ruiz", "Diaz, Cal III" becomes "Cal Diaz III",
 * "Ruiz, Ana, Jr." becomes "Ana Ruiz Jr." and "Cole, Ben, CPA" becomes "Ben
 * Cole, CPA". A credential alone after the comma ("Jane Roe, DDS"), a
 * company ("Acme Payroll, Inc.", "Smith, Jones & Co") and anything else that
 * does not read as a surname and given names stay as written.
 */
function reorderLastFirst(name: string): string {
  if (/\d/.test(name) || namesCompany(name)) return name;
  const parts = name.split(",").map((part) => part.trim());
  if (parts.length < 2 || parts.length > 3 || parts.some((part) => !part)) return name;
  const [last, given, credential] = parts;
  if (NAME_SUFFIXES.has(wordKey(given))) return name;
  if (credential !== undefined && !NAME_SUFFIXES.has(wordKey(credential))) return name;
  const givenWords = given.split(/\s+/);
  const trailing: string[] = [];
  while (givenWords.length > 1 && GENERATION_SUFFIXES.has(wordKey(givenWords.at(-1)!))) {
    trailing.unshift(givenWords.pop()!);
  }
  if (!looksLikeSurname(last) || !looksLikeGivenNames(givenWords.join(" "))) return name;
  const reordered = [...givenWords, last, ...trailing].join(" ");
  if (credential === undefined) return reordered;
  return GENERATION_SUFFIXES.has(wordKey(credential))
    ? `${reordered} ${credential}`
    : `${reordered}, ${credential}`;
}

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
function datesAreDayFirst(values: readonly string[]): boolean {
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

const ENTITLEMENT_ALIASES: Record<string, EntitlementId> = {
  payroll: "enter_payroll",
  "approve payroll": "approve_payroll",
  "employee records": "edit_payroll_master",
  "payroll master": "edit_payroll_master",
  "pay rates": "edit_payroll_master",
  "journal entries": "post_journal_entries",
  "journal entry": "post_journal_entries",
  je: "post_journal_entries",
  "pay bills": "release_payment",
  ap: "release_payment",
  "pay vendors": "release_payment",
  "add vendors": "create_vendor",
  "vendor setup": "create_vendor",
  "bank rec": "bank_reconcile",
  reconcile: "bank_reconcile",
  deposits: "prepare_deposit",
  cash: "collect_cash",
  "take payments": "collect_cash",
  "front desk payments": "collect_cash",
  refunds: "approve_writeoffs",
  writeoffs: "approve_writeoffs",
  "write-offs": "approve_writeoffs",
  adjustments: "post_adjustments",
  claims: "submit_claims",
  billing: "submit_claims",
  admin: "pms_admin_roles",
  "system admin": "pms_admin_roles",
  "user admin": "pms_admin_roles",
  "read only": "view_reports_only",
  reports: "view_reports_only",
};

function findEntitlement(token: string): EntitlementId | undefined {
  const normalized = normalize(token);
  const direct = ENTITLEMENTS.find((entitlement) => normalize(entitlement.id) === normalized);
  if (direct) return direct.id;
  const byLabel = ENTITLEMENTS.find((entitlement) => normalize(entitlement.label) === normalized);
  if (byLabel) return byLabel.id;
  const alias = Object.entries(ENTITLEMENT_ALIASES).find(([key]) => normalize(key) === normalized);
  return alias?.[1];
}

function emptyResult(issues: PeopleImportIssue[], removed: Person[]): PeopleImportResult {
  return {
    people: [],
    issues,
    unknownEntitlements: [],
    titles: [],
    removed,
    skipped: 0,
    duplicates: 0,
    dropped: 0,
    onLeave: [],
  };
}

/** Adds the lines skipped above the table to the result as one file-level issue. */
export function addSkippedLines(
  result: PeopleImportResult,
  lines: readonly string[],
): PeopleImportResult {
  if (!lines.length) return result;
  const shown = lines.map((line) => `"${line.slice(0, 60)}"`).join(", ");
  result.issues.unshift({
    row: 0,
    message: `Skipped ${lines.length} ${lines.length === 1 ? "line" : "lines"} at the top: ${shown}`,
  });
  result.skipped = (result.skipped ?? 0) + lines.length;
  return result;
}

export function parsePeopleCsv(
  text: string,
  tpl: IndustryTemplate,
  opts: { maxRows?: number; today?: Date } = {},
): PeopleImportResult {
  const source = stripInvisibleControls(text);
  const table = locateTable(source, looksLikeRosterHeader);
  if (table) return addSkippedLines(parsePeopleRows(table.rows, tpl, opts), table.skipped);
  return parsePeopleRows(parseRows(source, sniffDelimiter(source)), tpl, opts);
}

/** A first cell that numbers the rows rather than naming anyone: "#", "No.". */
function isIndexCell(value: string): boolean {
  return !/\p{L}/u.test(value) || /^(no|nr|num)\.?$/i.test(value);
}

/**
 * True when a row is a header the importer understands: it names a name
 * column, first and last name columns, or three or more known column words.
 * A row whose only column words are name aliases is data unless its first
 * cell is a column word too: "Ana Ruiz, Team Member" and "Jose, Staff" are
 * people with their titles.
 */
export function looksLikeRosterHeader(cells: readonly string[]): boolean {
  const fields = cells.map(headerField);
  const first = cells[0]?.trim() ?? "";
  const onlyNameHits = fields.every((field) => field === undefined || field === "name");
  const firstIsData = fields[0] === undefined && !hasHeaderWord(first) && !isIndexCell(first);
  if (firstIsData && onlyNameHits) return false;
  if (fields.includes("name")) return true;
  if (fields.includes("first_name") && fields.includes("last_name")) return true;
  return cells.filter(hasHeaderWord).length >= 3;
}

interface ColumnMap {
  name?: number;
  first?: number;
  last?: number;
  /** Title columns, best alias first, code columns left out. */
  titles: number[];
  department?: number;
  employeeId?: number;
  hireDate?: number;
  tenure?: number;
  /** Status columns, best alias first; only the first reports unknown words. */
  statuses: number[];
  /** Employment type columns: only a full inactive word there ("Terminated") counts. */
  workerTypes: number[];
  inactiveFlags: number[];
  lastDay?: number;
  entitlements?: number;
}

/** Column indexes matching a field, best alias first, then left to right. */
function rankedColumns(header: readonly string[], field: Field): number[] {
  return header
    .map((cell, index) => ({ index, rank: aliasRank(cell, field) }))
    .filter((hit) => hit.rank >= 0)
    .sort((a, b) => a.rank - b.rank || a.index - b.index)
    .map((hit) => hit.index);
}

/** True when more than half of a column's values are codes like "30001234" or "POS-0001". */
function mostlyCodes(rows: readonly string[][], column: number): boolean {
  const values = rows.map((cells) => (cells[column] ?? "").trim()).filter(Boolean);
  const codes = values.filter((value) => /^[A-Za-z]{0,4}[-_ ]?\d{3,}[A-Za-z0-9-]*$/.test(value));
  return codes.length * 2 > values.length;
}

function mapColumns(header: readonly string[], rows: readonly string[][]): ColumnMap {
  const first = (field: Field) => rankedColumns(header, field)[0];
  const name = first("name");
  const firstName = first("first_name");
  const lastName = first("last_name");
  const split = firstName !== undefined && lastName !== undefined;
  // A preferred name is a nickname; with first and last name columns present it is never the whole name.
  const preferred =
    name !== undefined && aliasRank(header[name], "name") === ALIAS_KEYS.name.length - 1;
  return {
    name: split && preferred ? undefined : name,
    first: firstName,
    last: lastName,
    titles: rankedColumns(header, "role").filter((column) => !mostlyCodes(rows, column)),
    department: first("department"),
    employeeId: first("employee_id"),
    hireDate: first("hire_date"),
    tenure: first("tenure_years"),
    statuses: rankedColumns(header, "active"),
    workerTypes: rankedColumns(header, "worker_type"),
    inactiveFlags: rankedColumns(header, "inactive_flag"),
    lastDay: first("last_day"),
    entitlements: first("entitlements"),
  };
}

function rowKey(cells: readonly string[]): string {
  const keys = cells.map(normalizeHeader);
  while (keys.length && !keys[keys.length - 1]) keys.pop();
  return keys.join("|");
}

/** The footer label when a row is a total, count, page or run stamp with nothing but numbers beside it. */
function footerLabel(cells: readonly string[]): string | undefined {
  const filled = cells.map((cell) => cell.trim()).filter(Boolean);
  const [first, ...rest] = filled;
  if (!first) return undefined;
  const line = filled.join(", ");
  if (line.length <= 80 && RUN_STAMP.test(line)) return line;
  if (!FOOTER_PATTERN.test(first)) return undefined;
  return rest.every((cell) => FOOTER_VALUE.test(cell)) ? first : undefined;
}

interface ImportContext {
  tpl: IndustryTemplate;
  columns: ColumnMap;
  today: Date;
  dayFirst: boolean;
  issues: PeopleImportIssue[];
  unknownEntitlements: string[];
  unknownStatuses: Set<string>;
  /** Titles and employee ids seen so far for each name. */
  seenNames: Map<string, { titleKeys: Set<string>; idKeys: Set<string> }>;
  /** People read so far by employee id, with every title seen for that id. */
  byEmployeeId: Map<string, { person: Person; titleKeys: Set<string> }>;
  onLeave: string[];
  existingByName: Map<string, Person>;
  usedIds: Set<string>;
}

/** Cuts a value to `max` characters without leaving a dangling separator. */
function tidyCut(value: string, max: number): string {
  return value.slice(0, max).replace(/[\s,;:/–—-]+$/u, "");
}

function cellAt(cells: readonly string[], column: number | undefined): string {
  return column === undefined ? "" : (cells[column] ?? "").trim();
}

function readName(
  cells: readonly string[],
  columns: ColumnMap,
): { name: string; idInName: string } {
  const split =
    columns.first !== undefined && columns.last !== undefined
      ? `${cellAt(cells, columns.first)} ${cellAt(cells, columns.last)}`.trim()
      : "";
  const raw = split || cellAt(cells, columns.name);
  // Workday writes the employee id after the name: "Ana Ruiz (1001)".
  const withId = raw.match(/^(.*\S)\s*\((\d{2,})\)$/);
  const name = withId ? withId[1] : raw;
  return { name: split ? name : reorderLastFirst(name), idInName: withId?.[2] ?? "" };
}

/** Whether the row's person works here, and the status that says they are on leave, if any. */
function readActive(
  context: ImportContext,
  cells: readonly string[],
  row: number,
): { active: boolean; leave?: string } {
  let inactive = false;
  let leave: string | undefined;
  context.columns.statuses.forEach((column, index) => {
    const value = cellAt(cells, column);
    if (!value) return;
    if (isOnLeave(value)) leave ??= value;
    else if (isInactive(value)) inactive = true;
    else if (index === 0 && !isKnownActive(value)) reportUnknownStatus(context, value, row);
  });
  for (const column of context.columns.workerTypes) {
    const value = cellAt(cells, column);
    if (!isOnLeave(value) && isInactive(value, true)) inactive = true;
  }
  for (const column of context.columns.inactiveFlags) {
    if (isTrue(cellAt(cells, column))) inactive = true;
  }
  return inactive ? { active: false } : { active: true, ...(leave ? { leave } : {}) };
}

function reportUnknownStatus(context: ImportContext, value: string, row: number): void {
  const key = statusKey(value);
  if (context.unknownStatuses.has(key)) return;
  context.unknownStatuses.add(key);
  context.issues.push({ row, message: `Status "${value}" not recognised; treated as active` });
}

function readTenure(
  context: ImportContext,
  cells: readonly string[],
  row: number,
): number | undefined {
  const { columns, today } = context;
  const tenureValue = cellAt(cells, columns.tenure);
  if (tenureValue) {
    const parsed = Number.parseFloat(tenureValue);
    if (Number.isFinite(parsed)) return Math.min(60, Math.max(0, parsed));
    context.issues.push({ row, message: "Tenure is not a valid number" });
    return undefined;
  }
  const raw = cellAt(cells, columns.hireDate);
  if (!raw) return undefined;
  const hired = readHireDate(raw, { dayFirst: context.dayFirst, today });
  if (!hired) {
    context.issues.push({ row, message: `Hire date not understood: ${raw}` });
    return undefined;
  }
  if (hired > today.toISOString().slice(0, 10)) {
    context.issues.push({ row, message: `Hire date is in the future: ${raw}` });
    return undefined;
  }
  return tenureFromHireDate(hired, today);
}

function readLastDay(
  context: ImportContext,
  cells: readonly string[],
  row: number,
  existing: Person | undefined,
): string | undefined {
  // A file without the column keeps whatever last day the matched person
  // already has; a blank cell in a file that has the column clears it.
  if (context.columns.lastDay === undefined) return existing?.lastDay;
  const raw = cellAt(cells, context.columns.lastDay);
  if (!raw) return undefined;
  const day = readHireDate(raw, { dayFirst: context.dayFirst, today: context.today });
  if (day) return day;
  context.issues.push({ row, message: `Last day not understood: ${raw}` });
  return existing?.lastDay;
}

/** True when the row has a status or inactive-flag cell with something in it. */
function hasStatus(context: ImportContext, cells: readonly string[]): boolean {
  return [...context.columns.statuses, ...context.columns.inactiveFlags].some((column) =>
    Boolean(cellAt(cells, column)),
  );
}

/** Duties listed in the file's own duties column, with unknown names reported. */
function readListedDuties(
  context: ImportContext,
  cells: readonly string[],
  row: number,
): EntitlementId[] {
  const entitlements: EntitlementId[] = [];
  const unknown: string[] = [];
  for (const token of cellAt(cells, context.columns.entitlements).split(/[;|]/)) {
    const trimmed = token.trim();
    if (!trimmed) continue;
    const entitlement = findEntitlement(trimmed);
    if (entitlement) {
      if (!entitlements.includes(entitlement)) entitlements.push(entitlement);
      continue;
    }
    unknown.push(trimmed);
    if (!context.unknownEntitlements.some((seen) => normalize(seen) === normalize(trimmed))) {
      context.unknownEntitlements.push(trimmed);
    }
  }
  if (unknown.length) {
    context.issues.push({ row, message: `Unknown entitlement(s): ${unknown.join(", ")}` });
  }
  return entitlements;
}

/**
 * The title the duties are read from. Title columns are tried in rank order
 * (the standard classification, such as Workday's Job Profile or Oracle's Job
 * Name, before the free-text Business Title or Position), and the first with
 * a catalog match wins, except that a column naming the owner's seat wins
 * wherever it sits: Oracle lists an owner veterinarian's Job as
 * "Veterinarian" and only the Position says "Owner & Medical Director".
 */
function catalogHit(titleValues: readonly string[], industry: string) {
  const hits = titleValues.flatMap((value) => {
    const match = matchJobTitle(value, industry);
    return match ? [{ value, match }] : [];
  });
  return hits.find((hit) => hit.match.entry.id === "owner") ?? hits[0];
}

interface EmployeeSeat {
  person: Person;
  titleKeys: Set<string>;
}

/**
 * How a row relates to the rows before it. When both rows carry an employee
 * id, the id decides: the same id and title is a repeat, the same id with
 * another title is a second position of one person, and another id is
 * another person even with the same name and title. Otherwise the same name
 * and title is a repeat. Every kind of repeat is reported.
 */
function repeatOf(
  context: ImportContext,
  name: string,
  title: string,
  employeeId: string,
  row: number,
): "new" | "duplicate" | EmployeeSeat {
  const key = nameKey(name);
  const titleKey = nameKey(title);
  const idKey = nameKey(employeeId);
  const sameId = idKey ? context.byEmployeeId.get(idKey) : undefined;
  if (sameId && nameKey(sameId.person.name) === key) {
    if (!sameId.titleKeys.has(titleKey)) return sameId;
    context.issues.push({ row, message: `"${name}" appears twice; second copy skipped` });
    return "duplicate";
  }
  if (sameId) {
    context.issues.push({
      row,
      message: `Employee ID "${employeeId}" is on rows for "${sameId.person.name}" and "${name}"; kept both, check which is right`,
    });
  }
  const earlier = context.seenNames.get(key);
  if (!earlier) {
    context.seenNames.set(key, { titleKeys: new Set([titleKey]), idKeys: new Set([idKey]) });
    return "new";
  }
  if (idKey && [...earlier.idKeys].some((other) => other && other !== idKey)) {
    context.issues.push({
      row,
      message: `"${name}" appears twice with different employee IDs; kept as two people`,
    });
  } else if (earlier.titleKeys.has(titleKey)) {
    context.issues.push({ row, message: `"${name}" appears twice; second copy skipped` });
    return "duplicate";
  } else {
    context.issues.push({
      row,
      message: `"${name}" appears twice with different titles; check whether this is one person`,
    });
  }
  earlier.titleKeys.add(titleKey);
  earlier.idKeys.add(idKey);
  return "new";
}

/**
 * A second position for someone already read under the same employee id:
 * one person holding both jobs, so the duties of both are checked together.
 * An inactive second position is left out; an active one replaces an
 * inactive first one.
 */
function addPosition(
  context: ImportContext,
  seat: EmployeeSeat,
  position: { title: string; role: string; duties: readonly string[]; active: boolean },
  employeeId: string,
  row: number,
): void {
  const { person } = seat;
  seat.titleKeys.add(nameKey(position.title));
  const who = `"${person.name}" (employee ID ${employeeId})`;
  if (!position.active) {
    context.issues.push({
      row,
      message: `${who}: the ${position.role} position is marked inactive, so its duties are left out`,
    });
    return;
  }
  const earlierDuties = person.entitlements ?? context.tpl.roleTemplates[person.role] ?? [];
  if (!person.active) {
    person.active = true;
    person.role = tidyCut(position.role, 40);
    person.entitlements = position.duties.length ? [...position.duties] : undefined;
    return;
  }
  const union = Array.from(new Set([...earlierDuties, ...position.duties]));
  context.issues.push({
    row,
    message: `${who} holds two positions, ${person.role} and ${position.role}; read as one person with the duties of both`,
  });
  person.role = tidyCut(`${person.role} / ${position.role}`, 40);
  person.entitlements = union.length ? union : undefined;
}

type RowRead = { person: Person; mapping: TitleMapping } | { position: TitleMapping };

function readPerson(
  context: ImportContext,
  cells: readonly string[],
  row: number,
): RowRead | "skip" | "duplicate" {
  const { tpl, columns } = context;
  const { name, idInName } = readName(cells, columns);
  if (!name) {
    context.issues.push({ row, message: "Name is required" });
    return "skip";
  }
  const titleValues = columns.titles.map((column) => cellAt(cells, column)).filter(Boolean);
  // The role shown is the title the duties were read from, so each tick has
  // its reason in front of the owner.
  const hit = catalogHit(titleValues, tpl.id);
  const roleValue = hit?.value ?? titleValues[0] ?? "";
  const employeeId = cellAt(cells, columns.employeeId) || idInName;
  const repeat = repeatOf(context, name, roleValue, employeeId, row);
  if (repeat === "duplicate") return "duplicate";

  const role = canonicalRole(roleValue || "Team member", tpl.roleTemplates);
  const department = tidyCut(cellAt(cells, columns.department), 60);
  const tenureYears = readTenure(context, cells, row);
  const status = readActive(context, cells, row);

  // Only the first row naming someone already on the team takes over that
  // person's identity; later rows with that name are new people.
  const candidate = context.existingByName.get(nameKey(name));
  const existing = candidate && !context.usedIds.has(candidate.id) ? candidate : undefined;
  let lastDay = readLastDay(context, cells, row, existing);
  // A last day already past means the person has left, unless a status says
  // otherwise (a rehire can keep an old termination date).
  if (lastDay && lastDay < context.today.toISOString().slice(0, 10) && status.active) {
    if (hasStatus(context, cells)) {
      context.issues.push({
        row,
        message: `"${name}" has a past last day (${lastDay}) but an active status; the last day was not kept`,
      });
      lastDay = undefined;
    } else {
      status.active = false;
      delete status.leave;
      context.issues.push({
        row,
        message: `"${name}" left on ${lastDay}, so is read as no longer working here`,
      });
    }
  }

  // Duties listed in the file win; else the catalog of common titles; else a
  // template role keeps its duties by leaving entitlements unset.
  const listed = readListedDuties(context, cells, row);
  const templateRole = Object.hasOwn(tpl.roleTemplates, role);
  const duties = listed.length ? listed : hit ? entitlementsForTitle(hit.value, tpl.id) : [];
  const mapping: TitleMapping = {
    row,
    name,
    title: roleValue,
    catalogTitle: hit?.match.entry.title ?? (templateRole ? role : undefined),
    confidence: hit?.match.confidence ?? (templateRole ? "exact" : undefined),
  };
  if (!listed.length && !hit && !templateRole) {
    context.issues.push({
      row,
      message: roleValue
        ? `Title "${roleValue}" is not in the catalog; duties left for you to tick`
        : "No job title; duties left for you to tick",
    });
  }

  if (repeat !== "new") {
    const positionDuties = duties.length ? duties : templateRole ? tpl.roleTemplates[role] : [];
    addPosition(
      context,
      repeat,
      { title: roleValue, role, duties: positionDuties, active: status.active },
      employeeId,
      row,
    );
    return { position: mapping };
  }

  const baseId = existing
    ? existing.id
    : employeeId
      ? `emp-${slug(employeeId) || slug(name)}`
      : `p-${slug(name)}`;
  let id = baseId;
  let suffix = 2;
  while (context.usedIds.has(id)) id = `${baseId}-${suffix++}`;
  context.usedIds.add(id);
  const person: Person = {
    id,
    name: name.slice(0, 60),
    role: tidyCut(role, 40),
    active: status.active,
    tenureYears,
    ...(lastDay ? { lastDay } : {}),
    entitlements: duties.length ? duties : undefined,
    ...(department ? { department } : {}),
  };
  const idKey = nameKey(employeeId);
  if (idKey && !context.byEmployeeId.has(idKey)) {
    context.byEmployeeId.set(idKey, { person, titleKeys: new Set([nameKey(roleValue)]) });
  }
  if (status.leave) {
    context.onLeave.push(id);
    context.issues.push({
      row,
      message: `"${person.name}" is on leave (status "${status.leave}"); kept on the team`,
    });
  }
  return { person, mapping };
}

export function parsePeopleRows(
  rows: string[][],
  tpl: IndustryTemplate,
  opts: { maxRows?: number; today?: Date } = {},
): PeopleImportResult {
  const clean = rows.map((cells) => cells.map(stripInvisibleControls));
  const header = clean[0] ?? [];
  const dataRows = clean.slice(1);
  const columns = mapColumns(header, dataRows);
  if (columns.name === undefined && (columns.first === undefined || columns.last === undefined)) {
    const shown = header
      .map((cell) => cell.trim())
      .filter(Boolean)
      .slice(0, 8)
      .join(", ");
    return emptyResult([{ row: 0, message: `Missing a name column (header: ${shown})` }], []);
  }

  const issues: PeopleImportIssue[] = [];
  const headerKey = rowKey(header);
  const candidates: { cells: string[]; row: number }[] = [];
  let skipped = 0;
  dataRows.forEach((cells, index) => {
    const row = index + 1;
    if (rowKey(cells) === headerKey) {
      skipped += 1;
      issues.push({ row, message: "Skipped a repeated header row" });
      return;
    }
    const footer = footerLabel(cells);
    if (footer) {
      skipped += 1;
      issues.push({ row, message: `Skipped a footer row: "${footer}"` });
      return;
    }
    candidates.push({ cells, row });
  });

  const maxRows =
    opts.maxRows === undefined ? 250 : Math.max(0, Math.floor(Number(opts.maxRows) || 0));
  const kept = candidates.slice(0, maxRows);
  const dropped = candidates.length - kept.length;
  if (dropped) {
    issues.push({
      row: candidates[maxRows].row,
      message: `Read the first ${maxRows} rows; ${dropped} more ${dropped === 1 ? "row was" : "rows were"} not read, because one import reads up to ${maxRows}`,
    });
  }

  // Rows that name someone already on the team keep that person's id, so the
  // who-knows-what register and process ownership survive a re-import.
  const existingByName = new Map<string, Person>();
  for (const person of tpl.people) {
    const key = nameKey(person.name);
    if (!existingByName.has(key)) existingByName.set(key, person);
  }
  const today = opts.today ?? new Date();
  const context: ImportContext = {
    tpl,
    columns,
    today,
    dayFirst:
      columns.hireDate !== undefined &&
      datesAreDayFirst(kept.map(({ cells }) => cells[columns.hireDate!] ?? "")),
    issues,
    unknownEntitlements: [],
    unknownStatuses: new Set(),
    seenNames: new Map(),
    byEmployeeId: new Map(),
    onLeave: [],
    existingByName,
    usedIds: new Set(),
  };

  const people: Person[] = [];
  const titles: TitleMapping[] = [];
  let duplicates = 0;
  for (const { cells, row } of kept) {
    const read = readPerson(context, cells, row);
    if (read === "duplicate") duplicates += 1;
    if (typeof read === "string") continue;
    if ("position" in read) {
      titles.push(read.position);
      continue;
    }
    people.push(read.person);
    titles.push(read.mapping);
  }

  const removed = tpl.people.filter((person) => !context.usedIds.has(person.id));
  return {
    people,
    issues,
    unknownEntitlements: context.unknownEntitlements,
    titles,
    removed,
    skipped,
    duplicates,
    dropped,
    onLeave: context.onLeave,
  };
}

/** What an import would take with it: register assignments and process owner slots held by `removed`. */
export function removedPeopleImpact(
  tpl: IndustryTemplate,
  removed: readonly Person[],
): { assignments: number; processOwnerships: number } {
  const ids = new Set(removed.map((p) => p.id));
  return {
    assignments: tpl.relations.filter((r) => ids.has(r.personId)).length,
    processOwnerships: tpl.processes.reduce(
      (n, p) => n + (p.ownerPersonIds ?? []).filter((id) => ids.has(id)).length,
      0,
    ),
  };
}

export function peopleToCsv(people: readonly Person[]): string {
  const rows = [
    PEOPLE_CSV_HEADER.join(","),
    ...people.map((person) =>
      [
        person.name,
        person.role,
        person.department ?? "",
        person.tenureYears === undefined ? "" : String(person.tenureYears),
        person.active ? "true" : "false",
        person.lastDay ?? "",
        (person.entitlements ?? []).join(";"),
      ]
        .map(escapeCsv)
        .join(","),
    ),
  ];
  return `${rows.join("\r\n")}\r\n`;
}

const SPACED_DASH = /\s[-–—]\s/;

/**
 * True when the text before a dash or a bracket is a "Last, First" name
 * rather than a name and a title: "Smith, John", "Roe, Jane, DDS". The part
 * after the comma must not be a known title, and either the surname is one
 * word or the part after the dash is a known title ("Ruiz Lopez, Ana - Cook").
 */
function leadsWithLastFirst(head: string, next: string): boolean {
  const pieces = head.split(",").map((piece) => piece.trim());
  if (pieces.length < 2 || pieces.length > 3) return false;
  const [last, given, credential] = pieces;
  if (credential !== undefined && !NAME_SUFFIXES.has(wordKey(credential))) return false;
  if (!looksLikeGivenNames(given) || matchJobTitle(given)) return false;
  return looksLikeSurname(last, true) || (looksLikeSurname(last) && Boolean(matchJobTitle(next)));
}

/**
 * "Ana Ruiz (Front Desk)" as ["Ana Ruiz", "Front Desk"]: the text before the
 * last bracket and the text inside it, when the line ends with that bracket
 * and nothing inside it is a bracket. A scan, not a regular expression: the
 * pattern it replaces retried from every character of a long run of spaces
 * and froze the page on a pasted line such as "Ana, Clerk (" followed by
 * thousands of spaces.
 */
function trailingBracket(source: string): [string, string, string] | null {
  if (!source.endsWith(")")) return null;
  const open = source.lastIndexOf("(", source.length - 2);
  if (open <= 0) return null;
  const inner = source.slice(open + 1, -1);
  if (inner.length === 0 || inner.includes(")")) return null;
  const before = source.slice(0, open).trimEnd();
  if (before.length === 0) return null;
  return [source, before, inner];
}

/**
 * Splits one line of a headerless list into name, title and department: on
 * tabs first, then " | ", then ": ", then commas or spaced dashes, whichever
 * separates the name ("Ana Ruiz, Front Desk - Evenings" keeps its title whole;
 * "Smith, John - Bookkeeper" is a "Last, First" name), then a bracket.
 */
export function splitListLine(line: string): string[] {
  const source = line.trim().replace(LIST_MARKER, "");
  let parts: string[];
  if (source.includes("\t")) parts = source.split("\t");
  else if (source.includes(" | ")) parts = source.split(" | ");
  else if (source.includes(": ")) parts = source.split(": ");
  else {
    const dash = source.search(SPACED_DASH);
    const comma = source.indexOf(",");
    const parenthetical = trailingBracket(source);
    if (dash >= 0 && (comma < 0 || comma > dash)) parts = source.split(SPACED_DASH);
    else if (
      dash >= 0 &&
      leadsWithLastFirst(source.slice(0, dash), source.slice(dash).split(SPACED_DASH)[1] ?? "")
    ) {
      parts = source.split(SPACED_DASH);
    } else if (
      parenthetical &&
      (comma < 0 || leadsWithLastFirst(parenthetical[1], parenthetical[2]))
    ) {
      parts = [parenthetical[1], parenthetical[2]];
    } else if (comma >= 0) parts = parseRows(source, ",")[0] ?? [source];
    else parts = [source];
  }
  return parts.map((part) => part.trim());
}
