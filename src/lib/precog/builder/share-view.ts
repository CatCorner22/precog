import { PASSCODE_ATTEMPT_LIMIT, PASSCODE_ATTEMPT_WINDOW_MINUTES } from "../share/share-attempts";
import { FREQUENCY_LABEL, type EvidenceStatus } from "./evidence";
import type { EvidenceFrequency } from "../types";
import { firstName } from "../text";

/**
 * What the shared-map page shows when a link does not open: the passcode
 * form (with a line above it) or a message, with a retry button when the
 * failure was the network rather than the link.
 */
export type ShareErrorView =
  { kind: "passcode"; message: string } | { kind: "message"; message: string; retry: boolean };

export function shareErrorView(reason: string): ShareErrorView {
  switch (reason) {
    case "passcode":
      return { kind: "passcode", message: "Enter the passcode provided by the owner." };
    case "passcode_wrong":
      return { kind: "passcode", message: "That passcode is not right. Check it and try again." };
    case "rate_limited":
      return {
        kind: "passcode",
        message: `Too many passcode attempts. Wait up to ${PASSCODE_ATTEMPT_WINDOW_MINUTES} minutes, then try again.`,
      };
    case "locked":
      return {
        kind: "passcode",
        message: `After ${PASSCODE_ATTEMPT_LIMIT} wrong passcodes this link locks for ${PASSCODE_ATTEMPT_WINDOW_MINUTES} minutes. Ask the owner for the passcode and try again then.`,
      };
    case "revoked":
      return { kind: "message", message: "The owner revoked this link.", retry: false };
    case "expired":
      return { kind: "message", message: "This link has expired.", retry: false };
    case "network":
      return {
        kind: "message",
        message: "The page could not reach the server. Check the connection and try again.",
        retry: true,
      };
    default:
      return { kind: "message", message: "This link is not valid.", retry: false };
  }
}

/**
 * One evidence item in the shared process table: "Cash count (Daily): overdue".
 * Each item carries its own frequency, so a daily count and a monthly
 * reconciliation in one process are never summarised under one label.
 */
export function evidenceLine(item: { label: string; frequency: string; status: string }): string {
  const frequency = FREQUENCY_LABEL[item.frequency as EvidenceFrequency] ?? item.frequency;
  const status = STATUS_WORDS[item.status as EvidenceStatus] ?? item.status;
  return `${item.label} (${frequency}): ${status}`;
}

/**
 * The owner shown in a value-stream box. A person's first name is enough to
 * tell boxes apart; a redacted share carries role labels ("Office manager A")
 * whose first word would read "Office", so those keep the whole label.
 */
export function ownerTag(owner: string | undefined, redacted: boolean): string {
  if (!owner) return "unowned";
  const tag = redacted ? owner : firstName(owner);
  return tag.length > OWNER_TAG_MAX ? `${tag.slice(0, OWNER_TAG_MAX - 1)}…` : tag;
}

const STATUS_WORDS: Record<EvidenceStatus, string> = {
  never: "never recorded",
  current: "current",
  due_soon: "due soon",
  overdue: "overdue",
};

const OWNER_TAG_MAX = 18;
