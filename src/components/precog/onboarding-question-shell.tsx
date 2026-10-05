/* eslint-disable react-refresh/only-export-components -- navigation helpers share this small shell */
import { forwardRef, type ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  ACTORS,
  LOCATION_BANDS,
  ONBOARDING_FACTS_VERSION,
  WORKFORCE_BANDS,
  orderedSetupMethods,
  withWorkforceBand,
  type LocationBand,
  type OnboardingActor,
  type OnboardingFacts,
  type SetupMethod,
  type WorkforceBand,
} from "@/lib/precog/onboarding/decision-model";

export const SHELL_QUESTIONS = ["actor", "workforce", "locations", "setup_method"] as const;
export type ShellQuestion = (typeof SHELL_QUESTIONS)[number];

export function adjacentQuestion(question: ShellQuestion, direction: -1 | 1) {
  return SHELL_QUESTIONS[SHELL_QUESTIONS.indexOf(question) + direction];
}

const ACTOR_LABEL: Record<OnboardingActor, string> = {
  business_leader: "I lead or own this business",
  employee: "I work in this business",
  advisor: "I advise this business",
};
const WORKFORCE_LABEL: Record<WorkforceBand, string> = {
  "1": "1 person",
  "2-6": "2–6 people",
  "7-30": "7–30 people",
  "31-60": "31–60 people",
  "61-99": "61–99 people",
  "100-249": "100–249 people",
  "250+": "250+ people",
};
const LOCATION_LABEL: Record<LocationBand, string> = {
  "1": "1 location",
  "2-5": "2–5 locations",
  "6-20": "6–20 locations",
  "21+": "21+ locations",
};
const METHOD: Record<SetupMethod, { title: string; detail: string }> = {
  person_grid: {
    title: "Enter people now",
    detail: "Use the guided table to name each control participant and their money duties.",
  },
  roster_import: {
    title: "Paste a roster",
    detail: "Start with an HR or payroll export, then check the people and duties Precog maps.",
  },
  job_groups: {
    title: "Start with job groups",
    detail:
      "Staged path: begin with the existing roster paste, then review people grouped by job title.",
  },
};

interface Props {
  facts: OnboardingFacts;
  question: ShellQuestion;
  onFacts: (facts: OnboardingFacts) => void;
  onBack: () => void;
  onContinue: () => void;
  storageNote?: ReactNode;
  cancelLink?: ReactNode;
}

export const OnboardingQuestionShell = forwardRef<HTMLHeadingElement, Props>(
  ({ facts, question, onFacts, onBack, onContinue, storageNote, cancelLink }, ref) => {
    const index = SHELL_QUESTIONS.indexOf(question);
    const answer =
      question === "actor"
        ? facts.actor
        : question === "workforce"
          ? facts.workforceBand
          : question === "locations"
            ? facts.locationBand
            : facts.setupMethod;
    const options =
      question === "actor"
        ? ACTORS
        : question === "workforce"
          ? WORKFORCE_BANDS
          : question === "locations"
            ? LOCATION_BANDS
            : orderedSetupMethods(facts);
    const heading = {
      actor: "What is your role here?",
      workforce: "How many people work across the organization?",
      locations: "How many locations does the organization have?",
      setup_method: "How do you want to start the map?",
    }[question];

    function choose(value: string) {
      if (question === "actor") onFacts({ ...facts, actor: value as OnboardingActor });
      if (question === "workforce") onFacts(withWorkforceBand(facts, value as WorkforceBand));
      if (question === "locations") onFacts({ ...facts, locationBand: value as LocationBand });
      if (question === "setup_method") onFacts({ ...facts, setupMethod: value as SetupMethod });
    }

    return (
      <>
        <header className="space-y-2 px-6 pt-6">
          <Badge variant="accent" className="w-fit">
            Set up your map
          </Badge>
          <p className="text-xs font-medium text-muted">
            Question {index + 1} of {SHELL_QUESTIONS.length}
          </p>
          <h2
            id="industry-onboarding-title"
            ref={ref}
            tabIndex={-1}
            className="text-xl font-semibold tracking-tight outline-hidden sm:text-2xl"
          >
            {heading}
          </h2>
          <p className="text-sm text-muted">
            {question === "setup_method"
              ? "Workforce size guides the setup path. Findings come from the control participants and duties you actually map."
              : "Your answers tailor setup; you can go back and change them."}
          </p>
        </header>
        <div className="space-y-4 p-6">
          {storageNote}
          {question === "setup_method" &&
            (facts.workforceBand === "100-249" || facts.workforceBand === "250+") && (
              <p className="rounded-lg border border-border bg-elevated/60 px-3 py-2 text-xs text-muted">
                For a larger organization, start from a roster or job groups. Precog still maps
                named control participants before producing findings; it does not treat total
                workforce as the mapped team.
              </p>
            )}
          <fieldset className="grid gap-2">
            <legend className="sr-only">{heading}</legend>
            {options.map((value) => {
              const method = question === "setup_method" ? METHOD[value as SetupMethod] : undefined;
              const label =
                question === "actor"
                  ? ACTOR_LABEL[value as OnboardingActor]
                  : question === "workforce"
                    ? WORKFORCE_LABEL[value as WorkforceBand]
                    : question === "locations"
                      ? LOCATION_LABEL[value as LocationBand]
                      : method!.title;
              return (
                <label
                  key={value}
                  className={cn(
                    "flex items-start gap-3 rounded-xl border p-4",
                    answer === value
                      ? "border-primary/50 bg-primary/10"
                      : "border-border bg-elevated",
                  )}
                >
                  <input
                    type="radio"
                    name={question}
                    value={value}
                    checked={answer === value}
                    onChange={() => choose(value)}
                    className="mt-1 size-4"
                  />
                  <span>
                    <span className="block text-sm font-medium">{label}</span>
                    {method && (
                      <span className="mt-1 block text-xs text-muted">{method.detail}</span>
                    )}
                  </span>
                </label>
              );
            })}
          </fieldset>
          {question === "actor" && facts.actor === "advisor" && (
            <p className="text-xs text-muted">
              Precog sets up the client&rsquo;s map. It never inserts the signed-in advisor into the
              client team.
            </p>
          )}
          <div className="grid gap-2 sm:grid-cols-2">
            <Button onClick={onContinue} disabled={!answer}>
              Continue
            </Button>
            <Button variant="secondary" onClick={onBack}>
              Back
            </Button>
          </div>
          {cancelLink}
        </div>
      </>
    );
  },
);
OnboardingQuestionShell.displayName = "OnboardingQuestionShell";

export const EMPTY_ONBOARDING_FACTS: OnboardingFacts = {
  schemaVersion: ONBOARDING_FACTS_VERSION,
};
