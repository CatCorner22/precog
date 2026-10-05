import type { ClientEngagementRow } from "@/lib/precog/firm/store";
import type { EngagementRecord } from "@/lib/precog/firm/engagement-row";
import { formatDay, localDateKey } from "@/lib/precog/dates";
import { MONTHLY_REVIEW_GRACE_DAY, reviewDueOn, reviewItemsFor } from "@/lib/precog/firm/reviews";
import { csvCell } from "@/lib/precog/import/csv";
import { count, slug } from "@/lib/precog/text";

/**
 * The firm's client table, without React: its columns, the text of its
 * cells, its sort order, the totals line and the CSV that holds the same
 * columns. `today` is YYYY-MM-DD.
 */

export type ClientColumn =
  "client" | "status" | "lastReview" | "thisMonth" | "conflicts" | "awaiting";

export interface ClientSort {
  key: ClientColumn;
  dir: "asc" | "desc";
}

export const CLIENT_COLUMNS: readonly { key: ClientColumn; label: string }[] = [
  { key: "client", label: "Client" },
  { key: "status", label: "Status" },
  { key: "lastReview", label: "Last review" },
  { key: "thisMonth", label: "This month" },
  { key: "conflicts", label: "Open duty conflicts" },
  { key: "awaiting", label: "Awaiting review" },
];

/**
 * The viewer's local day the engagement ended, YYYY-MM-DD, as the Engagement
 * card prints it; the table and the CSV both print this day.
 */
function endedOn(client: ClientEngagementRow): string | null {
  return client.endedAt ? localDateKey(new Date(client.endedAt)) : null;
}

/** "Active", or "Ended Sep 30, 2026". */
export function clientStatusText(client: ClientEngagementRow): string {
  if (client.status !== "ended") return "Active";
  const day = endedOn(client);
  return day ? `Ended ${formatDay(day)}` : "Ended";
}

/**
 * The rows after the Engagement card ended or reopened one client's
 * engagement: that row takes the status and end time the server returned, so
 * the Status column and the totals change with the card.
 */
export function withEngagementStatus(
  clients: readonly ClientEngagementRow[],
  target: Pick<ClientEngagementRow, "ownerUserId" | "id">,
  engagement: Pick<EngagementRecord, "status" | "endedAt">,
): ClientEngagementRow[] {
  return clients.map((c) =>
    c.ownerUserId === target.ownerUserId && c.id === target.id
      ? { ...c, status: engagement.status, endedAt: engagement.endedAt }
      : c,
  );
}

/** The number of monthly checks for the row's month. */
function checksFor(client: ClientEngagementRow): number {
  return reviewItemsFor(client.period).length;
}

function overdue(client: ClientEngagementRow, today: string): boolean {
  return client.thisMonthRecorded < checksFor(client) && today > reviewDueOn(client.period);
}

/**
 * The month's checks: "Done"; "{n} overdue" once the month's due day (the
 * 10th of the next month, as the Monthly review shows it) has passed with
 * checks open; "Not started"; or "{k} of {n} recorded".
 */
export function thisMonthText(client: ClientEngagementRow, today: string): string {
  const total = checksFor(client);
  const recorded = Math.min(client.thisMonthRecorded, total);
  if (recorded >= total) return "Done";
  if (overdue(client, today)) return `${total - recorded} overdue`;
  if (recorded === 0) return "Not started";
  return `${recorded} of ${total} recorded`;
}

/** Open from the grace day of its month, as Needs attention counts it, until every check has a result. */
function monthOpen(client: ClientEngagementRow, today: string): boolean {
  const opens = `${client.period}-${String(MONTHLY_REVIEW_GRACE_DAY).padStart(2, "0")}`;
  return today >= opens && client.thisMonthRecorded < checksFor(client);
}

/**
 * "{N} clients · {M} with this month's review open · {K} versions awaiting
 * review". An ended engagement's month is not counted as open.
 */
export function clientTotals(clients: readonly ClientEngagementRow[], today: string): string {
  const open = clients.filter((c) => c.status === "active" && monthOpen(c, today)).length;
  const awaiting = clients.reduce((sum, c) => sum + c.awaitingReview, 0);
  return `${count(clients.length, "client")} · ${open} with this month's review open · ${count(awaiting, "version")} awaiting review`;
}

function sortValue(client: ClientEngagementRow, key: ClientColumn, today: string): number | string {
  switch (key) {
    case "client":
      return client.name.toLocaleLowerCase();
    case "status":
      return client.status === "ended" ? `1 ${client.endedAt ?? ""}` : "0";
    case "lastReview":
      return client.lastReviewAt ?? "";
    case "thisMonth": {
      // The share recorded; an overdue month sorts below every other.
      const total = checksFor(client);
      const share = Math.min(client.thisMonthRecorded, total) / total;
      return overdue(client, today) ? share - 1 : share;
    }
    case "conflicts":
      // Not counted yet sorts below zero.
      return client.openFindings ?? -1;
    case "awaiting":
      return client.awaitingReview;
  }
}

/** The rows in the chosen order; ties fall back to the client's name. */
export function sortClients(
  clients: readonly ClientEngagementRow[],
  sort: ClientSort,
  today: string,
): ClientEngagementRow[] {
  const sign = sort.dir === "asc" ? 1 : -1;
  return [...clients].sort((a, b) => {
    const x = sortValue(a, sort.key, today);
    const y = sortValue(b, sort.key, today);
    const order =
      typeof x === "number" && typeof y === "number" ? x - y : String(x).localeCompare(String(y));
    return order * sign || a.name.localeCompare(b.name) || a.id.localeCompare(b.id);
  });
}

/** The columns of the client table, in order, as the CSV's first line names them. */
export const CLIENT_TABLE_CSV_HEADER =
  "id,client,status,ended_on,last_review,this_month_recorded,this_month_total,open_duty_conflicts,awaiting_review,owner_email_status";

/**
 * The firm's client table as CSV: one line per client, in the order given.
 * Dates are YYYY-MM-DD, each the same day the table prints; an empty cell
 * means none (no review yet, conflicts not counted yet, no owner address).
 * Every cell goes through `csvCell`, so a client named "=SUM(…)" opens as
 * text.
 */
export function clientTableCsv(clients: readonly ClientEngagementRow[]): string {
  const lines = clients.map((c) =>
    [
      c.id,
      c.name,
      c.status,
      endedOn(c) ?? "",
      c.lastReviewAt ? c.lastReviewAt.slice(0, 10) : "",
      String(c.thisMonthRecorded),
      String(checksFor(c)),
      c.openFindings === null ? "" : String(c.openFindings),
      String(c.awaitingReview),
      c.ownerEmailStatus ?? "",
    ]
      .map(csvCell)
      .join(","),
  );
  return [CLIENT_TABLE_CSV_HEADER, ...lines].join("\n") + "\n";
}

/** "{slug of the firm name}-clients.csv"; "clients.csv" when the name has no letters or digits. */
export function clientTableFileName(firmName: string): string {
  const base = slug(firmName);
  return base ? `${base}-clients.csv` : "clients.csv";
}
