import type { ControlId } from "../evidence/controls";
import { industryHasOwner, type IndustryId } from "../industry";
import { clamp } from "../number";
import { DEFAULT_RISK_VARIABLES } from "../scoring/dynamic-variables";
import { DEFAULT_WEIGHTS } from "../scoring/weights";
import type { EntitlementId } from "../sod/conflict-rules";

export type Answer = "yes" | "no" | "unsure";

export interface SetupAnswers {
  cashOrChecks: Answer;
  companyCard: Answer;
  refunds: Answer;
  payroll: "in-house" | "provider" | "none" | "unsure";
  bankRec: "team" | "outside" | "nobody" | "unsure";
  dailyTakings: "under-1k" | "1k-5k" | "5k-20k" | "over-20k" | "unsure";
  ownerReadsStatement: Answer;
  bankSecondApproval: Answer;
  cameras: Answer;
  alarm: Answer;
  backgroundChecks: Answer;
}

export const UNANSWERED: SetupAnswers = {
  cashOrChecks: "unsure",
  companyCard: "unsure",
  refunds: "unsure",
  payroll: "unsure",
  bankRec: "unsure",
  dailyTakings: "unsure",
  ownerReadsStatement: "unsure",
  bankSecondApproval: "unsure",
  cameras: "unsure",
  alarm: "unsure",
  backgroundChecks: "unsure",
};

export function normalizeSetupAnswers(value: unknown): SetupAnswers | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const answers = value as Record<string, unknown>;
  return {
    cashOrChecks: answer(answers.cashOrChecks),
    companyCard: answer(answers.companyCard),
    refunds: answer(answers.refunds),
    payroll: member(answers.payroll, ["in-house", "provider", "none", "unsure"]),
    bankRec: member(answers.bankRec, ["team", "outside", "nobody", "unsure"]),
    dailyTakings: member(answers.dailyTakings, [
      "under-1k",
      "1k-5k",
      "5k-20k",
      "over-20k",
      "unsure",
    ]),
    ownerReadsStatement: answer(answers.ownerReadsStatement),
    bankSecondApproval: answer(answers.bankSecondApproval),
    cameras: answer(answers.cameras),
    alarm: answer(answers.alarm),
    backgroundChecks: answer(answers.backgroundChecks),
  };
}

export const DAILY_TAKINGS_USD = {
  "under-1k": 500,
  "1k-5k": 2500,
  "5k-20k": 10000,
  "over-20k": 30000,
} as const;

export function hiddenDuties(a: SetupAnswers): ReadonlySet<EntitlementId> {
  const hidden = new Set<EntitlementId>();
  if (a.cashOrChecks === "no") {
    hidden.add("collect_cash");
    hidden.add("prepare_deposit");
  }
  if (a.companyCard === "no") hidden.add("hold_company_card");
  if (a.refunds === "no") {
    hidden.add("issue_refunds");
    hidden.add("approve_writeoffs");
  }
  if (a.payroll === "none") {
    hidden.add("enter_payroll");
    hidden.add("approve_payroll");
  }
  if (a.bankRec === "outside" || a.bankRec === "nobody") hidden.add("bank_reconcile");
  return hidden;
}

export function setupInPlaceControls(a: SetupAnswers | undefined): ReadonlySet<ControlId> {
  const inPlace = new Set<ControlId>();
  if (!a) return inPlace;
  if (a.ownerReadsStatement === "yes") inPlace.add("owner-opens-bank-statement");
  if (a.bankRec === "outside") inPlace.add("independent-bank-reconciliation");
  if (a.bankSecondApproval === "yes") inPlace.add("dual-release-above-threshold");
  if (a.backgroundChecks === "yes") inPlace.add("background-check-money-handlers");
  return inPlace;
}

export function setupEffects(
  a: SetupAnswers,
  industry: IndustryId,
): { changed: string[]; assumed: string[] } {
  const changed: string[] = [];
  const assumed: string[] = [];
  const statementReader = industryHasOwner(industry) ? "The owner" : "A board member";

  if (a.cashOrChecks === "no")
    changed.push("Cash and paper-check duties are left off because you do not take them.");
  if (a.companyCard === "no")
    changed.push("The company-card duty is left off because nobody uses a company card.");
  if (a.refunds === "no")
    changed.push("Refund and write-off duties are left off because you do not give them.");
  if (a.payroll === "in-house")
    changed.push(
      "Payroll is run in-house, so the people who enter it and approve the run still count.",
    );
  if (a.payroll === "provider")
    changed.push(
      "Payroll uses a provider, but whoever enters hours and whoever approves the run still count.",
    );
  if (a.payroll === "none")
    changed.push("Payroll duties are left off because you do not run payroll.");
  if (a.bankRec === "team")
    changed.push(
      "Bank reconciliation stays with the team, and the person with that duty still counts.",
    );
  if (a.bankRec === "outside")
    changed.push(
      "An outside bookkeeper or CPA reconciles the bank account, and that independent review is counted.",
    );
  if (a.bankRec === "nobody")
    changed.push(
      "Nobody reconciles the bank account, so the bank-reconciliation duty is left off.",
    );
  if (a.dailyTakings !== "unsure") {
    const usd = DAILY_TAKINGS_USD[a.dailyTakings];
    const referenceUsd = DEFAULT_WEIGHTS.likelihood.cashReferenceUsd;
    const rawIntensity = usd / referenceUsd;
    const intensity = clamp(rawIntensity, 0.5, 3);
    const clampNote =
      rawIntensity > 3
        ? " (the most Precog applies)"
        : rawIntensity < 0.5
          ? " (the least Precog applies)"
          : "";
    changed.push(
      `About $${usd.toLocaleString("en-US")} comes in on a typical day, so cash-scheme figures are scaled ×${intensity.toFixed(2)} against Precog's $${referenceUsd.toLocaleString("en-US")} reference day.${clampNote}`,
    );
  }
  if (a.ownerReadsStatement === "yes")
    changed.push(`${statementReader} opens and reads the bank statement each month.`);
  if (a.bankSecondApproval === "yes")
    changed.push(
      "The bank requires a second person to approve payments, so dual release starts on.",
    );
  if (a.cameras === "yes") changed.push("Security cameras are counted as in place.");
  if (a.alarm === "yes") changed.push("An alarm or access-control system is counted as in place.");
  if (a.backgroundChecks === "yes")
    changed.push("Background checks for money handlers are counted as in place.");

  if (a.cashOrChecks === "unsure")
    assumed.push(
      "Cash and paper-check duties stay in the team list because you answered Not sure.",
    );
  if (a.companyCard === "unsure")
    assumed.push("Company-card duties stay in the team list because you answered Not sure.");
  if (a.refunds === "unsure")
    assumed.push(
      "Refund and write-off duties stay in the team list because you answered Not sure.",
    );
  if (a.payroll === "unsure")
    assumed.push("Payroll is treated as run in-house because you answered Not sure.");
  if (a.bankRec === "unsure")
    assumed.push(
      "Bank reconciliation is read from who has the duty ticked because you answered Not sure.",
    );
  if (a.dailyTakings === "unsure")
    assumed.push(
      `Daily takings are assumed to be $${DEFAULT_RISK_VARIABLES.dailyCashExposure.toLocaleString("en-US")} because you answered Not sure.`,
    );
  if (a.ownerReadsStatement === "unsure")
    assumed.push(
      `${statementReader} opening and reading the bank statement is not counted because you answered Not sure.`,
    );
  if (a.bankSecondApproval === "unsure")
    assumed.push("A second bank approval is not counted because you answered Not sure.");
  if (a.cameras === "unsure")
    assumed.push("Security cameras are not counted because you answered Not sure.");
  if (a.alarm === "unsure")
    assumed.push("An alarm or access-control system is not counted because you answered Not sure.");
  if (a.backgroundChecks === "unsure")
    assumed.push(
      "Background checks for money handlers are not counted because you answered Not sure.",
    );

  assumed.push(
    "Insurance was not asked, and Precog treats it as unverified until a policy is added.",
    'Who can cover each duty was not asked yet. "Who knows what" starts from the sample\'s list with nobody assigned.',
  );
  return { changed, assumed };
}

function answer(value: unknown): Answer {
  return value === "yes" || value === "no" || value === "unsure" ? value : "unsure";
}

function member<const T extends readonly string[]>(value: unknown, allowed: T): T[number] {
  return allowed.includes(value as T[number]) ? (value as T[number]) : "unsure";
}
