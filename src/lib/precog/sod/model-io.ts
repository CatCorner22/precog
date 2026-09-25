import { ENTITLEMENTS, type EntitlementId } from "./conflict-rules";
import type { RoleAssignment } from "./detect";
import { csvCell } from "../import/csv";

const POWER_MAP_MODEL_VERSION = 1;
export const POWER_MAP_STORAGE_KEY = "precog.power-map.v1";

export interface PowerMapModelFile {
  version: number;
  exportedAt: string;
  assignments: RoleAssignment[];
}

/** Allow-list and bound imported/local assignment data before it reaches analysis. */
export function normalizeRoleAssignments(value: unknown): RoleAssignment[] | undefined {
  const container =
    value && typeof value === "object" && "assignments" in value
      ? (value as { assignments?: unknown }).assignments
      : value;
  if (!Array.isArray(container) || container.length === 0 || container.length > 100)
    return undefined;
  const allowed = new Set(ENTITLEMENTS.map((item) => item.id));
  const ids = new Set<string>();
  const normalized: RoleAssignment[] = [];

  for (const raw of container) {
    if (!raw || typeof raw !== "object") return undefined;
    const item = raw as Record<string, unknown>;
    const personId = typeof item.personId === "string" ? item.personId.trim().slice(0, 80) : "";
    const personName =
      typeof item.personName === "string" ? item.personName.trim().slice(0, 80) : "";
    const role = typeof item.role === "string" ? item.role.trim().slice(0, 80) : "";
    if (!personId || !personName || !role || ids.has(personId) || !Array.isArray(item.entitlements))
      return undefined;
    ids.add(personId);
    const entitlements = Array.from(
      new Set(
        item.entitlements.filter(
          (id): id is EntitlementId => typeof id === "string" && allowed.has(id as EntitlementId),
        ),
      ),
    );
    if (entitlements.length === 0) entitlements.push("view_reports_only");
    normalized.push({
      personId,
      personName,
      role,
      entitlements,
      ...(typeof item.owner === "boolean" ? { owner: item.owner } : {}),
    });
  }
  return normalized;
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
  const escape = csvCell;
  const duties = ENTITLEMENTS.filter((item) => item.id !== "view_reports_only");
  const rows = [
    [
      "Power / duty",
      "Duty family",
      "Risk",
      ...assignments.map((item) => `${item.personName} · ${item.role}`),
    ],
    ...duties.map((duty) => [
      duty.label,
      duty.family.replace("_", " "),
      String(duty.riskWeight),
      ...assignments.map((person) => (person.entitlements.includes(duty.id) ? "Assigned" : "")),
    ]),
  ];
  return rows.map((row) => row.map(escape).join(",")).join("\r\n");
}
