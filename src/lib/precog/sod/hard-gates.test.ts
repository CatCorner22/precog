import { describe, expect, it } from "vitest";
import { CONFLICT_RULES, gatedSeverity, hardGate, HARD_GATE_DUTIES } from "./conflict-rules";

describe("hard gates", () => {
  it("name the gate a pair trips, money out before statutory liability", () => {
    expect(hardGate("release_payment", "enter_payroll")).toBe("money_out");
    expect(hardGate("enter_payroll", "bank_reconcile")).toBe("statutory_liability");
    expect(hardGate("collect_cash", "post_payments")).toBeUndefined();
  });

  it("lift every gated named rule to critical and leave the rest alone", () => {
    const gated = new Set(Object.values(HARD_GATE_DUTIES).flat());
    for (const rule of CONFLICT_RULES) {
      const trips = gated.has(rule.a) || gated.has(rule.b);
      expect(gatedSeverity(rule)).toBe(trips ? "critical" : rule.severity);
    }
    const lifted = CONFLICT_RULES.filter((r) => r.severity !== "critical" && hardGate(r.a, r.b));
    expect(lifted.map((r) => r.id).sort()).toEqual([
      "rule-access-release",
      "rule-cash-refund",
      "rule-payroll",
      "rule-payroll-master-release",
      "rule-payroll-master-run",
      "rule-payroll-rec",
      "rule-payroll-release",
      "rule-refund-post",
      "rule-vendor-approve-pay",
    ]);
  });
});

import { INDUSTRIES } from "@/lib/precog/industry";
import { defaultProfile } from "@/lib/precog/practice-profile";
import { resolveTemplate } from "@/lib/precog/active-template";
import { buildStartHereModel } from "@/lib/precog/start-here/model";
import { SEVERITY_RANK } from "./detect";

describe("hard gates lead the ranked lists", () => {
  it("never let a high pair sit above a critical one on Start here", () => {
    for (const { id } of INDUSTRIES) {
      const profile = defaultProfile(id);
      const template = resolveTemplate(profile);
      const model = buildStartHereModel({ profile, template, today: new Date("2026-03-15") });
      const unmitigated = model.exposure.openConflicts.filter((c) => !c.dualReleaseMitigated);
      const ranks = unmitigated.map((c) => SEVERITY_RANK[c.severity]);
      expect(ranks, id).toEqual([...ranks].sort((a, b) => a - b));
      expect(
        unmitigated.some((c) => c.gate && c.severity === "critical"),
        id,
      ).toBe(true);
    }
  });
});
