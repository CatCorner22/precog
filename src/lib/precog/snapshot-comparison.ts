import { normalizeInsuranceRecord, type InsuranceRecord } from "./scoring/insurance-record";
import { VARIABLE_CATALOG } from "./scoring/variable-catalog";
import type { PracticeProfile } from "./practice-profile";
import { diffAssignments } from "./sod/assignment-diff";
import type { RoleAssignment } from "./sod/detect";
import { count } from "./text";
import { observedValueStatus, type ValueCaseInputs } from "./value-case";
import { summarizeValueEvidence, type ValueEvidence } from "./value-evidence";
import { formatSigned, formatUsd, formatUsdDelta } from "../utils";

export function compareAssessmentStates(
  current: {
    profile: PracticeProfile;
    powerMap: RoleAssignment[];
    valueCase: ValueCaseInputs;
    evidence: ValueEvidence[];
    asOf?: Date;
  },
  archived: {
    profile: PracticeProfile;
    powerMap: RoleAssignment[];
    valueCase: ValueCaseInputs;
    evidence: ValueEvidence[];
    asOf?: Date;
  },
) {
  const riskKeys = [
    ...new Set([
      ...Object.keys(current.profile.riskVariables),
      ...Object.keys(archived.profile.riskVariables),
    ]),
  ] as (keyof PracticeProfile["riskVariables"])[];
  const riskVariableChanges = riskKeys.flatMap((key) => {
    const comparable = (value: unknown) =>
      key === "insurance" ? JSON.stringify(normalizeInsuranceRecord(value) ?? null) : value;
    const before = comparable(archived.profile.riskVariables[key]);
    const after = comparable(current.profile.riskVariables[key]);
    if (before === after) return [];
    // `before` and `after` stay the comparison values; the texts are for people.
    return [
      {
        key,
        before,
        after,
        label: riskInputLabel(key),
        beforeText: riskInputText(key, archived.profile.riskVariables[key]),
        afterText: riskInputText(key, current.profile.riskVariables[key]),
      },
    ];
  });
  const assignmentChanges = diffAssignments(archived.powerMap, current.powerMap);
  // Only what the owner entered counts as observed; a value built from the
  // app's defaults is not a change anyone saw.
  const archivedValue = observedValueStatus(archived.valueCase).net.value;
  const currentValue = observedValueStatus(current.valueCase).net.value;
  const currentAsOf = current.asOf ?? new Date();
  const archivedAsOf = archived.asOf ?? currentAsOf;
  const currentEvidence = summarizeValueEvidence(current.evidence, currentAsOf);
  const archivedEvidence = summarizeValueEvidence(archived.evidence, archivedAsOf);
  return {
    teamSizeDelta: current.profile.staff.teamSize - archived.profile.staff.teamSize,
    riskChanges: riskVariableChanges.length,
    riskVariableChanges,
    grants: assignmentChanges.filter((item) => item.kind === "duty_granted").length,
    revocations: assignmentChanges.filter((item) => item.kind === "duty_revoked").length,
    hires: assignmentChanges.filter((item) => item.kind === "person_added").length,
    removals: assignmentChanges.filter((item) => item.kind === "person_removed").length,
    assignmentChanges,
    /** Null unless both assessments carry an observed net value. */
    netObservedValueDelta:
      currentValue === null || archivedValue === null ? null : currentValue - archivedValue,
    verifiedEvidenceDelta: currentEvidence.verified - archivedEvidence.verified,
    verifiedRecoveryDelta: currentEvidence.recoveries - archivedEvidence.recoveries,
    evidenceReadinessDelta: currentEvidence.score - archivedEvidence.score,
  };
}

export function createSnapshotComparisonReport(
  title: string,
  snapshotCreatedAt: string,
  comparison: ReturnType<typeof compareAssessmentStates>,
  generatedAt: Date = new Date(),
) {
  const safe = (value: string) => value.replace(/[\r\n]+/g, " ").trim();
  return [
    `# Assessment comparison — ${safe(title)}`,
    "",
    `Snapshot saved: ${snapshotCreatedAt}`,
    `Report generated: ${generatedAt.toISOString()}`,
    "",
    "## Change summary",
    "",
    `- Team size: ${formatSigned(comparison.teamSizeDelta)}`,
    `- Risk inputs changed: ${comparison.riskChanges}`,
    `- Duties assigned and revoked: ${comparison.grants} assigned, ${comparison.revocations} revoked`,
    `- People added and removed: ${comparison.hires} added, ${comparison.removals} removed`,
    `- Net observed value: ${
      comparison.netObservedValueDelta === null
        ? "not observed in both assessments"
        : formatUsdDelta(comparison.netObservedValueDelta)
    }`,
    `- Verified evidence: ${formatSigned(comparison.verifiedEvidenceDelta)}`,
    `- Evidence readiness: ${formatSigned(comparison.evidenceReadinessDelta)} points`,
    `- Verified recoveries: ${formatUsdDelta(comparison.verifiedRecoveryDelta)}`,
    "",
    "## Responsibility changes",
    "",
    ...(comparison.assignmentChanges.length
      ? comparison.assignmentChanges.map(
          (change) =>
            `- ${safe(change.kind.replaceAll("_", " "))}: ${safe(change.personName)} — ${safe(change.dutyLabel ?? change.role)}`,
        )
      : ["- Precog found no responsibility changes."]),
    "",
    "## Risk-input changes",
    "",
    ...(comparison.riskVariableChanges.length
      ? comparison.riskVariableChanges.map(
          (change) => `- ${change.label}: ${safe(change.beforeText)} → ${safe(change.afterText)}`,
        )
      : ["- Precog found no risk-input changes."]),
    "",
    "> This comparison describes modeled assessment changes. Validate actual access, evidence, and operating conditions before relying on it.",
    "",
  ].join("\n");
}

const INSURANCE_STATUS_TEXT: Record<InsuranceRecord["status"], string> = {
  unknown: "not assessed",
  none: "no crime policy",
  reported: "policy recorded",
};

/** A risk input's name as the Dynamic variables panel shows it. */
export function riskInputLabel(key: string): string {
  if (key === "insurance") return "Insurance information status";
  return (
    VARIABLE_CATALOG.find((item) => item.id === key)?.label ??
    key.replace(/([a-z])([A-Z])/g, "$1 $2").replace(/^./, (letter) => letter.toUpperCase())
  );
}

/**
 * A risk input's value with its unit: "$4,200" for an amount, "10%" for a
 * percentage, "×1.2" for the claims load factor, "Yes" or "No" for a switch,
 * and a phrase for the insurance record.
 */
export function riskInputText(key: string, value: unknown): string {
  if (key === "insurance") {
    const record = normalizeInsuranceRecord(value);
    if (!record) return INSURANCE_STATUS_TEXT.unknown;
    return record.status === "reported"
      ? `${INSURANCE_STATUS_TEXT.reported} (${count(record.confirmedFields.length, "figure")} confirmed)`
      : INSURANCE_STATUS_TEXT[record.status];
  }
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (typeof value !== "number") return value == null ? "not set" : String(value);
  const kind = VARIABLE_CATALOG.find((item) => item.id === key)?.kind;
  if (kind === "currency") return formatUsd(value);
  if (kind === "percent") return `${value.toLocaleString("en-US")}%`;
  if (key === "claimsLoadFactor") return `×${value.toLocaleString("en-US")}`;
  return value.toLocaleString("en-US");
}
