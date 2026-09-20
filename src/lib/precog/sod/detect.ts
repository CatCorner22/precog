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
import { mitigatedSodRuleIds, type DualReleasePolicy } from "../controls/dual-release";
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
  tpl: IndustryTemplate,
  overrides?: Partial<Record<string, EntitlementId[]>>,
): RoleAssignment[] {
  const { people, roleTemplates } = tpl;
  return people.map((p) => {
    const fromPerson = (p.entitlements?.length ? p.entitlements : null) as EntitlementId[] | null;
    const fromRole = (fromPerson ??
      roleTemplates[p.role] ?? ["view_reports_only"]) as EntitlementId[];
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
  tpl: IndustryTemplate,
  staff?: StaffComposition,
  options?: SodDetectionOptions,
): SodDetectionReport {
  const assignments = options?.assignments ?? buildAssignments(tpl);
  const residualAccepted = options?.residualAcceptedControlIds ?? new Set<string>();
  const compensatingByControl = options?.compensatingByControlId ?? {};
  const dualMitigatedRules = options?.dualReleaseMitigatedRuleIds ?? new Set<string>();

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
        if (a === "view_reports_only" || b === "view_reports_only") continue;

        if (rule) {
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
            entitlementA: a,
            entitlementB: b,
            labelA: entLabel(a),
            labelB: entLabel(b),
            severity: rule.severity,
            title: rule.title,
            why: rule.why,
            fraudPath: rule.fraudPath,
            score: scoreConflict(rule.severity, a, b, accepted, comps.length, dualMitigated, staff),
            compensatingControls: Array.from(new Set(comps)),
            residualRiskAccepted: accepted,
            dualReleaseMitigated: dualMitigated,
            linkedScenarioId: rule.linkedScenarioId,
            linkedControlId: rule.linkedControlId,
            processIds: Array.from(new Set([...entProcesses(a), ...entProcesses(b)])),
          });
        } else {
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
            title:
              fa === fb
                ? `Two ${SAME_FAMILY_NOUN[fa]} duties held by one person`
                : `${FAMILY_LABEL[fa]} and ${FAMILY_LABEL[fb]} in one pair of hands`,
            why:
              fa === fb
                ? `One person holds both of these ${SAME_FAMILY_NOUN[fa]} duties. Either one alone is ordinary; together they let the same hands complete a transaction end to end with nobody in between.`
                : (FAMILY_WHY[[fa, fb].sort().join("-")] ??
                  `One person both ${FAMILY_VERB[fa]} and ${FAMILY_VERB[fb]}, so no step in that sequence gets a second look.`),
            fraudPath:
              fa === fb
                ? `Complete both steps alone, with no handover anyone would notice`
                : `Act, then write or check the record of the act, unobserved`,
            score: scoreConflict("family", a, b, false, 0, false, staff),
            compensatingControls: [
              `Move either "${entLabel(a)}" or "${entLabel(b)}" to someone else`,
              "Have a second person review this sequence on a set cadence",
            ],
            residualRiskAccepted: false,
            dualReleaseMitigated: false,
            processIds: Array.from(new Set([...entProcesses(a), ...entProcesses(b)])),
          });
        }
      }
    }
  }

  conflicts.sort((a, b) => b.score - a.score);

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
