import type { PracticeProfile } from "./practice-profile";
import { calculateValueCase, observedValueStatus, type ValueCaseInputs } from "./value-case";
import { summarizeValueEvidence, type ValueEvidence } from "./value-evidence";

/**
 * How the verified hours in the evidence register compare with the hours the
 * value case calculates.
 *
 * - `match`: nothing to say (no verified hours, or within half an hour).
 * - `apply`: "Use verified hours" can set the hours per review to match.
 * - `unreachable`: the verified hours exceed what the review figures allow
 *   (hours per review before × reviews per year), so no "with Precog" figure
 *   can match; `most` is that ceiling.
 * - `no-reviews`: reviews per year is 0, so hours per review cannot be set.
 */
export type HoursCheck =
  | { kind: "match" }
  | { kind: "apply" }
  | { kind: "unreachable"; most: number }
  | { kind: "no-reviews" };

/**
 * How the verified recoveries compare with the documented recoveries typed on
 * the value case: `unbacked` when a figure is typed but no verified recovery
 * backs it, `differs` when verified recoveries exist and total something else.
 */
export type RecoveryCheck = { kind: "match" } | { kind: "unbacked" } | { kind: "differs" };

/** One line of the evidence checklist and whether the owner's records show it. */
export interface ChecklistItem {
  label: string;
  done: boolean;
}

/** Hours closer than this count as matching, so floating-point residue never shows a banner. */
const HOURS_TOLERANCE = 0.5;

export function hoursCheck(verifiedHours: number, inputs: ValueCaseInputs): HoursCheck {
  if (verifiedHours <= 0) return { kind: "match" };
  const { hoursSaved } = calculateValueCase(inputs).observed;
  if (Math.abs(verifiedHours - hoursSaved) < HOURS_TOLERANCE) return { kind: "match" };
  if (inputs.annualReviews === 0) return { kind: "no-reviews" };
  const most = inputs.reviewHoursBefore * inputs.annualReviews;
  if (verifiedHours > most) return { kind: "unreachable", most };
  return { kind: "apply" };
}

export function recoveryCheck(verifiedRecoveries: number, typedRecoveries: number): RecoveryCheck {
  if (verifiedRecoveries === typedRecoveries) return { kind: "match" };
  return verifiedRecoveries === 0 ? { kind: "unbacked" } : { kind: "differs" };
}

/**
 * What the "Observed value" figure is made of, for the note under it:
 * "Labor", "Documented recoveries", or both.
 */
export function observedValueParts(
  inputs: ValueCaseInputs,
  typed: Parameters<typeof observedValueStatus>[1],
): string {
  const status = observedValueStatus(inputs, typed);
  const labor = status.hours.observed && status.entered.has("hourlyCost");
  const recoveries = status.entered.has("directRecoveries");
  if (labor && recoveries) return "Labor + documented recoveries";
  return labor ? "Labor" : "Documented recoveries";
}

/**
 * The evidence checklist, each line derived from what the owner has recorded,
 * so nothing reads as done until the records show it.
 */
export function evidenceChecklist({
  hoursObserved,
  evidence,
  profile,
  asOf = new Date(),
}: {
  /** The owner entered their own review hours on the value case. */
  hoursObserved: boolean;
  evidence: ValueEvidence[];
  profile: Pick<PracticeProfile, "mapHealthHistory" | "accessReconciliation">;
  asOf?: Date;
}): ChecklistItem[] {
  const verifiedOf = (kinds: ValueEvidence["kind"][]) =>
    summarizeValueEvidence(
      evidence.filter((item) => kinds.includes(item.kind)),
      asOf,
    ).verified;
  return [
    {
      label: "Baseline review time documented",
      done: hoursObserved || verifiedOf(["time"]) > 0,
    },
    {
      label: "Closed findings and recoveries linked to evidence",
      done: verifiedOf(["recovery", "control"]) > 0,
    },
    {
      label: "Control coverage tracked over time",
      done: (profile.mapHealthHistory?.length ?? 0) >= 2,
    },
    {
      label: "Actual access reconciled to approved access",
      done: Boolean(profile.accessReconciliation),
    },
    { label: "Comparative outcome study completed", done: false },
  ];
}
