import { describe, expect, it } from "vitest";
import { CONTROL_CATALOG } from "../evidence/controls";
import { DEFAULT_RISK_VARIABLES } from "../scoring/dynamic-variables";
import { DEFAULT_WEIGHTS } from "../scoring/weights";
import {
  SETUP_QUESTIONS,
  UNANSWERED,
  answeredSummary,
  normalizeAnsweredQuestions,
  dutiesOffTeam,
  hiddenDuties,
  normalizeSetupAnswers,
  setupEffects,
  setupInPlaceControls,
} from "./setup-answers";

describe("setup answer normalization", () => {
  it("rejects values that are not answer objects", () => {
    expect(normalizeSetupAnswers(null)).toBeUndefined();
    expect(normalizeSetupAnswers("yes")).toBeUndefined();
    expect(normalizeSetupAnswers([])).toBeUndefined();
  });

  it("fills partial answers with unsure", () => {
    expect(normalizeSetupAnswers({ cashOrChecks: "yes" })).toEqual({
      ...UNANSWERED,
      cashOrChecks: "yes",
    });
  });

  it("normalizes unknown answer values to unsure", () => {
    expect(
      normalizeSetupAnswers({
        cashOrChecks: "maybe",
        payroll: "outsourced",
        bankRec: "someone",
        dailyTakings: "over-a-million",
      }),
    ).toMatchObject({
      cashOrChecks: "unsure",
      payroll: "unsure",
      bankRec: "unsure",
      dailyTakings: "unsure",
    });
  });
});

describe("duties and controls from setup answers", () => {
  it("excludes duties explicitly placed outside the team or not done", () => {
    expect(dutiesOffTeam({ ...UNANSWERED, bankRec: "outside" })).toEqual(
      new Set(["bank_reconcile"]),
    );
    expect(dutiesOffTeam({ ...UNANSWERED, bankRec: "nobody" })).toEqual(new Set());
    expect(dutiesOffTeam({ ...UNANSWERED, payroll: "none" })).toEqual(
      new Set(["enter_payroll", "approve_payroll"]),
    );
    expect(dutiesOffTeam({ ...UNANSWERED, cashOrChecks: "no" })).toEqual(
      new Set(["collect_cash", "prepare_deposit"]),
    );
    expect(dutiesOffTeam(undefined)).toEqual(new Set());
  });

  it("hides only the duty groups explicitly reported absent", () => {
    expect(hiddenDuties({ ...UNANSWERED, cashOrChecks: "no" })).toEqual(
      new Set(["collect_cash", "prepare_deposit"]),
    );
    expect(hiddenDuties({ ...UNANSWERED, companyCard: "no" })).toEqual(
      new Set(["hold_company_card"]),
    );
    expect(hiddenDuties({ ...UNANSWERED, refunds: "no" })).toEqual(
      new Set(["issue_refunds", "approve_writeoffs"]),
    );
    expect(hiddenDuties({ ...UNANSWERED, payroll: "none" })).toEqual(
      new Set(["enter_payroll", "approve_payroll"]),
    );
    expect(hiddenDuties({ ...UNANSWERED, bankRec: "outside" })).toEqual(
      new Set(["bank_reconcile"]),
    );
    expect(hiddenDuties({ ...UNANSWERED, bankRec: "nobody" })).toEqual(new Set(["bank_reconcile"]));
    expect(hiddenDuties({ ...UNANSWERED, payroll: "provider" })).toEqual(new Set());
    expect(hiddenDuties(UNANSWERED)).toEqual(new Set());
  });

  it("maps affirmative in-place answers to catalog controls", () => {
    const inPlace = setupInPlaceControls({
      ...UNANSWERED,
      ownerReadsStatement: "yes",
      bankRec: "outside",
      bankSecondApproval: "yes",
      backgroundChecks: "yes",
    });
    expect(inPlace).toEqual(
      new Set([
        "owner-opens-bank-statement",
        "independent-bank-reconciliation",
        "dual-release-above-threshold",
        "background-check-money-handlers",
      ]),
    );
    expect(CONTROL_CATALOG["owner-opens-bank-statement"].id).toBe("owner-opens-bank-statement");
    expect(setupInPlaceControls(undefined)).toEqual(new Set());
  });
});

describe("setup answer effects", () => {
  it("uses board-member wording for nonprofits and scoring weights for intensity", () => {
    const effects = setupEffects(
      {
        ...UNANSWERED,
        ownerReadsStatement: "yes",
        dailyTakings: "5k-20k",
      },
      "nonprofit",
    );
    expect(effects.changed).toContain(
      "A board member opens and reads the bank statement each month.",
    );
    const referenceUsd = DEFAULT_WEIGHTS.likelihood.cashReferenceUsd;
    const intensity = Math.min(3, Math.max(0.5, 10000 / referenceUsd));
    expect(effects.changed).toContain(
      `About $10,000 comes in on a typical day. Precog scales cash-scheme figures by ×${intensity.toFixed(2)} against its $${referenceUsd.toLocaleString("en-US")} reference day (the most Precog applies).`,
    );
    const lowerBand = setupEffects({ ...UNANSWERED, dailyTakings: "under-1k" }, "general");
    expect(lowerBand.changed).toContain(
      `About $500 comes in on a typical day. Precog scales cash-scheme figures by ×0.50 against its $${referenceUsd.toLocaleString("en-US")} reference day (the least Precog applies).`,
    );
  });

  it("explains every unsure field, the unchanged defaults, and the knowledge-register premise", () => {
    const effects = setupEffects(UNANSWERED, "general");
    expect(effects.changed).toEqual([]);
    expect(effects.assumed).toHaveLength(13);
    expect(effects.assumed).toContain(
      `Precog assumes $${DEFAULT_RISK_VARIABLES.dailyCashExposure.toLocaleString("en-US")} in daily takings because you answered Not sure.`,
    );
    expect(effects.assumed).toContain(
      "Precog keeps cash and paper-check duties on the team list because you answered Not sure.",
    );
    expect(effects.assumed).toContain(
      "Precog treats payroll as in-house because you answered Not sure.",
    );
    expect(effects.assumed).toContain(
      "Precog reads bank reconciliation from the person marked with that duty because you answered Not sure.",
    );
    expect(
      effects.assumed.slice(0, -2).every((line) => line.endsWith("because you answered Not sure.")),
    ).toBe(true);
    expect(effects.assumed.slice(-2)).toEqual([
      "Precog did not ask about insurance. Precog treats it as unverified until you add a policy.",
      'Precog did not ask who can cover each duty. "Who knows what" starts with the sample list and no one assigned.',
    ]);
    expect(effects.assumed.filter((line) => line.includes("does not count"))).toHaveLength(5);
  });
});

describe("unanswered money questions", () => {
  it("read exactly as Not sure for the engines, and say they were not answered", () => {
    const left = setupEffects(UNANSWERED, "general", []);
    const notSure = setupEffects(UNANSWERED, "general", SETUP_QUESTIONS);
    expect(left.changed).toEqual(notSure.changed);
    expect(notSure).toEqual(setupEffects(UNANSWERED, "general"));
    expect(left.assumed).toHaveLength(notSure.assumed.length);
    expect(left.assumed).toContain("Precog treats payroll as in-house because you did not answer.");
    expect(notSure.assumed).toContain(
      "Precog treats payroll as in-house because you answered Not sure.",
    );
    expect(answeredSummary(UNANSWERED, [])).toEqual({ answered: 0, shown: 11 });
    expect(
      answeredSummary({ ...UNANSWERED, cashOrChecks: "no" }, ["cashOrChecks", "cameras"]),
    ).toEqual({ answered: 1, shown: 10 });
    expect(normalizeAnsweredQuestions(["payroll", "nope", "payroll", 3])).toEqual(["payroll"]);
    expect(normalizeAnsweredQuestions("payroll")).toEqual([]);
  });
});
