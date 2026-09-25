import { describe, expect, it } from "vitest";
import { resolveTemplate } from "@/lib/precog/active-template";
import { buildOwnTeam, ownBusinessProfile } from "@/lib/precog/onboarding/own-team";
import { defaultProfile } from "@/lib/precog/practice-profile";
import { buildWeeklyActions } from "./build";
import { buildThreatAssessment } from "@/lib/precog/threat-scoring";

function bankRecAction(rows: Parameters<typeof buildOwnTeam>[0]) {
  const profile = ownBusinessProfile(defaultProfile("retail"), {
    practiceName: "Test Store",
    people: buildOwnTeam(rows),
  });
  const tpl = resolveTemplate(profile);
  const actions = buildWeeklyActions({
    tpl,
    staff: profile.staff,
    dualRelease: profile.dualRelease,
    today: "2026-09-23",
  });
  return { profile, action: actions.find((a) => a.id === "bank-rec") };
}

describe("the bank-reconciliation action", () => {
  it("does not appear when the owner signs checks and reconciles while employees hold the money", () => {
    const { profile, action } = bankRecAction([
      { name: "Olive Owner", role: "Owner", duties: ["sign_checks", "bank_reconcile"] },
      { name: "Ben Cole", role: "Office Manager", duties: ["post_payments", "prepare_deposit"] },
      { name: "Cal Diaz", role: "Cashier", duties: ["collect_cash"] },
    ]);
    expect(profile.staff.independentBankRec).toBe(true);
    expect(action).toBeUndefined();
  });

  it("asks for an outside reader, not a start, when the owner reconciles and records", () => {
    const { action } = bankRecAction([
      {
        name: "Olive Owner",
        role: "Owner",
        duties: ["collect_cash", "post_payments", "bank_reconcile"],
      },
    ]);
    expect(action?.title).toBe("Have someone outside the books read the bank statement each month");
  });

  it("asks the owner to start reconciling when an employee reconciles the money they post", () => {
    const { action } = bankRecAction([
      { name: "Olive Owner", role: "Owner", duties: ["approve_payroll"] },
      { name: "Ben Cole", role: "Bookkeeper", duties: ["post_payments", "bank_reconcile"] },
    ]);
    expect(action?.title).toBe("Start owner weekly bank reconciliation");
  });
});

describe("a one-person business", () => {
  it("is not told to turn on dual control or split duties with nobody", () => {
    const profile = ownBusinessProfile(defaultProfile("retail"), {
      practiceName: "Solo Shop",
      people: buildOwnTeam([
        {
          name: "Olive Owner",
          role: "Owner",
          duties: ["collect_cash", "post_payments", "release_payment", "bank_reconcile"],
        },
      ]),
    });
    const tpl = resolveTemplate(profile);
    const ids = buildWeeklyActions({
      tpl,
      staff: profile.staff,
      dualRelease: profile.dualRelease,
      today: "2026-09-23",
    }).map((a) => a.id);
    expect(ids).not.toContain("dual-control");
    expect(ids.some((id) => id.startsWith("sod-"))).toBe(false);
    const threat = buildThreatAssessment({
      tpl,
      practiceName: profile.practiceName,
      staff: profile.staff,
      riskVariables: profile.riskVariables,
      dualRelease: profile.dualRelease,
    });
    expect(threat.targetDeck.some((t) => t.kind === "sod")).toBe(false);
  });
});
