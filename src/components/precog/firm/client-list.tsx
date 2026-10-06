import { useState } from "react";
import { toast } from "sonner";
import { ArrowDown, ArrowUp, RotateCcw } from "lucide-react";
import { localDateKey } from "@/lib/precog/dates";
import { restoreDeletedClient, setClientOwnerEmail } from "@/lib/precog/firm/server";
import type { ClientEngagementRow } from "@/lib/precog/firm/store";
import type { DeletedBusinessRow } from "@/lib/precog/business-store";
import { fieldCls } from "@/components/ui/field-classes";
import { cn } from "@/lib/utils";
import {
  CLIENT_COLUMNS,
  clientStatusText,
  clientTotals,
  DEFAULT_CLIENT_SORT,
  exceptionsText,
  lastMonthStanding,
  lastMonthText,
  skippedText,
  sortClients,
  thisMonthText,
  type ClientSort,
} from "./client-table-csv";

/**
 * Every client the firm holds as a sortable table: the engagement's state,
 * the last monthly result, last month's and this month's checks Done (last
 * month marked Overdue after its due day), the exceptions and skips, open
 * duty conflicts and the versions awaiting review, the owner's address for
 * reminders, and the businesses deleted within the grace period. Clients
 * with exceptions sort to the top until another column is chosen.
 */
export function ClientList({
  clients,
  deleted,
  activeId,
  onOpen,
  onOpenReport,
  onRestored,
  onClientsChange,
  onExport,
  canRestore,
  today = localDateKey(new Date()),
}: {
  clients: ClientEngagementRow[];
  deleted: DeletedBusinessRow[];
  activeId: string;
  /** Only the firm owner (or a solo account) restores a deleted client; others see no list. */
  canRestore: boolean;
  /** Switch to the client and open its Monthly review. */
  onOpen: (id: string) => void;
  onOpenReport: (id: string) => void;
  onRestored: (id: string) => void;
  onClientsChange: (clients: ClientEngagementRow[]) => void;
  /** Download the table as CSV, in the order it is sorted. */
  onExport: (clients: ClientEngagementRow[]) => void;
  /** YYYY-MM-DD; the viewer's day unless a test fixes it. */
  today?: string;
}) {
  const [sort, setSort] = useState<ClientSort>(DEFAULT_CLIENT_SORT);
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState("");

  async function saveEmail(client: ClientEngagementRow) {
    try {
      const address = draft.trim().toLowerCase() || null;
      const { confirmation } = await setClientOwnerEmail({
        data: { businessId: client.id, email: draft },
      });
      onClientsChange(
        clients.map((c) =>
          c.id === client.id
            ? {
                ...c,
                ownerEmail: address,
                ownerEmailStatus: !address
                  ? null
                  : confirmation === "stopped"
                    ? "stopped"
                    : confirmation === "none"
                      ? c.ownerEmailStatus
                      : "waiting",
              }
            : c,
        ),
      );
      setEditing(null);
      toast.success(
        !address
          ? "Precog removed the owner address."
          : confirmation === "sent"
            ? `Precog emailed ${address} a link to confirm. Reminders start once the owner opens it.`
            : confirmation === "not-sent"
              ? "Precog saved the owner address but could not email the confirmation link, so no reminders go out yet. Save the address again to retry."
              : confirmation === "stopped"
                ? `Precog saved the owner address. The owner stopped reminders to ${address}, so Precog sends nothing to it.`
                : "Precog saved the owner address.",
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Precog did not save the address.");
    }
  }

  async function restore(id: string) {
    try {
      await restoreDeletedClient({ data: { businessId: id } });
      onRestored(id);
      toast.success("Business restored.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Precog did not restore the business.");
    }
  }

  const sorted = sortClients(clients, sort, today);
  const totals = clientTotals(clients, today);

  return (
    <section className="rounded-xl border border-border bg-surface p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-lg font-semibold">Clients</h2>
        {clients.length > 0 && (
          <button
            type="button"
            className="rounded-md border border-border px-2 py-1 text-xs hover:bg-elevated"
            onClick={() => onExport(sorted)}
          >
            Export clients (CSV)
          </button>
        )}
      </div>
      {clients.length > 0 && <p className="mt-1 text-sm font-medium">{totals}</p>}
      <p className="mt-1 text-sm text-muted">
        Last review is the newest monthly result Precog holds for that client. Last month and This
        month count Done checks only; Exceptions and Skipped count the others. Last month stays open
        until its due day, the 10th, and shows Overdue after it. An owner address receives the
        reminders about their own business once its owner confirms it from an email; Precog sends
        nothing else to it.
        {clients.length > 0 &&
          " Sort by any column; Export clients (CSV) downloads the same columns."}
      </p>
      {clients.length === 0 ? (
        <p className="mt-3 text-sm text-muted">
          No saved clients yet. Save a business to list it here.
        </p>
      ) : (
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[60rem] text-left text-sm">
            <thead>
              <tr className="border-b border-border text-xs text-muted">
                {CLIENT_COLUMNS.map((col) => (
                  <th
                    key={col.key}
                    scope="col"
                    className="py-1.5 pr-3 font-medium"
                    aria-sort={
                      sort.key === col.key
                        ? sort.dir === "asc"
                          ? "ascending"
                          : "descending"
                        : "none"
                    }
                  >
                    <button
                      type="button"
                      className="inline-flex items-center gap-1 hover:text-fg"
                      onClick={() =>
                        setSort((cur) =>
                          cur.key === col.key
                            ? { key: col.key, dir: cur.dir === "asc" ? "desc" : "asc" }
                            : { key: col.key, dir: "asc" },
                        )
                      }
                    >
                      {col.label}
                      {sort.key === col.key &&
                        (sort.dir === "asc" ? (
                          <ArrowUp className="size-3" aria-hidden />
                        ) : (
                          <ArrowDown className="size-3" aria-hidden />
                        ))}
                    </button>
                  </th>
                ))}
                <th scope="col" className="py-1.5" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {sorted.map((client) => (
                <tr key={`${client.ownerUserId}/${client.id}`} className="align-top">
                  <td className="py-2 pr-3">
                    <span className="font-medium">{client.name}</span>
                    {client.id === activeId && (
                      <span className="ml-2 text-xs text-primary">open</span>
                    )}
                    {/* A row someone else holds: its owner shared it with the firm, or
                        another member of the firm saved it. The viewer's own row has no tag. */}
                    {client.shared && (
                      <span className="ml-2 text-xs text-muted">
                        {client.granted ? "Client's own" : "another firm member's"}
                      </span>
                    )}
                  </td>
                  <td className="py-2 pr-3 text-xs">{clientStatusText(client)}</td>
                  <td className="py-2 pr-3 text-xs">
                    {client.lastReviewAt ? client.lastReviewAt.slice(0, 10) : "None"}
                  </td>
                  <td className="py-2 pr-3 text-xs">
                    {lastMonthText(client, today)}
                    {lastMonthStanding(client, today).overdue && (
                      <span className="ml-1.5 rounded border border-danger/40 px-1 py-0.5 font-medium text-danger">
                        Overdue
                      </span>
                    )}
                  </td>
                  <td className="py-2 pr-3 text-xs">{thisMonthText(client, today)}</td>
                  <td className="py-2 pr-3 text-xs">{exceptionsText(client, today)}</td>
                  <td className="py-2 pr-3 text-xs">{skippedText(client, today)}</td>
                  <td className="py-2 pr-3 text-xs">
                    {client.openFindings === null ? "Not counted yet" : client.openFindings}
                  </td>
                  <td className="py-2 pr-3 text-xs">
                    {client.awaitingReview > 0 ? client.awaitingReview : "None"}
                  </td>
                  <td className="py-2">
                    <div className="flex flex-wrap items-center justify-end gap-1.5">
                      {editing === client.id ? (
                        <form
                          className="flex items-center gap-1.5"
                          onSubmit={(e) => {
                            e.preventDefault();
                            void saveEmail(client);
                          }}
                        >
                          <input
                            className={cn(fieldCls, "py-1 text-xs")}
                            type="email"
                            autoFocus
                            value={draft}
                            onChange={(e) => setDraft(e.target.value)}
                            placeholder="owner@business.com"
                            aria-label={`Owner email for ${client.name}`}
                          />
                          <button
                            type="submit"
                            className="rounded-md border border-border px-2 py-1 text-xs hover:bg-elevated"
                          >
                            Save
                          </button>
                          <button
                            type="button"
                            className="rounded-md px-2 py-1 text-xs text-muted hover:text-fg"
                            onClick={() => setEditing(null)}
                          >
                            Cancel
                          </button>
                        </form>
                      ) : (
                        <button
                          type="button"
                          className="rounded-md border border-border px-2 py-1 text-xs hover:bg-elevated"
                          aria-label={
                            client.ownerEmail
                              ? `Change the owner email for ${client.name} (${client.ownerEmail})`
                              : `Add an owner email for ${client.name}`
                          }
                          onClick={() => {
                            setEditing(client.id);
                            setDraft(client.ownerEmail ?? "");
                          }}
                        >
                          {client.ownerEmail
                            ? `Owner: ${client.ownerEmail}${ownerStatusText(client.ownerEmailStatus)}`
                            : "Add owner email"}
                        </button>
                      )}
                      <button
                        type="button"
                        className="rounded-md border border-border px-2 py-1 text-xs hover:bg-elevated"
                        aria-label={`Open the Monthly review for ${client.name}`}
                        onClick={() => onOpen(client.id)}
                      >
                        Open
                      </button>
                      <button
                        type="button"
                        className="rounded-md border border-border px-2 py-1 text-xs hover:bg-elevated"
                        aria-label={`Open the report for ${client.name}`}
                        onClick={() => onOpenReport(client.id)}
                      >
                        Open report
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {canRestore && deleted.length > 0 && (
        <div className="mt-4 border-t border-border pt-3">
          <h3 className="text-sm font-medium">Recently deleted</h3>
          <ul className="mt-2 divide-y divide-border">
            {deleted.map((d) => (
              <li
                key={d.id}
                className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm"
              >
                <div>
                  <p>{d.name}</p>
                  <p className="text-xs text-muted">
                    Deleted {d.deletedAt.slice(0, 10)} · removed for good on{" "}
                    {d.purgeOn.slice(0, 10)}
                  </p>
                </div>
                <button
                  type="button"
                  className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs hover:bg-elevated"
                  aria-label={`Restore ${d.name}`}
                  onClick={() => void restore(d.id)}
                >
                  <RotateCcw className="size-3.5" aria-hidden /> Restore
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

/** Whether reminders reach the owner address, after the address itself. */
function ownerStatusText(status: ClientEngagementRow["ownerEmailStatus"]): string {
  if (status === "unsent")
    return " (not confirmed: save the address again to send the confirmation link)";
  if (status === "waiting") return " (not confirmed yet)";
  if (status === "stopped") return " (owner stopped reminders)";
  return "";
}
