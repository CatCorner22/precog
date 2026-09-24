import { getIndustryTemplate } from "../templates";
import { describe, expect, it } from "vitest";
import { getBaseTemplate } from "../active-template";
import {
  defaultDualReleasePolicy,
  dualReleaseCoverage,
  evaluateRelease,
  listEligibleApprovers,
  mergeDualReleasePolicy,
  mitigatedSodRuleIds,
  type DualReleasePolicy,
} from "./dual-release";

const dental = getBaseTemplate("dental");
const owner = "p1"; // Dr. Elena Vargas, Owner / Dentist
const officeManager = "p2"; // Maya Chen, Office Manager
const hygienist = "p4"; // Sam Ortiz, cannot initiate payments

function policyOn(): DualReleasePolicy {
  return defaultDualReleasePolicy(dental, {
    ...dental.staffComposition,
    dualControlPayments: true,
  });
}

describe("defaultDualReleasePolicy", () => {
  it("follows the staff dual-control flag", () => {
    expect(defaultDualReleasePolicy(dental).enabled).toBe(false);
    expect(policyOn().enabled).toBe(true);
  });

  it("only names roles that exist in the template", () => {
    for (const id of [
      "retail",
      "restaurant",
      "professional_services",
      "construction",
      "nonprofit",
      "general",
    ] as const) {
      const tpl = getBaseTemplate(id);
      const roles = new Set(tpl.people.map((p) => p.role));
      const processes = new Set(tpl.processes.map((p) => p.id));
      for (const rule of defaultDualReleasePolicy(tpl).rules) {
        for (const r of [...rule.firstApproverRoles, ...rule.secondApproverRoles]) {
          expect(roles.has(r), `${id}/${rule.channel}: ${r}`).toBe(true);
        }
        for (const p of rule.processIds) expect(processes.has(p), `${id}/${p}`).toBe(true);
      }
    }
  });
});

describe("evaluateRelease", () => {
  it("blocks everything when the policy is off", () => {
    const r = evaluateRelease(dental, defaultDualReleasePolicy(dental), {
      channel: "ach",
      amountUsd: 10,
      initiatorPersonId: officeManager,
    });
    expect(r.status).toBe("blocked_policy_off");
    expect(r.ok).toBe(false);
  });

  it("lets a small payment through on one signature", () => {
    const r = evaluateRelease(dental, policyOn(), {
      channel: "ach",
      amountUsd: 200,
      initiatorPersonId: officeManager,
    });
    expect(r.status).toBe("below_threshold");
    expect(r.ok).toBe(true);
    expect(r.dualRequired).toBe(false);
  });

  it("requires a distinct, eligible second signer above the threshold", () => {
    const policy = policyOn();
    const base = { channel: "ach" as const, amountUsd: 5000, initiatorPersonId: officeManager };

    const missing = evaluateRelease(dental, policy, base);
    expect(missing.status).toBe("blocked_missing_second");
    expect(missing.eligibleSeconds.map((p) => p.id)).toContain(owner);

    const same = evaluateRelease(dental, policy, { ...base, secondPersonId: officeManager });
    expect(same.status).toBe("blocked_same_person");

    const wrongRole = evaluateRelease(dental, policy, { ...base, secondPersonId: hygienist });
    expect(wrongRole.status).toBe("blocked_role");

    const ok = evaluateRelease(dental, policy, { ...base, secondPersonId: owner });
    expect(ok.status).toBe("approved_dual");
    expect(ok.ok).toBe(true);
    expect(ok.mitigatesRules).toContain("rule-vendor-create-pay");
  });

  it("refuses an initiator whose role cannot start the channel", () => {
    const r = evaluateRelease(dental, policyOn(), {
      channel: "ach",
      amountUsd: 5000,
      initiatorPersonId: hygienist,
      secondPersonId: owner,
    });
    expect(r.status).toBe("blocked_role");
  });

  it("applies a payee exception to raise the single-signature threshold", () => {
    const policy = policyOn();
    const ex = policy.exceptions.find((e) => e.id === "ex-vendor-recurring")!;
    const base = { channel: "ach" as const, amountUsd: 3000, initiatorPersonId: officeManager };

    const plain = evaluateRelease(dental, policy, { ...base, payee: "Unknown Supplies" });
    expect(plain.status).toBe("blocked_missing_second");

    const matched = evaluateRelease(dental, policy, { ...base, payee: "Northgate Lab Services" });
    expect(matched.status).toBe("approved_exception");
    expect(matched.appliedException?.id).toBe(ex.id);
    expect(matched.thresholdUsd).toBe(ex.thresholdUsd);

    const over = evaluateRelease(dental, policy, {
      ...base,
      amountUsd: 4000,
      payee: "Northgate Lab Services",
    });
    expect(over.dualRequired).toBe(true);
  });

  it("does not apply a disabled or expired exception", () => {
    const policy = policyOn();
    const temp = policy.exceptions.find((e) => e.id === "ex-temp-om-writeoff")!;
    temp.enabled = true;
    const req = { channel: "writeoff" as const, amountUsd: 300, initiatorPersonId: officeManager };

    expect(evaluateRelease(dental, policy, req).status).toBe("approved_exception");
    expect(evaluateRelease(dental, policy, { ...req, asOfDate: "2099-01-01" }).status).toBe(
      "blocked_missing_second",
    );
    temp.enabled = false;
    expect(evaluateRelease(dental, policy, req).status).toBe("blocked_missing_second");
  });
});

describe("policy helpers", () => {
  it("lists approvers by role and lets the owner second any channel", () => {
    const approvers = listEligibleApprovers(dental, policyOn(), "payroll");
    const o = approvers.find((a) => a.id === owner)!;
    expect(o.canSecond).toBe(true);
    expect(approvers.some((a) => a.id === hygienist)).toBe(false);
  });

  it("reports mitigated SoD rules only for enabled rules on an enabled policy", () => {
    const policy = policyOn();
    expect(mitigatedSodRuleIds(policy).has("rule-vendor-create-pay")).toBe(true);
    policy.rules = policy.rules.map((r) => ({ ...r, enabled: false }));
    expect(mitigatedSodRuleIds(policy).size).toBe(0);
    expect(mitigatedSodRuleIds({ ...policyOn(), enabled: false }).size).toBe(0);
  });
});

describe("mergeDualReleasePolicy", () => {
  it("drops exceptions that cannot be evaluated and repairs malformed fields", () => {
    const merged = mergeDualReleasePolicy(dental, {
      enabled: true,
      exceptions: [
        // channels: null used to crash dualReleaseCoverage on e.channels.length
        {
          id: "x1",
          label: "Null channels",
          channels: null,
          action: "waive_dual",
          enabled: true,
          reason: "",
          createdAt: "2026-01-01",
        },
        {
          id: "x2",
          channels: ["ach", "bogus"],
          action: "raise_threshold",
          thresholdUsd: -5,
          enabled: "yes",
          amountMaxUsd: Infinity,
          effectiveFrom: "next week",
        },
        { id: "", channels: [], action: "waive_dual", enabled: true },
        { id: "x4", channels: [], action: "not-an-action", enabled: true },
        "not an object",
      ] as unknown as DualReleasePolicy["exceptions"],
    });
    expect(merged.exceptions.map((e) => e.id)).toEqual(["x1", "x2"]);
    expect(merged.exceptions[0].channels).toEqual([]);
    expect(merged.exceptions[1]).toMatchObject({
      channels: ["ach"],
      thresholdUsd: 0,
      enabled: false,
      label: "",
      reason: "",
    });
    expect(merged.exceptions[1].amountMaxUsd).toBeUndefined();
    expect(merged.exceptions[1].effectiveFrom).toBeUndefined();
    expect(() => dualReleaseCoverage(merged)).not.toThrow();
  });

  it("applies rule overrides field by field and keeps template-owned fields", () => {
    const base = defaultDualReleasePolicy(dental);
    const ach = base.rules.find((r) => r.channel === "ach")!;
    const merged = mergeDualReleasePolicy(dental, {
      rules: [
        {
          channel: "ach",
          thresholdUsd: "lots",
          enabled: "no",
          mitigatesRuleIds: ["rule-fake"],
          firstApproverRoles: ["Owner / Dentist", 7],
        },
        { channel: "ghost", enabled: true },
        null,
      ] as unknown as DualReleasePolicy["rules"],
    });
    const mergedAch = merged.rules.find((r) => r.channel === "ach")!;
    expect(mergedAch.thresholdUsd).toBe(ach.thresholdUsd);
    expect(mergedAch.enabled).toBe(ach.enabled);
    expect(mergedAch.mitigatesRuleIds).toEqual(ach.mitigatesRuleIds);
    expect(mergedAch.firstApproverRoles).toEqual(["Owner / Dentist"]);
    expect(merged.rules.map((r) => r.channel)).toEqual(base.rules.map((r) => r.channel));
  });
});

describe("mitigatedSodRuleIds with a team", () => {
  it("narrows nothing when nobody on the team can second a distinct initiator", () => {
    const dental = getIndustryTemplate("dental");
    const policy = { ...defaultDualReleasePolicy(dental), enabled: true };
    expect(mitigatedSodRuleIds(policy).size).toBeGreaterThan(0);
    const solo = { ...dental, people: [{ ...dental.people[0], role: "Owner", active: true }] };
    expect(mitigatedSodRuleIds(policy, solo).size).toBe(0);
    expect(mitigatedSodRuleIds(policy, dental).size).toBeGreaterThan(0);
  });
});

describe("what a two-person deposit count narrows", () => {
  it("narrows deposit preparation with posting, not collecting with posting or posting with reconciling", () => {
    const ids = mitigatedSodRuleIds(policyOn(), dental);
    expect(ids.has("rule-deposit-post")).toBe(true);
    const deposit = policyOn().rules.find((r) => r.channel === "deposit")!;
    expect(deposit.mitigatesRuleIds).toEqual(["rule-deposit-post"]);
  });

  it("applies the narrower list to a policy saved before the change", () => {
    const saved = policyOn();
    saved.rules = saved.rules.map((r) =>
      r.channel === "deposit"
        ? { ...r, mitigatesRuleIds: ["rule-collect-post", "rule-deposit-post", "rule-cash-rec"] }
        : r,
    );
    const merged = mergeDualReleasePolicy(dental, saved);
    expect(merged.rules.find((r) => r.channel === "deposit")!.mitigatesRuleIds).toEqual([
      "rule-deposit-post",
    ]);
  });
});

describe("dual-release seats for a team that says what each person does", () => {
  const person = (id: string, name: string, role: string, duties: string[]) => ({
    id,
    name,
    role,
    active: true,
    entitlements: [...duties, "view_reports_only"],
  });
  const construction = {
    ...dental,
    people: [
      person("o", "Owner Person", "Owner / President", ["approve_payroll", "approve_vendor"]),
      person("c", "Carol Whitfield", "Controller - Part Time", [
        "sign_checks",
        "release_payment",
        "bank_reconcile",
      ]),
      person("r", "Ramon Vasquez", "Project Manager", []),
      person("g", "Grace Kim", "Bookkeeper (Contract)", ["enter_invoices", "release_payment"]),
    ],
  };

  it("lets the check signer start a check and the owner second it", () => {
    const policy = defaultDualReleasePolicy(construction, {
      ...dental.staffComposition,
      dualControlPayments: true,
    });
    const seats = listEligibleApprovers(construction, policy, "check");
    const carol = seats.find((p) => p.id === "c")!;
    expect(carol.canInitiate).toBe(true);
    expect(carol.canSecond).toBe(true);
    expect(seats.find((p) => p.id === "g")?.canInitiate).toBe(true);
    expect(seats.find((p) => p.id === "o")?.canSecond).toBe(true);
  });

  it("gives a project manager with no money duties no seat on any channel", () => {
    const policy = defaultDualReleasePolicy(construction, {
      ...dental.staffComposition,
      dualControlPayments: true,
    });
    for (const channel of [
      "ach",
      "check",
      "deposit",
      "payroll",
      "writeoff",
      "vendor_new",
    ] as const) {
      expect(listEligibleApprovers(construction, policy, channel).some((p) => p.id === "r")).toBe(
        false,
      );
    }
  });

  it("lists the people who may second, not title keywords, in a blocked release", () => {
    const policy = defaultDualReleasePolicy(construction, {
      ...dental.staffComposition,
      dualControlPayments: true,
    });
    const result = evaluateRelease(construction, policy, {
      channel: "check",
      amountUsd: 5000,
      initiatorPersonId: "c",
      secondPersonId: "r",
      asOfDate: "2026-01-15",
    });
    expect(result.status).toBe("blocked_role");
    expect(result.nextSteps.join(" ")).toMatch(/Owner Person \(Owner \/ President\)/);
    expect(result.nextSteps.join(" ")).not.toMatch(/Project Manager/);
  });

  it("keeps the sample team seated by its role lists", () => {
    const seats = listEligibleApprovers(dental, policyOn(), "ach");
    expect(seats.find((p) => p.id === officeManager)?.canInitiate).toBe(true);
    expect(seats.some((p) => p.id === hygienist)).toBe(false);
  });
});
