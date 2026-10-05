/** Stored onboarding facts are additive and never stand in for mapped-team figures. */
export const ONBOARDING_FACTS_VERSION = 1 as const;

export const ACTORS = ["business_leader", "employee", "advisor"] as const;
export type OnboardingActor = (typeof ACTORS)[number];

export const WORKFORCE_BANDS = ["1", "2-6", "7-30", "31-60", "61-99", "100-249", "250+"] as const;
export type WorkforceBand = (typeof WORKFORCE_BANDS)[number];

export const LOCATION_BANDS = ["1", "2-5", "6-20", "21+"] as const;
export type LocationBand = (typeof LOCATION_BANDS)[number];

export const MAPPING_SCOPES = ["whole_business", "one_location", "one_team"] as const;
export type MappingScope = (typeof MAPPING_SCOPES)[number];

export const SETUP_METHODS = ["person_grid", "roster_import", "job_groups"] as const;
export type SetupMethod = (typeof SETUP_METHODS)[number];

export const COMPLEXITY_ANSWERS = ["yes", "no", "unknown"] as const;
export type ComplexityAnswer = (typeof COMPLEXITY_ANSWERS)[number];

export const COMPLEXITY_QUESTION_IDS = [
  "handles_customer_money",
  "payment_approval",
  "runs_payroll",
  "holds_inventory",
  "regulated_access",
] as const;
export type ComplexityQuestionId = (typeof COMPLEXITY_QUESTION_IDS)[number];

export const ONBOARDING_QUESTION_IDS = [
  "actor",
  "workforce",
  "locations",
  "mapping_scope",
  "setup_method",
  ...COMPLEXITY_QUESTION_IDS,
] as const;
export type OnboardingQuestionId = (typeof ONBOARDING_QUESTION_IDS)[number];

export interface OnboardingFacts {
  schemaVersion: typeof ONBOARDING_FACTS_VERSION;
  actor?: OnboardingActor;
  workforceBand?: WorkforceBand;
  /** Organization workforce. This is separate from staff.teamSize (mapped active participants). */
  workforceCount?: number;
  locationBand?: LocationBand;
  mappingScope?: MappingScope;
  setupMethod?: SetupMethod;
  answers?: Partial<Record<ComplexityQuestionId, ComplexityAnswer>>;
}

export interface QuestionDependency {
  questionId: ComplexityQuestionId;
  answers: readonly ComplexityAnswer[];
}

export interface OnboardingQuestion {
  id: OnboardingQuestionId;
  dependsOn?: QuestionDependency;
}

const QUESTIONS: Record<OnboardingQuestionId, OnboardingQuestion> = Object.fromEntries(
  ONBOARDING_QUESTION_IDS.map((id) => [id, { id }]),
) as Record<OnboardingQuestionId, OnboardingQuestion>;

QUESTIONS.payment_approval = {
  id: "payment_approval",
  // "Unknown" keeps the follow-up visible; it is information, not a "no".
  dependsOn: { questionId: "handles_customer_money", answers: ["yes", "unknown"] },
};

const isOneOf = <T extends string>(value: unknown, values: readonly T[]): value is T =>
  typeof value === "string" && values.includes(value as T);

export function workforceBandForCount(count: number): WorkforceBand {
  if (count <= 1) return "1";
  if (count <= 6) return "2-6";
  if (count <= 30) return "7-30";
  if (count <= 60) return "31-60";
  if (count <= 99) return "61-99";
  if (count <= 249) return "100-249";
  return "250+";
}

export function normalizeOnboardingFacts(value: unknown): OnboardingFacts | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const raw = value as Record<string, unknown>;
  if (raw.schemaVersion !== ONBOARDING_FACTS_VERSION) return undefined;
  const workforceCount =
    typeof raw.workforceCount === "number" &&
    Number.isInteger(raw.workforceCount) &&
    raw.workforceCount >= 1 &&
    raw.workforceCount <= 1_000_000
      ? raw.workforceCount
      : undefined;
  const rawAnswers =
    raw.answers && typeof raw.answers === "object" && !Array.isArray(raw.answers)
      ? (raw.answers as Record<string, unknown>)
      : {};
  const answers = Object.fromEntries(
    COMPLEXITY_QUESTION_IDS.flatMap((id) =>
      isOneOf(rawAnswers[id], COMPLEXITY_ANSWERS) ? [[id, rawAnswers[id]]] : [],
    ),
  ) as NonNullable<OnboardingFacts["answers"]>;
  return {
    schemaVersion: ONBOARDING_FACTS_VERSION,
    ...(isOneOf(raw.actor, ACTORS) ? { actor: raw.actor } : {}),
    ...(isOneOf(raw.workforceBand, WORKFORCE_BANDS)
      ? { workforceBand: raw.workforceBand }
      : workforceCount
        ? { workforceBand: workforceBandForCount(workforceCount) }
        : {}),
    ...(workforceCount ? { workforceCount } : {}),
    ...(isOneOf(raw.locationBand, LOCATION_BANDS) ? { locationBand: raw.locationBand } : {}),
    ...(isOneOf(raw.mappingScope, MAPPING_SCOPES) ? { mappingScope: raw.mappingScope } : {}),
    ...(isOneOf(raw.setupMethod, SETUP_METHODS) ? { setupMethod: raw.setupMethod } : {}),
    ...(Object.keys(answers).length ? { answers } : {}),
  };
}

const isLarge = (facts: OnboardingFacts) =>
  facts.workforceCount !== undefined
    ? facts.workforceCount >= 100
    : facts.workforceBand === "100-249" || facts.workforceBand === "250+";

/** Entry methods in the order Precog offers them for this organization. */
export function orderedSetupMethods(facts: OnboardingFacts): readonly SetupMethod[] {
  return isLarge(facts)
    ? ["roster_import", "job_groups"]
    : ["person_grid", "roster_import", "job_groups"];
}

/** Change organization size and clear only a setup choice that no longer applies. */
export function withWorkforceBand(
  facts: OnboardingFacts,
  workforceBand: WorkforceBand,
): OnboardingFacts {
  const next = { ...facts, workforceBand, workforceCount: undefined };
  return next.setupMethod && !orderedSetupMethods(next).includes(next.setupMethod)
    ? { ...next, setupMethod: undefined }
    : next;
}

/** Questions in presentation order, with unmet dependent questions omitted. */
export function orderedOnboardingQuestions(facts: OnboardingFacts): OnboardingQuestion[] {
  const ids: OnboardingQuestionId[] = isLarge(facts)
    ? [
        "actor",
        "workforce",
        "locations",
        "setup_method",
        "mapping_scope",
        "runs_payroll",
        "regulated_access",
        "handles_customer_money",
        "payment_approval",
        "holds_inventory",
      ]
    : [
        "actor",
        "workforce",
        "mapping_scope",
        "locations",
        "handles_customer_money",
        "payment_approval",
        "runs_payroll",
        "holds_inventory",
        "regulated_access",
        "setup_method",
      ];
  return ids
    .map((id) => QUESTIONS[id])
    .filter((question) => {
      const dependency = question.dependsOn;
      return (
        !dependency || dependency.answers.includes(facts.answers?.[dependency.questionId] ?? "no")
      );
    });
}

/** Set one answer and remove answers whose dependencies are no longer met. */
export function withComplexityAnswer(
  facts: OnboardingFacts,
  questionId: ComplexityQuestionId,
  answer: ComplexityAnswer,
): OnboardingFacts {
  const next = { ...facts, answers: { ...facts.answers, [questionId]: answer } };
  const selected = new Set(orderedOnboardingQuestions(next).map((question) => question.id));
  next.answers = Object.fromEntries(
    Object.entries(next.answers).filter(([id]) => selected.has(id as OnboardingQuestionId)),
  );
  return next;
}

export type OnboardingCompletion =
  { complete: true } | { complete: false; nextQuestionId: OnboardingQuestionId };

export function onboardingCompletion(facts: OnboardingFacts): OnboardingCompletion {
  const answered = (id: OnboardingQuestionId) => {
    if (id === "actor") return facts.actor !== undefined;
    if (id === "workforce") return facts.workforceBand !== undefined;
    if (id === "locations") return facts.locationBand !== undefined;
    if (id === "mapping_scope") return facts.mappingScope !== undefined;
    if (id === "setup_method") return facts.setupMethod !== undefined;
    return facts.answers?.[id] !== undefined;
  };
  const next = orderedOnboardingQuestions(facts).find((question) => !answered(question.id));
  return next ? { complete: false, nextQuestionId: next.id } : { complete: true };
}
