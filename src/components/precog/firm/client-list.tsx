import { useState } from "react";
import { toast } from "sonner";
import { RotateCcw } from "lucide-react";
import { restoreDeletedClient, setClientOwnerEmail } from "@/lib/precog/firm/server";
import type { ClientEngagementRow } from "@/lib/precog/firm/store";
import type { DeletedBusinessRow } from "@/lib/precog/business-store";
import { fieldCls } from "@/components/ui/field-classes";
import { cn } from "@/lib/utils";
import { count } from "@/lib/precog/text";

/**
 * Every client the firm holds, with the stage each is at, the owner's
 * address for reminders, and the businesses deleted within the grace period.
 */
export function ClientList({
  clients,
  deleted,
  activeId,
  onOpen,
  onRestored,
  onClientsChange,
}: {
  clients: ClientEngagementRow[];
  deleted: DeletedBusinessRow[];
  activeId: string;
  onOpen: (id: string) => void;
  onRestored: (id: string) => void;
  onClientsChange: (clients: ClientEngagementRow[]) => void;
}) {
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
          ? "Owner address removed."
          : confirmation === "sent"
            ? `Precog emailed ${address} a link to confirm. Reminders start once the owner opens it.`
            : confirmation === "not-sent"
              ? "Owner address saved. Precog could not email the confirmation link, so no reminders go out yet. Save the address again to retry."
              : "Owner address saved.",
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

  return (
    <section className="rounded-xl border border-border bg-surface p-4">
      <h2 className="text-lg font-semibold">Clients</h2>
      <p className="mt-1 text-sm text-muted">
        Last review is the newest monthly result stored for that client. An owner address receives
        the reminders about their own business once its owner confirms it from an email; Precog
        sends nothing else to it.
      </p>
      {clients.length === 0 ? (
        <p className="mt-3 text-sm text-muted">
          No saved clients yet. Save a business to list it here.
        </p>
      ) : (
        <ul className="mt-3 divide-y divide-border">
          {clients.map((client) => (
            <li key={`${client.ownerUserId}/${client.id}`} className="py-2 text-sm">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-medium">
                    {client.name}
                    {client.id === activeId && (
                      <span className="ml-2 text-xs text-primary">open</span>
                    )}
                    {client.shared && (
                      <span className="ml-2 text-xs text-muted">another firm member's</span>
                    )}
                  </p>
                  <p className="text-xs text-muted">
                    Last review: {client.lastReviewAt ? client.lastReviewAt.slice(0, 10) : "none"} ·
                    Report {client.reportSentAt ? "sent" : "not sent"} ·{" "}
                    {conflictsText(client.openFindings)}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-1.5">
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
                  {client.id !== activeId && (
                    <button
                      type="button"
                      className="rounded-md border border-border px-2 py-1 text-xs hover:bg-elevated"
                      aria-label={`Open ${client.name}`}
                      onClick={() => onOpen(client.id)}
                    >
                      Open
                    </button>
                  )}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
      {deleted.length > 0 && (
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
  if (status === "waiting") return " (not confirmed yet)";
  if (status === "stopped") return " (owner stopped reminders)";
  return "";
}

/** The open-conflict count, or a plain statement that nobody has counted them yet. */
function conflictsText(openFindings: number | null): string {
  if (openFindings === null)
    return "duty conflicts not counted yet (open the client to count them)";
  return count(openFindings, "open duty conflict");
}
