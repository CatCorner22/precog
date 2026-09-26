import { describe, expect, it } from "vitest";
import { resolveTemplate } from "../active-template";
import { defaultDualReleasePolicy } from "../controls/dual-release";
import { recommendedStepsForRules } from "../evidence";
import { detectSodConflicts } from "../sod/detect";
import type { Person } from "../types";
import {
  CONTROL_DUTIES,
  closingSteps,
  dualReleaseLine,
  findingsAnswered,
  gapBadge,
  ownerHeldPairs,
  rankFirstSteps,
  type OpenFinding,
} from "./first-steps";

/** The clinic reviewers set up: a contract bookkeeper, two front-desk staff, a practice manager. */
const clinic: OpenFinding[] = [
  {
    ruleId: "rule-vendor-create-pay",
    entitlementA: "create_vendor",
    entitlementB: "release_payment",
  },
  { ruleId: "rule-collect-post", entitlementA: "collect_cash", entitlementB: "post_payments" },
  {
    ruleId: "family-custody-reconciliation",
    entitlementA: "bank_reconcile",
    entitlementB: "prepare_deposit",
  },
];

describe("rankFirstSteps", () => {
  it("puts the controls that answer this business's findings ahead of pool-wide counts", () => {
    const steps = recommendedStepsForRules(clinic.map((f) => f.ruleId));
    const answers = (id: (typeof steps)[number]["control"]["id"]) => findingsAnswered(id, clinic);
    // Across the whole case pool, a control that answers none of this
    // clinic's findings sits above one that answers some (case count only).
    const firstIdle = steps.findIndex((s) => answers(s.control.id) === 0);
    const lastUseful = steps.map((s) => answers(s.control.id) > 0).lastIndexOf(true);
    expect(firstIdle).toBeGreaterThanOrEqual(0);
    expect(firstIdle).toBeLessThan(lastUseful);
    const ranked = rankFirstSteps(steps, clinic);
    // After ranking, every control that answers a finding comes first.
    const firstZero = ranked.findIndex((s) => s.answers === 0);
    expect(firstZero).toBeGreaterThan(0);
    for (const s of ranked.slice(0, firstZero)) expect(s.answers).toBeGreaterThan(0);
    for (const s of ranked.slice(firstZero)) expect(s.answers).toBe(0);
    expect(ranked[0].answers).toBe(Math.max(...ranked.map((s) => s.answers)));
    // Within the same number of findings answered, more cases first.
    for (let i = 1; i < ranked.length; i++) {
      if (ranked[i - 1].answers === ranked[i].answers) {
        expect(ranked[i - 1].supportingCaseIds.length).toBeGreaterThanOrEqual(
          ranked[i].supportingCaseIds.length,
        );
      }
    }
  });

  it("answers a finding when a control watches either duty of the pair", () => {
    expect(findingsAnswered("new-payee-review", clinic)).toBe(1);
    expect(findingsAnswered("independent-bank-reconciliation", clinic)).toBe(3);
    expect(findingsAnswered("card-statement-line-review", clinic)).toBe(0);
    expect(Object.keys(CONTROL_DUTIES).length).toBe(37);
  });

  it("lets the card-statement review and receipt controls answer a company card finding", () => {
    const card: OpenFinding[] = [
      {
        ruleId: "rule-card-review",
        entitlementA: "hold_company_card",
        entitlementB: "review_card_statement",
      },
      {
        ruleId: "rule-card-approve",
        entitlementA: "approve_expenses",
        entitlementB: "hold_company_card",
      },
    ];
    expect(findingsAnswered("card-statement-line-review", card)).toBe(2);
    expect(findingsAnswered("receipt-and-second-approval", card)).toBe(2);
    expect(findingsAnswered("gift-card-purchases-controlled", card)).toBe(2);
    expect(findingsAnswered("no-self-approval", card)).toBe(1);
    expect(findingsAnswered("positive-pay", card)).toBe(0);
    const ranked = rankFirstSteps(recommendedStepsForRules(["rule-card-review"]), card);
    expect(ranked[0].control.id).toBe("card-statement-line-review");
  });
});

describe("dual-release wording", () => {
  const tpl = resolveTemplate({ industry: "dental" });
  const off = defaultDualReleasePolicy(tpl, {
    ...tpl.staffComposition,
    dualControlPayments: false,
  });
  const on = { ...off, enabled: true };

  it("quotes the live policy's thresholds, never a template's", () => {
    expect(dualReleaseLine(on, "rule-vendor-create-pay")).toBe(
      "Your dual-release policy requires a second person on ACH / vendor electronic pay above $500; Paper checks above $500; New vendor master at every amount",
    );
    expect(dualReleaseLine(off, "rule-vendor-create-pay")).toMatch(
      /^Dual release is off for this in your policy/,
    );
    expect(dualReleaseLine(on, "rule-sign-rec")).toBeNull();
    const closes = closingSteps(
      [
        "Dual release on payments > $1,000",
        "Owner signs new vendor form",
        "Dual-release policy active on related channel",
      ],
      on,
      "rule-vendor-create-pay",
    );
    expect(closes.join(" ")).not.toContain("$1,000");
    expect(closes).toContain("Owner signs new vendor form");
    expect(closes[closes.length - 1]).toMatch(/above \$500/);
    // A control the owner already has is done, not a step to take.
    const withReview = closingSteps(
      ["Owner opens the bank statement first", "The CFO reviews each reconciliation"],
      off,
      "rule-release-rec",
      ["The CFO reviews each reconciliation"],
    );
    expect(withReview).toEqual(["Owner opens the bank statement first"]);
  });

  it("drops the severity badge once dual release covers the gap", () => {
    expect(gapBadge({ severity: "critical", dualReleaseMitigated: false }, undefined)).toBe(
      "Fix first",
    );
    expect(gapBadge({ severity: "critical", dualReleaseMitigated: true }, undefined)).toBe(
      "Covered by dual release",
    );
    expect(gapBadge({ severity: "critical", dualReleaseMitigated: true }, 500)).toBe(
      "Reduced, not closed",
    );
  });
});

describe("ownerHeldPairs", () => {
  it("lists the owner's own pairs with the outside-reader suggestion", () => {
    const people: Person[] = [
      {
        id: "own-1",
        name: "Lena Park",
        role: "Owner / Principal",
        active: true,
        entitlements: ["collect_cash", "bank_reconcile", "view_reports_only"],
      },
      {
        id: "own-2",
        name: "Ben Ochoa",
        role: "Bookkeeper",
        active: true,
        entitlements: ["create_vendor", "release_payment", "view_reports_only"],
      },
    ];
    const tpl = resolveTemplate({ industry: "general", customPeople: people });
    const pairs = ownerHeldPairs(detectSodConflicts(tpl).conflicts);
    expect(pairs.length).toBeGreaterThan(0);
    expect(pairs.every((p) => p.personName === "Lena Park")).toBe(true);
    expect(pairs[0].suggestion).toBe(
      "An outside bookkeeper or accountant reads the bank statement and the payroll register each month",
    );
  });
});
