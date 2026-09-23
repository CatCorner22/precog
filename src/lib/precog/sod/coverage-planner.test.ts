import { describe, expect, it } from "vitest";
import { getIndustryTemplate } from "../templates";
import { evaluateAssignmentChange } from "./change-impact";
import { ENTITLEMENTS, type EntitlementId } from "./conflict-rules";
import { analyzeDutyCoverage } from "./coverage-analysis";
import {
  buildCoveragePlans,
  buildCoverageProgram,
  dutyToggleEffects,
  type CoveragePlan,
  type CoverageProgram,
} from "./coverage-planner";
import { buildAssignments, type RoleAssignment } from "./detect";

/**
 * A 26-person restaurant as the setup grid seats a pasted payroll export: an
 * owner and a bookkeeper holding most of the money duties, servers and
 * bartenders taking cash, and a kitchen with no money duties at all.
 */
const RESTAURANT_26: [string, string, string, EntitlementId[]][] = [
  [
    "own-1",
    "Marco DeLuca",
    "Owner/Operator",
    [
      "approve_vendor",
      "approve_payroll",
      "approve_writeoffs",
      "sign_checks",
      "bank_reconcile",
      "manage_user_access",
      "view_reports_only",
    ],
  ],
  [
    "own-2",
    "Tessa Morgan",
    "General Manager",
    [
      "approve_vendor",
      "approve_writeoffs",
      "approve_payroll",
      "order_supplies",
      "manage_user_access",
      "view_reports_only",
    ],
  ],
  [
    "own-3",
    "Andre Baptiste",
    "Executive Chef",
    ["order_supplies", "receive_goods", "view_reports_only"],
  ],
  ["own-4", "Kelly Huang", "Sous Chef", ["order_supplies", "receive_goods", "view_reports_only"]],
  [
    "own-5",
    "Sean O'Rourke",
    "Bar Manager",
    ["collect_cash", "prepare_deposit", "order_supplies", "receive_goods", "view_reports_only"],
  ],
  [
    "own-6",
    "Patricia Webb",
    "Bookkeeper",
    [
      "post_payments",
      "enter_invoices",
      "release_payment",
      "bank_reconcile",
      "enter_payroll",
      "post_journal_entries",
      "view_reports_only",
    ],
  ],
  ["own-7", "Jade Wilson", "Server", ["collect_cash", "view_reports_only"]],
  ["own-8", "Carlos Mendoza", "Server", ["collect_cash", "view_reports_only"]],
  ["own-9", "Ivy Holt", "Bartender", ["collect_cash", "view_reports_only"]],
  ["own-10", "Emma Garcia", "Host", ["collect_cash", "view_reports_only"]],
  ["own-11", "Darnell Reed", "Line Cook", ["view_reports_only"]],
  ["own-12", "Pedro Silva", "Dishwasher", ["view_reports_only"]],
  ["own-13", "Aaron Quinn0", "Server", ["collect_cash", "view_reports_only"]],
  ["own-14", "Bella Quinn1", "Server", ["collect_cash", "view_reports_only"]],
  ["own-15", "Cody Quinn2", "Bartender", ["collect_cash", "view_reports_only"]],
  ["own-16", "Dana Quinn3", "Line Cook", ["view_reports_only"]],
  ["own-17", "Eli Quinn4", "Line Cook", ["view_reports_only"]],
  ["own-18", "Fiona Quinn5", "Host", ["collect_cash", "view_reports_only"]],
  ["own-19", "Gus Quinn6", "Busser", ["collect_cash", "view_reports_only"]],
  ["own-20", "Hana Quinn7", "Prep Cook", ["view_reports_only"]],
  ["own-21", "Ian Quinn8", "Dishwasher", ["view_reports_only"]],
  ["own-22", "Jill Quinn9", "Server", ["collect_cash", "view_reports_only"]],
  ["own-23", "Kurt Quinn10", "Line Cook", ["view_reports_only"]],
  ["own-24", "Lola Quinn11", "Barback", ["collect_cash", "view_reports_only"]],
  ["own-25", "Mona Quinn12", "Server", ["collect_cash", "view_reports_only"]],
  ["own-26", "Noel Quinn13", "Line Cook", ["view_reports_only"]],
];

const restaurant26 = (): RoleAssignment[] =>
  RESTAURANT_26.map(([personId, personName, role, entitlements]) => ({
    personId,
    personName,
    role,
    entitlements: [...entitlements],
  }));

/**
 * The planner as it was before it stopped re-scanning the whole team: every
 * candidate runs two whole-team conflict scans through
 * evaluateAssignmentChange. The planner must give the same answers.
 */
function referencePlans(assignments: RoleAssignment[]): CoveragePlan[] {
  const coverage = analyzeDutyCoverage(assignments);
  return [...coverage.unassigned, ...coverage.singlePoints].flatMap((duty) =>
    assignments
      .filter((person) => !person.entitlements.includes(duty.entitlementId))
      .map((person) => {
        const impact = evaluateAssignmentChange(assignments, person.personId, duty.entitlementId);
        if (!impact || impact.conflictsCreated.length > 0) return undefined;
        return {
          id: `${duty.entitlementId}:${person.personId}`,
          entitlement: duty.entitlementId,
          dutyLabel: duty.label,
          reason:
            duty.status === "unassigned" ? ("unassigned" as const) : ("single_point" as const),
          toPersonId: person.personId,
          toPersonName: person.personName,
          toRole: person.role,
          currentWorkload: person.entitlements.filter((id) => id !== "view_reports_only").length,
          continuityGain: impact.continuityChange,
          nextAssignments: impact.nextAssignments,
        };
      })
      .filter((plan): plan is CoveragePlan => Boolean(plan))
      .sort(
        (a, b) =>
          b.continuityGain - a.continuityGain ||
          a.currentWorkload - b.currentWorkload ||
          a.toPersonName.localeCompare(b.toPersonName),
      )
      .slice(0, 3),
  );
}

function referenceProgram(assignments: RoleAssignment[]): CoverageProgram {
  const startingScore = analyzeDutyCoverage(assignments).resilienceScore;
  let current = assignments;
  const steps: CoveragePlan[] = [];
  const assignmentsPerDuty = new Map<EntitlementId, number>();
  for (let index = 0; index < 25; index++) {
    const next = referencePlans(current).filter(
      (plan) => (assignmentsPerDuty.get(plan.entitlement) ?? 0) < 2,
    )[0];
    if (!next) break;
    steps.push(next);
    assignmentsPerDuty.set(next.entitlement, (assignmentsPerDuty.get(next.entitlement) ?? 0) + 1);
    current = next.nextAssignments;
  }
  const finalCoverage = analyzeDutyCoverage(current);
  return {
    steps,
    nextAssignments: current,
    startingScore,
    projectedScore: finalCoverage.resilienceScore,
    unresolvedGaps: finalCoverage.unassigned.length + finalCoverage.singlePoints.length,
  };
}

/** Seeded pseudo-random teams (mulberry32), so a failure always reproduces. */
function randomTeams(seed: number, count: number, size: number): RoleAssignment[][] {
  let state = seed;
  const random = () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const roles = ["Owner", "Office Manager", "Bookkeeper", "Front Desk", "Server", "Partner"];
  const duties = ENTITLEMENTS.map((e) => e.id);
  return Array.from({ length: count }, (_, team) =>
    Array.from({ length: size }, (_, i) => {
      const held = duties.filter(() => random() < 0.22);
      return {
        personId: `t${team}-p${i}`,
        personName: `Person ${String.fromCharCode(65 + Math.floor(random() * 26))}${i}`,
        role: roles[Math.floor(random() * roles.length)],
        entitlements: held.length ? held : (["view_reports_only"] as EntitlementId[]),
      };
    }),
  );
}

describe("coverage planner", () => {
  it("gives a 26-person restaurant the same backup program as the whole-team scan", () => {
    // Pinned from the whole-team reference scan under the current rulebook
    // (refund, void and journal-entry rules; check signing read as release).
    expect(buildCoverageProgram(restaurant26())).toEqual(referenceProgram(restaurant26()));
    const program = buildCoverageProgram(restaurant26());
    expect(program.steps.map((s) => `${s.id}:${s.continuityGain}`)).toEqual([
      "post_adjustments:own-16:2",
      "submit_claims:own-11:3",
      "create_vendor:own-17:2",
      "edit_payroll_master:own-20:2",
      "pms_admin_roles:own-21:1",
      "issue_refunds:own-23:3",
      "change_fee_schedule:own-26:1",
      "edit_patient_master:own-12:3",
      "export_bulk_data:own-13:2",
      "initiate_ach:own-14:2",
      "review_audit_logs:own-8:3",
      "manage_backups:own-15:2",
      "post_payments:own-11:1",
      "prepare_deposit:own-17:3",
      "post_adjustments:own-20:1",
      "create_vendor:own-16:3",
      "release_payment:own-10:2",
      "edit_payroll_master:own-18:2",
      "post_journal_entries:own-21:1",
      "pms_admin_roles:own-19:2",
      "issue_refunds:own-3:2",
      "change_fee_schedule:own-9:2",
      "export_bulk_data:own-7:2",
      "enter_invoices:own-22:2",
      "initiate_ach:own-23:2",
    ]);
    expect([program.startingScore, program.projectedScore, program.unresolvedGaps]).toEqual([
      45, 96, 2,
    ]);
    expect(program.nextAssignments.map((p) => `${p.personId}=${p.entitlements.join("+")}`)).toEqual(
      [
        "own-1=approve_vendor+approve_payroll+approve_writeoffs+sign_checks+bank_reconcile+manage_user_access+view_reports_only",
        "own-2=approve_vendor+approve_writeoffs+approve_payroll+order_supplies+manage_user_access+view_reports_only",
        "own-3=order_supplies+receive_goods+view_reports_only+issue_refunds",
        "own-4=order_supplies+receive_goods+view_reports_only",
        "own-5=collect_cash+prepare_deposit+order_supplies+receive_goods+view_reports_only",
        "own-6=post_payments+enter_invoices+release_payment+bank_reconcile+enter_payroll+post_journal_entries+view_reports_only",
        "own-7=collect_cash+view_reports_only+export_bulk_data",
        "own-8=collect_cash+view_reports_only+review_audit_logs",
        "own-9=collect_cash+view_reports_only+change_fee_schedule",
        "own-10=collect_cash+view_reports_only+release_payment",
        "own-11=view_reports_only+submit_claims+post_payments",
        "own-12=view_reports_only+edit_patient_master",
        "own-13=collect_cash+view_reports_only+export_bulk_data",
        "own-14=collect_cash+view_reports_only+initiate_ach",
        "own-15=collect_cash+view_reports_only+manage_backups",
        "own-16=view_reports_only+post_adjustments+create_vendor",
        "own-17=view_reports_only+create_vendor+prepare_deposit",
        "own-18=collect_cash+view_reports_only+edit_payroll_master",
        "own-19=collect_cash+view_reports_only+pms_admin_roles",
        "own-20=view_reports_only+edit_payroll_master+post_adjustments",
        "own-21=view_reports_only+pms_admin_roles+post_journal_entries",
        "own-22=collect_cash+view_reports_only+enter_invoices",
        "own-23=view_reports_only+issue_refunds+initiate_ach",
        "own-24=collect_cash+view_reports_only",
        "own-25=collect_cash+view_reports_only",
        "own-26=view_reports_only+change_fee_schedule",
      ],
    );
  }, 120_000);

  it("offers a 26-person restaurant the same three backups per weak duty as the whole-team scan", () => {
    expect(buildCoveragePlans(restaurant26())).toEqual(referencePlans(restaurant26()));
    const plans = buildCoveragePlans(restaurant26());
    expect(plans.map((p) => `${p.id}:${p.continuityGain}:${p.currentWorkload}`)).toEqual([
      "post_adjustments:own-16:2:0",
      "post_adjustments:own-11:2:0",
      "post_adjustments:own-17:2:0",
      "submit_claims:own-16:3:0",
      "submit_claims:own-11:3:0",
      "submit_claims:own-17:3:0",
      "create_vendor:own-16:2:0",
      "create_vendor:own-11:2:0",
      "create_vendor:own-17:2:0",
      "edit_payroll_master:own-16:2:0",
      "edit_payroll_master:own-11:2:0",
      "edit_payroll_master:own-17:2:0",
      "pms_admin_roles:own-16:2:0",
      "pms_admin_roles:own-11:2:0",
      "pms_admin_roles:own-17:2:0",
      "issue_refunds:own-16:2:0",
      "issue_refunds:own-11:2:0",
      "issue_refunds:own-17:2:0",
      "change_fee_schedule:own-16:2:0",
      "change_fee_schedule:own-11:2:0",
      "change_fee_schedule:own-17:2:0",
      "edit_patient_master:own-16:3:0",
      "edit_patient_master:own-11:3:0",
      "edit_patient_master:own-17:3:0",
      "export_bulk_data:own-16:2:0",
      "export_bulk_data:own-11:2:0",
      "export_bulk_data:own-17:2:0",
      "initiate_ach:own-16:2:0",
      "initiate_ach:own-11:2:0",
      "initiate_ach:own-17:2:0",
      "review_audit_logs:own-16:3:0",
      "review_audit_logs:own-11:3:0",
      "review_audit_logs:own-17:3:0",
      "manage_backups:own-16:2:0",
      "manage_backups:own-11:2:0",
      "manage_backups:own-17:2:0",
      "post_payments:own-16:2:0",
      "post_payments:own-11:2:0",
      "post_payments:own-17:2:0",
      "prepare_deposit:own-16:2:0",
      "prepare_deposit:own-11:2:0",
      "prepare_deposit:own-17:2:0",
      "release_payment:own-16:2:0",
      "release_payment:own-11:2:0",
      "release_payment:own-17:2:0",
      "post_journal_entries:own-16:2:0",
      "post_journal_entries:own-11:2:0",
      "post_journal_entries:own-17:2:0",
      "enter_invoices:own-16:2:0",
      "enter_invoices:own-11:2:0",
      "enter_invoices:own-17:2:0",
      "sign_checks:own-16:2:0",
      "sign_checks:own-11:2:0",
      "sign_checks:own-17:2:0",
    ]);
  }, 120_000);

  it("offers the same conflict-free backups as scanning the whole team, on every sample team and random teams", () => {
    const teams = [
      ...(["dental", "retail", "restaurant", "professional_services", "general"] as const).map(
        (id) => buildAssignments(getIndustryTemplate(id)),
      ),
      ...randomTeams(20260923, 12, 5),
    ];
    for (const team of teams) expect(buildCoveragePlans(team)).toEqual(referencePlans(team));
  }, 120_000);

  it("sequences the same program as scanning the whole team for every candidate", () => {
    for (const team of randomTeams(7, 3, 3)) {
      expect(buildCoverageProgram(team)).toEqual(referenceProgram(team));
    }
  }, 120_000);

  it("shows each duty's conflict counts on the Power map exactly as a whole-team scan would", () => {
    const duties = ENTITLEMENTS.map((e) => e.id).filter((id) => id !== "view_reports_only");
    for (const team of [restaurant26(), ...randomTeams(99, 2, 6)]) {
      for (const person of team) {
        const effects = dutyToggleEffects(person, duties, team);
        for (const duty of duties) {
          const impact = evaluateAssignmentChange(team, person.personId, duty);
          expect(effects.get(duty), `${person.personName} · ${duty}`).toEqual({
            created: impact?.conflictsCreated.length,
            resolved: impact?.conflictsResolved.length,
          });
        }
      }
    }
  }, 120_000);
});
