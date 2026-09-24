import type { PracticeProfile } from "./practice-profile";
import { diffAssignments } from "./sod/assignment-diff";
import type { RoleAssignment } from "./sod/detect";
import { observedValueStatus, type ValueCaseInputs } from "./value-case";
import {
  assessEvidenceQuality,
  summarizeValueEvidence,
  type ValueEvidence,
} from "./value-evidence";

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
  const riskKeys = Object.keys(
    current.profile.riskVariables,
  ) as (keyof PracticeProfile["riskVariables"])[];
  const riskVariableChanges = riskKeys.flatMap((key) => {
    const before = archived.profile.riskVariables[key];
    const after = current.profile.riskVariables[key];
    return before === after ? [] : [{ key, before, after }];
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
  const currentQuality = assessEvidenceQuality(current.evidence, currentAsOf);
  const archivedQuality = assessEvidenceQuality(archived.evidence, archivedAsOf);
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
    evidenceReadinessDelta: currentQuality.score - archivedQuality.score,
  };
}

export function createSnapshotComparisonReport(
  title: string,
  snapshotCreatedAt: string,
  comparison: ReturnType<typeof compareAssessmentStates>,
  generatedAt: Date = new Date(),
) {
  const safe = (value: string) => value.replace(/[\r\n]+/g, " ").trim();
  const signed = (value: number) => `${value > 0 ? "+" : ""}${value}`;
  const dollars = (value: number) => `${value > 0 ? "+" : ""}$${value.toLocaleString("en-US")}`;
  return [
    `# Assessment comparison — ${safe(title)}`,
    "",
    `Snapshot saved: ${snapshotCreatedAt}`,
    `Report generated: ${generatedAt.toISOString()}`,
    "",
    "## Change summary",
    "",
    `- Team size: ${signed(comparison.teamSizeDelta)}`,
    `- Risk inputs changed: ${comparison.riskChanges}`,
    `- Duty grants / revocations: ${comparison.grants} / ${comparison.revocations}`,
    `- People added / removed: ${comparison.hires} / ${comparison.removals}`,
    `- Net observed value: ${
      comparison.netObservedValueDelta === null
        ? "not observed in both assessments"
        : dollars(comparison.netObservedValueDelta)
    }`,
    `- Verified evidence: ${signed(comparison.verifiedEvidenceDelta)}`,
    `- Evidence readiness: ${signed(comparison.evidenceReadinessDelta)} points`,
    `- Verified recoveries: ${dollars(comparison.verifiedRecoveryDelta)}`,
    "",
    "## Responsibility changes",
    "",
    ...(comparison.assignmentChanges.length
      ? comparison.assignmentChanges.map(
          (change) =>
            `- ${safe(change.kind.replaceAll("_", " "))}: ${safe(change.personName)} — ${safe(change.dutyLabel ?? change.role)}`,
        )
      : ["- No responsibility changes detected."]),
    "",
    "## Risk-input changes",
    "",
    ...(comparison.riskVariableChanges.length
      ? comparison.riskVariableChanges.map(
          (change) => `- ${safe(change.key)}: ${String(change.before)} → ${String(change.after)}`,
        )
      : ["- No risk-input changes detected."]),
    "",
    "> This comparison describes modeled assessment changes. Validate actual access, evidence, and operating conditions before relying on it.",
    "",
  ].join("\n");
}
