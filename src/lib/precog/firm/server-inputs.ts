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

/** A logo as the browser re-encodes it: PNG or JPEG, base64, 64 KB of picture (88 000 characters). */
const LOGO_DATA_URL = /^data:image\/(png|jpeg);base64,[A-Za-z0-9+/=]+$/;
export const MAX_LOGO_DATA_URL_CHARS = 88_000;
export const LOGO_REFUSAL = "The logo must be a PNG or JPEG of 64 KB or less";

/** The firm's letterhead text, logo and cover-page switch. */
export function letterheadInput(input: {
  letterhead: string;
  logoDataUrl: string | null;
  coverPage: boolean;
}): { letterhead: string; logoDataUrl: string | null; coverPage: boolean } {
  const raw = requireObject(input);
  const letterhead = typeof raw.letterhead === "string" ? raw.letterhead.trim().slice(0, 600) : "";
  let logoDataUrl: string | null = null;
  if (raw.logoDataUrl !== null && raw.logoDataUrl !== undefined && raw.logoDataUrl !== "") {
    if (
      typeof raw.logoDataUrl !== "string" ||
      raw.logoDataUrl.length > MAX_LOGO_DATA_URL_CHARS ||
      !LOGO_DATA_URL.test(raw.logoDataUrl)
    ) {
      throw new RequestError(400, LOGO_REFUSAL);
    }
    logoDataUrl = raw.logoDataUrl;
  }
  return { letterhead, logoDataUrl, coverPage: raw.coverPage === true };
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
