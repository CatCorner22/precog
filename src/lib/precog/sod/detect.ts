/**
 * Automated SoD conflict detection.
 *
 * Algorithm:
 * 1. Expand each person → set of entitlements (role template + overrides)
 * 2. For each person, test all unordered pairs of entitlements against CONFLICT_RULES
 * 3. Also flag family-level conflicts when no specific rule but matrix says conflict
 * 4. Score severity with risk weights + residual acceptance + compensating strength
 * 5. Build N×N entitlement matrix for UI
 */
import { people } from "../demo-data";
import {
  CONFLICT_RULES,
  ENTITLEMENTS,
  FAMILY_CONFLICT_MATRIX,
  type ConflictRule,
  type DutyFamily,
  type EntitlementId,
} from "./conflict-rules";
import type { StaffComposition } from "../types";

export interface RoleAssignment {
  personId: string;
  personName: string;
  role: string;
  entitlements: EntitlementId[];
}

export interface DetectedConflict {
  id: string;
  ruleId: string;
  personId: string;
  personName: string;
  role: string;
  entitlementA: EntitlementId;
  entitlementB: EntitlementId;
  labelA: string;
  labelB: string;
  severity: ConflictRule["severity"] | "family";
  title: string;
  why: string;
  fraudPath: string;
  score: number; // 0–100
  compensatingControls: string[];
  residualRiskAccepted: boolean;
  linkedScenarioId?: string;
  linkedControlId?: string;
  processIds: string[];
}

export interface SodMatrixCell {
  row: EntitlementId;
  col: EntitlementId;
  status: "safe" | "conflict" | "self" | "n/a";
  ruleIds: string[];
  severity?: ConflictRule["severity"] | "family";
}

export interface SodDetectionReport {
  method: string;
  assignments: RoleAssignment[];
  conflicts: DetectedConflict[];
  matrix: SodMatrixCell[];
  entitlementOrder: EntitlementId[];
  summary: {
    critical: number;
    high: number;
    medium: number;
    family: number;
    peopleWithConflicts: number;
    openWithoutAcceptance: number;
    segregationHealth: number; // 0–100 inverse of conflict pressure
  };
  recommendations: string[];
}

/** Default dental role → entitlement templates. */
export const ROLE_TEMPLATES: Record<string, EntitlementId[]> = {
  "Owner / Dentist": [
    "approve_writeoffs",
    "approve_vendor",
    "approve_payroll",
    "bank_reconcile",
    "view_reports_only",
    "pms_admin_roles",
  ],
  "Office Manager": [
    "post_payments",
    "prepare_deposit",
    "post_adjustments",
    "create_vendor",
    "release_payment",
    "enter_payroll",
    "approve_writeoffs",
    "pms_admin_roles",
    "submit_claims",
    "view_reports_only",
  ],
  "Front Desk Lead": [
    "collect_cash",
    "post_payments",
    "prepare_deposit",
    "submit_claims",
    "post_adjustments",
  ],
  Hygienist: ["view_reports_only"],
  "Dental Assistant": ["view_reports_only"],
  "Billing Specialist": [
    "submit_claims",
    "post_adjustments",
    "post_payments",
    "approve_writeoffs",
    "view_reports_only",
  ],
};

function entLabel(id: EntitlementId) {
  return ENTITLEMENTS.find((e) => e.id === id)?.label ?? id;
}

function entFamily(id: EntitlementId): DutyFamily {
  return ENTITLEMENTS.find((e) => e.id === id)?.family ?? "recording";
}

function entWeight(id: EntitlementId) {
  return ENTITLEMENTS.find((e) => e.id === id)?.riskWeight ?? 3;
}

function entProcesses(id: EntitlementId) {
  return ENTITLEMENTS.find((e) => e.id === id)?.processIds ?? [];
}

function findRule(a: EntitlementId, b: EntitlementId): ConflictRule | undefined {
  return CONFLICT_RULES.find(
    (r) => (r.a === a && r.b === b) || (r.a === b && r.b === a),
  );
}

function familiesConflict(fa: DutyFamily, fb: DutyFamily): boolean {
  if (fa === fb) {
    // same family can still conflict for master_data + self, but skip same-id
    return fa === "master_data" || fa === "custody";
  }
  return Boolean(FAMILY_CONFLICT_MATRIX[fa]?.[fb]);
}

function scoreConflict(
  severity: DetectedConflict["severity"],
  a: EntitlementId,
  b: EntitlementId,
  residualAccepted: boolean,
  compensatingCount: number,
  staff?: StaffComposition,
): number {
  const base =
    severity === "critical" ? 88 : severity === "high" ? 72 : severity === "medium" ? 55 : 48;
  const weightBoost = (entWeight(a) + entWeight(b) - 6) * 3;
  let s = base + weightBoost;
  if (residualAccepted) s -= 18;
  s -= Math.min(20, compensatingCount * 6);
  if (staff && !staff.dualControlPayments && (a.includes("pay") || b.includes("pay") || a === "collect_cash" || b === "collect_cash")) {
    s += 6;
  }
  if (staff && !staff.independentBankRec && (a === "bank_reconcile" || b === "bank_reconcile")) {
    s += 8;
  }
  if (staff && staff.segregationScore < 50) s += 5;
  return Math.max(15, Math.min(100, Math.round(s)));
}

export function buildAssignments(
  overrides?: Partial<Record<string, EntitlementId[]>>,
): RoleAssignment[] {
  return people.map((p) => {
    const fromRole = ROLE_TEMPLATES[p.role] ?? ["view_reports_only"];
    const extra = overrides?.[p.id] ?? [];
    const entitlements = Array.from(new Set([...fromRole, ...extra]));
    return {
      personId: p.id,
      personName: p.name,
      role: p.role,
      entitlements,
    };
  });
}

export function detectSodConflicts(
  staff?: StaffComposition,
  options?: {
    assignments?: RoleAssignment[];
    /** Control IDs marked residual accepted (from demo controls) */
    residualAcceptedControlIds?: Set<string>;
    compensatingByControlId?: Record<string, string[]>;
  },
): SodDetectionReport {
  const assignments = options?.assignments ?? buildAssignments();
  const residualAccepted = options?.residualAcceptedControlIds ?? new Set<string>();
  const compensatingByControl = options?.compensatingByControlId ?? {};

  const conflicts: DetectedConflict[] = [];

  for (const person of assignments) {
    const ents = person.entitlements;
    for (let i = 0; i < ents.length; i++) {
      for (let j = i + 1; j < ents.length; j++) {
        const a = ents[i];
        const b = ents[j];
        const rule = findRule(a, b);
        const fa = entFamily(a);
        const fb = entFamily(b);

        if (!rule && !familiesConflict(fa, fb)) continue;
        // Skip pure report-only pairings
        if (a === "view_reports_only" || b === "view_reports_only") continue;

        if (rule) {
          const comps = [
            ...rule.compensatingDefaults,
            ...(rule.linkedControlId
              ? compensatingByControl[rule.linkedControlId] ?? []
              : []),
          ];
          const accepted = rule.linkedControlId
            ? residualAccepted.has(rule.linkedControlId)
            : false;
          conflicts.push({
            id: `${person.personId}:${rule.id}`,
            ruleId: rule.id,
            personId: person.personId,
            personName: person.personName,
            role: person.role,
            entitlementA: a,
            entitlementB: b,
            labelA: entLabel(a),
            labelB: entLabel(b),
            severity: rule.severity,
            title: rule.title,
            why: rule.why,
            fraudPath: rule.fraudPath,
            score: scoreConflict(
              rule.severity,
              a,
              b,
              accepted,
              comps.length,
              staff,
            ),
            compensatingControls: Array.from(new Set(comps)),
            residualRiskAccepted: accepted,
            linkedScenarioId: rule.linkedScenarioId,
            linkedControlId: rule.linkedControlId,
            processIds: Array.from(
              new Set([...entProcesses(a), ...entProcesses(b)]),
            ),
          });
        } else {
          // Family-level residual conflict
          conflicts.push({
            id: `${person.personId}:family:${a}:${b}`,
            ruleId: `family-${fa}-${fb}`,
            personId: person.personId,
            personName: person.personName,
            role: person.role,
            entitlementA: a,
            entitlementB: b,
            labelA: entLabel(a),
            labelB: entLabel(b),
            severity: "family",
            title: `${fa} + ${fb} combination`,
            why: "Duty families are classically incompatible under COSO-style SoD.",
            fraudPath: "Opportunity from combined incompatible duty families",
            score: scoreConflict("family", a, b, false, 0, staff),
            compensatingControls: [
              "Document residual acceptance",
              "Add independent review cadence",
            ],
            residualRiskAccepted: false,
            processIds: Array.from(
              new Set([...entProcesses(a), ...entProcesses(b)]),
            ),
          });
        }
      }
    }
  }

  conflicts.sort((a, b) => b.score - a.score);

  // Matrix for UI (entitlement × entitlement)
  const entitlementOrder = ENTITLEMENTS.map((e) => e.id);
  const matrix: SodMatrixCell[] = [];
  for (const row of entitlementOrder) {
    for (const col of entitlementOrder) {
      if (row === col) {
        matrix.push({ row, col, status: "self", ruleIds: [] });
        continue;
      }
      const rule = findRule(row, col);
      if (rule) {
        matrix.push({
          row,
          col,
          status: "conflict",
          ruleIds: [rule.id],
          severity: rule.severity,
        });
      } else if (familiesConflict(entFamily(row), entFamily(col))) {
        matrix.push({
          row,
          col,
          status: "conflict",
          ruleIds: [`family-${entFamily(row)}-${entFamily(col)}`],
          severity: "family",
        });
      } else {
        matrix.push({ row, col, status: "safe", ruleIds: [] });
      }
    }
  }

  const critical = conflicts.filter((c) => c.severity === "critical").length;
  const high = conflicts.filter((c) => c.severity === "high").length;
  const medium = conflicts.filter((c) => c.severity === "medium").length;
  const family = conflicts.filter((c) => c.severity === "family").length;
  const peopleWithConflicts = new Set(conflicts.map((c) => c.personId)).size;
  const openWithoutAcceptance = conflicts.filter((c) => !c.residualRiskAccepted).length;

  const pressure =
    critical * 14 + high * 8 + medium * 4 + family * 2 + openWithoutAcceptance * 1.5;
  const segregationHealth = Math.max(5, Math.min(100, Math.round(100 - pressure)));

  const recommendations: string[] = [];
  if (critical > 0) {
    recommendations.push(
      `Resolve or compensate ${critical} critical conflict(s) first (cash/vendor/write-off paths).`,
    );
  }
  if (conflicts.some((c) => c.ruleId === "rule-cash-rec" || c.ruleId === "rule-custody-rec")) {
    recommendations.push(
      "Highest ROI: move bank reconciliation to the owner (or outsourced bookkeeper) this week.",
    );
  }
  if (conflicts.some((c) => c.ruleId === "rule-vendor-create-pay")) {
    recommendations.push("Enable dual ACH release and freeze vendor master changes without owner sign-off.");
  }
  if (conflicts.some((c) => c.ruleId === "rule-writeoff" || c.ruleId === "rule-claims-writeoff")) {
    recommendations.push("Set write-off approval threshold and monthly exception report.");
  }
  if (openWithoutAcceptance > 0) {
    recommendations.push(
      `${openWithoutAcceptance} conflict(s) lack residual acceptance — document accept/remediate in the journal.`,
    );
  }
  if (!recommendations.length) {
    recommendations.push("No high-severity conflicts detected — re-run after any role or staff change.");
  }

  return {
    method:
      "Entitlement pair scan vs rulebook + duty-family matrix (COSO-style SoD)",
    assignments,
    conflicts,
    matrix,
    entitlementOrder,
    summary: {
      critical,
      high,
      medium,
      family,
      peopleWithConflicts,
      openWithoutAcceptance,
      segregationHealth,
    },
    recommendations,
  };
}

export function conflictMatrixForPerson(
  personId: string,
  report: SodDetectionReport,
): DetectedConflict[] {
  return report.conflicts.filter((c) => c.personId === personId);
}
