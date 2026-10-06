import { describe, expect, it } from "vitest";
import { defaultProfile } from "@/lib/precog/practice-profile";
import { withDualRelease } from "@/lib/precog/profile-actions";
import {
  dualReleaseCoverage,
  staffFlagsFromDualRelease,
  type DualReleasePolicy,
} from "@/lib/precog/controls/dual-release";
import {
  datesReversed,
  EMPTY_EXCEPTION_FORM,
  exceptionDecision,
  exceptionFromForm,
  policyDecision,
  withMasterSwitch,
} from "./dual-release-panel-actions";

const NOW = new Date("2026-09-25T10:00:00Z");

function onlyPayroll(policy: DualReleasePolicy): DualReleasePolicy {
  return {
    ...policy,
    rules: policy.rules.map((r) => ({ ...r, enabled: r.channel === "payroll" })),
  };
}

describe("withMasterSwitch", () => {
  it("credits dual control on payments only when the ACH or deposit channel is on", () => {
    let p = defaultProfile("dental");
    p = withDualRelease(p, onlyPayroll({ ...p.dualRelease, enabled: true }), NOW);
    p = withDualRelease(p, withMasterSwitch(p.dualRelease, false), NOW);
    p = withDualRelease(p, withMasterSwitch(p.dualRelease, true), NOW);
    expect(p.dualRelease.enabled).toBe(true);
    expect(staffFlagsFromDualRelease(p.dualRelease).dualControlPayments).toBe(false);
    expect(p.staff.dualControlPayments).toBe(false);
    expect(p.riskVariables.hasDualControl).toBe(false);
  });

  it("turns the credit on with the policy when the ACH channel is on", () => {
    let p = defaultProfile("dental");
    p = withDualRelease(p, withMasterSwitch(p.dualRelease, true), NOW);
    expect(p.staff.dualControlPayments).toBe(true);
    expect(p.riskVariables.hasDualControl).toBe(true);
  });
});

describe("exceptionFromForm", () => {
  const stamp = { id: "ex_1", createdAt: "2026-09-25", approvedByPersonId: null };

  it("waits for a label and a reason", () => {
    expect(exceptionFromForm({ ...EMPTY_EXCEPTION_FORM, label: "Lab" }, stamp)).toBeNull();
    expect(exceptionFromForm({ ...EMPTY_EXCEPTION_FORM, reason: "Why" }, stamp)).toBeNull();
  });

  it("saves no exception whose end date is before its start date", () => {
    const form = { ...EMPTY_EXCEPTION_FORM, label: "Lab", reason: "Monthly invoice" };
    const reversed = { ...form, from: "2026-11-01", to: "2026-10-01" };
    expect(datesReversed(reversed)).toBe(true);
    expect(exceptionFromForm(reversed, stamp)).toBeNull();
    for (const ok of [
      { ...form, from: "2026-10-01", to: "2026-10-01" },
      { ...form, from: "2026-10-01", to: "" },
      { ...form, from: "", to: "2026-10-01" },
    ]) {
      expect(datesReversed(ok)).toBe(false);
      expect(exceptionFromForm(ok, stamp)).not.toBeNull();
    }
  });

  it("names the sole owner as approver, and nobody when there is none, never the sample's p1", () => {
    const form = { ...EMPTY_EXCEPTION_FORM, label: "Lab", reason: "Monthly invoice" };
    const none = exceptionFromForm(form, stamp);
    expect(none).not.toBeNull();
    expect(none && "approvedByPersonId" in none).toBe(false);
    const owned = exceptionFromForm(form, { ...stamp, approvedByPersonId: "own-1" });
    expect(owned?.approvedByPersonId).toBe("own-1");
  });

  it("stores an amount band, low end first, and leaves empty bounds out", () => {
    const form = {
      ...EMPTY_EXCEPTION_FORM,
      label: "Small first payments",
      reason: "New payees",
      action: "force_dual" as const,
      amountMin: "499",
      amountMax: "1",
    };
    const ex = exceptionFromForm(form, stamp);
    expect(ex?.amountMinUsd).toBe(1);
    expect(ex?.amountMaxUsd).toBe(499);
    expect(ex?.thresholdUsd).toBeUndefined();
    const open = exceptionFromForm({ ...form, amountMin: "", amountMax: "" }, stamp);
    expect(open && "amountMinUsd" in open).toBe(false);
    expect(open && "amountMaxUsd" in open).toBe(false);
  });

  it("keeps an exception's threshold to the cent, never below $0", () => {
    const form = { ...EMPTY_EXCEPTION_FORM, label: "Lab", reason: "Monthly invoice" };
    expect(exceptionFromForm({ ...form, thresholdUsd: 3500.75 }, stamp)?.thresholdUsd).toBe(
      3500.75,
    );
    expect(
      exceptionFromForm({ ...form, action: "lower_threshold", thresholdUsd: 999.5 }, stamp)
        ?.thresholdUsd,
    ).toBe(999.5);
    expect(exceptionFromForm({ ...form, thresholdUsd: 12.345 }, stamp)?.thresholdUsd).toBe(12.35);
    expect(exceptionFromForm({ ...form, thresholdUsd: -5 }, stamp)?.thresholdUsd).toBe(0);
    expect(exceptionFromForm({ ...form, thresholdUsd: 3500 }, stamp)?.thresholdUsd).toBe(3500);
  });

  it("writes the action's label, not its code, into the journal note", () => {
    const ex = exceptionFromForm(
      { ...EMPTY_EXCEPTION_FORM, label: "Lab", reason: "Monthly", action: "waive_dual" },
      stamp,
    );
    expect(ex).not.toBeNull();
    const decision = exceptionDecision(ex!);
    expect(decision.kind).toBe("accept_residual");
    expect(decision.note).not.toMatch(/_/);
  });
});

describe("policyDecision", () => {
  it("never logs 'enable' while the policy is off", () => {
    const policy = { ...defaultProfile("dental").dualRelease, enabled: false };
    const decision = policyDecision(policy, dualReleaseCoverage(policy), 0, "2026-12-24");
    expect(decision.subject).toBe("Dual release off");
    expect(decision.kind).toBe("accept_residual");
  });

  it("names how many channels an 'on' policy covers", () => {
    const policy = { ...defaultProfile("dental").dualRelease, enabled: true };
    const coverage = dualReleaseCoverage(policy);
    const covered = coverage.filter((c) => c.covered).length;
    const decision = policyDecision(policy, coverage, 1, "2026-12-24");
    expect(decision.subject).toBe(`Dual release on for ${covered} channels`);
    expect(decision.kind).toBe("remediate");
    expect(decision.note).toContain("; 1 active exception.");
  });
});
