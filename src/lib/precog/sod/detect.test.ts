import { describe, expect, it } from "vitest";
import { getBaseTemplate } from "../active-template";
import type { IndustryTemplate } from "../templates/types";
import type { Person } from "../types";
import { CONFLICT_RULES, type EntitlementId } from "./conflict-rules";
import {
  buildAssignments,
  detectSodConflicts,
  type SodDetectionOptions,
  dropInactiveAssignments,
  ROLE_TEMPLATES,
  segregationHealthIndex,
} from "./detect";

const dental = getBaseTemplate("dental");

function oneClerk(entitlements: string[]): IndustryTemplate {
  const clerk: Person = { id: "x1", name: "Solo Clerk", role: "Clerk", active: true, entitlements };
  return { ...dental, people: [clerk], relations: [], roleTemplates: {} };
}

describe("buildAssignments", () => {
  it("uses role templates and lets per-person entitlements override them", () => {
    const a = buildAssignments(dental);
    expect(a.map((x) => x.personId)).toEqual(dental.people.map((p) => p.id));
    const owner = a.find((x) => x.role === "Owner / Dentist")!;
    expect(owner.entitlements).toEqual(dental.roleTemplates["Owner / Dentist"]);

    const explicit = buildAssignments(oneClerk(["collect_cash"]));
    expect(explicit[0].entitlements).toEqual(["collect_cash"]);
  });

  it("falls back to view-only for an unknown role and de-duplicates overrides", () => {
    const tpl = oneClerk([]);
    const a = buildAssignments(tpl, { x1: ["collect_cash", "collect_cash"] });
    expect(a[0].entitlements).toEqual(["view_reports_only", "collect_cash"]);
  });

  it("leaves people marked as left out of the live access map and its conflicts", () => {
    const gone: Person = {
      id: "x2",
      name: "Former Clerk",
      role: "Clerk",
      active: false,
      lastDay: "2020-01-01",
      entitlements: ["create_vendor", "release_payment"],
    };
    const tpl: IndustryTemplate = {
      ...oneClerk(["collect_cash"]),
      people: [gone, ...oneClerk(["collect_cash"]).people],
    };
    expect(buildAssignments(tpl).map((x) => x.personId)).toEqual(["x1"]);
    const report = detectSodConflicts(tpl);
    expect(report.conflicts.some((c) => c.ruleId === "rule-vendor-create-pay")).toBe(false);
  });
});

describe("dropInactiveAssignments", () => {
  it("removes saved assignments for people marked as left but keeps simulation-only ids", () => {
    const people: Person[] = [
      { id: "x1", name: "Solo Clerk", role: "Clerk", active: true },
      { id: "x2", name: "Former Clerk", role: "Clerk", active: false },
    ];
    const saved = [
      {
        personId: "x1",
        personName: "Solo Clerk",
        role: "Clerk",
        entitlements: ["collect_cash" as const],
      },
      {
        personId: "x2",
        personName: "Former Clerk",
        role: "Clerk",
        entitlements: ["create_vendor" as const],
      },
      {
        personId: "sim-1",
        personName: "New hire",
        role: "Receptionist",
        entitlements: ["view_reports_only" as const],
      },
    ];
    expect(dropInactiveAssignments(saved, people).map((a) => a.personId)).toEqual(["x1", "sim-1"]);
    expect(dropInactiveAssignments(saved, [people[0]])).toHaveLength(3);
  });
});

describe("detectSodConflicts", () => {
  it("flags one person who can create a vendor and release payment", () => {
    const report = detectSodConflicts(oneClerk(["create_vendor", "release_payment"]));
    const hit = report.conflicts.find((c) => c.ruleId === "rule-vendor-create-pay");
    expect(hit).toBeDefined();
    expect(hit!.severity).toBe("critical");
    expect(hit!.personId).toBe("x1");
    expect(hit!.linkedScenarioId).toBe("sc-vendor-fraud");
    expect(report.summary.critical).toBeGreaterThanOrEqual(1);
    expect(report.summary.peopleWithConflicts).toBe(1);
  });

  it("finds nothing for a person with a single entitlement or view-only access", () => {
    expect(detectSodConflicts(oneClerk(["release_payment"])).conflicts).toEqual([]);
    expect(
      detectSodConflicts(oneClerk(["view_reports_only", "release_payment"])).conflicts,
    ).toEqual([]);
  });

  it("marks conflicts mitigated by dual release and lowers the open count", () => {
    const tpl = oneClerk(["create_vendor", "release_payment"]);
    const open = detectSodConflicts(tpl);
    const mitigated = detectSodConflicts(tpl, undefined, {
      dualReleaseMitigatedRuleIds: new Set(["rule-vendor-create-pay"]),
    });
    const hit = mitigated.conflicts.find((c) => c.ruleId === "rule-vendor-create-pay")!;
    expect(hit.dualReleaseMitigated).toBe(true);
    expect(hit.compensatingControls).toContain("Dual-release policy active on related channel");
    expect(mitigated.summary.dualReleaseMitigated).toBe(1);
    expect(mitigated.summary.openWithoutAcceptance).toBeLessThan(
      open.summary.openWithoutAcceptance,
    );
  });

  it("scores the same conflict higher for a team without independent reconciliation", () => {
    const tpl = oneClerk(["collect_cash", "bank_reconcile"]);
    const staffBase = {
      ...dental.staffComposition,
      independentBankRec: true,
      segregationScore: 80,
    };
    const good = detectSodConflicts(tpl, staffBase).conflicts[0];
    const bad = detectSodConflicts(tpl, {
      ...staffBase,
      independentBankRec: false,
      segregationScore: 30,
    }).conflicts[0];
    expect(bad.ruleId).toBe(good.ruleId);
    expect(bad.score).toBeGreaterThan(good.score);
  });

  it("every rule can be triggered and links only to scenarios that exist", () => {
    for (const rule of CONFLICT_RULES) {
      const report = detectSodConflicts(oneClerk([rule.a, rule.b]));
      expect(
        report.conflicts.some((c) => c.ruleId === rule.id),
        `${rule.id} never fires`,
      ).toBe(true);
      if (rule.linkedScenarioId) {
        expect(
          dental.scenarios.some((s) => s.id === rule.linkedScenarioId),
          `${rule.id} links to missing scenario ${rule.linkedScenarioId}`,
        ).toBe(true);
      }
    }
  });

  it("does not flag a cashier for taking the payment and bagging the same deposit", () => {
    const report = detectSodConflicts(oneClerk(["collect_cash", "prepare_deposit"]));
    expect(report.conflicts).toEqual([]);
  });

  it("names the rule and skips the vaguer family finding on the same duty", () => {
    const report = detectSodConflicts(
      oneClerk(["post_payments", "bank_reconcile", "prepare_deposit"]),
    );
    const named = report.conflicts.filter((c) => !c.ruleId.startsWith("family-"));
    const family = report.conflicts.filter((c) => c.ruleId.startsWith("family-"));
    expect(named.map((c) => c.ruleId).sort()).toEqual(["rule-cash-rec", "rule-deposit-post"]);
    expect(family).toEqual([]);
  });

  it("flags payment posting with write-off entry, and check signing with reconciliation", () => {
    const a = detectSodConflicts(oneClerk(["post_payments", "post_adjustments"]));
    expect(a.conflicts.map((c) => c.ruleId)).toEqual(["rule-payments-adjust"]);
    const b = detectSodConflicts(oneClerk(["sign_checks", "bank_reconcile"]));
    expect(b.conflicts.map((c) => c.ruleId)).toEqual(["rule-sign-rec"]);
    expect(b.conflicts[0].severity).toBe("critical");
  });

  it("flags journal entries with reconciliation, and employee-record changes with running payroll", () => {
    const a = detectSodConflicts(oneClerk(["post_journal_entries", "bank_reconcile"]));
    expect(a.conflicts.map((c) => c.ruleId)).toEqual(["rule-je-rec"]);
    expect(a.conflicts[0].severity).toBe("critical");
    const b = detectSodConflicts(oneClerk(["edit_payroll_master", "enter_payroll"]));
    expect(b.conflicts.map((c) => c.ruleId)).toEqual(["rule-payroll-master-run"]);
    expect(b.conflicts[0].severity).toBe("high");
  });

  it("moves the health index when a heavily loaded team removes one conflict", () => {
    const before = detectSodConflicts(dental).summary.segregationHealth;
    const bookkeeperFreed = {
      ...dental,
      people: dental.people.map((p) =>
        p.role === "Office Manager"
          ? {
              ...p,
              entitlements: (ROLE_TEMPLATES[p.role] ?? []).filter((e) => e !== "release_payment"),
            }
          : p,
      ),
    };
    const after = detectSodConflicts(bookkeeperFreed).summary.segregationHealth;
    expect(before).toBeGreaterThan(5);
    expect(after).toBeGreaterThan(before);
  });

  it("maps pressure to a monotone index with no floor", () => {
    expect(segregationHealthIndex(0)).toBe(100);
    expect(segregationHealthIndex(20)).toBe(80);
    expect(segregationHealthIndex(50)).toBe(50);
    const series = [60, 100, 140, 200, 400].map(segregationHealthIndex);
    for (let i = 1; i < series.length; i += 1) expect(series[i]).toBeLessThan(series[i - 1]);
    expect(segregationHealthIndex(140) - segregationHealthIndex(155)).toBeGreaterThanOrEqual(1);
  });

  it("reports the sample dental team's conflicts deterministically", () => {
    const a = detectSodConflicts(dental);
    const b = detectSodConflicts(dental);
    expect(a.conflicts.map((c) => c.id)).toEqual(b.conflicts.map((c) => c.id));
    expect(a.conflicts.length).toBeGreaterThan(0);
    expect(a.summary.segregationHealth).toBeGreaterThanOrEqual(0);
    expect(a.summary.segregationHealth).toBeLessThanOrEqual(100);
  });
});

describe("release, payroll and reconciliation pairs", () => {
  const team = (entitlements: EntitlementId[]) =>
    detectSodConflicts(getBaseTemplate("general"), undefined, {
      assignments: [{ personId: "p1", personName: "Pat", role: "Bookkeeper", entitlements }],
    });

  it("names the person who releases payments and reconciles the account they leave from", () => {
    const report = team(["release_payment", "bank_reconcile", "view_reports_only"]);
    const hit = report.conflicts.find((c) => c.ruleId === "rule-release-rec");
    expect(hit?.severity).toBe("critical");
  });

  it("names payroll entry held with payment release or with reconciliation", () => {
    const ids = (e: EntitlementId[]) => team(e).conflicts.map((c) => c.ruleId);
    expect(ids(["enter_payroll", "release_payment", "view_reports_only"])).toContain(
      "rule-payroll-release",
    );
    expect(ids(["enter_payroll", "bank_reconcile", "view_reports_only"])).toContain(
      "rule-payroll-rec",
    );
  });

  it("does not lower a score for the controls it merely suggests", () => {
    const report = team(["sign_checks", "bank_reconcile", "view_reports_only"]);
    const hit = report.conflicts.find((c) => c.ruleId === "rule-sign-rec")!;
    expect(hit.compensatingControls.length).toBeGreaterThan(0);
    expect(hit.controlsInPlace).toEqual([]);
    const mitigated = detectSodConflicts(getBaseTemplate("general"), undefined, {
      assignments: [
        {
          personId: "p1",
          personName: "Pat",
          role: "Bookkeeper",
          entitlements: ["sign_checks", "bank_reconcile", "view_reports_only"],
        },
      ],
      compensatingByControlId: { "c-sod-cash": ["Owner reads every cleared-check image monthly"] },
    }).conflicts.find((c) => c.ruleId === "rule-sign-rec")!;
    expect(mitigated.controlsInPlace).toHaveLength(1);
    expect(mitigated.score).toBeLessThan(hit.score);
  });
});

describe("owner-aware and mitigation-aware detection", () => {
  const general = getBaseTemplate("general");
  const one = (role: string, entitlements: EntitlementId[], extra: SodDetectionOptions = {}) =>
    detectSodConflicts(general, undefined, {
      assignments: [{ personId: "p1", personName: "Pat", role, entitlements }],
      ...extra,
    });

  it("does not flag the owner for signing checks and reading the bank statement", () => {
    const owner = one("Owner", [
      "sign_checks",
      "bank_reconcile",
      "approve_payroll",
      "view_reports_only",
    ]);
    expect(owner.conflicts).toEqual([]);
    const treasurer = one("Board Treasurer", [
      "sign_checks",
      "bank_reconcile",
      "view_reports_only",
    ]);
    expect(treasurer.conflicts.map((c) => c.ruleId)).toContain("rule-sign-rec");
  });

  it("keeps an owner's money-handling pair but marks it, ranks it last, and asks for an outside reader", () => {
    const owner = one("Owner / Principal", ["collect_cash", "bank_reconcile", "view_reports_only"]);
    expect(owner.conflicts).toHaveLength(1);
    const hit = owner.conflicts[0];
    expect(hit.ruleId).toBe("rule-custody-rec");
    expect(hit.ownerHeld).toBe(true);
    expect(hit.why).toMatch(/cannot steal from themselves/);
    expect(hit.compensatingControls[0]).toMatch(/outside bookkeeper or accountant/);
    const employee = one("Bookkeeper", ["collect_cash", "bank_reconcile", "view_reports_only"]);
    expect(hit.score).toBeLessThan(employee.conflicts[0].score);
    expect(owner.summary.critical).toBe(0);
    expect(owner.summary.ownerHeld).toBe(1);
    expect(owner.summary.segregationHealth).toBeGreaterThan(employee.summary.segregationHealth);
  });

  it("does not raise a family flag for approving and administering access", () => {
    const gm = one("General Manager", [
      "approve_writeoffs",
      "approve_vendor",
      "manage_user_access",
      "view_reports_only",
    ]);
    expect(gm.conflicts.filter((c) => c.severity === "family")).toEqual([]);
  });

  it("reads initiating an ACH through the payment-release rules", () => {
    const ids = one("AP Specialist", [
      "create_vendor",
      "initiate_ach",
      "view_reports_only",
    ]).conflicts.map((c) => c.ruleId);
    expect(ids).toContain("rule-vendor-create-pay");
    expect(
      one("Bookkeeper", ["initiate_ach", "bank_reconcile", "view_reports_only"]).conflicts.map(
        (c) => c.ruleId,
      ),
    ).toContain("rule-release-rec");
  });

  it("lists every named finding above every family finding", () => {
    const report = one("Office Manager", [
      "order_supplies",
      "receive_goods",
      "create_vendor",
      "change_fee_schedule",
      "view_reports_only",
    ]);
    const severities = report.conflicts.map((c) => c.severity);
    const firstFamily = severities.indexOf("family");
    const lastNamed = severities.map((s) => s !== "family").lastIndexOf(true);
    expect(firstFamily === -1 || lastNamed < firstFamily).toBe(true);
  });

  it("never lets a mitigated conflict raise the health index", () => {
    const base = one("Bookkeeper", ["post_payments", "bank_reconcile", "view_reports_only"]);
    const more = one(
      "Bookkeeper",
      ["post_payments", "bank_reconcile", "create_vendor", "release_payment", "view_reports_only"],
      {
        dualReleaseMitigatedRuleIds: new Set(["rule-vendor-create-pay"]),
      },
    );
    expect(more.conflicts.some((c) => c.dualReleaseMitigated)).toBe(true);
    expect(more.summary.segregationHealth).toBeLessThan(base.summary.segregationHealth);
  });
});
