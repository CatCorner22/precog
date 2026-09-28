import type { EntitlementId } from "../sod/conflict-rules";
import { secretKindsIn } from "./credential-guard";
import { aiDraftedSteps, procedureStatus, shownSteps, suggestedSteps } from "./lifecycle";
import type { Place, Procedure, ProcedureStep } from "./types";

/**
 * A best-practice check of one written procedure: what to change so a
 * stand-in who has never done the task can follow it. It reads only what the
 * owner wrote and never changes it. The practices are the ones plain-language
 * and procedure-writing guides share: one reader, instructions that start
 * with a verb, one action per step, in the order they are done; say why, when
 * and where; name who does it, who covers and who checks; warn at the risky
 * step; and keep the written steps checked against the real screen or place.
 */

/** "fix": a stand-in could go wrong without it. "improve": makes it easier to follow. */
export type RecommendationLevel = "fix" | "improve";

export interface Recommendation {
  /** Stable key for the practice, and the step when it is about one step. */
  id: string;
  level: RecommendationLevel;
  /** What to do, as an instruction. */
  title: string;
  /** Why it matters, in one sentence. */
  why: string;
  /** The step it is about, numbered as the procedure shows it (1-based). */
  step?: number;
}

/** Duties where a wrong step moves or releases money. */
const MONEY_DUTIES = new Set<EntitlementId>([
  "release_payment",
  "initiate_ach",
  "sign_checks",
  "issue_refunds",
  "approve_payroll",
  "edit_payroll_master",
  "create_vendor",
  "approve_writeoffs",
  "prepare_deposit",
]);

/** More steps than this is hard to follow in one go. */
const MANY_STEPS = 15;
/** A step longer than this is usually more than one action. */
const LONG_STEP = 200;

// A step that opens with an article or pronoun describes rather than instructs:
// "The drawer is counted" instead of "Count the drawer".
const NOT_A_VERB =
  /^(?:the|a|an|this|that|these|those|it|there|you|we|i|they|he|she|my|our|your|their|someone|somebody|staff|everyone)\b/i;
// "The deposit is made", "Bags are sealed": a step that opens in the passive hides who acts.
const PASSIVE_OPENING =
  /^(?:\S+\s+){1,3}(?:is|are|was|were|gets|get)\s+(?:\w+ly\s+)?(?:\w+(?:ed|en)|made|done|sent|kept|paid|put|set|left|held|sold|bought|brought|told|shown|found|run|cut|read|built|spent)\b/i;
// A second action joined into the same step; a full stop after "Dr." or "a.m." is not one.
const SECOND_ACTION =
  /\s(?:and then|then|after that|afterwards)\s|;\s*\w|(?<!\b(?:Dr|Mr|Mrs|Ms|St|No|vs|etc|e\.g|i\.e|a\.m|p\.m))[.!?]\s+[A-Z]/;
// Words that leave a stand-in to guess.
const VAGUE =
  /\betc\b\.?|\b(?:and so on|as needed|as necessary|if necessary|if needed|when appropriate|appropriate(?:ly)?|properly|correctly|as usual|the usual way|whatever|somehow|stuff|things)\b/i;
const CONDITION_START = /^(?:if|when|whenever|once|unless|only if|in case)\b/i;

/** Every recommendation for `p`, fixes first, then procedure-wide before step-by-step. */
export function procedureRecommendations(
  p: Procedure,
  context: {
    place?: Place | null;
    today: string;
    /** False when this person cannot add pictures (signed out, or the sample), so none are suggested. */
    canAddPictures?: boolean;
  },
): Recommendation[] {
  const out: Recommendation[] = [];
  const add = (r: Recommendation) => out.push(r);
  const steps = shownSteps(p);
  const written = steps.filter((s) => s.text.trim());

  if (written.length === 0) {
    add({
      id: "steps",
      level: "fix",
      title: "Write the steps.",
      why: "Without steps, nobody else can do the task when the usual person is away.",
    });
    return out;
  }

  const secrets = secretKindsIn([
    ...steps.flatMap((s) => [s.text, s.caution ?? ""]),
    ...p.prerequisites,
    p.purpose ?? "",
    p.trigger ?? "",
  ]);
  if (secrets.length) {
    add({
      id: "secret",
      level: "fix",
      title: "Take out the password, code or number, and say where it is kept instead.",
      why: "A written secret can be read by anyone who sees the procedure, printed or on screen.",
    });
  }
  if (!p.purpose?.trim()) {
    add({
      id: "purpose",
      level: "improve",
      title: "Say why the task matters and what done looks like.",
      why: "A stand-in who knows the goal can tell when something has gone wrong.",
    });
  }
  if (!p.trigger?.trim() && !p.cadence) {
    add({
      id: "trigger",
      level: "fix",
      title: "Say when to do it.",
      why: "A stand-in cannot cover a task they do not know is due.",
    });
  }
  if (!p.placeId && !p.module?.trim()) {
    add({
      id: "where",
      level: "fix",
      title: "Say where it is done: the platform or place, and the screen.",
      why: "The first thing a stand-in needs is where to start.",
    });
  }
  if (context.place?.kind === "software" && p.prerequisites.length === 0) {
    add({
      id: "prerequisites",
      level: "improve",
      title: "List the login and anything else needed before starting.",
      why: "A stand-in who finds out halfway through that they have no access stops there.",
    });
  }
  if (!p.ownerPersonId) {
    add({
      id: "owner",
      level: "improve",
      title: "Name who does it today.",
      why: "A stand-in who is stuck needs to know who to ask.",
    });
  }
  if (p.backupPersonIds.length === 0) {
    add({
      id: "backup",
      level: "fix",
      title: "Name at least one person who can follow it when the usual person is out.",
      why: "A procedure only protects the business if someone else is ready to use it.",
    });
  }
  if (p.reviewerPersonId && p.reviewerPersonId === p.ownerPersonId) {
    add({
      id: "reviewer",
      level: "improve",
      title: "Have someone other than the person who does it check the steps.",
      why: "The author reads what they meant to write; a second reader finds the step they skipped.",
    });
  }
  const moneyDuty = (p.dutyIds ?? []).some((d) => MONEY_DUTIES.has(d));
  if (moneyDuty && !steps.some((s) => s.caution?.trim())) {
    add({
      id: "caution",
      level: "fix",
      title: "Add a caution at the step where money moves.",
      why: "The step that releases, refunds or changes a payment is where a mistake costs money.",
    });
  }
  if (
    context.place?.kind === "software" &&
    context.canAddPictures !== false &&
    written.length >= 3 &&
    !steps.some((s) => s.imageIds?.length)
  ) {
    add({
      id: "pictures",
      level: "improve",
      title: "Add a screenshot where the screen is hard to describe.",
      why: "A picture of the right button saves a stand-in from guessing between similar ones.",
    });
  }
  if (written.length > MANY_STEPS) {
    add({
      id: "length",
      level: "improve",
      title: `Split it into two procedures, or group the steps; it has ${written.length}.`,
      why: "Long procedures are where a stand-in loses their place.",
    });
  }
  const drafted = aiDraftedSteps(p);
  if (drafted > 0) {
    add({
      id: "ai-draft",
      level: "fix",
      title: `Check the ${drafted === 1 ? "step" : `${drafted} steps`} Grok drafted against the real screen or place.`,
      why: "A drafted step is only a guess until a person has followed it.",
    });
  }
  const suggested = suggestedSteps(p);
  if (suggested > 0) {
    add({
      id: "suggested",
      level: "fix",
      title: `Fit the ${suggested === 1 ? "suggested step" : `${suggested} suggested steps`} to your own screens, names and people.`,
      why: "A suggested step describes common practice, not the way this business does the task.",
    });
  }
  const status = procedureStatus(p, context.today);
  if (status === "draft" || status === "needs_reverify" || status === "stale") {
    add({
      id: "verify",
      level: status === "stale" ? "fix" : "improve",
      title:
        status === "stale"
          ? "Check the steps again; the last check has run out."
          : "Have the checker follow the steps and mark them checked.",
      why: "Software and places change; only a check shows the steps still work.",
    });
  }

  steps.forEach((s, i) => stepRecommendations(s, i + 1).forEach(add));
  return out.sort((a, b) => Number(a.level === "improve") - Number(b.level === "improve"));
}

/** Recommendations for one step, numbered as the procedure shows it. */
export function stepRecommendations(s: ProcedureStep, step: number): Recommendation[] {
  const text = s.text.trim();
  if (!text) return [];
  const out: Recommendation[] = [];
  const key = (practice: string) => `${practice}:${s.id}`;
  const conditional = CONDITION_START.test(text);
  if (!conditional && (NOT_A_VERB.test(text) || PASSIVE_OPENING.test(text))) {
    out.push({
      id: key("verb"),
      level: "improve",
      step,
      title: "Start the step with what to do, such as “Count” or “Open”.",
      why: "An instruction is quicker to follow than a description of what happens.",
    });
  }
  if (!conditional && SECOND_ACTION.test(text)) {
    out.push({
      id: key("one-action"),
      level: "improve",
      step,
      title: "Split this into one action per step.",
      why: "A stand-in who checks off a step should have done exactly one thing.",
    });
  } else if (text.length > LONG_STEP) {
    out.push({
      id: key("long"),
      level: "improve",
      step,
      title: "Shorten this step, or split it.",
      why: "Long steps hide the action a stand-in has to take.",
    });
  }
  if (VAGUE.test(text)) {
    out.push({
      id: key("vague"),
      level: "improve",
      step,
      title: `Replace “${text.match(VAGUE)?.[0]}” with exactly what to do.`,
      why: "A stand-in cannot guess what the usual person means.",
    });
  }
  return out;
}
