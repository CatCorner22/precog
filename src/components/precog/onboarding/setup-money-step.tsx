import { useId, type KeyboardEvent } from "react";
import { Button } from "@/components/ui/button";
import type { IndustryId } from "@/lib/precog/industry";
import { industryHasOwner } from "@/lib/precog/industry";
import {
  answeredSummary,
  type SetupAnswers,
  type SetupQuestion,
} from "@/lib/precog/onboarding/setup-answers";

type Choice<T extends string> = { value: T; label: string };

/**
 * One question as a radio group. Unanswered, no choice is selected and the
 * first choice takes the keyboard focus, so the owner sees what they have
 * not chosen.
 */
function SegmentedQuestion<T extends string>({
  label,
  value,
  answered,
  choices,
  onChange,
}: {
  label: string;
  value: T;
  answered: boolean;
  choices: readonly Choice<T>[];
  onChange: (value: T) => void;
}) {
  const labelId = useId();

  function move(event: KeyboardEvent<HTMLDivElement>) {
    const current = answered ? choices.findIndex((choice) => choice.value === value) : -1;
    const keyDirection =
      event.key === "ArrowRight" || event.key === "ArrowDown"
        ? 1
        : event.key === "ArrowLeft" || event.key === "ArrowUp"
          ? -1
          : 0;
    const nextIndex =
      keyDirection !== 0
        ? current < 0
          ? keyDirection > 0
            ? 0
            : choices.length - 1
          : (current + keyDirection + choices.length) % choices.length
        : event.key === "Home"
          ? 0
          : event.key === "End"
            ? choices.length - 1
            : -1;
    if (nextIndex < 0) return;
    event.preventDefault();
    onChange(choices[nextIndex].value);
    event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="radio"]')[nextIndex]?.focus();
  }

  return (
    <div className="min-w-0 space-y-1.5">
      <p id={labelId} className="text-sm font-medium">
        {label}
      </p>
      <div
        role="radiogroup"
        aria-labelledby={labelId}
        onKeyDown={move}
        className="flex flex-wrap gap-1 rounded-lg"
      >
        {choices.map((choice, index) => {
          const checked = answered && value === choice.value;
          return (
            <button
              key={choice.value}
              type="button"
              role="radio"
              aria-checked={checked}
              tabIndex={checked || (!answered && index === 0) ? 0 : -1}
              onClick={() => onChange(choice.value)}
              className={`min-h-8 rounded-md pointer-coarse:min-h-11 pointer-coarse:min-w-11 border px-2.5 py-1 text-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${
                checked
                  ? "border-primary/50 bg-primary/10 text-fg"
                  : "border-border bg-panel text-muted hover:border-border-strong"
              }`}
            >
              {choice.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

const ANSWER_CHOICES: readonly Choice<"yes" | "no" | "unsure">[] = [
  { value: "yes", label: "Yes" },
  { value: "no", label: "No" },
  { value: "unsure", label: "Not sure" },
];

/** A money question's answer was chosen: the new answers and which question it was. */
type OnAnswer = (answers: SetupAnswers, question: SetupQuestion) => void;

function setAnswer<K extends SetupQuestion>(
  answers: SetupAnswers,
  onChange: OnAnswer,
  key: K,
  value: SetupAnswers[K],
) {
  onChange({ ...answers, [key]: value }, key);
}

/**
 * The "How money moves here" questions. Every question starts unanswered;
 * an unanswered question keeps the Not sure value, so the engines read it
 * exactly as a Not sure answer. Next works at any count.
 */
export function SetupMoneyStep({
  answers,
  answered,
  onChange,
  industry,
  onNext,
  onBack,
}: {
  answers: SetupAnswers;
  /** The questions the owner chose an answer for. */
  answered: readonly SetupQuestion[];
  onChange: OnAnswer;
  industry: IndustryId;
  onNext: () => void;
  onBack: () => void;
}) {
  const has = (question: SetupQuestion) => answered.includes(question);
  const progress = answeredSummary(answers, answered);
  const statementQuestion = industryHasOwner(industry)
    ? "Does the owner open and read the bank statement each month?"
    : "Does a board member open and read the bank statement each month?";

  return (
    <div className="space-y-4">
      <fieldset className="space-y-3 rounded-xl border border-border bg-elevated/40 p-3 sm:p-4">
        <legend className="px-1 text-sm font-semibold">How money moves</legend>
        <div className="grid gap-4 sm:grid-cols-2">
          <SegmentedQuestion
            label="Do you take cash or paper checks in person or by mail?"
            value={answers.cashOrChecks}
            answered={has("cashOrChecks")}
            choices={ANSWER_CHOICES}
            onChange={(value) =>
              onChange(
                {
                  ...answers,
                  cashOrChecks: value,
                  ...(value === "no" ? { cameras: "unsure" } : {}),
                },
                "cashOrChecks",
              )
            }
          />
          <SegmentedQuestion
            label="Does anyone use a company credit or debit card?"
            value={answers.companyCard}
            answered={has("companyCard")}
            choices={ANSWER_CHOICES}
            onChange={(value) => setAnswer(answers, onChange, "companyCard", value)}
          />
          <SegmentedQuestion
            label="Do you give refunds, credits, or write-offs?"
            value={answers.refunds}
            answered={has("refunds")}
            choices={ANSWER_CHOICES}
            onChange={(value) => setAnswer(answers, onChange, "refunds", value)}
          />
          <SegmentedQuestion
            label="How is payroll handled?"
            value={answers.payroll}
            answered={has("payroll")}
            choices={[
              { value: "in-house", label: "In-house" },
              { value: "provider", label: "Provider" },
              { value: "none", label: "No payroll" },
              { value: "unsure", label: "Not sure" },
            ]}
            onChange={(value) => setAnswer(answers, onChange, "payroll", value)}
          />
          <SegmentedQuestion
            label="Who reconciles the bank each month?"
            value={answers.bankRec}
            answered={has("bankRec")}
            choices={[
              { value: "team", label: "Our team" },
              { value: "outside", label: "Outside bookkeeper or CPA" },
              { value: "nobody", label: "Nobody" },
              { value: "unsure", label: "Not sure" },
            ]}
            onChange={(value) => setAnswer(answers, onChange, "bankRec", value)}
          />
          <SegmentedQuestion
            label="About how much do you take in each day across all payment types?"
            value={answers.dailyTakings}
            answered={has("dailyTakings")}
            choices={[
              { value: "under-1k", label: "Under $1,000" },
              { value: "1k-5k", label: "$1,000–$5,000" },
              { value: "5k-20k", label: "$5,000–$20,000" },
              { value: "over-20k", label: "Over $20,000" },
              { value: "unsure", label: "Not sure" },
            ]}
            onChange={(value) => setAnswer(answers, onChange, "dailyTakings", value)}
          />
        </div>
      </fieldset>

      <fieldset className="space-y-3 rounded-xl border border-border bg-elevated/40 p-3 sm:p-4">
        <legend className="px-1 text-sm font-semibold">What already runs</legend>
        <div className="grid gap-4 sm:grid-cols-2">
          <SegmentedQuestion
            label={statementQuestion}
            value={answers.ownerReadsStatement}
            answered={has("ownerReadsStatement")}
            choices={ANSWER_CHOICES}
            onChange={(value) => setAnswer(answers, onChange, "ownerReadsStatement", value)}
          />
          <SegmentedQuestion
            label="Does the bank require a second person to approve payments?"
            value={answers.bankSecondApproval}
            answered={has("bankSecondApproval")}
            choices={ANSWER_CHOICES}
            onChange={(value) => setAnswer(answers, onChange, "bankSecondApproval", value)}
          />
          {answers.cashOrChecks !== "no" && (
            <SegmentedQuestion
              label="Are security cameras in place?"
              value={answers.cameras}
              answered={has("cameras")}
              choices={ANSWER_CHOICES}
              onChange={(value) => setAnswer(answers, onChange, "cameras", value)}
            />
          )}
          <SegmentedQuestion
            label="Is an alarm or access-control system in place?"
            value={answers.alarm}
            answered={has("alarm")}
            choices={ANSWER_CHOICES}
            onChange={(value) => setAnswer(answers, onChange, "alarm", value)}
          />
          <SegmentedQuestion
            label="Are people who handle money background checked?"
            value={answers.backgroundChecks}
            answered={has("backgroundChecks")}
            choices={ANSWER_CHOICES}
            onChange={(value) => setAnswer(answers, onChange, "backgroundChecks", value)}
          />
        </div>
      </fieldset>

      <p className="text-xs text-muted" role="status">
        {`${progress.answered} of ${progress.shown} answered. A question you leave counts as Not sure.`}
      </p>
      <div className="flex flex-wrap gap-2 border-t border-border pt-3">
        <Button variant="secondary" onClick={onBack}>
          Back
        </Button>
        <Button variant="secondary" onClick={onNext}>
          Skip these questions
        </Button>
        <Button className="sm:ml-auto" onClick={onNext}>
          Next: your team
        </Button>
      </div>
    </div>
  );
}
