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
