import { ENTITLEMENTS, type EntitlementId } from "../sod/conflict-rules";
import type { IndustryTemplate } from "../templates/types";
import type { Person } from "../types";

export interface PeopleImportIssue {
  row: number;
  message: string;
}

export interface PeopleImportResult {
  people: Person[];
  issues: PeopleImportIssue[];
  unknownEntitlements: string[];
}

export const PEOPLE_CSV_HEADER = [
  "name",
  "role",
  "tenure_years",
  "active",
  "entitlements",
] as const;

const HEADER_ALIASES = {
  name: ["name", "employee", "person", "full name", "staff"],
  role: ["role", "title", "job title", "position"],
  tenure_years: ["tenure_years", "tenure", "years", "years of service", "years_employed"],
  active: ["active", "status", "employed"],
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

function parseRows(text: string): string[][] {
  const source = text.startsWith("\uFEFF") ? text.slice(1) : text;
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;

  for (let i = 0; i < source.length; i++) {
    const char = source[i];
    if (quoted) {
      if (char === '"') {
        if (source[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          quoted = false;
        }
      } else {
        field += char;
      }
      continue;
    }
    if (char === '"' && field.length === 0) {
      quoted = true;
    } else if (char === ",") {
      row.push(field);
      field = "";
    } else if (char === "\r" || char === "\n") {
      row.push(field);
      field = "";
      if (char === "\r" && source[i + 1] === "\n") i++;
      rows.push(row);
      row = [];
    } else {
      field += char;
    }
  }
  if (field || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((cells) => cells.some((cell) => cell.trim()));
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

    const baseId = `p-${slug(name)}`;
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
      entitlements: entitlements.length ? entitlements : undefined,
    });
  });

  return { people, issues, unknownEntitlements };
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
        (person.entitlements ?? []).join(";"),
      ]
        .map(escapeCsv)
        .join(","),
    ),
  ];
  return `${rows.join("\r\n")}\r\n`;
}
