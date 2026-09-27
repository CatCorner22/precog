import { useState } from "react";
import { usePractice } from "@/lib/precog/practice-context";
import {
  ENTITLEMENTS,
  entitlementLabel,
  type EntitlementId,
} from "@/lib/precog/sod/conflict-rules";
import { buildAssignments } from "@/lib/precog/sod/detect";
import { applyAssignmentsToPeople } from "@/lib/precog/sod/apply-assignments";
import {
  parseAccessExport,
  parseVendorExport,
  pendingQueueCount,
  RECENT_VENDOR_DAYS,
  type AccessUserRow,
  type QueueStatus,
} from "@/lib/precog/firm/reconcile";
import { useToday } from "@/lib/use-today";
import { localDateKey } from "@/lib/precog/dates";
import { firstName } from "@/lib/precog/text";
import { grantDuty, rowDifferences, withUserStatus } from "./access-reconcile-rows";

/**
 * Read-only user and vendor files compared with the duty map.
 * Nothing is written back to the accounting system. Unmatched rows wait for a
 * person; mapping a row gives the matched team member that duty on the map.
 */
export function AccessReconcile() {
  const { profile, template, setAccessReconciliation, setCustomPeople } = usePractice();
  const today = localDateKey(useToday());
  const rec = profile.accessReconciliation;
  const [issues, setIssues] = useState<string[]>([]);
  const pending = pendingQueueCount(rec);

  async function onUsers(file: File) {
    const text = await readFile(file, setIssues);
    if (text === null) return;
    const parsed = parseAccessExport(text, template.people, today);
    setIssues(parsed.issues);
    setAccessReconciliation((current) => ({
      importedAt: new Date().toISOString(),
      source: parsed.source,
      users: parsed.users,
      vendors: current?.vendors ?? [],
    }));
  }

  async function onVendors(file: File) {
    const text = await readFile(file, setIssues);
    if (text === null) return;
    const vendors = parseVendorExport(text, today);
    setIssues(vendors.length === 0 ? ["No vendor rows were read from that file."] : []);
    setAccessReconciliation((current) => ({
      importedAt: new Date().toISOString(),
      source: current?.source ?? "unknown",
      users: current?.users ?? [],
      vendors,
    }));
  }

  function setUserStatus(id: string, status: QueueStatus, assigned?: EntitlementId) {
    setAccessReconciliation((current) =>
      current ? withUserStatus(current, id, status, assigned) : current,
    );
  }

  function mapUser(row: AccessUserRow, duty: EntitlementId) {
    const personId = row.personId;
    if (!personId) return;
    setCustomPeople((people) => {
      const next = grantDuty(buildAssignments({ ...template, people }), personId, duty);
      return next ? applyAssignmentsToPeople(people, next) : people;
    });
    setUserStatus(row.id, "mapped", duty);
  }

  function setVendorStatus(id: string, status: QueueStatus) {
    setAccessReconciliation((current) =>
      current
        ? {
            ...current,
            vendors: current.vendors.map((row) => (row.id === id ? { ...row, status } : row)),
          }
        : current,
    );
  }

  const queue = rec?.users.filter((u) => u.status === "pending") ?? [];
  const vendorQueue = rec?.vendors.filter((v) => v.status === "pending") ?? [];
  const reviewedUsers = rec?.users.filter((u) => u.status !== "pending") ?? [];
  const reviewedVendors = rec?.vendors.filter((v) => v.status !== "pending") ?? [];

  return (
    <section className="rounded-xl border border-border bg-surface p-4">
      <h2 className="text-lg font-semibold">Access and vendor import</h2>
      <p className="mt-1 text-sm text-muted">
        Upload a user export and a vendor export from QuickBooks Online or Xero. We compare each
        file with this client’s duty map and never write to the accounting system. Rows that do not
        match wait here until you map or dismiss them; mapping a row gives that person the duty on
        the map.
      </p>
      <div className="mt-3 flex flex-wrap gap-3 text-sm">
        <label className="cursor-pointer rounded-md border border-border px-3 py-2 hover:bg-elevated">
          User export
          <input
            type="file"
            accept=".csv,text/csv,text/plain"
            className="sr-only"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void onUsers(file);
              e.target.value = "";
            }}
          />
        </label>
        <label className="cursor-pointer rounded-md border border-border px-3 py-2 hover:bg-elevated">
          Vendor export
          <input
            type="file"
            accept=".csv,text/csv,text/plain"
            className="sr-only"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void onVendors(file);
              e.target.value = "";
            }}
          />
        </label>
        {rec && (
          <p className="self-center text-xs text-muted">
            {SOURCE_LABEL[rec.source]} · {rec.users.length} users · {rec.vendors.length} vendors ·{" "}
            {pending} waiting
          </p>
        )}
      </div>
      {issues.length > 0 && (
        <ul className="mt-2 list-disc pl-5 text-xs text-warn">
          {issues.map((issue) => (
            <li key={issue}>{issue}</li>
          ))}
        </ul>
      )}
      {queue.length > 0 && (
        <ul className="mt-4 space-y-3">
          {queue.map((row) => (
            <li key={row.id} className="rounded-lg border border-border p-3 text-sm">
              <p className="font-medium">
                {row.name}
                {row.role ? ` · ${row.role}` : ""}
              </p>
              <p className="mt-1 text-xs text-muted">{rowDifferences(row)}</p>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                {row.personId ? (
                  <label className="text-xs text-muted">
                    Give {firstName(row.name)} the duty
                    <select
                      className="ml-2 rounded-md border border-border bg-bg px-2 py-1 text-xs"
                      defaultValue=""
                      aria-label={`Duty to give ${row.name} on the duty map`}
                      onChange={(e) => {
                        const duty = e.target.value as EntitlementId;
                        if (duty) mapUser(row, duty);
                      }}
                    >
                      <option value="">Choose a duty</option>
                      {ENTITLEMENTS.map((duty) => (
                        <option key={duty.id} value={duty.id}>
                          {duty.label}
                        </option>
                      ))}
                    </select>
                  </label>
                ) : (
                  <span className="text-xs text-muted">
                    Add this person to the team to map their access, or dismiss the row.
                  </span>
                )}
                <button
                  type="button"
                  className="rounded-md border border-border px-2 py-1 text-xs hover:bg-elevated"
                  onClick={() => setUserStatus(row.id, "dismissed")}
                >
                  Dismiss
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
      {vendorQueue.length > 0 && (
        <ul className="mt-4 space-y-2">
          {vendorQueue.map((vendor) => (
            <li
              key={vendor.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border px-3 py-2 text-sm"
            >
              <span>
                {vendor.name}
                {vendor.recent ? ` · added in the last ${RECENT_VENDOR_DAYS} days` : ""}
                {vendor.detail ? ` · ${vendor.detail}` : ""}
              </span>
              <button
                type="button"
                className="rounded-md border border-border px-2 py-1 text-xs hover:bg-elevated"
                onClick={() => setVendorStatus(vendor.id, "dismissed")}
              >
                Reviewed
              </button>
            </li>
          ))}
        </ul>
      )}
      {reviewedUsers.length + reviewedVendors.length > 0 && (
        <details className="mt-4 text-sm">
          <summary className="cursor-pointer text-xs font-medium text-muted">
            Reviewed ({reviewedUsers.length + reviewedVendors.length})
          </summary>
          <ul className="mt-2 space-y-2">
            {reviewedUsers.map((row) => (
              <li
                key={row.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border px-3 py-2 text-xs"
              >
                <span>
                  {row.name} ·{" "}
                  {row.status === "mapped" && row.assigned
                    ? `given ${entitlementLabel(row.assigned)} on the duty map`
                    : "dismissed"}
                </span>
                <button
                  type="button"
                  className="rounded-md border border-border px-2 py-1 hover:bg-elevated"
                  title={
                    row.status === "mapped"
                      ? "The duty stays on the map; remove it in the power map if it was wrong."
                      : undefined
                  }
                  onClick={() => setUserStatus(row.id, "pending")}
                >
                  Back to the queue
                </button>
              </li>
            ))}
            {reviewedVendors.map((vendor) => (
              <li
                key={vendor.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border px-3 py-2 text-xs"
              >
                <span>{vendor.name} · reviewed</span>
                <button
                  type="button"
                  className="rounded-md border border-border px-2 py-1 hover:bg-elevated"
                  onClick={() => setVendorStatus(vendor.id, "pending")}
                >
                  Back to the queue
                </button>
              </li>
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}

const SOURCE_LABEL = {
  quickbooks: "QuickBooks-style export",
  xero: "Xero-style export",
  unknown: "Spreadsheet",
} as const;

/** The file's text, or null after telling the owner why it could not be read. */
async function readFile(file: File, report: (issues: string[]) => void): Promise<string | null> {
  try {
    return await file.text();
  } catch {
    report([`${file.name} could not be read. Choose the file again, or export it again.`]);
    return null;
  }
}
