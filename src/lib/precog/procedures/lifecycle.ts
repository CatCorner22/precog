import { shiftDay } from "../dates";
import { uid } from "../text";
import { DEFAULT_REVIEW_DAYS, PROCEDURE_LIMITS } from "./normalize";
import type { Procedure, ProcedureStatus, ProcedureStep } from "./types";

/**
 * A procedure's review lifecycle. Someone confirms the steps work as written
 * (verified); the verification lasts `reviewEveryDays`, after which the
 * procedure is stale. Changing what a stand-in would follow (the steps,
 * cautions, prerequisites, or where it is done) clears the verification,
 * because the confirmed steps are no longer the ones written. Changing who
 * does it, who backs up, or what it links to does not.
 */

/** Where the procedure stands on `today` (YYYY-MM-DD). */
export function procedureStatus(p: Procedure, today: string): ProcedureStatus {
  if (!isWrittenProcedure(p)) return "empty";
  if (!p.verifiedAt) return p.lastVerifiedAt ? "needs_reverify" : "draft";
  const due = reviewByDate(p);
  return due && today > due ? "stale" : "verified";
}

export const PROCEDURE_STATUS_LABEL: Record<ProcedureStatus, string> = {
  empty: "No steps yet",
  draft: "Not verified",
  verified: "Verified",
  stale: "Review overdue",
  needs_reverify: "Changed since verified",
};

/** A procedure with at least one step that says something. */
export function isWrittenProcedure(p: Pick<Procedure, "steps">): boolean {
  return p.steps.some((s) => s.text.trim().length > 0);
}

/** The day the current verification runs out, or null when it is not verified. */
export function reviewByDate(p: Pick<Procedure, "verifiedAt" | "reviewEveryDays">): string | null {
  return p.verifiedAt ? shiftDay(p.verifiedAt, p.reviewEveryDays) : null;
}

/** A new, empty procedure. */
export function newProcedure(
  fields: Pick<Procedure, "industry" | "title"> & Partial<Procedure>,
  today: string,
): Procedure {
  return {
    prerequisites: [],
    steps: [],
    knowledgeIds: [],
    processIds: [],
    backupPersonIds: [],
    reviewEveryDays: DEFAULT_REVIEW_DAYS,
    version: 1,
    changelog: [],
    proofs: [],
    ...fields,
    id: fields.id ?? uid("proc"),
    createdAt: today,
    updatedAt: today,
  };
}

/** A new, empty step. */
export function newStep(text = ""): ProcedureStep {
  return { id: uid("step"), text };
}

/**
 * Save `next` over `prev`. When what a stand-in would follow changed, the
 * version goes up, the change is logged, and any verification is cleared
 * (kept as `lastVerifiedAt` so the screen can ask for a re-check). A save
 * with no content change keeps the version and the verification.
 */
export function withProcedureEdit(
  prev: Procedure | null,
  next: Procedure,
  today: string,
): Procedure {
  const saved = { ...next, updatedAt: today };
  if (!prev) return saved;
  if (contentKey(prev) === contentKey(next)) {
    return {
      ...saved,
      version: prev.version,
      changelog: prev.changelog,
      verifiedAt: prev.verifiedAt,
      verifiedBy: prev.verifiedBy,
      verifiedByAccountId: prev.verifiedByAccountId,
      verifiedByAccountName: prev.verifiedByAccountName,
      lastVerifiedAt: prev.lastVerifiedAt,
    };
  }
  const version = prev.version + 1;
  const changelog = [
    { version, on: today, summary: describeChange(prev, next) },
    ...prev.changelog,
  ].slice(0, PROCEDURE_LIMITS.changelog);
  const {
    verifiedAt: _verifiedAt,
    verifiedBy: _verifiedBy,
    verifiedByAccountId: _accountId,
    verifiedByAccountName: _accountName,
    ...unverified
  } = saved;
  return {
    ...unverified,
    version,
    changelog,
    ...(prev.verifiedAt || prev.lastVerifiedAt
      ? { lastVerifiedAt: prev.verifiedAt ?? prev.lastVerifiedAt }
      : {}),
  };
}

/** The signed-in account that records a verification. */
export interface VerifyingAccount {
  id: string;
  name: string;
}

/**
 * Record that `verifiedBy` (a person id, or "owner") confirmed the steps work
 * as written on `today`, stamped with the signed-in `account` that pressed the
 * button (none when signed out). A person has now checked every step, so none
 * is marked as an AI draft any longer.
 */
export function verifyProcedure(
  p: Procedure,
  verifiedBy: string,
  today: string,
  account?: VerifyingAccount | null,
): Procedure {
  if (!isWrittenProcedure(p)) return p;
  const { verifiedByAccountId: _accountId, verifiedByAccountName: _accountName, ...rest } = p;
  const name = account?.name.trim().slice(0, 120);
  return {
    ...rest,
    steps: p.steps.map(withoutAiMark),
    verifiedAt: today,
    verifiedBy,
    ...(account?.id ? { verifiedByAccountId: account.id.slice(0, 120) } : {}),
    ...(account?.id && name ? { verifiedByAccountName: name } : {}),
    lastVerifiedAt: today,
    updatedAt: today,
  };
}

/** The step without its AI-draft mark (the same object when it has none). */
export function withoutAiMark(step: ProcedureStep): ProcedureStep {
  if (!step.aiDrafted) return step;
  const { aiDrafted: _aiDrafted, ...rest } = step;
  return rest;
}

/** Steps Grok wrote that no person has edited or verified yet. */
export function aiDraftedSteps(p: Pick<Procedure, "steps">): number {
  return p.steps.filter((s) => s.aiDrafted && s.text.trim()).length;
}

/**
 * A step a stand-in would see: one with text, a caution, pictures or the
 * photo flag. The view, follow mode, print and export all show these steps,
 * so they number them the same way.
 */
export function stepHasContent(s: ProcedureStep): boolean {
  return Boolean(s.text.trim() || s.caution?.trim() || s.imageIds?.length || s.requiresPhoto);
}

/** The steps a stand-in would see, in order. */
export function shownSteps(p: Pick<Procedure, "steps">): ProcedureStep[] {
  return p.steps.filter(stepHasContent);
}

/**
 * Everything a stand-in would follow; a change to any of it needs a new
 * verification. An empty step, which nobody sees, is not part of it.
 */
export function contentKey(p: Procedure): string {
  return JSON.stringify([
    shownSteps(p).map((s) => [
      s.text.trim(),
      s.caution?.trim() ?? "",
      s.imageIds ?? [],
      Boolean(s.requiresPhoto),
    ]),
    p.prerequisites,
    p.placeId ?? "",
    p.module ?? "",
    p.url ?? "",
    p.purpose ?? "",
    p.trigger ?? "",
  ]);
}

/** A one-line summary of what changed, for the change log. */
export function describeChange(prev: Procedure, next: Procedure): string {
  const parts: string[] = [];
  const before = prev.steps.filter((s) => s.text.trim()).length;
  const after = next.steps.filter((s) => s.text.trim()).length;
  if (after > before)
    parts.push(`added ${after - before} ${after - before === 1 ? "step" : "steps"}`);
  if (after < before)
    parts.push(`removed ${before - after} ${before - after === 1 ? "step" : "steps"}`);
  const stepsKey = (p: Procedure) =>
    JSON.stringify(p.steps.map((s) => [s.id, s.text.trim(), s.caution?.trim() ?? ""]));
  // A step kept from before whose words changed, even in a save that also added or removed steps.
  const earlier = new Map(prev.steps.map((s) => [s.id, s]));
  const reworded = next.steps.some((s) => {
    const was = earlier.get(s.id);
    return (
      was !== undefined &&
      (was.text.trim() !== s.text.trim() ||
        (was.caution?.trim() ?? "") !== (s.caution?.trim() ?? ""))
    );
  });
  if (reworded || (after === before && stepsKey(prev) !== stepsKey(next))) {
    parts.push("edited steps");
  }
  // Only steps that carry pictures or the photo flag; adding a plain step is not a picture change.
  const pictures = (p: Procedure) =>
    JSON.stringify(
      p.steps
        .filter((s) => s.imageIds?.length || s.requiresPhoto)
        .map((s) => [s.id, s.imageIds ?? [], Boolean(s.requiresPhoto)]),
    );
  if (pictures(prev) !== pictures(next)) parts.push("changed pictures");
  if (JSON.stringify(prev.prerequisites) !== JSON.stringify(next.prerequisites)) {
    parts.push("changed what is needed first");
  }
  if (
    (prev.placeId ?? "") !== (next.placeId ?? "") ||
    (prev.module ?? "") !== (next.module ?? "") ||
    (prev.url ?? "") !== (next.url ?? "")
  ) {
    parts.push("changed where it is done");
  }
  if (
    (prev.purpose ?? "") !== (next.purpose ?? "") ||
    (prev.trigger ?? "") !== (next.trigger ?? "")
  ) {
    parts.push("changed when and why");
  }
  const summary = parts.join(", ") || "edited";
  return summary.charAt(0).toUpperCase() + summary.slice(1);
}
