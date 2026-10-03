import { useEffect, useState } from "react";
import type { RoleAssignment } from "@/lib/precog/sod/detect";
import {
  dutyBaselineKey,
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
 */
export function useDutyBaseline(assignments: RoleAssignment[], businessId: string | undefined) {
  const workspace = useWorkspace();
  const baselineKey = dutyBaselineKey(businessId);
  const [baseline, setBaseline] = useState<RoleAssignment[]>(
    () => readDutyBaseline(workspace.local, businessId) ?? assignments,
  );

  useEffect(() => {
    seedDutyBaseline(workspace.local, businessId, baseline);
  }, [baselineKey, businessId, baseline, workspace.local]);

  function acceptBaseline(next: RoleAssignment[]) {
    setBaseline(next);
    storeDutyBaseline(workspace.local, businessId, next);
  }

  return { baseline, acceptBaseline };
}
