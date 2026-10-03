import { describe, expect, it } from "vitest";
import { resolveTemplate } from "@/lib/precog/active-template";
import { buildOwnTeam, ownBusinessProfile } from "@/lib/precog/onboarding/own-team";
import { defaultProfile, type PracticeProfile } from "@/lib/precog/practice-profile";
import { buildWeeklyActions } from "./build";
import { buildThreatAssessment } from "@/lib/precog/threat-scoring";
import { nonprofitLeaderPeople } from "@/test/nonprofit-leader-team";

function bankRecActionOf(profile: PracticeProfile) {
  const tpl = resolveTemplate(profile);
  const actions = buildWeeklyActions({
    tpl,
    staff: profile.staff,
    dualRelease: profile.dualRelease,
    today: "2026-09-23",
  });
  return actions.find((a) => a.id === "bank-rec");
}

function bankRecAction(rows: Parameters<typeof buildOwnTeam>[0]) {
  const profile = ownBusinessProfile(defaultProfile("retail"), {
    practiceName: "Test Store",
    people: buildOwnTeam(rows),
  });
  return { profile, action: bankRecActionOf(profile) };
}

const BOARD_TITLE = "Have a board member read the bank statement each month";
const BOARD_WHY =
  "A board member sees the bank's record without going through the person who posts payments — catches errors and diverted payments early.";

describe("the bank-reconciliation action", () => {
  it("asks for a separate reader when the owner signs checks and reconciles", () => {
    const { profile, action } = bankRecAction([
      { name: "Olive Owner", role: "Owner", duties: ["sign_checks", "bank_reconcile"] },
      { name: "Ben Cole", role: "Office Manager", duties: ["post_payments", "prepare_deposit"] },
      { name: "Cal Diaz", role: "Cashier", duties: ["collect_cash"] },
    ]);
    expect(profile.staff.independentBankRec).toBe(false);
    expect(action?.title).toBe("Have someone outside the books read the bank statement each month");
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

  it("asks a nonprofit for a board member, because its reconciling leader is not an owner", () => {
    // The leader carries no owner mark and reads as the owner by title alone;
    // the line of business says the nonprofit has none, so the reader outside
    // the books is a board member, not an owner who starts reconciling.
    const profile = ownBusinessProfile(defaultProfile("nonprofit"), {
      practiceName: "Riverbend Food Bank",
      people: nonprofitLeaderPeople(),
    });
    expect(profile.staff.independentBankRec).toBe(false);
    const action = bankRecActionOf(profile);
    expect(action?.title).toBe(BOARD_TITLE);
    expect(action?.why).toBe(BOARD_WHY);
  });

  it("asks the nonprofit sample for a board member, at the owner action's rank and evidence", () => {
    const sample = defaultProfile("nonprofit");
    expect(sample.staff.independentBankRec).toBe(false);
    const action = bankRecActionOf(sample);
    expect(action?.title).toBe(BOARD_TITLE);
    expect(action?.why).toBe(BOARD_WHY);
    // Only the words change: id, effort, tab, priority and the cases behind
    // it are the owner action's, so no count or ranking moves.
    const owner = bankRecActionOf(defaultProfile("retail"));
    expect(owner?.title).toBe("Start owner weekly bank reconciliation");
    expect({ ...action, title: owner?.title, why: owner?.why }).toEqual(owner);
  });

  it("keeps the owner wording on every other sample", () => {
    for (const industry of ["retail", "dental", "restaurant", "general"] as const) {
      expect(bankRecActionOf(defaultProfile(industry))?.title).toBe(
        "Start owner weekly bank reconciliation",
      );
    }
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
