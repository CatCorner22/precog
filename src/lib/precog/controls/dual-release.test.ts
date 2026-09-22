import { describe, expect, it } from "vitest";
import { getBaseTemplate } from "../active-template";
import {
  defaultDualReleasePolicy,
  evaluateRelease,
  listEligibleApprovers,
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
    for (const id of ["retail", "restaurant", "professional_services", "general"] as const) {
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

    const matched = evaluateRelease(dental, policy, { ...base, payee: "Apex Dental Lab" });
    expect(matched.status).toBe("approved_exception");
    expect(matched.appliedException?.id).toBe(ex.id);
    expect(matched.thresholdUsd).toBe(ex.thresholdUsd);

    const over = evaluateRelease(dental, policy, {
      ...base,
      amountUsd: 4000,
      payee: "Apex Dental Lab",
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
