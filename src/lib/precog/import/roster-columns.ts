/** Roster CSV column aliases and header detection. */

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
  // This app's own export only: common HR words ("owner", "guessed") mean other things.
  owns_business: ["owns_business", "owns the business"],
  duties_from_title: ["duties_from_title", "duties from title"],
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

export function normalizeHeader(cell: string): string {
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

export interface ColumnMap {
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
  ownsBusiness?: number;
  dutiesFromTitle?: number;
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

export function mapColumns(header: readonly string[], rows: readonly string[][]): ColumnMap {
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
    ownsBusiness: first("owns_business"),
    dutiesFromTitle: first("duties_from_title"),
  };
}
