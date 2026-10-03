import { useEffect, useState } from "react";
import { DEFAULT_BUSINESS_ID } from "@/lib/precog/business-id";
import type { RoleAssignment } from "@/lib/precog/sod/detect";
import { normalizeRoleAssignments } from "@/lib/precog/sod/model-io";
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
  const baselineKey = `precog.power-map-baseline.v1:${businessId ?? DEFAULT_BUSINESS_ID}`;
  const [baseline, setBaseline] = useState<RoleAssignment[]>(() => {
    try {
      const stored = workspace.local?.getItem(baselineKey);
      const restored = stored ? normalizeRoleAssignments(JSON.parse(stored)) : undefined;
      if (restored) return restored;
    } catch {
      /* storage unavailable or corrupt: start from today's assignments */
    }
    return assignments;
  });

  useEffect(() => {
    try {
      if (workspace.local?.getItem(baselineKey) === null) {
        workspace.local?.setItem(baselineKey, JSON.stringify(baseline));
      }
    } catch {
      /* storage unavailable */
    }
  }, [baselineKey, baseline, workspace.local]);

  function acceptBaseline(next: RoleAssignment[]) {
    setBaseline(next);
    try {
      workspace.local?.setItem(baselineKey, JSON.stringify(next));
    } catch {
      /* storage unavailable */
    }
  }

  return { baseline, acceptBaseline };
}
