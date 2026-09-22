import { ENTITLEMENTS, type EntitlementId } from "../sod/conflict-rules";
import type { IndustryTemplate } from "../templates/types";
import type { Person } from "../types";
import { isCalendarDate } from "../continuity/coverage";
import { parseRows } from "./csv";

export interface PeopleImportIssue {
  row: number;
  message: string;
}

export interface PeopleImportResult {
  people: Person[];
  issues: PeopleImportIssue[];
  unknownEntitlements: string[];
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
  "tenure_years",
  "active",
  "last_day",
  "entitlements",
] as const;

const HEADER_ALIASES = {
  name: ["name", "employee", "person", "full name", "staff"],
  role: ["role", "title", "job title", "position"],
  tenure_years: ["tenure_years", "tenure", "years", "years of service", "years_employed"],
  active: ["active", "status", "employed"],
  last_day: ["last_day", "last day", "leaving date", "leaving", "end date", "final day"],
  entitlements: ["entitlements", "permissions", "duties", "access", "rights"],
} as const;

const ENTITLEMENT_ALIASES: Record<string, EntitlementId> = {
  payroll: "enter_payroll",
  "approve payroll": "approve_payroll",
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
  opts: { maxRows?: number } = {},
): PeopleImportResult {
  const rows = parseRows(text);
  const issues: PeopleImportIssue[] = [];
  const people: Person[] = [];
  const unknownEntitlements: string[] = [];
  const unknownSeen = new Set<string>();
  const header = rows[0] ?? [];
  const columns = new Map<string, number>();

  for (const [key, aliases] of Object.entries(HEADER_ALIASES)) {
    const index = header.findIndex((cell) =>
      aliases.some((alias) => normalize(alias) === normalize(cell)),
    );
    if (index >= 0) columns.set(key, index);
  }
  const nameColumn = columns.get("name");
  if (nameColumn === undefined) {
    return {
      people: [],
      issues: [{ row: 0, message: "Missing a name column" }],
      unknownEntitlements: [],
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
    const name = (cells[nameColumn] ?? "").trim();
    if (!name) {
      issues.push({ row: rowNumber, message: "Name is required" });
      return;
    }

    const roleValue = columns.has("role") ? (cells[columns.get("role")!] ?? "") : "";
    const role = canonicalRole(roleValue || "Team member", tpl.roleTemplates);
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
    }

    const activeValue = columns.has("active")
      ? (cells[columns.get("active")!] ?? "").trim().toLowerCase()
      : "";
    const active = !["no", "n", "false", "0", "inactive", "terminated", "former", "left"].includes(
      activeValue,
    );

    // A file without the column keeps whatever last day the matched person
    // already has; a blank cell in a file that has the column clears it.
    const existing = existingByName.get(normalize(name));
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
    if (!entitlements.length && !Object.keys(tpl.roleTemplates).some((key) => key === role)) {
      issues.push({
        row: rowNumber,
        message: "role not recognised; add duties or use a template role",
      });
    }

    const baseId = existing && !usedIds.has(existing.id) ? existing.id : `p-${slug(name)}`;
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
    });
  });

  const removed = tpl.people.filter((person) => !usedIds.has(person.id));
  return { people, issues, unknownEntitlements, removed };
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
