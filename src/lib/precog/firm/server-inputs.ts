import { RequestError, requireObject } from "@/lib/request-errors";
import { isCalendarDate } from "../dates";
import { isBusinessId } from "../profile-input";
import type { FirmPlan } from "./pricing";
import { INVITE_ROLES, type InviteRole } from "./store";

/**
 * The input rules the firm and integration server functions share. Each
 * throws a 400 with a plain message, so a bad request never reaches the
 * database as a 500.
 */
export const PLANS: ReadonlySet<FirmPlan> = new Set<FirmPlan>(["assessment", "monthly"]);
export const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** The validator for a server function that takes only a business id. */
export function businessInput(input: { businessId: string }): { businessId: string } {
  const raw = requireObject(input);
  if (!isBusinessId(raw.businessId)) throw new RequestError(400, "Unknown business id");
  return { businessId: raw.businessId };
}

export function idInput(input: { id: string }): { id: string } {
  const raw = requireObject(input);
  if (typeof raw.id !== "string" || !/^[\w-]{4,64}$/.test(raw.id)) {
    throw new RequestError(400, "Unknown id");
  }
  return { id: raw.id };
}

/** An invitation token: 48 lowercase hex characters. */
export function tokenInput(input: { token: string }): { token: string } {
  const raw = requireObject(input);
  if (typeof raw.token !== "string" || !/^[a-f0-9]{48}$/.test(raw.token)) {
    throw new RequestError(400, "Unknown invitation");
  }
  return { token: raw.token };
}

export function inviteRoleInput(value: unknown): InviteRole {
  if (!INVITE_ROLES.includes(value as InviteRole)) throw new RequestError(400, "Unknown role");
  return value as InviteRole;
}

/** An engagement stamp: absent is null; anything but an ISO date or instant is a 400. */
export function instantInput(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  if (
    typeof value !== "string" ||
    !ISO_DAY_OR_INSTANT.test(value) ||
    !isCalendarDate(value.slice(0, 10)) ||
    Number.isNaN(Date.parse(value))
  ) {
    throw new RequestError(400, "Engagement dates must be ISO dates");
  }
  return value;
}

const ISO_DAY_OR_INSTANT =
  /^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:?\d{2})?)?$/;
