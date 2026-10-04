import { RequestError, requireObject } from "@/lib/request-errors";
import { isCalendarDate } from "../dates";

/**
 * The engagement record of one firm client (migration 0045): what the firm
 * was engaged to do, for which period, who prepares and who reviews, and
 * whether it has ended. Pure, so the firm page and the server share it.
 */

/** The least retention a firm can pick; the lawyer may lower it (the database allows 1). */
export const RETENTION_YEARS_MIN = 7;
/** The most retention a firm can pick in Precog. */
export const RETENTION_YEARS_MAX = 15;
/** What a firm keeps until its owner picks a period. */
export const RETENTION_YEARS_DEFAULT = 7;
/** The longest scope Precog stores, as the locked version's scope note. */
export const ENGAGEMENT_SCOPE_MAX = 600;

export type EngagementStatus = "active" | "ended";

export interface EngagementRecord {
  scope: string;
  /** "YYYY-MM-DD", or null when not set. */
  periodStart: string | null;
  periodEnd: string | null;
  status: EngagementStatus;
  endedAt: string | null;
  preparerUserId: string | null;
  reviewerUserId: string | null;
}

export interface EngagementInput {
  scope: string;
  periodStart: string | null;
  periodEnd: string | null;
  preparerUserId: string | null;
  reviewerUserId: string | null;
}

export const PERIOD_BACKWARDS = "The period ends before it starts.";
/** The refusal every change to an ended client meets from the firm's members. */
export const ENGAGEMENT_ENDED =
  "The engagement with this client has ended, so the firm can read it but not change it. The firm owner can reopen it on the Firm page.";
export const PICK_MEMBERS = "Pick a preparer and reviewer from the firm's members.";
export const PICK_REVIEWER =
  "Pick a reviewer who holds the owner or reviewer role and is not the preparer.";
export const NOT_A_FIRM_CLIENT = "Only a firm's client has an engagement.";
export const OWNER_ONLY_STATUS = "Only the firm owner can end or reopen an engagement.";
export const RETENTION_REFUSAL = `Pick a period from ${RETENTION_YEARS_MIN} to ${RETENTION_YEARS_MAX} years.`;
const DATE_REFUSAL = "Engagement dates must be ISO dates";

function dateField(value: unknown): string | null {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value !== "string" || !isCalendarDate(value)) {
    throw new RequestError(400, DATE_REFUSAL);
  }
  return value;
}

function userField(value: unknown): string | null {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value !== "string" || value.length > 120)
    throw new RequestError(400, "Unknown member");
  return value;
}

/** The five fields a firm member edits, trimmed and checked; throws a 400 with a plain message. */
export function parseEngagementInput(input: unknown): EngagementInput {
  const raw = requireObject(input);
  const scope =
    typeof raw.scope === "string" ? raw.scope.trim().slice(0, ENGAGEMENT_SCOPE_MAX) : "";
  const periodStart = dateField(raw.periodStart);
  const periodEnd = dateField(raw.periodEnd);
  if (periodStart && periodEnd && periodEnd < periodStart) {
    throw new RequestError(400, PERIOD_BACKWARDS);
  }
  return {
    scope,
    periodStart,
    periodEnd,
    preparerUserId: userField(raw.preparerUserId),
    reviewerUserId: userField(raw.reviewerUserId),
  };
}

/** Whether `years` is a retention period Precog lets a firm pick. */
export function isRetentionYears(years: unknown): years is number {
  return (
    typeof years === "number" &&
    Number.isInteger(years) &&
    years >= RETENTION_YEARS_MIN &&
    years <= RETENTION_YEARS_MAX
  );
}
