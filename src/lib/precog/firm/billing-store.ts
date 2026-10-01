import type { Sql } from "@/lib/db";
import { toIsoTimestamp, toIsoTimestampOrNull } from "../iso-time";

/**
 * What the payment provider last said about an account. Rows are written by
 * the Stripe webhook alone; the firm workspace reads them.
 */
export interface BillingAccount {
  stripeCustomerId: string | null;
  subscriptionId: string | null;
  subscriptionStatus: string | null;
  assessmentPaidAt: string | null;
  currentPeriodEnd: string | null;
  updatedAt: string;
}

export const ACTIVE_SUBSCRIPTION_STATUSES = new Set(["active", "trialing", "past_due"]);

/** Statuses that count as paid. past_due is a subscription, not a paid plan. */
export const PAID_SUBSCRIPTION_STATUSES = new Set(["active", "trialing"]);

/**
 * QuickBooks and the rest of the firm tools.
 * Stripe unconfigured: open, so the owner is not locked out of their own firm.
 * past_due: closed. An active or trialing subscription, or a paid assessment
 * with no subscription, is open.
 */
export function commercialToolsOpen(input: {
  stripeConfigured: boolean;
  subscriptionStatus: string | null;
  assessmentPaidAt: string | null;
}): boolean {
  if (!input.stripeConfigured) return true;
  if (input.subscriptionStatus === "past_due") return false;
  if (input.subscriptionStatus && PAID_SUBSCRIPTION_STATUSES.has(input.subscriptionStatus))
    return true;
  return Boolean(input.assessmentPaidAt);
}

export async function loadBillingAccount(sql: Sql, userId: string): Promise<BillingAccount | null> {
  const rows = await sql<{
    stripe_customer_id: string | null;
    subscription_id: string | null;
    subscription_status: string | null;
    assessment_paid_at: string | null;
    current_period_end: string | null;
    updated_at: string;
  }>`
    select stripe_customer_id, subscription_id, subscription_status, assessment_paid_at,
      current_period_end, updated_at
    from billing_accounts where user_id = ${userId}
  `;
  const row = rows[0];
  if (!row) return null;
  return {
    stripeCustomerId: row.stripe_customer_id,
    subscriptionId: row.subscription_id,
    subscriptionStatus: row.subscription_status,
    assessmentPaidAt: toIsoTimestampOrNull(row.assessment_paid_at),
    currentPeriodEnd: toIsoTimestampOrNull(row.current_period_end),
    updatedAt: toIsoTimestamp(row.updated_at),
  };
}

export async function recordAssessmentPayment(
  sql: Sql,
  userId: string,
  stripeCustomerId: string | null,
): Promise<void> {
  await sql`
    insert into billing_accounts (user_id, stripe_customer_id, assessment_paid_at, updated_at)
    values (${userId}, ${stripeCustomerId}, now(), now())
    on conflict (user_id) do update set
      stripe_customer_id = coalesce(excluded.stripe_customer_id, billing_accounts.stripe_customer_id),
      assessment_paid_at = coalesce(billing_accounts.assessment_paid_at, now()),
      updated_at = now()
  `;
}

/**
 * Why a new Checkout for `plan` would double-charge the account, or null
 * when it may start: the Firm plan is already running, or the assessment is
 * already paid. Reads the row the webhook writes, so it cannot see a payment
 * the webhook has not delivered yet; the Checkout idempotency key covers that
 * gap.
 */
export function checkoutRefusal(account: BillingAccount | null, plan: string): string | null {
  if (
    plan === "monthly" &&
    account?.subscriptionStatus &&
    ACTIVE_SUBSCRIPTION_STATUSES.has(account.subscriptionStatus)
  ) {
    return "Your firm plan is already active. Use Manage billing to change it.";
  }
  if (plan === "assessment" && account?.assessmentPaidAt) {
    return "Your firm has already paid for the assessment.";
  }
  return null;
}

/**
 * Records a subscription change and returns the status now stored. A null
 * `status` (a checkout completion, which knows only the ids) keeps the status
 * and renewal date a subscription event already stored for the same
 * subscription, since Stripe does not deliver events in order; with nothing
 * stored yet, a completed checkout counts as active.
 *
 * A stale event changes nothing: one created before the newest subscription
 * event already applied (a retry or a late delivery), or one for another
 * subscription while the stored one is still active (an old or duplicate
 * subscription being cancelled must not end the plan the firm pays for).
 * Only events that carry a status move the stored event time, because a
 * checkout completion can be created after the subscription events it
 * follows.
 */
export async function recordSubscription(
  sql: Sql,
  input: {
    userId: string;
    stripeCustomerId: string | null;
    subscriptionId: string;
    status: string | null;
    currentPeriodEnd: string | null;
    /** When Stripe created the event (ISO); null when unknown, which skips the order check. */
    eventAt?: string | null;
  },
): Promise<string> {
  const stored = await sql<{
    subscription_id: string | null;
    subscription_status: string | null;
    subscription_event_at: string | null;
  }>`
    select subscription_id, subscription_status, subscription_event_at
    from billing_accounts where user_id = ${input.userId}
    for update
  `;
  const current = stored[0];
  if (current?.subscription_status) {
    const otherWhileActive =
      current.subscription_id !== input.subscriptionId &&
      ACTIVE_SUBSCRIPTION_STATUSES.has(current.subscription_status);
    const storedAt = toIsoTimestampOrNull(current.subscription_event_at);
    const older = Boolean(
      input.eventAt && storedAt && Date.parse(input.eventAt) < Date.parse(storedAt),
    );
    if (otherWhileActive || older) return current.subscription_status;
  }
  const eventAt = input.status === null ? null : (input.eventAt ?? null);
  const rows = await sql<{ subscription_status: string }>`
    insert into billing_accounts
      (user_id, stripe_customer_id, subscription_id, subscription_status, current_period_end,
        subscription_event_at, updated_at)
    values (
      ${input.userId}, ${input.stripeCustomerId}, ${input.subscriptionId},
      coalesce(${input.status}::text, 'active'), ${input.currentPeriodEnd}::timestamptz,
      ${eventAt}::timestamptz, now()
    )
    on conflict (user_id) do update set
      stripe_customer_id = coalesce(excluded.stripe_customer_id, billing_accounts.stripe_customer_id),
      subscription_id = excluded.subscription_id,
      subscription_status = case
        when ${input.status}::text is null
          and billing_accounts.subscription_id = excluded.subscription_id
          and billing_accounts.subscription_status is not null
        then billing_accounts.subscription_status
        else excluded.subscription_status
      end,
      current_period_end = case
        when billing_accounts.subscription_id = excluded.subscription_id
        then coalesce(excluded.current_period_end, billing_accounts.current_period_end)
        else excluded.current_period_end
      end,
      subscription_event_at = case
        when billing_accounts.subscription_id = excluded.subscription_id
        then greatest(excluded.subscription_event_at, billing_accounts.subscription_event_at)
        else excluded.subscription_event_at
      end,
      updated_at = now()
    returning subscription_status
  `;
  return rows[0].subscription_status;
}

/** The account a Stripe customer id belongs to, or null. */
export async function userForCustomer(sql: Sql, stripeCustomerId: string): Promise<string | null> {
  const rows = await sql<{ user_id: string }>`
    select user_id from billing_accounts where stripe_customer_id = ${stripeCustomerId}
  `;
  return rows[0]?.user_id ?? null;
}

/** True the first time an event id is seen; false for a redelivery. */
export async function claimBillingEvent(sql: Sql, id: string, type: string): Promise<boolean> {
  const rows = await sql<{ id: string }>`
    insert into billing_events (id, type) values (${id}, ${type})
    on conflict (id) do nothing
    returning id
  `;
  return rows.length > 0;
}
