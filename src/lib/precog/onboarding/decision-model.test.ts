import { describe, expect, it } from "vitest";
import {
  ONBOARDING_FACTS_VERSION,
  normalizeOnboardingFacts,
  onboardingCompletion,
  orderedOnboardingQuestions,
  orderedSetupMethods,
  withComplexityAnswer,
  workforceBandForCount,
  type OnboardingFacts,
} from "./decision-model";

const factsFor = (workforceCount: number): OnboardingFacts => ({
  schemaVersion: ONBOARDING_FACTS_VERSION,
  actor: "business_leader",
  workforceBand: workforceBandForCount(workforceCount),
  workforceCount,
  locationBand: "1",
  mappingScope: "whole_business",
});

describe("adaptive onboarding branches", () => {
  it("gives a 12-person and 120-person organization different entry and question sequences", () => {
    const small = factsFor(12);
    const large = factsFor(120);
    expect(orderedSetupMethods(small)).toEqual(["person_grid", "roster_import", "job_groups"]);
    expect(orderedSetupMethods(large)).toEqual(["roster_import", "job_groups", "person_grid"]);
    expect(orderedOnboardingQuestions(small).map((question) => question.id)).not.toEqual(
      orderedOnboardingQuestions(large).map((question) => question.id),
    );
    expect(
      orderedOnboardingQuestions(large)
        .map((question) => question.id)
        .slice(0, 5),
    ).toEqual(["actor", "workforce", "locations", "setup_method", "mapping_scope"]);
  });

  it("invalidates a dependent answer when its parent changes to no", () => {
    let facts = withComplexityAnswer(factsFor(12), "handles_customer_money", "yes");
    facts = withComplexityAnswer(facts, "payment_approval", "unknown");
    expect(facts.answers?.payment_approval).toBe("unknown");
    facts = withComplexityAnswer(facts, "handles_customer_money", "no");
    expect(facts.answers).toEqual({ handles_customer_money: "no" });
    expect(orderedOnboardingQuestions(facts).map((question) => question.id)).not.toContain(
      "payment_approval",
    );
  });

  it("round-trips unknown as an answer distinct from no", () => {
    const input = {
      ...factsFor(12),
      answers: { handles_customer_money: "unknown" as const },
    };
    const loaded = normalizeOnboardingFacts(JSON.parse(JSON.stringify(input)));
    expect(loaded?.answers?.handles_customer_money).toBe("unknown");
    expect(orderedOnboardingQuestions(loaded!).map((question) => question.id)).toContain(
      "payment_approval",
    );
    expect(
      orderedOnboardingQuestions(withComplexityAnswer(loaded!, "handles_customer_money", "no")).map(
        (question) => question.id,
      ),
    ).not.toContain("payment_approval");
  });

  it("drops malformed enum values and derives a missing workforce band from the exact count", () => {
    expect(
      normalizeOnboardingFacts({
        schemaVersion: 1,
        actor: "accountant",
        workforceCount: 120,
        workforceBand: "large",
        locationBand: "many",
        mappingScope: "everything",
        setupMethod: "spreadsheet",
        answers: { handles_customer_money: "maybe", runs_payroll: "unknown" },
      }),
    ).toEqual({
      schemaVersion: 1,
      workforceBand: "100-249",
      workforceCount: 120,
      answers: { runs_payroll: "unknown" },
    });
    expect(normalizeOnboardingFacts({ schemaVersion: 99, actor: "advisor" })).toBeUndefined();
  });

  it("reports the first unanswered selected question and then completion", () => {
    const facts: OnboardingFacts = {
      ...factsFor(12),
      setupMethod: "person_grid",
      answers: {
        handles_customer_money: "no",
        runs_payroll: "unknown",
        holds_inventory: "no",
        regulated_access: "yes",
      },
    };
    expect(onboardingCompletion(facts)).toEqual({ complete: true });
    expect(onboardingCompletion({ ...facts, setupMethod: undefined })).toEqual({
      complete: false,
      nextQuestionId: "setup_method",
    });
  });
});
