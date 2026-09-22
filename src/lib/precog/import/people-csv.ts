import { ENTITLEMENTS, type EntitlementId } from "../sod/conflict-rules";
import type { IndustryTemplate } from "../templates/types";
import type { Person } from "../types";
import { isCalendarDate } from "../continuity/coverage";
import { parseRows, sniffDelimiter } from "./csv";
import { matchJobTitle } from "../onboarding/job-catalog";

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
 * Column names accepted for each field. The lists cover this app's own
 * export plus the worker exports of Workday (Worker, Business Title, Job
 * Profile, Hire Date), SAP SuccessFactors (Person ID External, Job Title,
 * Position, Employment Status), Oracle HCM Cloud (Person Number, Display
 * Name, Job Name, Position Name, Assignment Status), and the payroll
 * providers (Employee Name, Job Title, Department, Status, Hire Date).
 */
const HEADER_ALIASES = {
  name: [
    "name",
    "employee",
    "person",
    "full name",
    "staff",
    "worker",
    "employee name",
    "worker name",
    "display name",
    "full legal name",
    "legal name",
    "preferred name",
    "name - full",
    "person name",
    "team member",
  ],
  first_name: [
    "first name",
    "first_name",
    "given name",
    "legal first name",
    "preferred first name",
  ],
  last_name: ["last name", "last_name", "surname", "family name", "legal last name"],
  role: [
    "role",
    "title",
    "job title",
    "position",
    "business title",
    "job profile",
    "job name",
    "job",
    "position name",
    "position title",
    "job classification",
    "job code description",
    "occupation",
  ],
  department: [
    "department",
    "department name",
    "dept",
    "cost center",
    "cost centre",
    "supervisory organization",
    "organization",
    "org unit",
    "business unit",
    "division",
    "team",
    "location",
  ],
  employee_id: [
    "employee id",
    "employee_id",
    "employee number",
    "emp id",
    "emp no",
    "person number",
    "person id",
    "person id external",
    "user id",
    "worker id",
    "associate id",
    "payroll id",
    "staff id",
    "id",
  ],
  hire_date: [
    "hire date",
    "hire_date",
    "original hire date",
    "most recent hire date",
    "start date",
    "date of hire",
    "hired",
    "employment start date",
    "seniority date",
  ],
  tenure_years: ["tenure_years", "tenure", "years", "years of service", "years_employed"],
  active: [
    "active",
    "status",
    "employed",
    "employment status",
    "assignment status",
    "worker status",
    "active status",
    "employee status",
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
  ],
  entitlements: ["entitlements", "permissions", "duties", "access", "rights"],
} as const;

/** Status words that mean the person no longer works here, across the common exports. */
const INACTIVE_WORDS = [
  "no",
  "n",
  "false",
  "0",
  "inactive",
  "terminated",
  "term",
  "former",
  "left",
  "separated",
  "retired",
  "withdrawn",
  "resigned",
  "ended",
  "t",
];

function isInactive(value: string): boolean {
  const v = value.trim().toLowerCase();
  if (!v) return false;
  if (INACTIVE_WORDS.includes(v)) return true;
  // Oracle: "Inactive - Payroll Eligible"; SuccessFactors: "Terminated"; Workday: "No".
  return /^(inactive|terminated|separated|retired)\b/.test(v) || /\bterminat/.test(v);
}

/** Reads a hire date as written by the common exports and returns an ISO day, or undefined. */
export function parseHireDate(raw: string): string | undefined {
  const value = raw.trim();
  if (!value) return undefined;
  if (isCalendarDate(value)) return value;
  // 03/15/2019 or 3/15/19 (Workday, payroll exports)
  const us = value.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/);
  if (us) {
    const year = us[3].length === 2 ? Number(us[3]) + 2000 : Number(us[3]);
    const iso = `${year}-${us[1].padStart(2, "0")}-${us[2].padStart(2, "0")}`;
    return isCalendarDate(iso) ? iso : undefined;
  }
  // 15-Mar-2019 or 15-MAR-19 (Oracle)
  const oracle = value.match(/^(\d{1,2})-([A-Za-z]{3})-(\d{2}|\d{4})$/);
  if (oracle) {
    const months = [
      "jan",
      "feb",
      "mar",
      "apr",
      "may",
      "jun",
      "jul",
      "aug",
      "sep",
      "oct",
      "nov",
      "dec",
    ];
    const month = months.indexOf(oracle[2].toLowerCase()) + 1;
    if (!month) return undefined;
    const year = oracle[3].length === 2 ? Number(oracle[3]) + 2000 : Number(oracle[3]);
    const iso = `${year}-${String(month).padStart(2, "0")}-${oracle[1].padStart(2, "0")}`;
    return isCalendarDate(iso) ? iso : undefined;
  }
  // 2019-03-15T00:00:00 or "2019-03-15 00:00"
  const stamped = value.match(/^(\d{4}-\d{2}-\d{2})[T ]/);
  if (stamped && isCalendarDate(stamped[1])) return stamped[1];
  return undefined;
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

function escapeCsv(value: string): string {
  return /[",\r\n]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value;
}

function canonicalRole(value: string, roleTemplates: Record<string, unknown>): string {
  const trimmed = value.trim();
  const match = Object.keys(roleTemplates).find(
    (role) => role.toLowerCase() === trimmed.toLowerCase(),
  );
  return match ?? trimmed;
}

function findEntitlement(token: string): EntitlementId | undefined {
  const normalized = normalize(token);
  const direct = ENTITLEMENTS.find((entitlement) => normalize(entitlement.id) === normalized);
  if (direct) return direct.id;
  const byLabel = ENTITLEMENTS.find((entitlement) => normalize(entitlement.label) === normalized);
  if (byLabel) return byLabel.id;
  const alias = Object.entries(ENTITLEMENT_ALIASES).find(([key]) => normalize(key) === normalized);
  return alias?.[1];
}

export function parsePeopleCsv(
  text: string,
  tpl: IndustryTemplate,
  opts: { maxRows?: number; today?: Date } = {},
): PeopleImportResult {
  return parsePeopleRows(parseRows(text, sniffDelimiter(text)), tpl, opts);
}

/** True when a row looks like a header the importer understands (it names a name column). */
export function looksLikeRosterHeader(cells: readonly string[]): boolean {
  const has = (aliases: readonly string[]) =>
    cells.some((cell) => aliases.some((alias) => normalize(alias) === normalize(cell)));
  return (
    has(HEADER_ALIASES.name) || (has(HEADER_ALIASES.first_name) && has(HEADER_ALIASES.last_name))
  );
}

export function parsePeopleRows(
  rows: string[][],
  tpl: IndustryTemplate,
  opts: { maxRows?: number; today?: Date } = {},
): PeopleImportResult {
  const issues: PeopleImportIssue[] = [];
  const people: Person[] = [];
  const unknownEntitlements: string[] = [];
  const unknownSeen = new Set<string>();
  const titles: TitleMapping[] = [];
  const header = rows[0] ?? [];
  const columns = new Map<string, number>();

  for (const [key, aliases] of Object.entries(HEADER_ALIASES)) {
    const index = header.findIndex((cell) =>
      aliases.some((alias) => normalize(alias) === normalize(cell)),
    );
    if (index >= 0) columns.set(key, index);
  }
  const nameColumn = columns.get("name");
  const firstColumn = columns.get("first_name");
  const lastColumn = columns.get("last_name");
  const splitName =
    nameColumn === undefined && firstColumn !== undefined && lastColumn !== undefined;
  if (nameColumn === undefined && !splitName) {
    return {
      people: [],
      issues: [{ row: 0, message: "Missing a name column" }],
      unknownEntitlements: [],
      titles: [],
      removed: [],
    };
  }

  const maxRows =
    opts.maxRows === undefined ? 250 : Math.max(0, Math.floor(Number(opts.maxRows) || 0));
  const dataRows = rows.slice(1);
  const rowsToImport = dataRows.slice(0, maxRows);
  if (dataRows.length > maxRows) {
    issues.push({
      row: maxRows + 1,
      message: `Import truncated to ${maxRows} rows`,
    });
  }
  const usedIds = new Set<string>();
  // Rows that name someone already on the team keep that person's id, so the
  // who-knows-what register and process ownership survive a re-import.
  const existingByName = new Map<string, Person>();
  for (const person of tpl.people) {
    const key = normalize(person.name);
    if (!existingByName.has(key)) existingByName.set(key, person);
  }

  rowsToImport.forEach((cells, index) => {
    const rowNumber = index + 1;
    const name = (
      splitName
        ? `${(cells[firstColumn!] ?? "").trim()} ${(cells[lastColumn!] ?? "").trim()}`
        : (cells[nameColumn!] ?? "")
    ).trim();
    if (!name) {
      issues.push({ row: rowNumber, message: "Name is required" });
      return;
    }

    const roleValue = (columns.has("role") ? (cells[columns.get("role")!] ?? "") : "").trim();
    const role = canonicalRole(roleValue || "Team member", tpl.roleTemplates);
    const department = columns.has("department")
      ? (cells[columns.get("department")!] ?? "").trim().slice(0, 60)
      : "";
    const employeeId = columns.has("employee_id")
      ? (cells[columns.get("employee_id")!] ?? "").trim()
      : "";
    const tenureValue = columns.has("tenure_years")
      ? (cells[columns.get("tenure_years")!] ?? "").trim()
      : "";
    let tenureYears: number | undefined;
    if (tenureValue) {
      const parsed = Number.parseFloat(tenureValue);
      if (Number.isFinite(parsed)) {
        tenureYears = Math.min(60, Math.max(0, parsed));
      } else {
        issues.push({ row: rowNumber, message: "Tenure is not a valid number" });
      }
    } else if (columns.has("hire_date")) {
      const raw = (cells[columns.get("hire_date")!] ?? "").trim();
      const hired = parseHireDate(raw);
      if (hired) tenureYears = tenureFromHireDate(hired, opts.today);
      else if (raw) issues.push({ row: rowNumber, message: `Hire date not understood: ${raw}` });
    }

    const activeValue = columns.has("active") ? (cells[columns.get("active")!] ?? "") : "";
    const active = !isInactive(activeValue);

    // Only the first row naming someone already on the team takes over that
    // person's identity; later duplicates are new people.
    const candidate = existingByName.get(normalize(name));
    const existing = candidate && !usedIds.has(candidate.id) ? candidate : undefined;

    // A file without the column keeps whatever last day the matched person
    // already has; a blank cell in a file that has the column clears it.
    let lastDay: string | undefined = existing?.lastDay;
    if (columns.has("last_day")) {
      const raw = (cells[columns.get("last_day")!] ?? "").trim();
      if (!raw) lastDay = undefined;
      else if (isCalendarDate(raw)) lastDay = raw;
      else {
        issues.push({ row: rowNumber, message: "Last day must be a date like 2026-10-14" });
        lastDay = existing?.lastDay;
      }
    }

    const entitlementValue = columns.has("entitlements")
      ? (cells[columns.get("entitlements")!] ?? "")
      : "";
    const entitlements: EntitlementId[] = [];
    const unknown: string[] = [];
    for (const token of entitlementValue.split(/[;|]/)) {
      const trimmed = token.trim();
      if (!trimmed) continue;
      const entitlement = findEntitlement(trimmed);
      if (entitlement) {
        if (!entitlements.includes(entitlement)) entitlements.push(entitlement);
      } else {
        unknown.push(trimmed);
        const key = normalize(trimmed);
        if (!unknownSeen.has(key)) {
          unknownSeen.add(key);
          unknownEntitlements.push(trimmed);
        }
      }
    }
    if (unknown.length) {
      issues.push({
        row: rowNumber,
        message: `Unknown entitlement(s): ${unknown.join(", ")}`,
      });
    }
    // No duties listed and no template role: read the job title through the
    // catalog of common titles so the whole team lands with typical duties.
    const templateRole = Object.keys(tpl.roleTemplates).some((key) => key === role);
    if (!entitlements.length && !templateRole) {
      const match = roleValue ? matchJobTitle(roleValue) : undefined;
      if (match) {
        entitlements.push(...match.entry.entitlements);
        titles.push({
          row: rowNumber,
          name,
          title: roleValue,
          catalogTitle: match.entry.title,
          confidence: match.confidence,
        });
      } else {
        titles.push({ row: rowNumber, name, title: roleValue });
        issues.push({
          row: rowNumber,
          message: roleValue
            ? `Title "${roleValue}" is not in the catalog; duties left for you to tick`
            : "No job title; duties left for you to tick",
        });
      }
    } else {
      titles.push({
        row: rowNumber,
        name,
        title: roleValue,
        catalogTitle: templateRole ? role : undefined,
        confidence: templateRole ? "exact" : undefined,
      });
    }

    const baseId = existing
      ? existing.id
      : employeeId
        ? `emp-${slug(employeeId) || slug(name)}`
        : `p-${slug(name)}`;
    let id = baseId;
    let suffix = 2;
    while (usedIds.has(id)) id = `${baseId}-${suffix++}`;
    usedIds.add(id);
    people.push({
      id,
      name: name.slice(0, 60),
      role: role.slice(0, 40),
      active,
      tenureYears,
      ...(lastDay ? { lastDay } : {}),
      entitlements: entitlements.length ? entitlements : undefined,
      ...(department ? { department } : {}),
    });
  });

  const removed = tpl.people.filter((person) => !usedIds.has(person.id));
  return { people, issues, unknownEntitlements, titles, removed };
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
