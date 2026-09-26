import type { ExceptionAction, ReleaseStatus } from "@/lib/precog/controls/dual-release";

/** What each exception action does, in the owner's words: the form's options and the list's badges. */
export const EXCEPTION_ACTION_LABELS: { id: ExceptionAction; label: string; hint: string }[] = [
  {
    id: "raise_threshold",
    label: "Higher limit",
    hint: "Raise the threshold: one person may release up to a higher amount.",
  },
  {
    id: "lower_threshold",
    label: "Lower limit",
    hint: "Lower the threshold: two people are needed sooner.",
  },
  {
    id: "force_dual",
    label: "Always two signers",
    hint: "Always two signers when this exception matches.",
  },
  {
    id: "waive_dual",
    label: "Waiver",
    hint: "No second signer for this match. The risk you keep is logged; use rarely.",
  },
];

/** The short label for one exception action. */
export function exceptionActionLabel(action: ExceptionAction): string {
  return EXCEPTION_ACTION_LABELS.find((item) => item.id === action)?.label ?? action;
}

/** The release simulator's result, in words instead of the evaluator's status code. */
export const RELEASE_STATUS_LABEL: Record<ReleaseStatus, string> = {
  below_threshold: "One signer is enough: below the threshold",
  needs_second: "Needs a second signer",
  approved_dual: "Released by two people",
  approved_single: "Released by one person",
  approved_exception: "Released by one person under an exception",
  blocked_same_person: "Blocked: the same person signed twice",
  blocked_role: "Blocked: this person may not sign this payment",
  blocked_missing_second: "Blocked: no second signer",
  blocked_policy_off: "Not checked: dual release is off for this channel",
};
