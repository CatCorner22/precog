import type { Sql } from "@/lib/db";
import { reportServerError } from "@/lib/observability/report.server";
import { toIsoTimestampOrNull } from "../../iso-time";
import { TRUSTED_EMAIL } from "../../reminders/digest";
import type { RenderedEmail } from "../../reminders/email";
import { mailConfigured } from "../../reminders/mailer.server";
import {
  EXPIRY_WARNING_DAYS,
  renderQuickBooksAlert,
  type QuickBooksAlertItem,
} from "./alert-email";
import { markAlerted } from "./store";

export interface QuickBooksAlertOutcome {
  /** Accounts emailed. */
  emailed: number;
  /** Accounts covered without an email: mail off, or an address Precog cannot use. */
  skipped: number;
  errors: string[];
}

/**
 * The scheduled stage that tells a firm owner, once per problem, that a
 * client's QuickBooks connection failed its last reading or that Intuit's
 * permission ends within EXPIRY_WARNING_DAYS (or has ended). Problems are
 * grouped per controlling account (the firm owner for a firm client, the
 * owner for a solo business); the connection's own row is not consulted for
 * the address. A service notice: it goes out whatever the weekly digest
 * switch says, with no stop link. An account whose address Precog cannot use
 * (unconfirmed, or bounced or complained) is reported once and its rows are
 * stamped as covered, so one failure episode reports once; the next episode
 * reports again. A send the mailer gives up on is reported once per run and
 * leaves its rows unstamped, so the next run tries again. With mail off
 * nothing is sent and nothing is stamped, so the alerts go out once mail is
 * set up.
 *
 * `send` is injected so the stage runs against PGLite in a test with no
 * network; the cron route passes the real mailer.
 */
export async function alertQuickBooksProblems(
  sql: Sql,
  input: {
    today: string;
    appUrl: string;
    send: (to: string, message: RenderedEmail) => Promise<void>;
  },
): Promise<QuickBooksAlertOutcome> {
  const outcome: QuickBooksAlertOutcome = { emailed: 0, skipped: 0, errors: [] };
  const groups = groupByAccount(await problems(sql));
  if (!mailConfigured()) {
    outcome.skipped = groups.size;
    return outcome;
  }
  for (const [userId, rows] of groups) {
    const { email, trusted, suppressed, firm_name: firmName } = rows[0];
    const deliverable = Boolean(email && trusted && !suppressed);
    if (!deliverable) {
      await reportServerError(new Error("quickbooks alert not deliverable"), "qbo-alert");
      await stamp(sql, rows);
      outcome.skipped += 1;
      continue;
    }
    try {
      await input.send(
        email!,
        renderQuickBooksAlert({
          firmName,
          items: rows.flatMap((row) => itemsFor(row, input.today)),
          link: `${input.appUrl}/firm`,
        }),
      );
      await stamp(sql, rows);
      outcome.emailed += 1;
    } catch (err) {
      outcome.errors.push(
        `quickbooks alert ${userId}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }
  if (outcome.errors.length > 0) {
    // The rows stay unstamped and the next run tries again, but a provider
    // that keeps failing is reported, not left to the run's answer alone.
    await reportServerError(new Error(outcome.errors.join("; ")), "qbo-alert-send");
  }
  return outcome;
}

interface ProblemRow {
  user_id: string;
  business_id: string;
  business_name: string;
  controlling_user_id: string;
  email: string | null;
  trusted: boolean | null;
  suppressed: boolean;
  firm_name: string | null;
  last_error: string | null;
  last_error_at: string | null;
  last_synced_at: string | null;
  refresh_expires_at: string;
  /** The failure episode has not been announced. */
  failure_due: boolean;
  /** The expiry is near or past and has not been announced. */
  expiry_due: boolean;
}

/**
 * Connections on live businesses with a problem the controlling account has
 * not been told about. The suppression state is selected, not filtered, so
 * an unreachable owner is reported rather than silently skipped every week.
 */
async function problems(sql: Sql): Promise<ProblemRow[]> {
  return sql.query<ProblemRow>(`
    select c.user_id, c.business_id, b.name as business_name,
      coalesce(b.firm_user_id, b.user_id) as controlling_user_id,
      u.email,
      ${TRUSTED_EMAIL("u")} as trusted,
      exists (
        select 1 from email_suppressions es where es.email = lower(trim(u.email))
      ) as suppressed,
      f.name as firm_name,
      c.last_error, c.last_error_at, c.last_synced_at, c.refresh_expires_at,
      (c.last_error is not null and c.failure_alerted_at is null) as failure_due,
      (c.refresh_expires_at <= now() + interval '${EXPIRY_WARNING_DAYS} days'
        and c.expiry_alerted_for is distinct from c.refresh_expires_at) as expiry_due
    from integration_connections c
    join businesses b on b.user_id = c.user_id and b.id = c.business_id and b.deleted_at is null
    left join "user" u on u.id = coalesce(b.firm_user_id, b.user_id)
    left join firms f on f.user_id = coalesce(b.firm_user_id, b.user_id)
    where c.provider = 'qbo'
      and ((c.last_error is not null and c.failure_alerted_at is null)
        or (c.refresh_expires_at <= now() + interval '${EXPIRY_WARNING_DAYS} days'
          and c.expiry_alerted_for is distinct from c.refresh_expires_at))
    order by coalesce(b.firm_user_id, b.user_id), b.name, c.business_id
    limit 50
  `);
}

function groupByAccount(rows: ProblemRow[]): Map<string, ProblemRow[]> {
  const groups = new Map<string, ProblemRow[]>();
  for (const row of rows) {
    const group = groups.get(row.controlling_user_id) ?? [];
    group.push(row);
    groups.set(row.controlling_user_id, group);
  }
  return groups;
}

function itemsFor(row: ProblemRow, today: string): QuickBooksAlertItem[] {
  const items: QuickBooksAlertItem[] = [];
  if (row.failure_due) {
    items.push({
      businessName: row.business_name,
      kind: "failed",
      detail: row.last_error,
      when: utcDay(row.last_error_at),
      lastReadOn: utcDay(row.last_synced_at),
    });
  }
  if (row.expiry_due) {
    const lapsesOn = utcDay(row.refresh_expires_at)!;
    items.push({
      businessName: row.business_name,
      kind: lapsesOn < today ? "lapsed" : "lapsing",
      lapsesOn,
    });
  }
  return items;
}

async function stamp(sql: Sql, rows: ProblemRow[]): Promise<void> {
  for (const row of rows) {
    await markAlerted(sql, row.user_id, row.business_id, {
      failure: row.failure_due,
      expiryFor: row.expiry_due ? row.refresh_expires_at : null,
    });
  }
}

/** The UTC "YYYY-MM-DD" day of a stored time; null for null. */
function utcDay(value: string | null): string | null {
  return toIsoTimestampOrNull(value)?.slice(0, 10) ?? null;
}
