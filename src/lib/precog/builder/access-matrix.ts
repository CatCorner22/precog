/**
 * Access matrix for the bookkeeper: who should be able to do what in the accounting
 * system, derived from process ownership and duty entitlements — with SoD conflicts
 * flagged so the roles you grant match the controls you designed.
 */
import { getActiveTemplate } from "../active-template";
import { ENTITLEMENTS, type EntitlementId } from "../sod/conflict-rules";
import { detectSodConflicts, type DetectedConflict } from "../sod/detect";
import { mitigatedSodRuleIds, type DualReleasePolicy } from "../controls/dual-release";
import type { Person, ProcessNode, StaffComposition } from "../types";

/** QuickBooks Online-style permission areas; other systems map similarly. */
export type AccessArea =
  | "Sales & customers"
  | "Receive payments"
  | "Bank deposits"
  | "Bank reconciliation"
  | "Credits & write-offs"
  | "Vendors & bills"
  | "Vendor master"
  | "Pay bills / ACH release"
  | "Payroll entry"
  | "Payroll approval"
  | "Users & roles admin"
  | "Reports (view)";

export const ENTITLEMENT_TO_AREAS: Record<EntitlementId, AccessArea[]> = {
  collect_cash: ["Sales & customers", "Receive payments"],
  post_payments: ["Receive payments"],
  prepare_deposit: ["Bank deposits"],
  bank_reconcile: ["Bank reconciliation"],
  approve_writeoffs: ["Credits & write-offs"],
  post_adjustments: ["Credits & write-offs"],
  submit_claims: ["Sales & customers"],
  create_vendor: ["Vendor master", "Vendors & bills"],
  approve_vendor: ["Vendor master"],
  release_payment: ["Pay bills / ACH release"],
  enter_payroll: ["Payroll entry"],
  approve_payroll: ["Payroll approval"],
  pms_admin_roles: ["Users & roles admin"],
  view_reports_only: ["Reports (view)"],
};

export type SuggestedRole = "Company admin" | "Standard (all)" | "Standard (limited)" | "Reports only" | "No access";

export interface AccessRow {
  person: Person;
  ownedProcesses: ProcessNode[];
  entitlements: EntitlementId[];
  areas: AccessArea[];
  suggestedRole: SuggestedRole;
  conflicts: DetectedConflict[];
  /** Areas that should be removed or need a compensating control, per the conflicts. */
  flaggedAreas: AccessArea[];
  notes: string[];
}

export interface AccessMatrix {
  rows: AccessRow[];
  areas: AccessArea[];
  criticalConflicts: number;
  generatedAt: string;
}

const AREA_ORDER: AccessArea[] = [
  "Sales & customers",
  "Receive payments",
  "Bank deposits",
  "Bank reconciliation",
  "Credits & write-offs",
  "Vendors & bills",
  "Vendor master",
  "Pay bills / ACH release",
  "Payroll entry",
  "Payroll approval",
  "Users & roles admin",
  "Reports (view)",
];

function suggestRole(areas: AccessArea[], isOwner: boolean): SuggestedRole {
  if (isOwner || areas.includes("Users & roles admin")) return "Company admin";
  const real = areas.filter((a) => a !== "Reports (view)");
  if (real.length === 0) return areas.length ? "Reports only" : "No access";
  if (real.length >= 6) return "Standard (all)";
  return "Standard (limited)";
}

export function buildAccessMatrix(
  processes: ProcessNode[],
  people: Person[],
  staff: StaffComposition,
  dualRelease: DualReleasePolicy,
): AccessMatrix {
  const { roleTemplates } = getActiveTemplate();
  const sod = detectSodConflicts(staff, { dualReleaseMitigatedRuleIds: mitigatedSodRuleIds(dualRelease) });

  const rows: AccessRow[] = people
    .filter((p) => p.active)
    .map((person) => {
      const owned = processes.filter((p) => (p.ownerPersonIds ?? []).includes(person.id));
      const ents = ((person.entitlements?.length ? person.entitlements : roleTemplates[person.role]) ?? ["view_reports_only"]) as EntitlementId[];
      const areaSet = new Set<AccessArea>();
      for (const e of ents) for (const a of ENTITLEMENT_TO_AREAS[e] ?? []) areaSet.add(a);
      if (owned.length) areaSet.add("Reports (view)");
      const areas = AREA_ORDER.filter((a) => areaSet.has(a));
      const conflicts = sod.conflicts.filter((c) => c.personId === person.id && !c.dualReleaseMitigated && !c.residualRiskAccepted);
      const flagged = new Set<AccessArea>();
      for (const c of conflicts) {
        // Flag the custody/authorization side of the pair — the one you'd usually take away.
        const pick = [c.entitlementB, c.entitlementA].find((e) => ENTITLEMENTS.find((x) => x.id === e)?.family !== "recording") ?? c.entitlementB;
        for (const a of ENTITLEMENT_TO_AREAS[pick] ?? []) flagged.add(a);
      }
      const isOwner = /owner|principal|partner|dentist|md\b|ceo/i.test(person.role);
      const notes: string[] = [];
      if (conflicts.length) notes.push(`${conflicts.length} SoD conflict(s) — grant flagged areas only with a compensating control`);
      if (!owned.length && ents.length === 1 && ents[0] === "view_reports_only") notes.push("No processes owned — reports-only is enough");
      if (isOwner && areas.includes("Bank reconciliation")) notes.push("Owner reconciles: good — keep this independent of posting");
      return {
        person,
        ownedProcesses: owned,
        entitlements: ents,
        areas,
        suggestedRole: suggestRole(areas, isOwner),
        conflicts,
        flaggedAreas: AREA_ORDER.filter((a) => flagged.has(a)),
        notes,
      };
    })
    .sort((a, b) => b.areas.length - a.areas.length);

  const used = new Set(rows.flatMap((r) => r.areas));
  return {
    rows,
    areas: AREA_ORDER.filter((a) => used.has(a)),
    criticalConflicts: sod.summary.critical,
    generatedAt: new Date().toISOString(),
  };
}

export function accessMatrixCsv(m: AccessMatrix, businessName: string): string {
  const head = ["Person", "Role", "Suggested system role", "Owns processes", ...m.areas, "SoD conflicts", "Notes"];
  const lines = [
    [`${businessName} — access matrix (generated ${new Date(m.generatedAt).toLocaleDateString("en-US")})`],
    head,
    ...m.rows.map((r) => [
      r.person.name,
      r.person.role,
      r.suggestedRole,
      r.ownedProcesses.map((p) => p.name).join("; "),
      ...m.areas.map((a) => (r.areas.includes(a) ? (r.flaggedAreas.includes(a) ? "GRANT w/ control" : "GRANT") : "")),
      r.conflicts.map((c) => c.title).join("; "),
      r.notes.join("; "),
    ]),
  ];
  return lines.map((row) => row.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\r\n");
}
