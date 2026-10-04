import type { Sql } from "@/lib/db";
import { reportServerError } from "@/lib/observability/report.server";

/**
 * Product milestones (migration 0042): the first time an account did each
 * of four things. One row per account and milestone, two ids and a time, so
 * Precog's operator can see whether new accounts get started without any
 * analytics script and without storing a name or a word the account typed.
 */
export type ProductEvent =
  "first_business" | "first_locked_version" | "first_report_sent" | "first_monthly_review";

/**
 * Records the milestone once; a second call for the same account and event
 * changes nothing. A failed insert is reported and swallowed: telemetry never
 * fails the save, the lock or the review it rides on.
 */
export async function recordFirst(
  sql: Sql,
  userId: string,
  event: ProductEvent,
  businessId: string | null,
): Promise<void> {
  try {
    await sql`
      insert into product_events (user_id, event, business_id)
      values (${userId}, ${event}, ${businessId})
      on conflict (user_id, event) do nothing
    `;
  } catch (err) {
    await reportServerError(err, "telemetry");
  }
}

export interface WeeklyActivation {
  weekEnding: string;
  signedUp: number;
  firstBusiness: number;
  firstLockedVersion: number;
  firstReportSent: number;
  firstMonthlyReview: number;
}

/**
 * How many accounts signed up and passed each milestone in the seven days
 * ending `today` (a "YYYY-MM-DD" day, inclusive). Sign-ups come from the
 * account's creation time; nothing is written for them.
 */
export async function weeklyActivation(sql: Sql, today: string): Promise<WeeklyActivation> {
  const [signups, events] = await Promise.all([
    sql<{ n: number }>`
      select count(*)::int as n from "user"
      where "createdAt" >= ${today}::date - interval '6 days'
        and "createdAt" < ${today}::date + interval '1 day'
    `,
    sql<{ event: ProductEvent; n: number }>`
      select event, count(*)::int as n from product_events
      where occurred_at >= ${today}::date - interval '6 days'
        and occurred_at < ${today}::date + interval '1 day'
      group by event
    `,
  ]);
  const by = new Map(events.map((r) => [r.event, Number(r.n)]));
  return {
    weekEnding: today,
    signedUp: Number(signups[0]?.n ?? 0),
    firstBusiness: by.get("first_business") ?? 0,
    firstLockedVersion: by.get("first_locked_version") ?? 0,
    firstReportSent: by.get("first_report_sent") ?? 0,
    firstMonthlyReview: by.get("first_monthly_review") ?? 0,
  };
}
