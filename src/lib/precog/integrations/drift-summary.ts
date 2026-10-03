import type { IntegrationDrift } from "./qbo/model";
import type { AccessReconciliation } from "../firm/reconcile";
import { pendingQueueCount } from "../firm/reconcile";
import { driftIsEmpty } from "./qbo/model";

/** Compact drift snapshot stored on the business profile for Home and the weekly actions. */
export interface IntegrationDriftSummary {
  updatedAt: string;
  source: "quickbooks" | "access" | "both";
  headline: string;
  qboEmployeesNotOnMap: number;
  qboPeopleNotInBooks: number;
  qboVendorsAdded: number;
  accessPending: number;
}

export function summarizeQboDrift(drift: IntegrationDrift | null): IntegrationDriftSummary | null {
  if (!drift || driftIsEmpty(drift)) return null;
  const parts: string[] = [];
  if (drift.employeesNotOnMap.length)
    parts.push(`${drift.employeesNotOnMap.length} employee(s) in the books but not on your map`);
  if (drift.peopleNotInBooks.length)
    parts.push(`${drift.peopleNotInBooks.length} on the map but not in the books`);
  if (drift.vendorsAdded.length)
    parts.push(`${drift.vendorsAdded.length} new vendor(s) since the last reading`);
  return {
    updatedAt: new Date().toISOString(),
    source: "quickbooks",
    headline: parts.join("; ") || "QuickBooks reading differs from your duty map.",
    qboEmployeesNotOnMap: drift.employeesNotOnMap.length,
    qboPeopleNotInBooks: drift.peopleNotInBooks.length,
    qboVendorsAdded: drift.vendorsAdded.length,
    accessPending: 0,
  };
}

export function summarizeAccessReconciliation(
  rec: AccessReconciliation | null | undefined,
  previous?: IntegrationDriftSummary | null,
): IntegrationDriftSummary | null {
  const pending = pendingQueueCount(rec ?? undefined);
  if (!pending && !previous) return previous ?? null;
  const qbo = previous ?? {
    updatedAt: new Date().toISOString(),
    source: "access" as const,
    headline: "",
    qboEmployeesNotOnMap: 0,
    qboPeopleNotInBooks: 0,
    qboVendorsAdded: 0,
    accessPending: 0,
  };
  if (
    pending === 0 &&
    qbo.qboEmployeesNotOnMap + qbo.qboPeopleNotInBooks + qbo.qboVendorsAdded === 0
  ) {
    return null;
  }
  const headline =
    pending > 0
      ? `${pending} access or vendor row(s) from your import still need mapping to the duty map`
      : qbo.headline;
  return {
    ...qbo,
    updatedAt: new Date().toISOString(),
    source: previous?.source === "quickbooks" ? "both" : "access",
    headline,
    accessPending: pending,
  };
}

export function mergeDriftSummary(
  qbo: IntegrationDriftSummary | null,
  access: IntegrationDriftSummary | null,
): IntegrationDriftSummary | null {
  if (!qbo && !access) return null;
  if (!qbo) return access;
  if (!access) return qbo;
  return {
    updatedAt: new Date().toISOString(),
    source: "both",
    headline: [qbo.headline, access.headline].filter(Boolean).join("; "),
    qboEmployeesNotOnMap: qbo.qboEmployeesNotOnMap,
    qboPeopleNotInBooks: qbo.qboPeopleNotInBooks,
    qboVendorsAdded: qbo.qboVendorsAdded,
    accessPending: access.accessPending,
  };
}

export function normalizeIntegrationDriftSummary(
  value: unknown,
): IntegrationDriftSummary | undefined {
  if (!value || typeof value !== "object") return undefined;
  const raw = value as Record<string, unknown>;
  const source =
    raw.source === "quickbooks" || raw.source === "access" || raw.source === "both"
      ? raw.source
      : undefined;
  if (!source) return undefined;
  const headline = typeof raw.headline === "string" ? raw.headline.slice(0, 500) : "";
  const updatedAt = typeof raw.updatedAt === "string" ? raw.updatedAt : new Date().toISOString();
  return {
    updatedAt,
    source,
    headline,
    qboEmployeesNotOnMap: num(raw.qboEmployeesNotOnMap),
    qboPeopleNotInBooks: num(raw.qboPeopleNotInBooks),
    qboVendorsAdded: num(raw.qboVendorsAdded),
    accessPending: num(raw.accessPending),
  };
}

function num(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0;
}
