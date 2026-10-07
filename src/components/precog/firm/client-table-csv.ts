import type { ClientEngagementRow } from "@/lib/precog/firm/store";
import type { EngagementRecord } from "@/lib/precog/firm/engagement-row";
import { formatDay, localDateKey } from "@/lib/precog/dates";
import {
  checksCountOn,
  monthKey,
  periodStanding,
  previousPeriod,
  type PeriodStanding,
} from "@/lib/precog/firm/reviews";
import { csvCell } from "@/lib/precog/import/csv";
import { count, slug } from "@/lib/precog/text";

/**
 * The firm's client table, without React: its columns, the text of its
 * cells, its sort order, the totals line and the CSV that holds the same
 * columns. `today` is YYYY-MM-DD.
 */

export type ClientColumn =
  | "client"
  | "status"
  | "lastReview"
  | "lastMonth"
  | "thisMonth"
  | "exceptions"
  | "skipped"
  | "conflicts"
  | "awaiting";

export interface ClientSort {
  /** A column, or "urgency": the clients who need the firm first (see `urgencyValue`). */
  key: ClientColumn | "urgency";
  dir: "asc" | "desc";
}

/** The table opens with the clients who need the firm most on top, the rest by name. */
export const DEFAULT_CLIENT_SORT: ClientSort = { key: "urgency", dir: "desc" };

export const CLIENT_COLUMNS: readonly { key: ClientColumn; label: string }[] = [
  { key: "client", label: "Client" },
  { key: "status", label: "Status" },
  { key: "lastReview", label: "Last review" },
  { key: "lastMonth", label: "Last month" },
  { key: "thisMonth", label: "This month" },
  { key: "exceptions", label: "Exceptions" },
  { key: "skipped", label: "Skipped" },
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

/** Last month's checks on the viewer's day `today`: done, total, exceptions, skipped and overdue. */
export function lastMonthStanding(client: ClientEngagementRow, today: string): PeriodStanding {
  return periodStanding(client.months, previousPeriod(monthKey(today)), today);
}

/** This month's checks on the viewer's day `today`. */
export function thisMonthStanding(client: ClientEngagementRow, today: string): PeriodStanding {
  return periodStanding(client.months, monthKey(today), today);
}

/** "3 of 5 done": only Done counts; an Exception or a Skip is not done. */
function doneText(standing: PeriodStanding): string {
  return `${standing.done} of ${standing.total} done`;
}

/** Last month's checks, "3 of 4 done"; the table adds an Overdue badge after its due day, the 10th. */
export function lastMonthText(client: ClientEngagementRow, today: string): string {
  return doneText(lastMonthStanding(client, today));
}

/** This month's checks, "3 of 5 done". */
export function thisMonthText(client: ClientEngagementRow, today: string): string {
  return doneText(thisMonthStanding(client, today));
}

/** A result the table counts by month: Exception or Skipped. */
type CountedResult = "exceptions" | "skipped";

/** How many checks were reported with `field`'s result, last month and this month. */
function byMonth(
  client: ClientEngagementRow,
  today: string,
  field: CountedResult,
): { last: number; current: number } {
  return {
    last: lastMonthStanding(client, today)[field],
    current: thisMonthStanding(client, today)[field],
  };
}

/** "None", or "1 last month, 2 this month" (a month with none is left out). */
function byMonthText({ last, current }: { last: number; current: number }): string {
  const parts = [last > 0 ? `${last} last month` : "", current > 0 ? `${current} this month` : ""];
  return parts.filter(Boolean).join(", ") || "None";
}

/** The checks reported as Exception, last month and this month. */
export function exceptionsText(client: ClientEngagementRow, today: string): string {
  return byMonthText(byMonth(client, today, "exceptions"));
}

/** The checks reported as Skipped, last month and this month. */
export function skippedText(client: ClientEngagementRow, today: string): string {
  return byMonthText(byMonth(client, today, "skipped"));
}

/** Both months' checks reported with `field`'s result, as the totals and the sort count them. */
function bothMonths(client: ClientEngagementRow, today: string, field: CountedResult): number {
  const { last, current } = byMonth(client, today, field);
  return last + current;
}

/** Open from the grace day of its month, as Needs attention counts it, until every check is Done. */
function monthOpen(client: ClientEngagementRow, today: string): boolean {
  const standing = thisMonthStanding(client, today);
  return checksCountOn(today) && standing.done < standing.total;
}

/**
 * "{N} clients · {M} with this month's review open · {O} with last month
 * overdue · {E} with exceptions · {K} versions awaiting review". An ended
 * engagement's months are not counted as open or overdue.
 */
export function clientTotals(clients: readonly ClientEngagementRow[], today: string): string {
  const active = clients.filter((c) => c.status === "active");
  const open = active.filter((c) => monthOpen(c, today)).length;
  const overdue = active.filter((c) => lastMonthStanding(c, today).overdue).length;
  const exceptions = clients.filter((c) => bothMonths(c, today, "exceptions") > 0).length;
  const awaiting = clients.reduce((sum, c) => sum + c.awaitingReview, 0);
  return `${count(clients.length, "client")} · ${open} with this month's review open · ${overdue} with last month overdue · ${exceptions} with exceptions · ${count(awaiting, "version")} awaiting review`;
}

/**
 * Why a client needs the firm on `today`, in the order the urgency sort ranks
 * them. An ended engagement's months are neither overdue nor open, as the
 * totals count them.
 */
function needs(client: ClientEngagementRow, today: string) {
  const active = client.status === "active";
  const current = thisMonthStanding(client, today);
  return {
    overdue: active && lastMonthStanding(client, today).overdue,
    exceptions: bothMonths(client, today, "exceptions") > 0,
    nothingRecorded:
      active && checksCountOn(today) && current.done + current.exceptions + current.skipped === 0,
    awaiting: client.awaitingReview > 0,
  };
}

/**
 * Last month overdue outweighs everything below it, then open exceptions,
 * then nothing recorded once this month's checks are open, then versions
 * awaiting review. A client with several reasons ranks above one with only
 * the first of them.
 */
function urgencyValue(client: ClientEngagementRow, today: string): number {
  const n = needs(client, today);
  return (
    (n.overdue ? 8 : 0) +
    (n.exceptions ? 4 : 0) +
    (n.nothingRecorded ? 2 : 0) +
    (n.awaiting ? 1 : 0)
  );
}

/**
 * "{N} need you now: {O} with last month overdue, {E} with exceptions, {R}
 * with nothing recorded this month, {K} versions awaiting review." A reason
 * no client has is left out; with none, "No client needs you now."
 */
export function clientUrgencyText(clients: readonly ClientEngagementRow[], today: string): string {
  const all = clients.map((c) => needs(c, today));
  const need = all.filter((n) => n.overdue || n.exceptions || n.nothingRecorded || n.awaiting);
  if (need.length === 0) return "No client needs you now.";
  const overdue = all.filter((n) => n.overdue).length;
  const exceptions = all.filter((n) => n.exceptions).length;
  const nothing = all.filter((n) => n.nothingRecorded).length;
  const awaiting = clients.reduce((sum, c) => sum + c.awaitingReview, 0);
  const parts = [
    overdue > 0 ? `${overdue} with last month overdue` : "",
    exceptions > 0 ? `${exceptions} with exceptions` : "",
    nothing > 0 ? `${nothing} with nothing recorded this month` : "",
    awaiting > 0 ? `${count(awaiting, "version")} awaiting review` : "",
  ].filter(Boolean);
  const verb = need.length === 1 ? "needs" : "need";
  return `${need.length} ${verb} you now: ${parts.join(", ")}.`;
}

/** The share of the month's checks Done; an overdue month sorts below every other. */
function monthSortValue(standing: PeriodStanding): number {
  const share = standing.done / standing.total;
  return standing.overdue ? share - 1 : share;
}

function sortValue(
  client: ClientEngagementRow,
  key: ClientSort["key"],
  today: string,
): number | string {
  switch (key) {
    case "urgency":
      return urgencyValue(client, today);
    case "client":
      return client.name.toLocaleLowerCase();
    case "status":
      return client.status === "ended" ? `1 ${client.endedAt ?? ""}` : "0";
    case "lastReview":
      return client.lastReviewAt ?? "";
    case "lastMonth":
      return monthSortValue(lastMonthStanding(client, today));
    case "thisMonth":
      return monthSortValue(thisMonthStanding(client, today));
    case "exceptions":
    case "skipped":
      return bothMonths(client, today, key);
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
  "id,client,status,ended_on,last_review,last_month,last_month_done,last_month_total,last_month_overdue,this_month,this_month_done,this_month_total,exceptions_last_month,exceptions_this_month,skipped_last_month,skipped_this_month,open_duty_conflicts,awaiting_review,owner_email_status";

/**
 * The firm's client table as CSV: one line per client, in the order given.
 * Dates are YYYY-MM-DD, each the same day the table prints, and months are
 * YYYY-MM, last month and this month on the viewer's day `today`. Done
 * counts only Done results; last_month_overdue is "yes" after last month's
 * due day (the 10th) while a check has no result. An empty cell means none (no
 * review yet, conflicts not counted yet, no owner address). Every cell goes
 * through `csvCell`, so a client named "=SUM(…)" opens as text.
 */
export function clientTableCsv(
  clients: readonly ClientEngagementRow[],
  today: string = localDateKey(new Date()),
): string {
  const lines = clients.map((c) => {
    const last = lastMonthStanding(c, today);
    const current = thisMonthStanding(c, today);
    return [
      c.id,
      c.name,
      c.status,
      endedOn(c) ?? "",
      c.lastReviewAt ? c.lastReviewAt.slice(0, 10) : "",
      last.period,
      String(last.done),
      String(last.total),
      last.overdue ? "yes" : "no",
      current.period,
      String(current.done),
      String(current.total),
      String(last.exceptions),
      String(current.exceptions),
      String(last.skipped),
      String(current.skipped),
      c.openFindings === null ? "" : String(c.openFindings),
      String(c.awaitingReview),
      c.ownerEmailStatus ?? "",
    ]
      .map(csvCell)
      .join(",");
  });
  return [CLIENT_TABLE_CSV_HEADER, ...lines].join("\n") + "\n";
}

/** "{slug of the firm name}-clients.csv"; "clients.csv" when the name has no letters or digits. */
export function clientTableFileName(firmName: string): string {
  const base = slug(firmName);
  return base ? `${base}-clients.csv` : "clients.csv";
}
