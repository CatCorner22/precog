import { getIndustryTemplate } from "../templates";
import { describe, expect, it } from "vitest";
import { teamTemplate } from "@/test/fixtures";
import type { IndustryTemplate } from "../templates/types";
import type { Person } from "../types";
import { CONFLICT_RULES, type EntitlementId } from "./conflict-rules";
import {
  buildAssignments,
  detectAssignments,
  detectSodConflicts,
  SEVERITY_RANK,
  type SodDetectionOptions,
} from "./detect";
import type { RoleAssignment } from "./assignments";
import { segregationHealthIndex } from "./score";
import { ROLE_TEMPLATES } from "./role-templates";
import { sodMatrix } from "./rule-match";
import { defaultDualReleasePolicy, mitigatedSodRuleIds } from "../controls/dual-release";
import { openFindings } from "./open-findings";

const dental = getIndustryTemplate("dental");

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

  it("falls back to view-only for an unknown role and de-duplicates a person's duties", () => {
    expect(buildAssignments(oneClerk([]))[0].entitlements).toEqual(["view_reports_only"]);
    const doubled = buildAssignments(oneClerk(["collect_cash", "collect_cash"]));
    expect(doubled[0].entitlements).toEqual(["collect_cash"]);
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

describe("detectSodConflicts", () => {
  it("does not treat an empty duty map as assessed or separated", () => {
    const report = detectAssignments({
      industry: "general",
      assignments: [
        {
          personId: "p1",
          personName: "Pat",
          role: "Owner",
          entitlements: [],
        },
      ],
    });

    expect(report.summary.dutiesMarked).toBe(false);
    expect(report.summary.segregationHealth).toBe(100);
    expect(report.recommendations).toContain(
      "Mark who does each money duty. Precog cannot judge separation until you do.",
    );
    expect(report.recommendations).not.toContain(
      "Duties look separated; scan again after any role change.",
    );
  });

  it("does not treat report-view-only access as an assessed money duty", () => {
    const report = detectAssignments({
      industry: "general",
      assignments: [
        {
          personId: "p1",
          personName: "Pat",
          role: "Owner",
          entitlements: ["view_reports_only"],
        },
      ],
    });

    expect(report.summary.dutiesMarked).toBe(false);
    expect(report.recommendations).toContain(
      "Mark who does each money duty. Precog cannot judge separation until you do.",
    );
  });

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
    // Preparing the deposit is holding the cash on its way to the bank, so
    // preparing it and reconciling the account is the cash-custody gap too.
    expect(named.map((c) => c.ruleId).sort()).toEqual([
      "rule-cash-rec",
      "rule-custody-rec",
      "rule-deposit-post",
    ]);
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
    // The index has no floor above 1, so a heavily loaded team still moves.
    expect(before).toBeGreaterThan(1);
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
    detectSodConflicts(getIndustryTemplate("general"), undefined, {
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
    const mitigated = detectSodConflicts(getIndustryTemplate("general"), undefined, {
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
    expect(mitigated.score).toBe(hit.score);
  });
});

describe("owner-aware and mitigation-aware detection", () => {
  const general = getIndustryTemplate("general");
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

describe("recommendations", () => {
  it("never calls duties healthy while a high pair is open", () => {
    const report = detectSodConflicts(getIndustryTemplate("general"), undefined, {
      assignments: [
        {
          personId: "p1",
          personName: "Pat",
          role: "Property Manager",
          entitlements: ["collect_cash", "post_payments", "view_reports_only"],
        },
      ],
    });
    expect(report.summary.high).toBeGreaterThan(0);
    expect(report.recommendations.join(" ")).not.toMatch(/look healthy|look separated/);
    const clean = detectSodConflicts(getIndustryTemplate("general"), undefined, {
      assignments: [
        {
          personId: "p1",
          personName: "Pat",
          role: "Cashier",
          entitlements: ["collect_cash", "view_reports_only"],
        },
      ],
    });
    expect(clean.recommendations).toEqual([
      "Duties look separated; scan again after any role change.",
    ]);
  });
});

describe("unheld duties", () => {
  it("names the money duties nobody active holds", () => {
    const report = detectSodConflicts(getIndustryTemplate("general"), undefined, {
      assignments: [
        {
          personId: "p1",
          personName: "Pat",
          role: "Bookkeeper",
          entitlements: ["post_payments", "bank_reconcile"],
        },
        {
          personId: "p2",
          personName: "Ana",
          role: "Owner",
          entitlements: ["approve_payroll", "view_reports_only"],
        },
        { personId: "p3", personName: "Cal", role: "Cashier", entitlements: ["collect_cash"] },
      ],
    });
    expect(report.summary.unheldDuties).toEqual([
      "prepare_deposit",
      "release_payment",
      "create_vendor",
    ]);
  });

  it("asks for nobody to prepare deposits when nobody takes payments", () => {
    const report = detectSodConflicts(
      teamTemplate(dental, [
        {
          role: "Owner",
          duties: ["bank_reconcile", "release_payment", "create_vendor", "approve_payroll"],
        },
        { role: "Bookkeeper", duties: ["post_payments", "enter_invoices"] },
      ]),
    );
    expect(report.summary.unheldDuties).toEqual([]);
  });

  it("says nobody sets up suppliers when a bookkeeper pays them and nobody is recorded adding them", () => {
    const report = detectSodConflicts(
      teamTemplate(dental, [
        { role: "Owner", duties: ["approve_payroll", "bank_reconcile"] },
        { role: "Bookkeeper", duties: ["enter_invoices", "release_payment", "prepare_deposit"] },
      ]),
    );
    expect(report.summary.unheldDuties).toEqual(["create_vendor"]);
  });
});

describe("owner-held pairs belong to the one owner only", () => {
  it.each([
    "Principal Accountant",
    "Assistant to the Owner",
    "Vice President, Finance",
    "Office Manager (Owner's wife)",
  ])("keeps a %s's critical pair open", (role) => {
    const report = detectSodConflicts(
      teamTemplate(dental, [
        { role: "Owner", duties: ["sign_checks"] },
        { role, duties: ["release_payment", "bank_reconcile"] },
      ]),
    );
    const pair = report.conflicts.find((c) => c.ruleId === "rule-release-rec")!;
    expect(pair.ownerHeld).toBe(false);
    expect(pair.fraudPath).not.toMatch(/nobody but the owner/);
    expect(report.summary.critical).toBe(1);
  });

  it("treats no partner as the owner who cannot steal from themselves", () => {
    const report = detectSodConflicts(
      teamTemplate(dental, [
        { role: "Partner", duties: ["release_payment", "bank_reconcile"] },
        { role: "Partner", duties: ["sign_checks"] },
      ]),
    );
    expect(report.summary.ownerHeld).toBe(0);
    expect(report.summary.critical).toBe(1);
  });

  it("still ranks a sole owner's own pair last and at half weight", () => {
    const report = detectSodConflicts(
      teamTemplate(dental, [
        { role: "Owner", duties: ["collect_cash", "post_payments", "bank_reconcile"] },
      ]),
    );
    expect(report.conflicts.every((c) => c.ownerHeld)).toBe(true);
    expect(report.summary.critical).toBe(0);
  });
});

describe("one finding per gap per person", () => {
  it("reports ACH initiation and payment release with reconciliation once, not twice", () => {
    const report = detectSodConflicts(
      oneClerk(["initiate_ach", "release_payment", "bank_reconcile", "create_vendor"]),
    );
    const ids = report.conflicts.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.filter((id) => id.endsWith(":rule-release-rec"))).toHaveLength(1);
    expect(ids.filter((id) => id.endsWith(":rule-vendor-create-pay"))).toHaveLength(1);
  });

  it("labels a pair read through a channel with the duties the person holds", () => {
    const report = detectSodConflicts(oneClerk(["initiate_ach", "bank_reconcile"]));
    const pair = report.conflicts.find((c) => c.ruleId === "rule-release-rec")!;
    expect([pair.entitlementA, pair.entitlementB].sort()).toEqual([
      "bank_reconcile",
      "initiate_ach",
    ]);
  });

  it("counts a controller who releases, signs and reconciles as one gap", () => {
    const report = detectSodConflicts(
      oneClerk(["release_payment", "sign_checks", "bank_reconcile"]),
    );
    const rules = report.conflicts.map((c) => c.ruleId);
    expect(rules).toContain("rule-release-rec");
    expect(rules).not.toContain("rule-sign-rec");
    const pair = report.conflicts.find((c) => c.ruleId === "rule-release-rec")!;
    expect(pair.compensatingControls).toContain(
      "Bank Positive Pay: the bank pays only checks on the owner's list",
    );
  });

  it("keeps a check signer who releases nothing on the check-signing rule", () => {
    const report = detectSodConflicts(oneClerk(["sign_checks", "bank_reconcile"]));
    expect(report.conflicts.map((c) => c.ruleId)).toEqual(["rule-sign-rec"]);
  });
});

describe("deposit preparation with reconciliation", () => {
  it("flags a practice manager who prepares deposits, reconciles and enters payroll", () => {
    const report = detectSodConflicts(
      oneClerk(["prepare_deposit", "bank_reconcile", "enter_payroll", "approve_writeoffs"]),
    );
    const rules = report.conflicts.map((c) => c.ruleId);
    expect(rules).toContain("rule-custody-rec");
    expect(rules).toContain("rule-payroll-rec");
    const custody = report.conflicts.find((c) => c.ruleId === "rule-custody-rec")!;
    expect(custody.severity).toBe("critical");
    expect(custody.labelA + custody.labelB).toMatch(/deposit/i);
  });
});

describe("money duties nobody holds", () => {
  it("counts check signing and ACH initiation as releasing payments", () => {
    const signs = detectSodConflicts(
      teamTemplate(dental, [
        { role: "Owner", duties: ["sign_checks", "approve_payroll"] },
        { role: "Bookkeeper", duties: ["prepare_deposit", "bank_reconcile"] },
      ]),
    );
    expect(signs.summary.unheldDuties).not.toContain("release_payment");
    const ach = detectSodConflicts(
      teamTemplate(dental, [
        { role: "Treasurer", duties: ["initiate_ach", "prepare_deposit", "approve_payroll"] },
      ]),
    );
    expect(ach.summary.unheldDuties).not.toContain("release_payment");
  });
});

describe("recommendations", () => {
  it("does not tell a one-person business to have two people count the deposit", () => {
    const report = detectSodConflicts(
      teamTemplate(dental, [
        {
          role: "Owner",
          duties: ["collect_cash", "post_payments", "release_payment", "bank_reconcile"],
        },
      ]),
    );
    expect(report.recommendations.join(" ")).not.toMatch(/two people count/);
    expect(report.recommendations.join(" ")).toMatch(/outside bookkeeper or accountant/);
    expect(report.recommendations).not.toContain(
      "Duties look separated; scan again after any role change.",
    );
  });

  it("names an employee who holds most of the money cycle", () => {
    const report = detectSodConflicts(
      teamTemplate(dental, [
        { role: "Owner", duties: ["sign_checks"] },
        {
          role: "Office Manager",
          duties: [
            "collect_cash",
            "post_payments",
            "prepare_deposit",
            "enter_invoices",
            "initiate_ach",
            "enter_payroll",
            "bank_reconcile",
          ],
        },
      ]),
    );
    expect(report.recommendations.join(" ")).toMatch(
      /Person 2 \(Office Manager\) holds 7 of the 11 core money duties/,
    );
    expect(report.recommendations.join(" ")).toMatch(/Moving the bank reconciliation/);
  });

  it("ranks two critical findings that both show 100 by their full score, not their id", () => {
    // Payment posting (weight 4) + reconciliation for the first clerk, cash
    // custody (weight 5) + reconciliation for the second. Both clamp to 100
    // under weak staffing; the heavier pair must still come first.
    const report = detectSodConflicts(
      teamTemplate(dental, [
        { role: "Clerk", duties: ["post_payments", "bank_reconcile"] },
        { role: "Cashier", duties: ["collect_cash", "bank_reconcile"] },
      ]),
      {
        ...dental.staffComposition,
        dualControlPayments: false,
        independentBankRec: false,
        segregationScore: 20,
      },
    );
    const critical = report.conflicts.filter((c) => c.severity === "critical");
    expect(critical.map((c) => c.score)).toEqual([100, 100]);
    expect(critical.map((c) => c.ruleId)).toEqual(["rule-custody-rec", "rule-cash-rec"]);
  });
});

describe("family catch-all", () => {
  it("does not flag administering the system and assigning its logins as two record duties", () => {
    const report = detectSodConflicts(oneClerk(["pms_admin_roles", "manage_user_access"]));
    expect(report.conflicts.filter((c) => c.ruleId.startsWith("family-"))).toEqual([]);
    const cell = report.matrix.find(
      (m) => m.row === "pms_admin_roles" && m.col === "manage_user_access",
    );
    expect(cell?.status).toBe("safe");
  });

  it("does not flag two master-record duties as a conflict", () => {
    const report = detectSodConflicts(oneClerk(["change_fee_schedule", "edit_patient_master"]));
    expect(report.conflicts.filter((c) => c.ruleId.startsWith("family-"))).toEqual([]);
  });
});

describe("cash, refund, void and journal-entry rules", () => {
  it.each([
    [["collect_cash", "approve_writeoffs"], "rule-cash-void"],
    [["prepare_deposit", "approve_writeoffs"], "rule-cash-void"],
    [["collect_cash", "issue_refunds"], "rule-cash-refund"],
    [["prepare_deposit", "issue_refunds"], "rule-cash-refund"],
    [["issue_refunds", "post_payments"], "rule-refund-post"],
    [["release_payment", "post_journal_entries"], "rule-release-je"],
    [["initiate_ach", "post_journal_entries"], "rule-release-je"],
    [["edit_payroll_master", "release_payment"], "rule-payroll-master-release"],
    [["collect_cash", "pms_admin_roles"], "rule-cash-admin"],
    [["prepare_deposit", "pms_admin_roles"], "rule-cash-admin"],
    [["manage_user_access", "release_payment"], "rule-access-release"],
    [["manage_user_access", "initiate_ach"], "rule-access-release"],
  ])("flags %j as %s", (duties, ruleId) => {
    const report = detectSodConflicts(oneClerk(duties));
    expect(report.conflicts.map((c) => c.ruleId)).toContain(ruleId);
  });
});

describe("signing checks is releasing payments", () => {
  it.each([
    [["approve_vendor", "sign_checks"], "rule-vendor-approve-pay", "high"],
    [["create_vendor", "sign_checks"], "rule-vendor-create-pay", "critical"],
    [["enter_invoices", "sign_checks"], "rule-invoice-pay", "critical"],
    [["enter_payroll", "sign_checks"], "rule-payroll-release", "high"],
  ])("reads %j through %s", (duties, ruleId, severity) => {
    const report = detectSodConflicts(oneClerk(duties));
    const found = report.conflicts.find((c) => c.ruleId === ruleId);
    expect(found?.severity).toBe(severity);
    expect(report.conflicts.some((c) => c.ruleId.startsWith("family-"))).toBe(false);
  });

  it("does not pair two ways of sending money out", () => {
    for (const duties of [
      ["sign_checks", "release_payment"],
      ["sign_checks", "initiate_ach"],
    ]) {
      expect(detectSodConflicts(oneClerk(duties)).conflicts).toEqual([]);
    }
  });

  it("flags initiating an ACH and releasing it: the bank's maker and checker in one pair of hands", () => {
    const ids = detectSodConflicts(oneClerk(["initiate_ach", "release_payment"])).conflicts.map(
      (c) => [c.ruleId, c.severity],
    );
    expect(ids).toEqual([["rule-ach-release", "critical"]]);
  });
});

describe("company card and expense duties", () => {
  it("flags the cardholder who reads and codes the card's own statement", () => {
    const report = detectSodConflicts(
      oneClerk(["hold_company_card", "review_card_statement", "enter_invoices"]),
    );
    const card = report.conflicts.find((c) => c.ruleId === "rule-card-review");
    expect(card?.severity).toBe("high");
    expect(card?.labelA).toBe("Spend on a company card or charge account");
    expect(card?.labelB).toBe("Review and code the company card statement");
    // The named rule already covers the card; no vaguer catch-all repeats it.
    expect(report.conflicts.some((c) => c.ruleId.startsWith("family-"))).toBe(false);
    expect(report.recommendations.some((r) => /card statement line by line/.test(r))).toBe(true);
  });

  it("flags the cardholder who approves the expense claims", () => {
    const report = detectSodConflicts(
      oneClerk(["hold_company_card", "approve_expenses", "approve_vendor", "manage_user_access"]),
    );
    expect(report.conflicts.map((c) => c.ruleId)).toEqual(["rule-card-approve"]);
  });

  it("treats ordering supplies and paying for them on the card as one act of buying", () => {
    for (const duties of [
      ["hold_company_card", "order_supplies"],
      ["hold_company_card", "order_supplies", "receive_goods"],
    ]) {
      const report = detectSodConflicts(oneClerk(duties));
      expect(
        report.conflicts.filter(
          (c) => c.entitlementA === "hold_company_card" || c.entitlementB === "hold_company_card",
        ),
      ).toEqual([]);
    }
  });

  it("leaves a reviewer or approver who holds no card, and a team with no card, unflagged", () => {
    expect(
      detectSodConflicts(oneClerk(["review_card_statement", "approve_expenses"])).conflicts,
    ).toEqual([]);
    const report = detectSodConflicts(
      teamTemplate(dental, [
        { role: "Owner", duties: ["approve_expenses", "approve_payroll"] },
        { role: "Bookkeeper", duties: ["review_card_statement", "enter_invoices"] },
      ]),
    );
    expect(report.conflicts).toEqual([]);
    // Nobody holding a card is a choice, not an empty seat.
    expect(report.summary.unheldDuties).not.toContain("hold_company_card");
  });

  it("reads the owner's own card and approval as an owner-held pair, not a theft finding", () => {
    const report = detectSodConflicts(
      teamTemplate(dental, [
        { role: "Owner", duties: ["hold_company_card", "approve_expenses"] },
        { role: "Bookkeeper", duties: ["review_card_statement"] },
      ]),
    );
    expect(report.conflicts.map((c) => `${c.ruleId}:${c.ownerHeld}`)).toEqual([
      "rule-card-approve:true",
    ]);
  });
});

describe("the owner's findings", () => {
  it("gives the sole owner no vaguer catch-all about their own business", () => {
    const report = detectSodConflicts(
      teamTemplate(dental, [
        { role: "Owner", duties: ["release_payment", "sign_checks", "order_supplies"] },
      ]),
    );
    expect(report.conflicts.some((c) => c.ruleId.startsWith("family-"))).toBe(false);
  });

  it("lists every employee finding before an owner-held critical pair", () => {
    const report = detectSodConflicts(
      teamTemplate(dental, [
        { role: "Owner", duties: ["collect_cash", "bank_reconcile"] },
        { role: "Bookkeeper", duties: ["prepare_deposit", "post_payments"] },
      ]),
    );
    const order = report.conflicts.map((c) => `${c.ownerHeld ? "owner" : "staff"}:${c.severity}`);
    expect(order).toEqual(["staff:high", "owner:critical"]);
  });
});

describe("segregation health counts distinct gaps", () => {
  const frontDesk = (n: number) =>
    Array.from({ length: n }, () => ({
      role: "Front Desk",
      duties: ["collect_cash", "post_payments"],
    }));

  it("scores a large clinic with one repeated front-desk gap above a shop whose bookkeeper holds everything", () => {
    const clinic = detectSodConflicts(
      teamTemplate(dental, [
        { role: "Owner", duties: ["approve_payroll", "bank_reconcile"] },
        ...frontDesk(8),
        { role: "Billing", duties: ["post_adjustments"] },
        { role: "AP Clerk", duties: ["enter_invoices"] },
        { role: "Controller", duties: ["release_payment", "bank_reconcile"] },
      ]),
    ).summary.segregationHealth;
    const shop = detectSodConflicts(
      teamTemplate(dental, [
        { role: "Owner", duties: ["approve_payroll"] },
        {
          role: "Bookkeeper",
          duties: [
            "post_payments",
            "prepare_deposit",
            "bank_reconcile",
            "release_payment",
            "create_vendor",
            "enter_invoices",
          ],
        },
      ]),
    ).summary.segregationHealth;
    expect(clinic).toBeGreaterThan(shop + 20);
  });

  it("lowers the index only slowly as more people hold the same flagged seat", () => {
    const one = detectSodConflicts(teamTemplate(dental, frontDesk(1))).summary.segregationHealth;
    const eight = detectSodConflicts(teamTemplate(dental, frontDesk(8))).summary.segregationHealth;
    expect(eight).toBeLessThan(one);
    expect(one - eight).toBeLessThan(10);
  });

  it("never rises when a conflict is added", () => {
    let previous = 101;
    for (let n = 1; n <= 12; n++) {
      const health = detectSodConflicts(teamTemplate(dental, frontDesk(n))).summary
        .segregationHealth;
      expect(health).toBeLessThanOrEqual(previous);
      previous = health;
    }
  });
});

describe("catch-all wording for master records", () => {
  it("does not treat a price or customer record beside an approval as a family conflict", () => {
    const report = detectSodConflicts(oneClerk(["approve_writeoffs", "edit_patient_master"]));
    expect(report.conflicts.filter((c) => c.ruleId.startsWith("family-"))).toEqual([]);
  });
});

function clerk(entitlements: string[], role = "Clerk"): RoleAssignment {
  return { personId: "c", personName: "Cy", role, entitlements } as RoleAssignment;
}

describe("the pair matrix", () => {
  it("marks a pair a conflict exactly when one employee holding just those two duties gets a finding", () => {
    const report = detectAssignments({ assignments: [] });
    const disagreements: string[] = [];
    for (const cell of report.matrix) {
      if (cell.row >= cell.col) continue;
      const found = detectAssignments({
        assignments: [clerk([cell.row, cell.col])],
        soleOwnerId: null,
      }).conflicts;
      if ((cell.status === "conflict") !== found.length > 0) {
        disagreements.push(`${cell.row} x ${cell.col}`);
      }
      if (found.length) expect(cell.ruleIds).toEqual([found[0].ruleId]);
    }
    expect(disagreements).toEqual([]);
  });

  it("is built once, since it depends only on the rulebook", () => {
    const a = detectAssignments({ assignments: [clerk(["collect_cash"])] });
    const b = detectAssignments({ assignments: [clerk(["bank_reconcile"])] });
    expect(a.matrix).toBe(b.matrix);
  });

  it("gives every pair of duties at most one named rule", () => {
    const pairs = CONFLICT_RULES.map((r) => [r.a, r.b].sort().join("|"));
    expect(new Set(pairs).size).toBe(pairs.length);
  });
});

describe("owner logic by line of business", () => {
  const founder = (): RoleAssignment[] => [
    {
      personId: "ed",
      personName: "Dana",
      role: "Founder & Executive Director",
      entitlements: ["release_payment", "bank_reconcile", "create_vendor"],
    },
    {
      personId: "bk",
      personName: "Bo",
      role: "Bookkeeper",
      entitlements: ["enter_invoices", "post_payments"],
    },
  ];

  it("treats nobody on a nonprofit as the owner, even an unmarked founder", () => {
    const report = detectAssignments({ assignments: founder(), industry: "nonprofit" });
    expect(report.summary.ownerHeld).toBe(0);
    expect(report.summary.critical).toBe(2);
    expect(report.conflicts.every((c) => !c.ownerHeld)).toBe(true);
  });

  it("names the board treasurer, not an owner, in a nonprofit's controls and advice", () => {
    const report = detectAssignments({ assignments: founder(), industry: "nonprofit" });
    const text = [
      ...report.conflicts.flatMap((c) => [c.why, c.fraudPath, ...c.compensatingControls]),
      ...report.recommendations,
    ].join("\n");
    expect(text).not.toMatch(/\bowner\b/i);
    expect(text).toMatch(/board treasurer/i);
  });

  it("still reads the founder of a business as its owner", () => {
    const report = detectAssignments({ assignments: founder(), industry: "general" });
    expect(report.summary.ownerHeld).toBe(2);
  });

  it("does not count the owner's invoice-entry and payment-release pair as open", () => {
    const assignments = [clerk(["enter_invoices", "release_payment"], "Owner")];
    const report = detectAssignments({ assignments, industry: "general" });
    const ownerPair = report.conflicts.filter((conflict) => conflict.ruleId === "rule-invoice-pay");
    expect(ownerPair).toMatchObject([{ ownerHeld: true, dualReleaseMitigated: false }]);
    expect(openFindings(ownerPair, new Map())).toEqual([]);

    const employeeReport = detectAssignments({
      assignments: [clerk(["enter_invoices", "release_payment"], "Bookkeeper")],
      industry: "general",
    });
    const employeePair = employeeReport.conflicts.filter(
      (conflict) => conflict.ruleId === "rule-invoice-pay",
    );
    expect(employeePair).toMatchObject([{ ownerHeld: false, dualReleaseMitigated: false }]);
    expect(openFindings(employeePair, new Map())).toEqual(employeePair);
  });

  it("names the board treasurer as the reader in a nonprofit's advice, never a partner", () => {
    const report = detectAssignments({
      assignments: [
        {
          personId: "bk",
          personName: "Bo",
          role: "Bookkeeper",
          entitlements: ["post_payments", "bank_reconcile", "create_vendor", "release_payment"],
        },
      ],
      industry: "nonprofit",
    });
    const advice = report.recommendations.join("\n");
    expect(advice).toMatch(/have the board treasurer/);
    expect(advice).not.toMatch(/\ban board\b|partner/);
  });
});

describe("supplier set-up and bill entry", () => {
  const apClerk = (): RoleAssignment[] => [
    {
      personId: "own",
      personName: "Olive",
      role: "Owner",
      entitlements: ["release_payment", "approve_invoices"],
    },
    {
      personId: "ap",
      personName: "Avery",
      role: "Accounts Payable Specialist",
      entitlements: ["enter_invoices", "create_vendor", "view_reports_only"],
    },
  ];

  it("flags a clerk who can set up a supplier and enter its bills", () => {
    const report = detectAssignments({ assignments: apClerk() });
    const found = report.conflicts.find((c) => c.ruleId === "rule-vendor-create-invoice");
    expect(found).toMatchObject({ personId: "ap", severity: "high", ownerHeld: false });
    expect(found?.linkedControlId).toBe("c-sod-ap");
    expect(report.summary.segregationHealth).toBeLessThan(100);
    expect(report.recommendations.join("\n")).toMatch(
      /approve every new supplier before anyone enters a bill from it/,
    );
  });

  it("marks the pair as a conflict in the matrix", () => {
    const cell = sodMatrix().find((c) => c.row === "create_vendor" && c.col === "enter_invoices");
    expect(cell?.status).toBe("conflict");
    expect(cell?.ruleIds).toEqual(["rule-vendor-create-invoice"]);
  });

  it("is narrowed by the owner signing every new supplier", () => {
    const report = detectAssignments({
      assignments: apClerk(),
      dualReleaseMitigatedRuleIds: mitigatedSodRuleIds({
        ...defaultDualReleasePolicy(dental),
        enabled: true,
      }),
    });
    const found = report.conflicts.find((c) => c.ruleId === "rule-vendor-create-invoice");
    expect(found?.dualReleaseMitigated).toBe(true);
  });
});

describe("findings the owner reads", () => {
  it("lists only real controls under an owner-held pair", () => {
    const report = detectAssignments({
      assignments: [clerk(["collect_cash", "bank_reconcile"], "Owner")],
    });
    const [finding] = report.conflicts;
    expect(finding.ownerHeld).toBe(true);
    expect(finding.compensatingControls).toEqual([
      "An outside bookkeeper or accountant reads the bank statement and the payroll register each month",
    ]);
  });

  it("counts no one in People when the only pairs are the owner's own", () => {
    const report = detectAssignments({
      assignments: [
        clerk(["collect_cash", "bank_reconcile"], "Owner"),
        {
          personId: "b",
          personName: "Bo",
          role: "Bookkeeper",
          entitlements: ["view_reports_only"],
        },
      ],
    });
    expect(report.summary.ownerHeld).toBe(1);
    expect(report.summary.peopleWithConflicts).toBe(0);
  });

  it("does not raise a payroll pair's score for missing dual control on payments", () => {
    const pair = [clerk(["edit_payroll_master", "enter_payroll"], "Payroll Clerk")];
    const staff = getIndustryTemplate("general").staffComposition;
    const score = (dualControlPayments: boolean) =>
      detectAssignments({ assignments: pair }, { ...staff, dualControlPayments }).conflicts[0]
        .score;
    expect(score(false)).toBe(score(true));
  });

  it("writes recommendations with real plurals and names partners, not an owner, when there are two", () => {
    const partners: RoleAssignment[] = [
      {
        personId: "p1",
        personName: "Ana",
        role: "Partner",
        entitlements: ["collect_cash", "bank_reconcile", "post_payments"],
      },
      { personId: "p2", personName: "Ben", role: "Partner", entitlements: ["release_payment"] },
    ];
    const recs = detectAssignments({ assignments: partners }).recommendations.join("\n");
    expect(recs).toMatch(
      /Close the 2 critical pairs before the others, or narrow them with a dual-release rule\./,
    );
    expect(recs).not.toMatch(/\(s\)|dual-release-compensate|PMS/);
    expect(recs).toMatch(
      /have an owner or partner who holds none of them reconcile the bank account/,
    );
  });

  it("writes one critical pair in the singular", () => {
    const recs = detectAssignments({
      assignments: [clerk(["create_vendor", "release_payment"])],
    }).recommendations;
    expect(recs[0]).toBe(
      "Close the 1 critical pair before the others, or narrow it with a dual-release rule.",
    );
  });
});

describe("the rulebook's case references", () => {
  it("never points to a case library the text may be printed without", () => {
    for (const rule of CONFLICT_RULES) expect(rule.why, rule.id).not.toMatch(/library/);
  });

  it("describes no tuition case the library does not hold", () => {
    const rule = CONFLICT_RULES.find((r) => r.id === "rule-cash-admin")!;
    expect(rule.why).not.toMatch(/tuition/);
  });
});

describe("SEVERITY_RANK", () => {
  it("orders critical before high, high before medium and medium before family", () => {
    expect(SEVERITY_RANK.critical).toBeLessThan(SEVERITY_RANK.high);
    expect(SEVERITY_RANK.high).toBeLessThan(SEVERITY_RANK.medium);
    expect(SEVERITY_RANK.medium).toBeLessThan(SEVERITY_RANK.family);
  });
});
