import { csvCell } from "../import/csv";
import { LIST_LIMITS } from "../profile-entries";
import type { RoleAssignment } from "./assignments";
import { ENTITLEMENTS, OPERATING_DUTIES, type EntitlementId } from "./conflict-rules";

/** A downloaded power map: the file the map exports and imports. */
interface PowerMapModelFile {
  /** The file format; an import refuses a newer one than this build reads. */
  version: number;
  exportedAt: string;
  assignments: RoleAssignment[];
}

/** One row an import left out, and why. Rows count from 1. */
interface PowerMapImportIssue {
  row: number;
  reason: string;
}

/** What an import read: the good rows, a reason for each row left out, and a problem with the file as a whole. */
interface PowerMapImport {
  assignments: RoleAssignment[];
  issues: PowerMapImportIssue[];
  /** Set when nothing in the file can be used. */
  problem?: string;
}

/**
 * Reads a power-map file (or a bare list of assignments): each row is
 * allow-listed and bounded before it reaches analysis. A malformed row is
 * left out with its reason, and the rest import. A file the owner imports
 * holds at most MAX_PEOPLE people; a stored baseline or snapshot passes
 * MAX_PEOPLE_STORED instead.
 */
export function readRoleAssignments(value: unknown, maxPeople = MAX_PEOPLE): PowerMapImport {
  const file = value && typeof value === "object" && "assignments" in value ? value : undefined;
  const version = file && (file as { version?: unknown }).version;
  if (typeof version === "number" && version > POWER_MAP_MODEL_VERSION) {
    return {
      assignments: [],
      issues: [],
      problem: "A newer version of Precog saved this map.",
    };
  }
  const rows = file ? (file as { assignments?: unknown }).assignments : value;
  if (!Array.isArray(rows)) {
    return {
      assignments: [],
      issues: [],
      problem: "That file is not a Precog duty assignments file.",
    };
  }
  if (rows.length === 0) return { assignments: [], issues: [], problem: "The map lists nobody." };
  if (rows.length > maxPeople) {
    return { assignments: [], issues: [], problem: `A map holds at most ${maxPeople} people.` };
  }
  const ids = new Set<string>();
  const assignments: RoleAssignment[] = [];
  const issues: PowerMapImportIssue[] = [];
  rows.forEach((raw: unknown, index) => {
    const read = readRow(raw, ids);
    if (typeof read === "string") issues.push({ row: index + 1, reason: read });
    else {
      ids.add(read.personId);
      assignments.push(read);
    }
  });
  return { assignments, issues };
}

/**
 * A stored list of assignments, only when every row is good: a saved baseline
 * or snapshot is all or nothing. It holds up to the team a business can store
 * (MAX_PEOPLE_STORED), not the cap on an imported file.
 */
export function normalizeRoleAssignments(value: unknown): RoleAssignment[] | undefined {
  const read = readRoleAssignments(value, MAX_PEOPLE_STORED);
  return read.problem || read.issues.length ? undefined : read.assignments;
}

export function createPowerMapFile(assignments: RoleAssignment[]): PowerMapModelFile {
  return {
    version: POWER_MAP_MODEL_VERSION,
    exportedAt: new Date().toISOString(),
    assignments,
  };
}

/** Export an audit-friendly RACI-style assignment register without formula injection. */
export function createResponsibilityMatrixCsv(assignments: RoleAssignment[]): string {
  const rows = [
    [
      "Duty",
      "Duty family",
      "Risk",
      ...assignments.map((item) => `${item.personName} · ${item.role}`),
    ],
    ...OPERATING_DUTIES.map((duty) => [
      duty.label,
      duty.family.replace("_", " "),
      String(duty.riskWeight),
      ...assignments.map((person) => (person.entitlements.includes(duty.id) ? "Assigned" : "")),
    ]),
  ];
  return rows.map((row) => row.map(csvCell).join(",")).join("\r\n");
}

/** One row as an assignment, or the reason it cannot be one. */
function readRow(raw: unknown, seenIds: ReadonlySet<string>): RoleAssignment | string {
  if (!raw || typeof raw !== "object") return "not a person";
  const item = raw as Record<string, unknown>;
  const text = (field: unknown) => (typeof field === "string" ? field.trim().slice(0, 80) : "");
  const personId = text(item.personId);
  const personName = text(item.personName);
  const role = text(item.role);
  if (!personId) return "no person id";
  if (!personName) return "no name";
  if (!role) return "no job title";
  if (seenIds.has(personId)) return `the same person id as an earlier row (${personId})`;
  if (!Array.isArray(item.entitlements)) return "no list of duties";
  const entitlements = Array.from(
    new Set(
      item.entitlements.filter(
        (id): id is EntitlementId => typeof id === "string" && KNOWN_DUTIES.has(id),
      ),
    ),
  );
  if (entitlements.length === 0) entitlements.push("view_reports_only");
  return {
    personId,
    personName,
    role,
    entitlements,
    ...(typeof item.owner === "boolean" ? { owner: item.owner } : {}),
  };
}

const POWER_MAP_MODEL_VERSION = 1;
/** Most people in a power-map file the owner imports. */
const MAX_PEOPLE = 100;
/** Most people in a stored baseline or snapshot: the most a business's team holds. */
export const MAX_PEOPLE_STORED = LIST_LIMITS.people;
const KNOWN_DUTIES: ReadonlySet<string> = new Set(ENTITLEMENTS.map((item) => item.id));
