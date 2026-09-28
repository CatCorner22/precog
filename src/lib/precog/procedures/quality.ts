import type { EntitlementId } from "../sod/conflict-rules";
import { secretKindsIn } from "./credential-guard";
import { aiDraftedSteps, procedureStatus, shownSteps, suggestedSteps } from "./lifecycle";
import type { Place, Procedure } from "./types";
import { screenProcedureWriting, type WritingStandard } from "./writing";

/**
 * A best-practice check of one written procedure: what to change so a
 * backup who has never done the task can follow it. It reads only what the
 * owner wrote and never changes it. It joins the writing screen
 * (procedures/writing.ts: clarity, consistency, completeness, active voice),
 * whose errors block verification, with the practices that procedure-writing
 * guides share: name who does it, who covers and who checks; warn at the
 * risky step; and keep the written steps checked against the real screen or
 * place.
 */

/** "fix": a backup could go wrong without it. "improve": makes it easier to follow. */
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
  /** The writing standard it enforces, or "practice" for everything else. */
  standard?: WritingStandard | "practice";
  /** A writing error: nobody can verify the procedure until it is fixed. */
  blocksVerification?: boolean;
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

/**
 * Every recommendation for `p`: writing errors that block verification first,
 * then other fixes, then improvements.
 */
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

  // How it is written: clarity, consistency, completeness and active voice.
  for (const issue of screenProcedureWriting(p, { place: context.place })) {
    add({
      id: issue.id,
      level: issue.blocking ? "fix" : "improve",
      standard: issue.standard,
      blocksVerification: issue.blocking,
      title: issue.title,
      why: issue.why,
      ...(issue.step ? { step: issue.step } : {}),
    });
  }
  if (written.length === 0) return sorted(out);

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
      title: "Take out the password, code or number, and say where you keep it instead.",
      why: "Anyone who sees the procedure, printed or on screen, can read a written secret.",
    });
  }
  if (!p.ownerPersonId) {
    add({
      id: "owner",
      level: "improve",
      title: "Name who does it today.",
      why: "A backup who is stuck needs to know who to ask.",
    });
  }
  if (p.backupPersonIds.length === 0) {
    add({
      id: "backup",
      level: "fix",
      title: "Name at least one backup: a person who can follow it when the usual person is out.",
      why: "A procedure only protects the business if someone else is ready to use it.",
    });
  }
  if (p.reviewerPersonId && p.reviewerPersonId === p.ownerPersonId) {
    add({
      id: "reviewer",
      level: "improve",
      title: "Name a reviewer other than the person who does the task.",
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
      why: "A picture of the right button saves a backup from guessing between similar ones.",
    });
  }
  if (written.length > MANY_STEPS) {
    add({
      id: "length",
      level: "improve",
      title: `Split it into two procedures, or group the steps; it has ${written.length}.`,
      why: "Long procedures are where a backup loses their place.",
    });
  }
  const drafted = aiDraftedSteps(p);
  if (drafted > 0) {
    add({
      id: "ai-draft",
      level: "fix",
      title: `Compare the ${drafted === 1 ? "step" : `${drafted} steps`} Grok drafted with the real screen or place.`,
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
          ? "Verify the steps again; the last verification has run out."
          : "Ask the reviewer to follow the steps and verify them.",
      why: "Software and places change; only a verification shows that the steps still work.",
    });
  }

  return sorted(out);
}

/** Errors that block verification first, then other fixes, then improvements. */
function sorted(list: Recommendation[]): Recommendation[] {
  const rank = (r: Recommendation) => (r.blocksVerification ? 0 : r.level === "fix" ? 1 : 2);
  return list.sort((a, b) => rank(a) - rank(b));
}
