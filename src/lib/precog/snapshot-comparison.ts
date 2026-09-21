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
  },
  archived: {
    profile: PracticeProfile;
    powerMap: RoleAssignment[];
    valueCase: ValueCaseInputs;
    evidence: ValueEvidence[];
  },
) {
  const riskKeys = Object.keys(
    current.profile.riskVariables,
  ) as (keyof PracticeProfile["riskVariables"])[];
  const riskChanges = riskKeys.filter(
    (key) => current.profile.riskVariables[key] !== archived.profile.riskVariables[key],
  ).length;
  const assignmentChanges = diffAssignments(archived.powerMap, current.powerMap);
  const archivedValue = calculateValueCase(archived.valueCase).observed.net;
  const currentValue = calculateValueCase(current.valueCase).observed.net;
  const currentEvidence = summarizeValueEvidence(current.evidence);
  const archivedEvidence = summarizeValueEvidence(archived.evidence);
  const currentQuality = assessEvidenceQuality(current.evidence);
  const archivedQuality = assessEvidenceQuality(archived.evidence);
  return {
    teamSizeDelta: current.profile.staff.teamSize - archived.profile.staff.teamSize,
    riskChanges,
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
