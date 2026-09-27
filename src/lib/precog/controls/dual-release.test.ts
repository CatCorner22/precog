import { getIndustryTemplate } from "../templates";
import { describe, expect, it, vi } from "vitest";
import {
  activeExceptionSummary,
  defaultDualReleasePolicy,
  dualReleaseCoverage,
  evaluateRelease,
  listEligibleApprovers,
  mergeDualReleasePolicy,
  mitigatedSodRuleIds,
  staffFlagsFromDualRelease,
  type DualReleasePolicy,
  type ThresholdException,
} from "./dual-release";

const dental = getIndustryTemplate("dental");
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
      const tpl = getIndustryTemplate(id);
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

describe("evaluateRelease edge cases", () => {
  it("tells a channel that is off apart from a policy that is off", () => {
    const policy = policyOn();
    policy.rules = policy.rules.map((r) =>
      r.channel === "payroll" ? { ...r, enabled: false } : r,
    );
    const payrollRule = policy.rules.find((r) => r.channel === "payroll")!;
    const r = evaluateRelease(dental, policy, {
      channel: "payroll",
      amountUsd: 10,
      initiatorPersonId: officeManager,
    });
    expect(r.status).toBe("blocked_channel_off");
    expect(r.reasons[0]).toContain(payrollRule.label);
    expect(r.reasons[0]).not.toContain('"payroll"');
    expect(r.controlCredit.dualControlPayments).toBe(false);
  });

  it("resolves two equally specific exceptions to the stricter one, whatever their order", () => {
    const exception = (id: string, action: "waive_dual" | "force_dual") => ({
      id,
      label: id,
      channels: [],
      action,
      enabled: true,
      reason: "test",
      createdAt: "2026-01-01",
    });
    const waive = exception("Waive for payroll week", "waive_dual");
    const force = exception("Always two signers", "force_dual");
    const req = {
      channel: "ach" as const,
      amountUsd: 10,
      initiatorPersonId: officeManager,
      asOfDate: "2026-06-01",
    };
    for (const exceptions of [
      [waive, force],
      [force, waive],
    ]) {
      const r = evaluateRelease(dental, { ...policyOn(), exceptions }, req);
      expect(r.status).toBe("blocked_missing_second");
      expect(r.appliedException?.id).toBe(force.id);
      expect(r.reasons.join(" ")).toContain(`"${waive.label}"`);
    }
  });

  it("uses one display threshold in every outcome", () => {
    const policy = policyOn();
    const ach = policy.rules.find((r) => r.channel === "ach")!;
    const base = { channel: "ach" as const, initiatorPersonId: officeManager };
    const below = evaluateRelease(dental, policy, { ...base, amountUsd: 1 });
    const above = evaluateRelease(dental, policy, { ...base, amountUsd: ach.thresholdUsd + 1 });
    expect(below.thresholdUsd).toBe(ach.thresholdUsd);
    expect(above.thresholdUsd).toBe(ach.thresholdUsd);
    expect(above.eligibleSeconds.some((p) => p.id === officeManager)).toBe(false);
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

describe("exceptions on the owner's calendar day", () => {
  it("keeps an exception active through its last local day after UTC has rolled over", () => {
    vi.useFakeTimers();
    // 6:30 pm in Denver on 30 September is already 1 October in UTC.
    vi.setSystemTime(new Date("2026-10-01T00:30:00Z"));
    try {
      const policy: DualReleasePolicy = {
        ...policyOn(),
        exceptions: [
          {
            id: "ex-last-day",
            label: "Raised threshold through September",
            channels: [],
            action: "raise_threshold",
            thresholdUsd: 25_000,
            enabled: true,
            effectiveTo: "2026-09-30",
            reason: "Quarter-end vendor run",
            createdAt: "2026-09-01",
          },
        ],
      };
      expect(activeExceptionSummary(policy, "2026-09-30").total).toBe(1);
      expect(activeExceptionSummary(policy, "2026-10-01").total).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("evaluateRelease without an as-of date", () => {
  it("uses the owner's local day, not the UTC day", () => {
    const tz = process.env.TZ;
    process.env.TZ = "America/Denver";
    vi.useFakeTimers();
    // 6:30 pm in Denver on 30 September is already 1 October in UTC.
    vi.setSystemTime(new Date("2026-10-01T00:30:00Z"));
    try {
      const policy: DualReleasePolicy = {
        ...policyOn(),
        exceptions: [
          {
            id: "ex-raise-sept",
            label: "Raised threshold through September",
            channels: ["ach"],
            action: "raise_threshold",
            thresholdUsd: 25_000,
            enabled: true,
            effectiveTo: "2026-09-30",
            reason: "Quarter-end vendor run",
            createdAt: "2026-09-01",
          },
        ],
      };
      const r = evaluateRelease(dental, policy, {
        channel: "ach",
        amountUsd: 20_000,
        initiatorPersonId: officeManager,
      });
      expect(r.status).toBe("approved_exception");
      expect(r.appliedException?.id).toBe("ex-raise-sept");
    } finally {
      vi.useRealTimers();
      if (tz === undefined) delete process.env.TZ;
      else process.env.TZ = tz;
    }
  });
});

function exception(fields: Partial<ThresholdException>): ThresholdException {
  return {
    id: "ex-test",
    label: "Test exception",
    channels: [],
    action: "waive_dual",
    enabled: true,
    reason: "Test",
    createdAt: "2026-01-01",
    ...fields,
  };
}

describe("a blanket waive_dual exception", () => {
  const today = "2026-01-15";
  const waived = (fields: Partial<ThresholdException> = {}): DualReleasePolicy => ({
    ...policyOn(),
    exceptions: [exception(fields)],
  });

  it("lets one person release any amount, and the evaluator says the control is not evidence-ready", () => {
    const r = evaluateRelease(dental, waived(), {
      channel: "ach",
      amountUsd: 50_000,
      initiatorPersonId: officeManager,
      asOfDate: today,
    });
    expect(r.status).toBe("approved_exception");
    expect(r.controlCredit.evidenceReady).toBe(false);
  });

  it("narrows no conflict and earns no dual-control credit on the channels it covers", () => {
    expect(mitigatedSodRuleIds(waived(), dental, today).size).toBe(0);
    expect(staffFlagsFromDualRelease(waived(), dental, today).dualControlPayments).toBe(false);
    expect(dualReleaseCoverage(waived(), today).every((c) => !c.covered)).toBe(true);
  });

  it("empties only its own channels", () => {
    const ids = mitigatedSodRuleIds(waived({ channels: ["deposit"] }), dental, today);
    expect(ids.has("rule-deposit-post")).toBe(false);
    expect(ids.has("rule-vendor-create-pay")).toBe(true);
    const coverage = dualReleaseCoverage(waived({ channels: ["deposit"] }), today);
    expect(coverage.find((c) => c.channel === "deposit")!.covered).toBe(false);
    expect(coverage.find((c) => c.channel === "ach")!.covered).toBe(true);
  });

  it("leaves the credit in place when the waiver is scoped, disabled or out of date", () => {
    for (const policy of [
      waived({ payeeContains: "Patterson" }),
      waived({ amountMaxUsd: 200 }),
      waived({ enabled: false }),
      waived({ effectiveTo: "2025-12-31" }),
      waived({ effectiveFrom: "2026-02-01" }),
    ]) {
      expect(mitigatedSodRuleIds(policy, dental, today)).toEqual(
        mitigatedSodRuleIds(policyOn(), dental, today),
      );
      expect(staffFlagsFromDualRelease(policy, dental, today).dualControlPayments).toBe(true);
    }
  });
});

describe("sample teams on the default rules", () => {
  it("seat only the people who run the money", () => {
    for (const id of [
      "dental",
      "retail",
      "professional_services",
      "restaurant",
      "construction",
      "nonprofit",
      "general",
    ] as const) {
      for (const rule of defaultDualReleasePolicy(getIndustryTemplate(id)).rules) {
        for (const role of [...rule.firstApproverRoles, ...rule.secondApproverRoles]) {
          expect(role, `${id}/${rule.channel}`).not.toMatch(
            /project manager|grants|program|development|bar manager|superintendent|estimator|foreman/i,
          );
        }
      }
    }
  });

  it("seats the nonprofit's executive director as a second signer on payments", () => {
    const ach = defaultDualReleasePolicy(getIndustryTemplate("nonprofit")).rules.find(
      (r) => r.channel === "ach",
    )!;
    expect(ach.secondApproverRoles).toContain("Executive Director");
    expect(ach.secondApproverRoles).not.toContain("Grants Manager");
  });
});

describe("seed exceptions", () => {
  it("are dated from the given day and name the sample's own people", () => {
    const now = new Date(2026, 2, 10);
    const policy = defaultDualReleasePolicy(dental, undefined, now);
    expect(policy.exceptions.every((e) => e.createdAt === "2026-03-10")).toBe(true);
    const cover = policy.exceptions.find((e) => e.id === "ex-temp-om-writeoff")!;
    expect(cover.personId).toBe(officeManager);
    expect(cover.approvedByPersonId).toBe(owner);
    expect(defaultDualReleasePolicy(dental, undefined, now)).toEqual(policy);
  });

  it("are never seeded into an owner's own business, even from a saved policy without exceptions", () => {
    const own = { ...dental, people: dental.people.map((p) => ({ ...p })) };
    expect(defaultDualReleasePolicy(own).exceptions).toEqual([]);
    expect(mergeDualReleasePolicy(own, { enabled: true }).exceptions).toEqual([]);
  });
});

describe("dual-control credit for payments", () => {
  const today = "2026-01-15";

  it("needs someone who can second a different person's release", () => {
    const solo = {
      ...dental,
      people: [
        {
          id: "solo",
          name: "Solo Owner",
          role: "Owner",
          active: true,
          entitlements: [
            "release_payment" as const,
            "bank_reconcile" as const,
            "create_vendor" as const,
          ],
        },
      ],
    };
    const policy = { ...defaultDualReleasePolicy(solo), enabled: true };
    expect(mitigatedSodRuleIds(policy, solo, today).size).toBe(0);
    expect(staffFlagsFromDualRelease(policy, solo, today).dualControlPayments).toBe(false);
  });

  it("comes from the payment channels, not a two-person deposit count", () => {
    const depositOnly: DualReleasePolicy = {
      ...policyOn(),
      rules: policyOn().rules.map((r) => ({ ...r, enabled: r.channel === "deposit" })),
    };
    expect(staffFlagsFromDualRelease(depositOnly, dental, today).dualControlPayments).toBe(false);
    expect([...mitigatedSodRuleIds(depositOnly, dental, today)]).toEqual(["rule-deposit-post"]);
    expect(staffFlagsFromDualRelease(policyOn(), dental, today).dualControlPayments).toBe(true);
  });
});

describe("channel cards and the exception summary", () => {
  it("agree that an expired exception is not active", () => {
    const policy: DualReleasePolicy = {
      ...policyOn(),
      exceptions: [
        exception({
          action: "raise_threshold",
          thresholdUsd: 900,
          channels: ["ach"],
          effectiveTo: "2020-12-31",
        }),
      ],
    };
    const today = "2026-01-15";
    expect(
      dualReleaseCoverage(policy, today).find((c) => c.channel === "ach")!.activeExceptions,
    ).toBe(0);
    expect(activeExceptionSummary(policy, today).total).toBe(0);
  });
});

describe("force_dual and lower_threshold exceptions", () => {
  const today = "2026-01-15";

  it("force_dual blocks a $1 release that has no second signer and reports a $0 threshold", () => {
    const policy: DualReleasePolicy = {
      ...policyOn(),
      exceptions: [exception({ action: "force_dual", channels: ["ach"] })],
    };
    const r = evaluateRelease(dental, policy, {
      channel: "ach",
      amountUsd: 1,
      initiatorPersonId: officeManager,
      asOfDate: today,
    });
    expect(r.status).toBe("blocked_missing_second");
    expect(r.dualForced).toBe(true);
    expect(r.dualWaived).toBe(false);
    expect(r.thresholdUsd).toBe(0);
  });

  it("force_dual still approves once a distinct second signs", () => {
    const policy: DualReleasePolicy = {
      ...policyOn(),
      exceptions: [exception({ action: "force_dual", channels: ["ach"] })],
    };
    const r = evaluateRelease(dental, policy, {
      channel: "ach",
      amountUsd: 1,
      initiatorPersonId: officeManager,
      secondPersonId: owner,
      asOfDate: today,
    });
    expect(r.status).toBe("approved_dual");
  });

  it("lower_threshold requires a second above the lowered figure and reports it", () => {
    const policy: DualReleasePolicy = {
      ...policyOn(),
      exceptions: [exception({ action: "lower_threshold", thresholdUsd: 100, channels: ["ach"] })],
    };
    const r = evaluateRelease(dental, policy, {
      channel: "ach",
      amountUsd: 250,
      initiatorPersonId: officeManager,
      asOfDate: today,
    });
    expect(r.dualRequired).toBe(true);
    expect(r.thresholdUsd).toBe(100);
    expect(r.baseThresholdUsd).toBe(500);
  });

  it("lower_threshold never raises the base threshold", () => {
    const policy: DualReleasePolicy = {
      ...policyOn(),
      exceptions: [exception({ action: "lower_threshold", thresholdUsd: 9000, channels: ["ach"] })],
    };
    const r = evaluateRelease(dental, policy, {
      channel: "ach",
      amountUsd: 600,
      initiatorPersonId: officeManager,
      asOfDate: today,
    });
    expect(r.dualRequired).toBe(true);
    expect(r.thresholdUsd).toBe(500);
  });

  it("a scoped exception outranks a broader one", () => {
    const policy: DualReleasePolicy = {
      ...policyOn(),
      exceptions: [
        exception({ id: "broad", action: "raise_threshold", thresholdUsd: 5000 }),
        exception({
          id: "scoped",
          action: "force_dual",
          channels: ["ach"],
          personId: officeManager,
        }),
      ],
    };
    const r = evaluateRelease(dental, policy, {
      channel: "ach",
      amountUsd: 50,
      initiatorPersonId: officeManager,
      asOfDate: today,
    });
    expect(r.appliedException?.id).toBe("scoped");
    expect(r.dualForced).toBe(true);
  });

  it("the summary counts each action among the exceptions in force", () => {
    const policy: DualReleasePolicy = {
      ...policyOn(),
      exceptions: [
        exception({ id: "a", action: "force_dual" }),
        exception({ id: "b", action: "waive_dual", payeeContains: "Rent" }),
        exception({
          id: "c",
          action: "raise_threshold",
          thresholdUsd: 900,
          effectiveTo: "2026-02-01",
        }),
        exception({ id: "d", action: "raise_threshold", thresholdUsd: 900, enabled: false }),
      ],
    };
    expect(activeExceptionSummary(policy, today)).toEqual({
      total: 3,
      raises: 1,
      forceDual: 1,
      waives: 1,
      expiringSoon: 1,
    });
  });
});
