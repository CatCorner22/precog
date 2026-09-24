import { useState } from "react";
import { usePractice } from "@/lib/precog/practice-context";
import { ENTITLEMENTS, type EntitlementId } from "@/lib/precog/sod/conflict-rules";
import {
  parseAccessExport,
  parseVendorExport,
  pendingQueueCount,
  type AccessReconciliation,
  type QueueStatus,
} from "@/lib/precog/firm/reconcile";
import { localDateKey } from "@/lib/precog/decisions/follow-through";
import { useToday } from "@/lib/precog/decisions/use-today";

const SOURCE_LABEL = {
  quickbooks: "QuickBooks-style export",
  xero: "Xero-style export",
  unknown: "Spreadsheet",
} as const;

/**
 * Read-only user and vendor files compared with the duty map.
 * Nothing is written back to the accounting system. Unmatched rows wait for a person.
 */
export function AccessReconcile() {
  const { profile, template, replaceProfile } = usePractice();
  const today = localDateKey(useToday());
  const rec = profile.accessReconciliation;
  const [issues, setIssues] = useState<string[]>([]);
  const pending = pendingQueueCount(rec);

  function save(next: AccessReconciliation) {
    replaceProfile({ ...profile, accessReconciliation: next });
  }

  function onUsers(file: File) {
    const reader = new FileReader();
    reader.onload = () => {
      const text = String(reader.result ?? "");
      const parsed = parseAccessExport(text, template.people, today);
      setIssues(parsed.issues);
      save({
        importedAt: new Date().toISOString(),
        source: parsed.source,
        users: parsed.users,
        vendors: rec?.vendors ?? [],
      });
    };
    reader.readAsText(file);
  }

  function onVendors(file: File) {
    const reader = new FileReader();
    reader.onload = () => {
      const text = String(reader.result ?? "");
      const vendors = parseVendorExport(text, today);
      setIssues(vendors.length === 0 ? ["No vendor rows were read from that file."] : []);
      save({
        importedAt: new Date().toISOString(),
        source: rec?.source ?? "unknown",
        users: rec?.users ?? [],
        vendors,
      });
    };
    reader.readAsText(file);
  }

  function setUserStatus(id: string, status: QueueStatus, assigned?: EntitlementId) {
    if (!rec) return;
    save({
      ...rec,
      users: rec.users.map((row) =>
        row.id === id ? { ...row, status, ...(assigned ? { assigned } : {}) } : row,
      ),
    });
  }

  function setVendorStatus(id: string, status: QueueStatus) {
    if (!rec) return;
    save({
      ...rec,
      vendors: rec.vendors.map((row) => (row.id === id ? { ...row, status } : row)),
    });
  }

  const queue = [...(rec?.users.filter((u) => u.status === "pending") ?? [])];

  return (
    <section className="rounded-xl border border-border bg-surface p-4">
      <h2 className="text-lg font-semibold">Access and vendor import</h2>
      <p className="mt-1 text-sm text-muted">
        Upload a user export and a vendor export from QuickBooks Online or Xero. The file is
        compared with this client’s duty map. Rows that do not match wait here until you map or
        dismiss them. The accounting system is not changed.
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
              if (file) onUsers(file);
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
              if (file) onVendors(file);
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
              <p className="mt-1 text-xs text-muted">
                {!row.personId && "No one on this team has this name. "}
                {row.unmatchedTokens.length > 0 &&
                  `Unmatched permission: ${row.unmatchedTokens.join(", ")}. `}
                {row.extra.length > 0 && `Books grant ${row.extra.join(", ")} beyond the map. `}
                {row.missingFromBooks.length > 0 &&
                  `Map grants ${row.missingFromBooks.join(", ")} that this export does not show.`}
              </p>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <label className="text-xs text-muted">
                  Map unmatched to
                  <select
                    className="ml-2 rounded-md border border-border bg-bg px-2 py-1 text-xs"
                    defaultValue=""
                    aria-label={`Map permission for ${row.name}`}
                    onChange={(e) => {
                      const duty = e.target.value as EntitlementId;
                      if (duty) setUserStatus(row.id, "mapped", duty);
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
      {(rec?.vendors.filter((v) => v.status === "pending").length ?? 0) > 0 && (
        <ul className="mt-4 space-y-2">
          {rec?.vendors
            .filter((v) => v.status === "pending")
            .map((vendor) => (
              <li
                key={vendor.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border px-3 py-2 text-sm"
              >
                <span>
                  {vendor.name}
                  {vendor.recent ? " · added in the last 90 days" : ""}
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
    </section>
  );
}
