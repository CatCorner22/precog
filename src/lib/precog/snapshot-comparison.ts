import type { PracticeProfile } from "./practice-profile";
import { diffAssignments } from "./sod/assignment-diff";
import type { RoleAssignment } from "./sod/detect";
import { calculateValueCase, type ValueCaseInputs } from "./value-case";
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
  const archivedValue = calculateValueCase(archived.valueCase).observed.net;
  const currentValue = calculateValueCase(current.valueCase).observed.net;
  const currentEvidence = summarizeValueEvidence(current.evidence);
  const archivedEvidence = summarizeValueEvidence(archived.evidence);
  const currentQuality = assessEvidenceQuality(current.evidence, current.asOf ?? new Date());
  const archivedQuality = assessEvidenceQuality(
    archived.evidence,
    archived.asOf ?? current.asOf ?? new Date(),
  );
  return {
    teamSizeDelta: current.profile.staff.teamSize - archived.profile.staff.teamSize,
    riskChanges: riskVariableChanges.length,
    riskVariableChanges,
    grants: assignmentChanges.filter((item) => item.kind === "duty_granted").length,
    revocations: assignmentChanges.filter((item) => item.kind === "duty_revoked").length,
    hires: assignmentChanges.filter((item) => item.kind === "person_added").length,
    removals: assignmentChanges.filter((item) => item.kind === "person_removed").length,
    assignmentChanges,
    netObservedValueDelta: currentValue - archivedValue,
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
    `- Net observed value: ${dollars(comparison.netObservedValueDelta)}`,
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
