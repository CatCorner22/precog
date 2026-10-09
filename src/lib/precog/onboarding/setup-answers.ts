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

/** One "How money moves here" question, named by the answer it sets. */
export type SetupQuestion = keyof SetupAnswers;

/** Every money question, in the order the step asks them. */
export const SETUP_QUESTIONS = Object.keys(UNANSWERED) as SetupQuestion[];

/**
 * The questions the step shows for these answers: the camera question goes
 * when no cash or paper checks are taken.
 */
export function shownSetupQuestions(a: SetupAnswers): SetupQuestion[] {
  return SETUP_QUESTIONS.filter((q) => !(q === "cameras" && a.cashOrChecks === "no"));
}

/**
 * The questions the owner chose an answer for, read from a saved draft:
 * known names only, each once. A question the owner left alone keeps the
 * Not sure value, so the engines read it exactly as a Not sure answer; this
 * list only lets the step show it as unanswered.
 */
export function normalizeAnsweredQuestions(value: unknown): SetupQuestion[] {
  if (!Array.isArray(value)) return [];
  return SETUP_QUESTIONS.filter((q) => value.includes(q));
}

/** "N of M answered" for the money step: the shown questions the owner chose an answer for. */
export function answeredSummary(
  a: SetupAnswers,
  answered: readonly SetupQuestion[],
): { answered: number; shown: number } {
  const shown = shownSetupQuestions(a);
  return { answered: shown.filter((q) => answered.includes(q)).length, shown: shown.length };
}

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

/** Duties the setup answers place outside the team (or that the business doesn't do), so an empty seat for them is expected. */
export function dutiesOffTeam(a: SetupAnswers | undefined): ReadonlySet<EntitlementId> {
  const duties = new Set<EntitlementId>();
  if (!a) return duties;
  if (a.payroll === "none") {
    duties.add("enter_payroll");
    duties.add("approve_payroll");
  }
  if (a.bankRec === "outside") duties.add("bank_reconcile");
  if (a.cashOrChecks === "no") {
    duties.add("collect_cash");
    duties.add("prepare_deposit");
  }
  return duties;
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
  answered?: readonly SetupQuestion[],
): { changed: string[]; assumed: string[] } {
  // A question left unanswered reads as Not sure; the reason says which it was.
  const why = (question: SetupQuestion) =>
    answered && !answered.includes(question)
      ? "because you did not answer."
      : "because you answered Not sure.";
  const changed: string[] = [];
  const assumed: string[] = [];
  const statementReader = industryHasOwner(industry) ? "The owner" : "A board member";

  if (a.cashOrChecks === "no")
    changed.push("Precog leaves out cash and paper-check duties because you do not take them.");
  if (a.companyCard === "no")
    changed.push("Precog leaves out the company-card duty because nobody uses a company card.");
  if (a.refunds === "no")
    changed.push("Precog leaves out refund and write-off duties because you do not give them.");
  if (a.payroll === "in-house")
    changed.push(
      "Payroll runs in-house. The people who enter it and approve each run still count.",
    );
  if (a.payroll === "provider")
    changed.push(
      "A provider runs payroll. The people who enter hours and approve each run still count.",
    );
  if (a.payroll === "none")
    changed.push("Precog leaves out payroll duties because you do not run payroll.");
  if (a.bankRec === "team")
    changed.push("Your team reconciles the bank. The person with that duty still counts.");
  if (a.bankRec === "outside")
    changed.push(
      "An outside bookkeeper or CPA reconciles the bank. Precog counts that independent review.",
    );
  if (a.bankRec === "nobody")
    changed.push("Nobody reconciles the bank, so Precog leaves out that duty.");
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
      `About $${usd.toLocaleString("en-US")} comes in on a typical day. Precog scales cash-scheme figures by ×${intensity.toFixed(2)} against its $${referenceUsd.toLocaleString("en-US")} reference day${clampNote}.`,
    );
  }
  if (a.ownerReadsStatement === "yes")
    changed.push(`${statementReader} opens and reads the bank statement each month.`);
  if (a.bankSecondApproval === "yes")
    changed.push(
      "Bank rules require a second person to approve payments. Precog counts dual release as in place.",
    );
  if (a.cameras === "yes") changed.push("Precog counts security cameras as in place.");
  if (a.alarm === "yes")
    changed.push("Precog counts an alarm or access-control system as in place.");
  if (a.backgroundChecks === "yes")
    changed.push("Precog counts background checks for money handlers as in place.");

  if (a.cashOrChecks === "unsure")
    assumed.push(
      `Precog keeps cash and paper-check duties on the team list ${why("cashOrChecks")}`,
    );
  if (a.companyCard === "unsure")
    assumed.push(`Precog keeps company-card duties on the team list ${why("companyCard")}`);
  if (a.refunds === "unsure")
    assumed.push(`Precog keeps refund and write-off duties on the team list ${why("refunds")}`);
  if (a.payroll === "unsure") assumed.push(`Precog treats payroll as in-house ${why("payroll")}`);
  if (a.bankRec === "unsure")
    assumed.push(
      `Precog reads bank reconciliation from the person marked with that duty ${why("bankRec")}`,
    );
  if (a.dailyTakings === "unsure")
    assumed.push(
      `Precog assumes $${DEFAULT_RISK_VARIABLES.dailyCashExposure.toLocaleString("en-US")} in daily takings ${why("dailyTakings")}`,
    );
  if (a.ownerReadsStatement === "unsure")
    assumed.push(
      `Precog does not count ${statementReader.toLowerCase()} reading the bank statement ${why("ownerReadsStatement")}`,
    );
  if (a.bankSecondApproval === "unsure")
    assumed.push(`Precog does not count a second bank approver ${why("bankSecondApproval")}`);
  if (a.cameras === "unsure")
    assumed.push(`Precog does not count security cameras ${why("cameras")}`);
  if (a.alarm === "unsure")
    assumed.push(`Precog does not count an alarm or access-control system ${why("alarm")}`);
  if (a.backgroundChecks === "unsure")
    assumed.push(
      `Precog does not count background checks for money handlers ${why("backgroundChecks")}`,
    );

  assumed.push(
    "Precog did not ask about insurance. Precog treats it as unverified until you add a policy.",
    'Precog did not ask who can cover each duty. "Who knows what" starts with the sample list and no one assigned.',
  );
  return { changed, assumed };
}

function answer(value: unknown): Answer {
  return value === "yes" || value === "no" || value === "unsure" ? value : "unsure";
}

function member<const T extends readonly string[]>(value: unknown, allowed: T): T[number] {
  return allowed.includes(value as T[number]) ? (value as T[number]) : "unsure";
}
