/**
 * Automated SoD conflict detection.
 *
 * Algorithm:
 * 1. Expand each person → set of entitlements (role template + overrides)
 * 2. For each person, test all unordered pairs of entitlements against CONFLICT_RULES
 * 3. Also flag family-level conflicts when no specific rule but matrix says conflict
 * 4. Score severity with risk weights + residual acceptance + dual-release mitigation
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
  dualReleaseMitigated: boolean;
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
    dualReleaseMitigated: number;
    segregationHealth: number;
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
  "Associate Dentist": ["approve_writeoffs", "view_reports_only"],
  "Practice Administrator": ["approve_vendor", "approve_payroll", "approve_writeoffs", "view_reports_only", "review_audit_logs"],
  Receptionist: ["collect_cash", "post_payments", "edit_patient_master", "view_reports_only"],
  "Treatment Coordinator": ["edit_patient_master", "post_adjustments", "view_reports_only"],
  "Insurance Coordinator": ["submit_claims", "post_adjustments", "post_payments", "view_reports_only"],
  Bookkeeper: ["enter_invoices", "post_payments", "bank_reconcile", "enter_payroll", "view_reports_only"],
  "CPA / Independent Reviewer": ["bank_reconcile", "review_audit_logs", "view_reports_only"],
  "Payroll Coordinator": ["enter_payroll", "view_reports_only"],
  "Procurement Coordinator": ["order_supplies", "receive_goods", "enter_invoices", "view_reports_only"],
  "IT Administrator": ["pms_admin_roles", "manage_user_access", "manage_backups", "view_reports_only"],
  "Clinical Lead": ["order_supplies", "receive_goods", "view_reports_only"],
  "External Billing Service": ["submit_claims", "post_adjustments", "post_payments", "export_bulk_data", "view_reports_only"],
  "AP Specialist": ["create_vendor", "enter_invoices", "initiate_ach", "view_reports_only"],
  "Payment Approver": ["approve_vendor", "release_payment", "sign_checks", "view_reports_only"],
};

/** Common jobs available to the visual assignment sandbox. */
export const COMMON_JOB_TEMPLATES = Object.entries(ROLE_TEMPLATES).map(
  ([role, entitlements]) => ({ role, entitlements }),
);

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
    return fa === "master_data" || fa === "custody";
  }
  return Boolean(FAMILY_CONFLICT_MATRIX[fa]?.[fb]);
}

function sharesProcess(a: EntitlementId, b: EntitlementId): boolean {
  const left = entProcesses(a);
  const right = new Set(entProcesses(b));
  return left.some((processId) => right.has(processId));
}

function canonicalPair(a: EntitlementId, b: EntitlementId): [EntitlementId, EntitlementId] {
  return a.localeCompare(b) <= 0 ? [a, b] : [b, a];
}

function familyRuleId(a: DutyFamily, b: DutyFamily) {
  return `family-${[a, b].sort().join("-")}`;
}

function scoreConflict(
  severity: DetectedConflict["severity"],
  a: EntitlementId,
  b: EntitlementId,
  residualAccepted: boolean,
  compensatingCount: number,
  dualMitigated: boolean,
  staff?: StaffComposition,
): number {
  const base =
    severity === "critical" ? 88 : severity === "high" ? 72 : severity === "medium" ? 55 : 48;
  const weightBoost = (entWeight(a) + entWeight(b) - 6) * 3;
  let s = base + weightBoost;
  if (residualAccepted) s -= 18;
  s -= Math.min(20, compensatingCount * 6);
  if (dualMitigated) s -= 28; // dual release is a strong compensating control
  if (
    staff &&
    !staff.dualControlPayments &&
    (a.includes("pay") ||
      b.includes("pay") ||
      a === "collect_cash" ||
      b === "collect_cash" ||
      a === "release_payment" ||
      b === "release_payment")
  ) {
    s += 6;
  }
  if (staff && !staff.independentBankRec && (a === "bank_reconcile" || b === "bank_reconcile")) {
    s += 8;
  }
  if (staff && staff.segregationScore < 50) s += 5;
  return Math.max(12, Math.min(100, Math.round(s)));
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
    residualAcceptedControlIds?: Set<string>;
    compensatingByControlId?: Record<string, string[]>;
    /** SoD rule IDs mitigated by dual-release policy */
    dualReleaseMitigatedRuleIds?: Set<string>;
  },
): SodDetectionReport {
  const assignments = options?.assignments ?? buildAssignments();
  const residualAccepted = options?.residualAcceptedControlIds ?? new Set<string>();
  const compensatingByControl = options?.compensatingByControlId ?? {};
  const dualMitigatedRules =
    options?.dualReleaseMitigatedRuleIds ?? new Set<string>();

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

        // Family heuristics are a backstop, not a reason to flag unrelated
        // workflows. Explicit rulebook conflicts remain global; generic family
        // conflicts require the powers to participate in the same process.
        if (!rule && (!familiesConflict(fa, fb) || !sharesProcess(a, b))) continue;
        if (a === "view_reports_only" || b === "view_reports_only") continue;

        if (rule) {
          const canonicalA = rule.a;
          const canonicalB = rule.b;
          const dualMitigated = dualMitigatedRules.has(rule.id);
          const comps = [
            ...rule.compensatingDefaults,
            ...(rule.linkedControlId
              ? compensatingByControl[rule.linkedControlId] ?? []
              : []),
            ...(dualMitigated
              ? ["Dual-release policy active on related channel"]
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
            entitlementA: canonicalA,
            entitlementB: canonicalB,
            labelA: entLabel(canonicalA),
            labelB: entLabel(canonicalB),
            severity: rule.severity,
            title: rule.title,
            why: rule.why,
            fraudPath: rule.fraudPath,
            score: scoreConflict(
              rule.severity,
              canonicalA,
              canonicalB,
              accepted,
              comps.length,
              dualMitigated,
              staff,
            ),
            compensatingControls: Array.from(new Set(comps)),
            residualRiskAccepted: accepted,
            dualReleaseMitigated: dualMitigated,
            linkedScenarioId: rule.linkedScenarioId,
            linkedControlId: rule.linkedControlId,
            processIds: Array.from(
              new Set([...entProcesses(canonicalA), ...entProcesses(canonicalB)]),
            ),
          });
        } else {
          const [canonicalA, canonicalB] = canonicalPair(a, b);
          const canonicalFamilyA = entFamily(canonicalA);
          const canonicalFamilyB = entFamily(canonicalB);
          conflicts.push({
            id: `${person.personId}:family:${canonicalA}:${canonicalB}`,
            ruleId: familyRuleId(canonicalFamilyA, canonicalFamilyB),
            personId: person.personId,
            personName: person.personName,
            role: person.role,
            entitlementA: canonicalA,
            entitlementB: canonicalB,
            labelA: entLabel(canonicalA),
            labelB: entLabel(canonicalB),
            severity: "family",
            title: `${canonicalFamilyA} + ${canonicalFamilyB} combination`,
            why: "These duty families are incompatible within the same operating process.",
            fraudPath: "Opportunity from combined incompatible duty families",
            score: scoreConflict("family", canonicalA, canonicalB, false, 0, false, staff),
            compensatingControls: [
              "Document residual acceptance",
              "Add independent review cadence",
            ],
            residualRiskAccepted: false,
            dualReleaseMitigated: false,
            processIds: Array.from(
              new Set([...entProcesses(canonicalA), ...entProcesses(canonicalB)]),
            ),
          });
        }
      }
    }
  }

  conflicts.sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));

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
      } else if (familiesConflict(entFamily(row), entFamily(col)) && sharesProcess(row, col)) {
        matrix.push({
          row,
          col,
          status: "conflict",
          ruleIds: [familyRuleId(entFamily(row), entFamily(col))],
          severity: "family",
        });
      } else {
        matrix.push({ row, col, status: "safe", ruleIds: [] });
      }
    }
  }

  const critical = conflicts.filter(
    (c) => c.severity === "critical" && !c.dualReleaseMitigated,
  ).length;
  const high = conflicts.filter(
    (c) => c.severity === "high" && !c.dualReleaseMitigated,
  ).length;
  const medium = conflicts.filter((c) => c.severity === "medium").length;
  const family = conflicts.filter((c) => c.severity === "family").length;
  const peopleWithConflicts = new Set(conflicts.map((c) => c.personId)).size;
  const openWithoutAcceptance = conflicts.filter(
    (c) => !c.residualRiskAccepted && !c.dualReleaseMitigated,
  ).length;
  const dualReleaseMitigated = conflicts.filter((c) => c.dualReleaseMitigated).length;

  const pressure =
    critical * 14 +
    high * 8 +
    medium * 4 +
    family * 2 +
    openWithoutAcceptance * 1.5 -
    dualReleaseMitigated * 4;
  const segregationHealth = Math.max(5, Math.min(100, Math.round(100 - pressure)));

  const recommendations: string[] = [];
  if (critical > 0) {
    recommendations.push(
      `Resolve or dual-release-compensate ${critical} unmitigated critical conflict(s) first.`,
    );
  }
  if (dualReleaseMitigated > 0) {
    recommendations.push(
      `${dualReleaseMitigated} conflict(s) mitigated by dual-release policy — keep thresholds enforced in bank/PMS.`,
    );
  }
  if (
    conflicts.some(
      (c) =>
        (c.ruleId === "rule-cash-rec" || c.ruleId === "rule-custody-rec") &&
        !c.dualReleaseMitigated,
    )
  ) {
    recommendations.push(
      "Enable deposit dual-count + owner bank rec — highest ROI for cash SoD.",
    );
  }
  if (
    conflicts.some(
      (c) => c.ruleId === "rule-vendor-create-pay" && !c.dualReleaseMitigated,
    )
  ) {
    recommendations.push(
      "Turn on ACH dual release ≥ $500 and owner sign-off on new vendors.",
    );
  }
  if (
    conflicts.some(
      (c) =>
        (c.ruleId === "rule-writeoff" || c.ruleId === "rule-claims-writeoff") &&
        !c.dualReleaseMitigated,
    )
  ) {
    recommendations.push(
      "Require dual release on write-offs above $150 (owner/OM second).",
    );
  }
  if (!recommendations.length) {
    recommendations.push(
      "Dual release + SoD look healthy — re-scan after any role change.",
    );
  }

  return {
    method:
      "Entitlement pair scan vs rulebook + duty-family matrix + dual-release mitigation",
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
      dualReleaseMitigated,
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
