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
import type { IndustryTemplate } from "../templates";
import { getIndustryTemplate } from "../templates";
import { mitigatedSodRuleIds, type DualReleasePolicy } from "../controls/dual-release";
import {
  CONFLICT_RULES,
  ENTITLEMENTS,
  FAMILY_CONFLICT_MATRIX,
  type ConflictRule,
  type DutyFamily,
  type EntitlementId,
} from "./conflict-rules";
import type { Person, StaffComposition } from "../types";

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

export interface SodDetectionOptions {
  assignments?: RoleAssignment[];
  residualAcceptedControlIds?: Set<string>;
  compensatingByControlId?: Record<string, string[]>;
  /** SoD rule IDs mitigated by dual-release policy */
  dualReleaseMitigatedRuleIds?: Set<string>;
}

export function sodDetectionOptions(
  tpl: IndustryTemplate,
  dualRelease: DualReleasePolicy,
): SodDetectionOptions {
  const compensatingByControlId: Record<string, string[]> = {};
  for (const control of tpl.controls) {
    if (control.compensatingControls.length) {
      compensatingByControlId[control.id] = control.compensatingControls;
    }
  }
  return {
    residualAcceptedControlIds: new Set(
      tpl.controls.filter((control) => control.residualRiskAccepted).map((control) => control.id),
    ),
    compensatingByControlId,
    dualReleaseMitigatedRuleIds: mitigatedSodRuleIds(dualRelease),
  };
}

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
  "Practice Administrator": [
    "approve_vendor",
    "approve_payroll",
    "approve_writeoffs",
    "view_reports_only",
    "review_audit_logs",
  ],
  Receptionist: ["collect_cash", "post_payments", "edit_patient_master", "view_reports_only"],
  "Treatment Coordinator": ["edit_patient_master", "post_adjustments", "view_reports_only"],
  "Insurance Coordinator": [
    "submit_claims",
    "post_adjustments",
    "post_payments",
    "view_reports_only",
  ],
  Bookkeeper: [
    "enter_invoices",
    "post_payments",
    "bank_reconcile",
    "enter_payroll",
    "view_reports_only",
  ],
  "CPA / Independent Reviewer": ["bank_reconcile", "review_audit_logs", "view_reports_only"],
  "Payroll Coordinator": ["enter_payroll", "view_reports_only"],
  "Procurement Coordinator": [
    "order_supplies",
    "receive_goods",
    "enter_invoices",
    "view_reports_only",
  ],
  "IT Administrator": [
    "pms_admin_roles",
    "manage_user_access",
    "manage_backups",
    "view_reports_only",
  ],
  "Clinical Lead": ["order_supplies", "receive_goods", "view_reports_only"],
  "External Billing Service": [
    "submit_claims",
    "post_adjustments",
    "post_payments",
    "export_bulk_data",
    "view_reports_only",
  ],
  "AP Specialist": ["create_vendor", "enter_invoices", "initiate_ach", "view_reports_only"],
  "Payment Approver": ["approve_vendor", "release_payment", "sign_checks", "view_reports_only"],
};

export const COMMON_JOB_TEMPLATES = Object.entries(ROLE_TEMPLATES).map(([role, entitlements]) => ({
  role,
  entitlements,
}));

/**
 * Plain wording for the duty families.
 *
 * These findings previously read "Duty families are classically incompatible
 * under COSO-style SoD" with a fraud path of "Opportunity from combined
 * incompatible duty families". That asserts a framework rather than explaining
 * a mechanism, and it gave the owner nothing to act on — the suggested
 * remedy was to "document residual acceptance", which is to write down that
 * you are living with it. Plain language, and a remedy that names the actual
 * duties, replace it.
 */
const FAMILY_LABEL: Record<DutyFamily, string> = {
  authorization: "Approving",
  custody: "Handling the money",
  recording: "Writing the records",
  reconciliation: "Checking the records",
  master_data: "Controlling who can be paid",
};

const FAMILY_VERB: Record<DutyFamily, string> = {
  authorization: "approves it",
  custody: "handles the money",
  recording: "writes the record",
  reconciliation: "checks the record",
  master_data: "controls who can be paid",
};

/**
 * Wording for a pair drawn from the same family — two custody duties, say.
 * The family labels cannot carry those on their own: rendering them gives
 * "Handling the money and Handling the money", so the entitlement labels do
 * the distinguishing work instead.
 */
const SAME_FAMILY_NOUN: Record<DutyFamily, string> = {
  authorization: "approval",
  custody: "money-handling",
  recording: "record-keeping",
  reconciliation: "checking",
  master_data: "payee-list",
};

/** Mechanism for the pairings worth spelling out. Keys are sorted pairs. */
const FAMILY_WHY: Record<string, string> = {
  "authorization-custody":
    "The same person approves a payment and then hands over the money, so the approval is the only check and it is their own.",
  "custody-recording":
    "The same person handles the money and writes down what was handled, so the books will always match whatever was actually taken.",
  "custody-reconciliation":
    "The same person holds the money and confirms it arrived, which leaves nobody able to notice a shortfall.",
  "recording-reconciliation":
    "The same person writes the records and checks them, so an error or an omission has no independent reader.",
  "authorization-master_data":
    "The same person decides who may be paid and approves paying them, so an invented payee passes both gates at once.",
  "custody-master_data":
    "The same person controls the payee list and moves the money, which is the shortest path to paying a supplier that does not exist.",
  "master_data-recording":
    "The same person can add a payee and write the entry that explains it, so the payment looks routine in the accounts.",
  "authorization-recording":
    "The same person approves a transaction and writes its record, so the approval can be composed after the fact to fit.",
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
  return CONFLICT_RULES.find((r) => (r.a === a && r.b === b) || (r.a === b && r.b === a));
}

function familiesConflict(fa: DutyFamily, fb: DutyFamily): boolean {
  if (fa === fb) {
    // Two custody duties are one custody chain: the person who takes the
    // payment also bags the deposit in every small office, and the control is
    // that someone else posts and reconciles it (named rules cover that).
    // Two master-data duties still conflict: one person shaping both the
    // payee list and the price list is the shell-vendor setup.
    return fa === "master_data";
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

function isIndustryTemplate(
  value: IndustryTemplate | StaffComposition | Partial<Record<string, EntitlementId[]>> | undefined,
): value is IndustryTemplate {
  return Boolean(
    value &&
    typeof value === "object" &&
    "people" in value &&
    "controls" in value &&
    "scenarios" in value,
  );
}

function isSodDetectionOptions(
  value: StaffComposition | SodDetectionOptions | undefined,
): value is SodDetectionOptions {
  return Boolean(
    value &&
    typeof value === "object" &&
    ("assignments" in value ||
      "residualAcceptedControlIds" in value ||
      "compensatingByControlId" in value ||
      "dualReleaseMitigatedRuleIds" in value),
  );
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
  tpl?: IndustryTemplate,
  overrides?: Partial<Record<string, EntitlementId[]>>,
): RoleAssignment[] {
  const activeTemplate = tpl ?? getIndustryTemplate("dental");
  const { people, roleTemplates } = activeTemplate;
  // People marked as left stay on the list for history but hold no live access.
  return people
    .filter((p) => p.active)
    .map((p) => {
      const fromPerson = (p.entitlements?.length ? p.entitlements : null) as EntitlementId[] | null;
      const fromRole = (fromPerson ??
        roleTemplates[p.role] ??
        ROLE_TEMPLATES[p.role] ?? ["view_reports_only"]) as EntitlementId[];
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

/**
 * Drop assignments held by people the team marks as left. Ids not on the team
 * (simulation-only hires) are kept.
 */
export function dropInactiveAssignments(
  assignments: readonly RoleAssignment[],
  people: readonly Person[],
): RoleAssignment[] {
  const inactive = new Set(people.filter((p) => !p.active).map((p) => p.id));
  if (inactive.size === 0) return [...assignments];
  return assignments.filter((a) => !inactive.has(a.personId));
}

export function detectSodConflicts(
  tpl: IndustryTemplate,
  staff?: StaffComposition,
  options?: SodDetectionOptions,
): SodDetectionReport;
export function detectSodConflicts(
  staff?: StaffComposition,
  options?: SodDetectionOptions,
): SodDetectionReport;
export function detectSodConflicts(
  tplOrStaff?: IndustryTemplate | StaffComposition,
  staffOrOptions?: StaffComposition | SodDetectionOptions,
  maybeOptions?: SodDetectionOptions,
): SodDetectionReport {
  const tpl = isIndustryTemplate(tplOrStaff) ? tplOrStaff : getIndustryTemplate("dental");
  const staff = isIndustryTemplate(tplOrStaff)
    ? isSodDetectionOptions(staffOrOptions)
      ? undefined
      : staffOrOptions
    : tplOrStaff;
  const options = isIndustryTemplate(tplOrStaff)
    ? isSodDetectionOptions(staffOrOptions)
      ? staffOrOptions
      : maybeOptions
    : isSodDetectionOptions(staffOrOptions)
      ? staffOrOptions
      : maybeOptions;

  const assignments = options?.assignments ?? buildAssignments(tpl);
  const residualAccepted = options?.residualAcceptedControlIds ?? new Set<string>();
  const compensatingByControl = options?.compensatingByControlId ?? {};
  const dualMitigatedRules = options?.dualReleaseMitigatedRuleIds ?? new Set<string>();

  const conflicts: DetectedConflict[] = [];

  for (const person of assignments) {
    const ents = person.entitlements;
    // Family findings are the catch-all for pairs no named rule describes.
    // Once a named rule has already flagged one of the two duties for this
    // person, a second, vaguer finding on the same duty adds noise, not risk.
    const namedDuties = new Set<EntitlementId>();
    for (let i = 0; i < ents.length; i++) {
      for (let j = i + 1; j < ents.length; j++) {
        if (findRule(ents[i], ents[j])) {
          namedDuties.add(ents[i]);
          namedDuties.add(ents[j]);
        }
      }
    }
    for (let i = 0; i < ents.length; i++) {
      for (let j = i + 1; j < ents.length; j++) {
        const a = ents[i];
        const b = ents[j];
        const rule = findRule(a, b);
        const fa = entFamily(a);
        const fb = entFamily(b);

        if (!rule && (!familiesConflict(fa, fb) || !sharesProcess(a, b))) continue;
        if (a === "view_reports_only" || b === "view_reports_only") continue;
        if (!rule && (namedDuties.has(a) || namedDuties.has(b))) continue;

        if (rule) {
          const [canonicalA, canonicalB] = canonicalPair(rule.a, rule.b);
          const dualMitigated = dualMitigatedRules.has(rule.id);
          const comps = [
            ...rule.compensatingDefaults,
            ...(rule.linkedControlId ? (compensatingByControl[rule.linkedControlId] ?? []) : []),
            ...(dualMitigated ? ["Dual-release policy active on related channel"] : []),
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
            title:
              canonicalFamilyA === canonicalFamilyB
                ? `Two ${SAME_FAMILY_NOUN[canonicalFamilyA]} duties held by one person`
                : `${FAMILY_LABEL[canonicalFamilyA]} and ${FAMILY_LABEL[canonicalFamilyB]} in one pair of hands`,
            why:
              canonicalFamilyA === canonicalFamilyB
                ? `One person holds both of these ${SAME_FAMILY_NOUN[canonicalFamilyA]} duties. Either one alone is ordinary; together they let the same hands complete a transaction end to end with nobody in between.`
                : (FAMILY_WHY[[canonicalFamilyA, canonicalFamilyB].sort().join("-")] ??
                  `One person both ${FAMILY_VERB[canonicalFamilyA]} and ${FAMILY_VERB[canonicalFamilyB]}, so no step in that sequence gets a second look.`),
            fraudPath:
              canonicalFamilyA === canonicalFamilyB
                ? `Complete both steps alone, with no handover anyone would notice`
                : `Act, then write or check the record of the act, unobserved`,
            score: scoreConflict("family", canonicalA, canonicalB, false, 0, false, staff),
            compensatingControls: [
              `Move either "${entLabel(canonicalA)}" or "${entLabel(canonicalB)}" to someone else`,
              "Have a second person review this sequence on a set cadence",
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
          ruleIds: [`family-${entFamily(row)}-${entFamily(col)}`],
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
  const high = conflicts.filter((c) => c.severity === "high" && !c.dualReleaseMitigated).length;
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
      "Have two people count and sign each deposit, and have the owner reconcile the bank account — two records the same person can no longer make agree.",
    );
  }
  if (conflicts.some((c) => c.ruleId === "rule-vendor-create-pay" && !c.dualReleaseMitigated)) {
    recommendations.push(
      "Turn on dual release for electronic payments above the amount you set, and have the owner sign off on every new vendor.",
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
      "Require a second approval on write-offs above the amount you set, with the owner or office manager as the second.",
    );
  }
  if (!recommendations.length) {
    recommendations.push("Dual release + SoD look healthy — re-scan after any role change.");
  }

  return {
    method: "Entitlement pair scan vs rulebook + duty-family matrix + dual-release mitigation",
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
