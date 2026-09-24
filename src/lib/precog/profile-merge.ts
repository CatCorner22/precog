import type { IndustryId } from "./industry";
import {
  defaultProfile,
  normalizeCustomKnowledge,
  normalizePlannedAbsences,
  normalizeLeaverAccessChecks,
  type PracticeProfile,
} from "./practice-profile";
import { normalizeEngagement } from "./firm/engagement";
import { normalizeReviewRecords } from "./firm/reviews";
import { normalizeAccessReconciliation } from "./firm/reconcile";

/**
 * A stored profile row as the server hands it back: the industry's defaults
 * under the stored document, with the list fields checked. Nested objects
 * (staff, risk variables, dual release) are spread over their defaults, so
 * every stored field, including `staff.segregationSource` and
 * `staff.bankRecSource`, comes back as it was saved. The client runs its own
 * normaliser on the result.
 */
export function mergeProfile(
  row: {
    name: string;
    industry: string;
    profile: PracticeProfile;
  },
  today: string,
): PracticeProfile {
  const base = defaultProfile((row.industry as IndustryId) || row.profile.industry || "dental");
  return {
    ...base,
    ...row.profile,
    practiceName: row.name || row.profile.practiceName || base.practiceName,
    staff: { ...base.staff, ...row.profile.staff },
    riskVariables: { ...base.riskVariables, ...row.profile.riskVariables },
    dualRelease: { ...base.dualRelease, ...row.profile.dualRelease },
    decisions: Array.isArray(row.profile.decisions) ? row.profile.decisions : [],
    customProcesses: Array.isArray(row.profile.customProcesses)
      ? row.profile.customProcesses
      : null,
    customPeople: Array.isArray(row.profile.customPeople) ? row.profile.customPeople : null,
    customKnowledge: normalizeCustomKnowledge(row.profile.customKnowledge, today),
    customRelations: Array.isArray(row.profile.customRelations)
      ? row.profile.customRelations
      : null,
    plannedAbsences: normalizePlannedAbsences(row.profile.plannedAbsences),
    leaverAccessChecks: normalizeLeaverAccessChecks(row.profile.leaverAccessChecks),
    mapLayout: row.profile.mapLayout ?? {},
    savedProcessBlocks: Array.isArray(row.profile.savedProcessBlocks)
      ? row.profile.savedProcessBlocks
      : [],
    mapHealthHistory: Array.isArray(row.profile.mapHealthHistory)
      ? row.profile.mapHealthHistory
      : [],
    mapVersions: Array.isArray(row.profile.mapVersions) ? row.profile.mapVersions : [],
    engagement: normalizeEngagement(row.profile.engagement),
    monthlyReviews: normalizeReviewRecords(row.profile.monthlyReviews),
    accessReconciliation: normalizeAccessReconciliation(row.profile.accessReconciliation),
  };
}
