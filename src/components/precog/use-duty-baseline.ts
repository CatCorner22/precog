import { useEffect, useState } from "react";
import type { RoleAssignment } from "@/lib/precog/sod/detect";
import {
  dutyBaselineKey,
  hasStoredDutyBaseline,
  readDutyBaseline,
  seedDutyBaseline,
  storeDutyBaseline,
} from "@/lib/precog/sod/duty-baseline";
import { useWorkspace } from "@/lib/precog/workspace-context";

/**
 * The duty assignments the owner last accepted, kept per business in this
 * browser under `precog.power-map-baseline.v1:{businessId}`. Leaving a screen
 * with changes pending does not quietly approve them: the next visit still
 * shows them against the last baseline the owner accepted. The first visit
 * stores today's assignments as the baseline.
 *
 * A stored baseline that cannot be read gives `baseline` undefined: today's
 * duties are never taken as the accepted ones. The screen says so
 * (UNREADABLE_BASELINE_MESSAGE); accepting the current duties stores a new
 * baseline and restarts review.
 */
export function useDutyBaseline(assignments: RoleAssignment[], businessId: string | undefined) {
  const workspace = useWorkspace();
  const baselineKey = dutyBaselineKey(businessId);
  const [baseline, setBaseline] = useState<RoleAssignment[] | undefined>(() => {
    const stored = readDutyBaseline(workspace.local, businessId);
    if (stored) return stored;
    return hasStoredDutyBaseline(workspace.local, businessId) ? undefined : assignments;
  });

  useEffect(() => {
    if (baseline) seedDutyBaseline(workspace.local, businessId, baseline);
  }, [baselineKey, businessId, baseline, workspace.local]);

  function acceptBaseline(next: RoleAssignment[]) {
    setBaseline(next);
    storeDutyBaseline(workspace.local, businessId, next);
  }

  return { baseline, acceptBaseline };
}
