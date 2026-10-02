import type { IntegrationDriftSummary } from "./drift-summary";
import type { AccessReconciliation } from "../firm/reconcile";
import { pendingQueueCount } from "../firm/reconcile";
import { count, verb } from "../text";
import { formatDay } from "../dates";

export interface DriftAction {
  id: string;
  title: string;
  why: string;
  tab: "firm" | "sod" | "start";
  priority: number;
}

const PRIORITY = 88;

/**
 * The scope limit beside the duty-conflict findings when the books show
 * people the duty map does not list: the findings cover only the people on
 * the map. Dated, because the stored reading does not refresh when people
 * are added to the map. Pending access-import rows stay out: they mix
 * sign-ins with supplier rows, and the drift actions already ask for them.
 * Null when no drift reading shows anyone missing.
 */
export function sodScopeLine(summary: IntegrationDriftSummary | null | undefined): string | null {
  const n = summary?.qboEmployeesNotOnMap ?? 0;
  if (!summary || n <= 0) return null;
  return `At the reading on ${formatDay(summary.updatedAt)}, your books showed ${count(n, "person", "people")} the duty map does not list; ${verb(n, "that person's", "their")} duties are not assessed.`;
}

/** Ranked owner actions when books or access exports disagree with the duty map. */
export function buildDriftActions(input: {
  summary: IntegrationDriftSummary | null | undefined;
  accessReconciliation: AccessReconciliation | null | undefined;
}): DriftAction[] {
  const actions: DriftAction[] = [];
  const summary = input.summary;
  if (summary?.qboEmployeesNotOnMap) {
    actions.push({
      id: "drift-qbo-employees",
      title: "Match payroll names to your team map",
      why: `${summary.qboEmployeesNotOnMap} people appear in QuickBooks but not on your duty map. Add or map them before relying on segregation checks.`,
      tab: "firm",
      priority: PRIORITY,
    });
  }
  if (summary?.qboPeopleNotInBooks) {
    actions.push({
      id: "drift-qbo-missing-books",
      title: "Remove or confirm people not in the books",
      why: `${summary.qboPeopleNotInBooks} people on your map have no employee record in QuickBooks — confirm they are still employed or update the map.`,
      tab: "firm",
      priority: PRIORITY - 1,
    });
  }
  if (summary?.qboVendorsAdded) {
    actions.push({
      id: "drift-qbo-vendors",
      title: "Review new vendors in the books",
      why: `${summary.qboVendorsAdded} vendor(s) were added since the last reading. Match them to who can create or approve suppliers on your map.`,
      tab: "firm",
      priority: PRIORITY - 2,
    });
  }
  const pending = pendingQueueCount(input.accessReconciliation ?? undefined);
  if (pending > 0 || summary?.accessPending) {
    actions.push({
      id: "drift-access-import",
      title: "Finish mapping imported access rows",
      why: `${pending || summary?.accessPending} row(s) from your user or vendor export still need a person and duty on the map.`,
      tab: "firm",
      priority: PRIORITY - 3,
    });
  }
  return actions;
}
