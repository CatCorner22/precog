import type {
  DualReleaseCoverage,
  DualReleasePolicy,
  ExceptionAction,
  ReleaseChannel,
  ThresholdException,
} from "@/lib/precog/controls/dual-release";
import type { DecisionInput } from "@/lib/precog/profile-actions";
import { exceptionActionLabel } from "./dual-release-constants";

/** What the owner has typed into the "Add exception" form. */
export interface ExceptionForm {
  label: string;
  action: ExceptionAction;
  thresholdUsd: number;
  channels: ReleaseChannel[];
  payee: string;
  personId: string;
  role: string;
  /** Amount band, as typed: empty means no bound. */
  amountMin: string;
  amountMax: string;
  from: string;
  to: string;
  reason: string;
  residual: string;
}

/** The form as it opens, and as it resets after each saved exception. */
export const EMPTY_EXCEPTION_FORM: ExceptionForm = {
  label: "",
  action: "raise_threshold",
  thresholdUsd: 3500,
  channels: ["ach"],
  payee: "",
  personId: "",
  role: "",
  amountMin: "",
  amountMax: "",
  from: "",
  to: "",
  reason: "",
  residual: "",
};

/**
 * The master switch. Only the policy changes: the profile derives the staff
 * "dual control on payments" flag from it (policy on and the ACH or deposit
 * channel on), so the switch never credits dual control that no payment
 * channel enforces.
 */
export function withMasterSwitch(policy: DualReleasePolicy, enabled: boolean): DualReleasePolicy {
  return { ...policy, enabled };
}

/**
 * The exception the form describes, or null while the label or the reason is
 * missing. `approvedByPersonId` is the business's sole owner when there is
 * one; with no single owner the field is left out rather than naming anyone.
 */
export function exceptionFromForm(
  form: ExceptionForm,
  stamp: { id: string; createdAt: string; approvedByPersonId: string | null },
): ThresholdException | null {
  const label = form.label.trim();
  const reason = form.reason.trim();
  if (!label || !reason) return null;
  const setsThreshold = form.action === "raise_threshold" || form.action === "lower_threshold";
  const [amountMinUsd, amountMaxUsd] = amountBand(form.amountMin, form.amountMax);
  return {
    id: stamp.id,
    label: label.slice(0, 80),
    channels: form.channels,
    action: form.action,
    thresholdUsd: setsThreshold ? Math.max(0, Math.round(form.thresholdUsd)) : undefined,
    payeeContains: form.payee.trim() || undefined,
    personId: form.personId || undefined,
    role: form.role || undefined,
    ...(amountMinUsd !== undefined ? { amountMinUsd } : {}),
    ...(amountMaxUsd !== undefined ? { amountMaxUsd } : {}),
    effectiveFrom: form.from || undefined,
    effectiveTo: form.to || undefined,
    enabled: true,
    reason: reason.slice(0, 300),
    residualNote: form.residual.trim().slice(0, 300) || undefined,
    ...(stamp.approvedByPersonId ? { approvedByPersonId: stamp.approvedByPersonId } : {}),
    createdAt: stamp.createdAt,
  };
}

/** The decision-journal entry logged with a new exception. */
export function exceptionDecision(ex: ThresholdException): DecisionInput {
  return {
    subject: `Threshold exception: ${ex.label}`,
    kind: ex.action === "waive_dual" ? "accept_residual" : "remediate",
    note: `${exceptionActionLabel(ex.action)} · ${ex.reason}${ex.residualNote ? ` · Risk kept: ${ex.residualNote}` : ""}`,
    reviewBy: ex.effectiveTo || undefined,
    linkedTab: "sod",
  };
}

/**
 * The decision-journal entry for the policy as it stands: an "on" policy is a
 * remediation, an "off" one is a risk the owner keeps, and the subject says
 * which, so the journal never records turning on a policy that is off.
 */
export function policyDecision(
  policy: DualReleasePolicy,
  coverage: readonly DualReleaseCoverage[],
  activeExceptions: number,
  reviewBy: string,
): DecisionInput {
  const covered = coverage.filter((c) => c.covered).map((c) => c.label);
  const exceptions = `${activeExceptions} active exception${activeExceptions === 1 ? "" : "s"}`;
  return policy.enabled
    ? {
        subject: `Dual release on for ${covered.length} channel${covered.length === 1 ? "" : "s"}`,
        kind: "remediate",
        note: `${covered.length ? covered.join(", ") : "No channel turned on yet"}; ${exceptions}.`,
        reviewBy,
        linkedTab: "sod",
      }
    : {
        subject: "Dual release off",
        kind: "accept_residual",
        note: `One person may release any payment on their own; ${exceptions} on file.`,
        reviewBy,
        linkedTab: "sod",
      };
}

/** The amount band in whole dollars, low end first; an empty or unreadable box is no bound. */
function amountBand(minText: string, maxText: string): [number | undefined, number | undefined] {
  const min = amountBound(minText);
  const max = amountBound(maxText);
  return min !== undefined && max !== undefined && min > max ? [max, min] : [min, max];
}

function amountBound(text: string): number | undefined {
  if (!text.trim()) return undefined;
  const value = Number(text);
  return Number.isFinite(value) && value >= 0 ? Math.round(value) : undefined;
}
