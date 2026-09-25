import { locateTable, stripInvisibleControls } from "../import/csv";
import type { EntitlementId } from "../sod/conflict-rules";
import { ENTITLEMENTS } from "../sod/conflict-rules";
import type { Person } from "../types";
import { daysBetween } from "../dates";

export type AccessSource = "quickbooks" | "xero" | "unknown";

export type QueueStatus = "pending" | "mapped" | "dismissed";

export interface AccessUserRow {
  id: string;
  name: string;
  email: string;
  role: string;
  /** Entitlements the role text mapped to. Empty when nothing matched. */
  mapped: EntitlementId[];
  /** Role words that did not match a duty. */
  unmatchedTokens: string[];
  /** Team member this row was paired with, when the name matched. */
  personId?: string;
  /** Duties the books grant that the model does not. */
  extra: EntitlementId[];
  /** Duties the model grants that this export does not show. */
  missingFromBooks: EntitlementId[];
  status: QueueStatus;
  /** Duty a person assigned when the role did not map. */
  assigned?: EntitlementId;
}

export interface AccessVendorRow {
  id: string;
  name: string;
  detail: string;
  /** True when a date column is within the last 90 days of `asOf`. */
  recent: boolean;
  status: QueueStatus;
}

export interface AccessReconciliation {
  importedAt: string;
  source: AccessSource;
  users: AccessUserRow[];
  vendors: AccessVendorRow[];
}

const ENTITLEMENT_SET = new Set<string>(ENTITLEMENTS.map((e) => e.id));

/** Role phrases, longest first, mapped to the duties that seat usually holds. */
const ROLE_MAP: { phrase: string; duties: EntitlementId[] }[] = [
  { phrase: "accounts payable", duties: ["enter_invoices", "create_vendor", "release_payment"] },
  {
    phrase: "accounts receivable",
    duties: ["post_payments", "issue_refunds", "approve_writeoffs"],
  },
  {
    phrase: "payroll manager",
    duties: ["enter_payroll", "approve_payroll", "edit_payroll_master"],
  },
  { phrase: "company admin", duties: ["manage_user_access", "pms_admin_roles", "release_payment"] },
  { phrase: "master admin", duties: ["manage_user_access", "pms_admin_roles", "export_bulk_data"] },
  {
    phrase: "standard all access",
    duties: ["enter_invoices", "create_vendor", "release_payment", "post_payments"],
  },
  { phrase: "standard no access", duties: ["view_reports_only"] },
  { phrase: "reports only", duties: ["view_reports_only"] },
  { phrase: "view only", duties: ["view_reports_only"] },
  { phrase: "read only", duties: ["view_reports_only"] },
  { phrase: "time tracking", duties: ["enter_payroll"] },
  { phrase: "invoicing only", duties: ["submit_claims", "enter_invoices"] },
  { phrase: "bank admin", duties: ["release_payment", "initiate_ach", "sign_checks"] },
  { phrase: "approver", duties: ["approve_invoices", "approve_vendor"] },
  { phrase: "admin", duties: ["manage_user_access", "pms_admin_roles"] },
  { phrase: "advisor", duties: ["view_reports_only", "bank_reconcile"] },
  { phrase: "accountant", duties: ["bank_reconcile", "post_journal_entries", "view_reports_only"] },
  { phrase: "bookkeeper", duties: ["enter_invoices", "post_payments", "bank_reconcile"] },
  { phrase: "standard", duties: ["enter_invoices", "post_payments"] },
  { phrase: "invoice only", duties: ["submit_claims"] },
];

const VENDOR_HEADERS = ["vendor", "supplier", "contact name", "company"];

function norm(value: string): string {
  return stripInvisibleControls(value).trim().toLowerCase().replace(/\s+/g, " ");
}

function headerIndex(headers: readonly string[], names: readonly string[]): number {
  const lowered = headers.map(norm);
  return lowered.findIndex((h) => names.includes(h));
}

function looksLikeUsers(headers: readonly string[]): boolean {
  const lowered = headers.map(norm);
  if (lowered.some((h) => VENDOR_HEADERS.includes(h))) return false;
  return lowered.some((h) => h === "role" || h === "user role" || h === "email" || h === "user");
}

function looksLikeVendors(headers: readonly string[]): boolean {
  const lowered = headers.map(norm);
  return lowered.some((h) => VENDOR_HEADERS.includes(h));
}

function detectAccessSource(headers: readonly string[]): AccessSource {
  const joined = headers.map(norm).join(" ");
  if (joined.includes("billable") || joined.includes("user role")) return "quickbooks";
  if (joined.includes("contact name") || joined.includes("account number")) return "xero";
  return "unknown";
}

/** Split a role cell into phrases and map the ones this catalog knows. */
export function mapRoleToDuties(role: string): {
  mapped: EntitlementId[];
  unmatchedTokens: string[];
} {
  const rest = norm(role);
  const mapped = new Set<EntitlementId>();
  const unmatched: string[] = [];
  if (!rest) return { mapped: [], unmatchedTokens: [] };
  const parts = rest.split(/\s*(?:\/|,|;|\band\b)\s*/).filter(Boolean);
  for (const part of parts) {
    let remaining = part;
    let hit = false;
    const ordered = [...ROLE_MAP].sort((a, b) => b.phrase.length - a.phrase.length);
    for (const entry of ordered) {
      if (remaining.includes(entry.phrase)) {
        hit = true;
        for (const duty of entry.duties) mapped.add(duty);
        remaining = remaining.replace(entry.phrase, " ").replace(/\s+/g, " ").trim();
      }
    }
    if (!hit) unmatched.push(part);
    else if (remaining && remaining !== part) unmatched.push(remaining);
  }
  return { mapped: [...mapped], unmatchedTokens: unmatched.filter(Boolean) };
}

function personKey(name: string): string {
  return norm(name).replace(/[^a-z0-9 ]/g, "");
}

function matchPerson(name: string, people: readonly Person[]): Person | undefined {
  const key = personKey(name);
  if (!key) return undefined;
  return people.find((p) => personKey(p.name) === key);
}

function readDate(value: string): string {
  const text = value.trim();
  const iso = text.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const us = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (us) {
    return `${us[3]}-${us[1].padStart(2, "0")}-${us[2].padStart(2, "0")}`;
  }
  return "";
}

function rowId(prefix: string, index: number, name: string): string {
  return `${prefix}_${index}_${personKey(name).slice(0, 24) || "row"}`;
}

export function parseAccessExport(
  text: string,
  people: readonly Person[],
  asOf: string,
): { source: AccessSource; users: AccessUserRow[]; vendors: AccessVendorRow[]; issues: string[] } {
  const issues: string[] = [];
  const located = locateTable(text, (cells) => looksLikeUsers(cells) || looksLikeVendors(cells), 8);
  if (!located) {
    return {
      source: "unknown",
      users: [],
      vendors: [],
      issues: ["No user or vendor header was found."],
    };
  }
  const headers = located.rows[0].map((c) => c.trim());
  const source = detectAccessSource(headers);
  const users: AccessUserRow[] = [];
  const vendors: AccessVendorRow[] = [];
  if (looksLikeUsers(headers)) {
    const nameAt = headerIndex(headers, ["name", "user", "display name"]);
    const emailAt = headerIndex(headers, ["email", "email address"]);
    const roleAt = headerIndex(headers, ["role", "user role"]);
    const firstAt = headerIndex(headers, ["first name"]);
    const lastAt = headerIndex(headers, ["last name"]);
    located.rows.slice(1).forEach((cells, index) => {
      const first = firstAt >= 0 ? (cells[firstAt] ?? "") : "";
      const last = lastAt >= 0 ? (cells[lastAt] ?? "") : "";
      const name = (nameAt >= 0 ? cells[nameAt] : `${first} ${last}`).trim();
      if (!name || norm(name) === "total") return;
      const role = roleAt >= 0 ? (cells[roleAt] ?? "").trim() : "";
      const mappedRole = mapRoleToDuties(role);
      const person = matchPerson(name, people);
      const held = new Set(person?.entitlements ?? []);
      const extra = mappedRole.mapped.filter((d) => !held.has(d));
      const missingFromBooks = [...held].filter(
        (d): d is EntitlementId =>
          ENTITLEMENT_SET.has(d) && !mappedRole.mapped.includes(d as EntitlementId),
      );
      const needsQueue = mappedRole.unmatchedTokens.length > 0 || !person || extra.length > 0;
      users.push({
        id: rowId("user", index + 2, name),
        name: name.slice(0, 120),
        email: emailAt >= 0 ? (cells[emailAt] ?? "").trim().slice(0, 160) : "",
        role: role.slice(0, 160),
        mapped: mappedRole.mapped,
        unmatchedTokens: mappedRole.unmatchedTokens,
        ...(person ? { personId: person.id } : {}),
        extra: person ? extra : mappedRole.mapped,
        missingFromBooks: person ? missingFromBooks : [],
        status: needsQueue ? "pending" : "mapped",
      });
    });
  }
  if (looksLikeVendors(headers) && !looksLikeUsers(headers)) {
    const nameAt = headerIndex(headers, ["vendor", "supplier", "contact name", "company", "name"]);
    const dateAt = headerIndex(headers, ["created", "created date", "date", "open balance date"]);
    const detailAt = headerIndex(headers, ["email", "account number", "company"]);
    located.rows.slice(1).forEach((cells, index) => {
      const name = (nameAt >= 0 ? cells[nameAt] : (cells[0] ?? "")).trim();
      if (!name || norm(name) === "total") return;
      const created = dateAt >= 0 ? readDate(cells[dateAt] ?? "") : "";
      const age = created ? daysBetween(created, asOf.slice(0, 10)) : null;
      vendors.push({
        id: rowId("vendor", index + 2, name),
        name: name.slice(0, 160),
        detail: detailAt >= 0 ? (cells[detailAt] ?? "").trim().slice(0, 160) : created,
        recent: age !== null && age >= 0 && age <= 90,
        status: "pending",
      });
    });
  } else if (!looksLikeUsers(headers)) {
    issues.push("The header is not a user list or a vendor list.");
  }
  if (users.length === 0 && vendors.length === 0) {
    issues.push("The file had a header and no data rows.");
  }
  return { source, users: users.slice(0, 500), vendors: vendors.slice(0, 500), issues };
}

/** Second file: vendors parsed on their own and merged onto an existing user import. */
export function parseVendorExport(text: string, asOf: string): AccessVendorRow[] {
  const parsed = parseAccessExport(text, [], asOf);
  if (parsed.vendors.length > 0) return parsed.vendors;
  // A user-shaped file should not be reread as vendors.
  return [];
}

function isDuty(value: unknown): value is EntitlementId {
  return typeof value === "string" && ENTITLEMENT_SET.has(value);
}

export function normalizeAccessReconciliation(value: unknown): AccessReconciliation | undefined {
  if (!value || typeof value !== "object") return undefined;
  const raw = value as Record<string, unknown>;
  const usersIn = Array.isArray(raw.users) ? raw.users : [];
  const vendorsIn = Array.isArray(raw.vendors) ? raw.vendors : [];
  const users: AccessUserRow[] = [];
  for (const entry of usersIn.slice(0, 500)) {
    if (!entry || typeof entry !== "object") continue;
    const row = entry as Record<string, unknown>;
    if (typeof row.id !== "string" || typeof row.name !== "string") continue;
    const status: QueueStatus =
      row.status === "mapped" || row.status === "dismissed" ? row.status : "pending";
    users.push({
      id: row.id.slice(0, 80),
      name: row.name.slice(0, 120),
      email: typeof row.email === "string" ? row.email.slice(0, 160) : "",
      role: typeof row.role === "string" ? row.role.slice(0, 160) : "",
      mapped: Array.isArray(row.mapped) ? row.mapped.filter(isDuty) : [],
      unmatchedTokens: Array.isArray(row.unmatchedTokens)
        ? row.unmatchedTokens.filter((t): t is string => typeof t === "string").slice(0, 12)
        : [],
      ...(typeof row.personId === "string" ? { personId: row.personId.slice(0, 80) } : {}),
      extra: Array.isArray(row.extra) ? row.extra.filter(isDuty) : [],
      missingFromBooks: Array.isArray(row.missingFromBooks)
        ? row.missingFromBooks.filter(isDuty)
        : [],
      status,
      ...(isDuty(row.assigned) ? { assigned: row.assigned } : {}),
    });
  }
  const vendors: AccessVendorRow[] = [];
  for (const entry of vendorsIn.slice(0, 500)) {
    if (!entry || typeof entry !== "object") continue;
    const row = entry as Record<string, unknown>;
    if (typeof row.id !== "string" || typeof row.name !== "string") continue;
    const status: QueueStatus =
      row.status === "mapped" || row.status === "dismissed" ? row.status : "pending";
    vendors.push({
      id: row.id.slice(0, 80),
      name: row.name.slice(0, 160),
      detail: typeof row.detail === "string" ? row.detail.slice(0, 160) : "",
      recent: row.recent === true,
      status,
    });
  }
  if (users.length === 0 && vendors.length === 0) return undefined;
  const source: AccessSource =
    raw.source === "quickbooks" || raw.source === "xero" ? raw.source : "unknown";
  return {
    importedAt: typeof raw.importedAt === "string" ? raw.importedAt.slice(0, 40) : "",
    source,
    users,
    vendors,
  };
}

export function pendingQueueCount(rec: AccessReconciliation | undefined): number {
  if (!rec) return 0;
  return (
    rec.users.filter((u) => u.status === "pending").length +
    rec.vendors.filter((v) => v.status === "pending").length
  );
}
