import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Link2, RefreshCw, Unlink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { usePractice } from "@/lib/precog/practice-context";
import {
  disconnectQuickBooks,
  getQuickBooksStatus,
  startQuickBooksConnect,
  syncQuickBooksNow,
} from "@/lib/precog/integrations/qbo/server";
import { driftIsEmpty, type IntegrationDrift } from "@/lib/precog/integrations/qbo/model";
import type { ConnectionStatus } from "@/lib/precog/integrations/qbo/store";
import { isOwnTeam } from "@/lib/precog/firm/engagement";

type Status = {
  configured: boolean;
  connection: ConnectionStatus | null;
  drift: IntegrationDrift | null;
};

/**
 * The read-only QuickBooks connection for the open client: connect, read
 * now, and what changed in the books since the reading before, matched to
 * the duty map. The scheduled run re-reads every month.
 */
export function QuickBooksPanel({ signedIn }: { signedIn: boolean }) {
  const { profile } = usePractice();
  const businessId = profile.businessId ?? null;
  const own = isOwnTeam(profile);
  const [status, setStatus] = useState<Status | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!signedIn || !businessId || !own) return;
    let cancel = false;
    void getQuickBooksStatus({ data: { businessId } })
      .then((res) => {
        if (!cancel) setStatus(res);
      })
      .catch(() => {
        if (!cancel) setStatus({ configured: false, connection: null, drift: null });
      });
    return () => {
      cancel = true;
    };
  }, [signedIn, businessId, own]);

  if (!signedIn || !businessId || !own) return null;

  async function connect() {
    if (!businessId) return;
    setBusy(true);
    try {
      const { url } = await startQuickBooksConnect({ data: { businessId } });
      window.location.href = url;
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "QuickBooks could not be connected.");
      setBusy(false);
    }
  }

  async function sync() {
    if (!businessId) return;
    setBusy(true);
    try {
      const { drift } = await syncQuickBooksNow({ data: { businessId } });
      setStatus((cur) =>
        cur
          ? {
              ...cur,
              drift,
              connection: cur.connection
                ? { ...cur.connection, lastSyncedAt: new Date().toISOString(), lastError: null }
                : cur.connection,
            }
          : cur,
      );
      toast.success(
        driftIsEmpty(drift) ? "Books read; nothing changed." : "Books read; see what changed.",
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "The books could not be read.");
    } finally {
      setBusy(false);
    }
  }

  async function disconnect() {
    if (!businessId) return;
    if (!window.confirm("Disconnect QuickBooks for this client? Past readings are removed too."))
      return;
    setBusy(true);
    try {
      await disconnectQuickBooks({ data: { businessId } });
      setStatus((cur) => (cur ? { ...cur, connection: null, drift: null } : cur));
    } catch {
      toast.error("QuickBooks was not disconnected.");
    } finally {
      setBusy(false);
    }
  }

  const drift = status?.drift ?? null;

  return (
    <section className="rounded-xl border border-border bg-surface p-4">
      <h2 className="text-lg font-semibold">QuickBooks Online</h2>
      <p className="mt-1 text-sm text-muted">
        A read-only connection. Precog reads the vendor and employee lists once a month and says
        what changed: new or altered vendors, people paid who are not on the duty map, and people
        released from payroll whose logins still need confirming.
      </p>
      {status === null ? (
        <p className="mt-3 text-sm text-muted">Checking the connection…</p>
      ) : !status.configured ? (
        <p className="mt-3 text-sm text-muted">
          Not available on this deployment. The file import below does the same comparison from an
          export.
        </p>
      ) : !status.connection ? (
        <Button className="mt-3" size="sm" onClick={() => void connect()} disabled={busy}>
          <Link2 className="size-3.5" /> Connect QuickBooks
        </Button>
      ) : (
        <>
          <p className="mt-3 text-sm">
            Connected {status.connection.connectedAt.slice(0, 10)} · last read{" "}
            {status.connection.lastSyncedAt
              ? status.connection.lastSyncedAt.slice(0, 10)
              : "not yet"}
            {status.connection.lastError && (
              <span className="text-danger">
                {" "}
                · last attempt failed: {status.connection.lastError}
              </span>
            )}
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            <Button size="sm" onClick={() => void sync()} disabled={busy}>
              <RefreshCw className="size-3.5" /> Read the books now
            </Button>
            <Button size="sm" variant="secondary" onClick={() => void disconnect()} disabled={busy}>
              <Unlink className="size-3.5" /> Disconnect
            </Button>
          </div>
          {drift && <DriftList drift={drift} />}
        </>
      )}
    </section>
  );
}

function DriftList({ drift }: { drift: IntegrationDrift }) {
  if (driftIsEmpty(drift)) {
    return (
      <p className="mt-3 text-sm text-muted">
        Nothing changed{drift.since ? ` since ${drift.since.slice(0, 10)}` : ""}, and the books
        match the duty map.
      </p>
    );
  }
  const names = (rows: readonly { name: string }[]) => rows.map((r) => r.name).join(", ");
  const lines: { label: string; text: string; warn?: boolean }[] = [];
  if (drift.employeesReleased.length) {
    lines.push({
      label: "Released from payroll",
      text: `${names(drift.employeesReleased)} — confirm their logins are gone and mark them as left on the map.`,
      warn: true,
    });
  }
  if (drift.vendorsChanged.length) {
    lines.push({
      label: "Vendor details changed",
      text:
        drift.vendorsChanged.map((c) => `${c.vendor.name} (${c.fields.join(", ")})`).join("; ") +
        " — a changed address or account is how a payee gets redirected.",
      warn: true,
    });
  }
  if (drift.vendorsAdded.length)
    lines.push({ label: "New vendors", text: names(drift.vendorsAdded) });
  if (drift.vendorsRemoved.length)
    lines.push({ label: "Vendors gone", text: names(drift.vendorsRemoved) });
  if (drift.employeesAdded.length)
    lines.push({ label: "New employees", text: names(drift.employeesAdded) });
  if (drift.employeesNotOnMap.length) {
    lines.push({
      label: "Paid but not on the duty map",
      text: `${names(drift.employeesNotOnMap)} — add them, or confirm they hold no money duties.`,
      warn: true,
    });
  }
  if (drift.peopleNotInBooks.length) {
    lines.push({
      label: "On the map but not in payroll",
      text: `${drift.peopleNotInBooks.join(", ")} — contractors, or people who have left.`,
    });
  }
  return (
    <dl className="mt-3 space-y-2 text-sm">
      {drift.since && (
        <p className="text-xs text-muted">
          Compared with the reading of {drift.since.slice(0, 10)}.
        </p>
      )}
      {lines.map((line) => (
        <div
          key={line.label}
          className={line.warn ? "rounded-md border border-warn/40 bg-warn/5 p-2" : ""}
        >
          <dt className={`text-xs font-medium ${line.warn ? "text-warn" : "text-muted"}`}>
            {line.label}
          </dt>
          <dd className="mt-0.5">{line.text}</dd>
        </div>
      ))}
    </dl>
  );
}
