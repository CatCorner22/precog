import type { Sql } from "@/lib/db";
import { RequestError } from "@/lib/request-errors";
import { toIsoTimestamp, toIsoTimestampOrNull } from "../iso-time";
import { entitlementsFor } from "./entitlements";
import type { FirmPlan } from "./pricing";

/**
 * What the payment provider last said about an account. Rows are written by
 * the Stripe webhook alone; the firm workspace reads them.
 */
export interface BillingAccount {
  stripeCustomerId: string | null;
  subscriptionId: string | null;
  subscriptionStatus: string | null;
  assessmentPaidAt: string | null;
  /** The payment intent behind the assessment payment; a refund or dispute names it. */
  assessmentPaymentIntentId: string | null;
  /** Set when Stripe refunded the assessment, or a dispute of it was lost; cleared by a new payment. */
  assessmentRefundedAt: string | null;
  /** Set while a dispute of the assessment is open; cleared when it is won or a new payment lands. */
  assessmentDisputedAt: string | null;
  currentPeriodEnd: string | null;
  /**
   * When the subscription first went past due (the Firm plan stays open for
   * PAST_DUE_GRACE_DAYS from here); for a row already past due before the
   * column existed, the time of its newest subscription event. Cleared when
   * a payment goes through; kept on a cancellation Stripe made because the
   * retries ran out.
   */
  pastDueSince: string | null;
  /** When the one failed-payment email went (or was found suppressed); cleared when a payment goes through. */
  paymentFailedEmailSentAt: string | null;
  /** Stripe's hosted page for the failed invoice, where the card can be fixed without signing in. */
  paymentFailedInvoiceUrl: string | null;
  /** When the Assessment fee was credited against the Firm plan's first Checkout. */
  assessmentCreditUsedAt: string | null;
  /** The Assessment fee as charged before tax, in cents, from the Checkout session. */
  assessmentFeeCents: number | null;
  /** The credit posted to the Stripe customer balance, in cents, so a refund reverses what was posted. */
  assessmentCreditCents: number | null;
  /** The Stripe price the subscription runs on (its tier); null until a subscription event names it. */
  subscriptionPriceId: string | null;
  /** When a Stripe-side credit reversal last failed; the weekly run retries while this is set and cents stay posted. */
  assessmentCreditReversalFailedAt: string | null;
  updatedAt: string;
}

export const ACTIVE_SUBSCRIPTION_STATUSES = new Set(["active", "trialing", "past_due"]);

/** Statuses that count as paid. past_due is a subscription, not a paid plan. */
export const PAID_SUBSCRIPTION_STATUSES = new Set(["active", "trialing"]);

/**
 * QuickBooks and the rest of the firm tools: `entitlementsFor(...).features.quickbooks`.
 * Stripe unconfigured: open, so the owner is not locked out of their own firm.
 * past_due or unpaid: open for PAST_DUE_GRACE_DAYS from `pastDueSince` (or
 * while that start is unknown), then closed. An active or trialing
 * subscription, or a paid assessment (not refunded) inside its window, is
 * open. A dispute under way does not close the tools; a lost dispute counts
 * as a refund.
 */
export function commercialToolsOpen(input: {
  stripeConfigured: boolean;
  subscriptionStatus: string | null;
  assessmentPaidAt: string | null;
  assessmentRefundedAt: string | null;
  pastDueSince?: string | null;
  now?: Date;
}): boolean {
  return entitlementsFor({
    stripeConfigured: input.stripeConfigured,
    firmPlan: null,
    billing: {
      subscriptionStatus: input.subscriptionStatus,
      assessmentPaidAt: input.assessmentPaidAt,
      assessmentRefundedAt: input.assessmentRefundedAt,
      pastDueSince: input.pastDueSince ?? null,
    },
    now: input.now ?? new Date(),
  }).features.quickbooks;
}

/**
 * True when the first subscription Checkout credits the Assessment fee: paid,
 * not refunded, never subscribed, and not credited already. A cancelled and
 * restarted subscription keeps its id, so it gets no second credit.
 */
export function assessmentCreditApplies(account: BillingAccount | null): boolean {
  return (
    account !== null &&
    assessmentPaid(account) &&
    account.subscriptionId === null &&
    account.assessmentCreditUsedAt === null
  );
}

/** True while the assessment is paid and not refunded. */
export function assessmentPaid(
  account: { assessmentPaidAt: string | null; assessmentRefundedAt: string | null } | null,
): boolean {
  return Boolean(account?.assessmentPaidAt) && !account?.assessmentRefundedAt;
}

/** The word the firm page prints for a Stripe subscription status. */
export function subscriptionStatusLabel(status: string | null): string {
  switch (status) {
    case null:
      return "None";
    case "active":
      return "Active";
    case "trialing":
      return "Trial";
    case "past_due":
      return "Payment overdue";
    case "incomplete":
      return "Payment not finished";
    case "incomplete_expired":
      return "Checkout expired";
    case "canceled":
      return "Cancelled";
    case "unpaid":
      return "Unpaid";
    case "paused":
      return "Paused";
    default:
      return status;
  }
}

/**
 * The plan a firm profile save may store, or null to keep the stored one.
 * With Stripe connected the plan follows the webhook alone, whatever the
 * client sent; so does an account that already has a billing row. Without
 * Stripe the owner records the stage by hand.
 */
export function planToStore(
  stripeConfigured: boolean,
  hasBillingRow: boolean,
  requested: FirmPlan,
): FirmPlan | null {
  if (stripeConfigured || hasBillingRow) return null;
  return requested;
}

export async function loadBillingAccount(sql: Sql, userId: string): Promise<BillingAccount | null> {
  const rows = await sql<{
    stripe_customer_id: string | null;
    subscription_id: string | null;
    subscription_status: string | null;
    assessment_paid_at: string | null;
    assessment_payment_intent: string | null;
    assessment_refunded_at: string | null;
    assessment_disputed_at: string | null;
    current_period_end: string | null;
    past_due_since: string | null;
    payment_failed_email_sent_at: string | null;
    payment_failed_invoice_url: string | null;
    assessment_credit_used_at: string | null;
    assessment_fee_cents: number | string | null;
    assessment_credit_cents: number | string | null;
    subscription_price_id: string | null;
    assessment_credit_reversal_failed_at: string | null;
    updated_at: string;
  }>`
    select stripe_customer_id, subscription_id, subscription_status, assessment_paid_at,
      assessment_payment_intent, assessment_refunded_at, assessment_disputed_at,
      current_period_end,
      coalesce(past_due_since,
        case when subscription_status in ('past_due', 'unpaid') then subscription_event_at end) as past_due_since,
      payment_failed_email_sent_at, payment_failed_invoice_url, assessment_credit_used_at,
      assessment_fee_cents, assessment_credit_cents, subscription_price_id,
      assessment_credit_reversal_failed_at, updated_at
    from billing_accounts where user_id = ${userId}
  `;
  const row = rows[0];
  if (!row) return null;
  return {
    stripeCustomerId: row.stripe_customer_id,
    subscriptionId: row.subscription_id,
    subscriptionStatus: row.subscription_status,
    assessmentPaidAt: toIsoTimestampOrNull(row.assessment_paid_at),
    assessmentPaymentIntentId: row.assessment_payment_intent,
    assessmentRefundedAt: toIsoTimestampOrNull(row.assessment_refunded_at),
    assessmentDisputedAt: toIsoTimestampOrNull(row.assessment_disputed_at),
    currentPeriodEnd: toIsoTimestampOrNull(row.current_period_end),
    pastDueSince: toIsoTimestampOrNull(row.past_due_since),
    paymentFailedEmailSentAt: toIsoTimestampOrNull(row.payment_failed_email_sent_at),
    paymentFailedInvoiceUrl: row.payment_failed_invoice_url,
    assessmentCreditUsedAt: toIsoTimestampOrNull(row.assessment_credit_used_at),
    assessmentFeeCents: row.assessment_fee_cents === null ? null : Number(row.assessment_fee_cents),
    assessmentCreditCents:
      row.assessment_credit_cents === null ? null : Number(row.assessment_credit_cents),
    subscriptionPriceId: row.subscription_price_id,
    assessmentCreditReversalFailedAt: toIsoTimestampOrNull(
      row.assessment_credit_reversal_failed_at,
    ),
    updatedAt: toIsoTimestamp(row.updated_at),
  };
}

/**
 * Stores the Stripe customer an account was given outside Checkout (the
 * Assessment credit creates one for a row paid before Checkout created
 * customers). A customer already stored is kept.
 */
export async function recordStripeCustomer(
  sql: Sql,
  userId: string,
  stripeCustomerId: string,
): Promise<void> {
  await sql`
    insert into billing_accounts (user_id, stripe_customer_id, updated_at)
    values (${userId}, ${stripeCustomerId}, now())
    on conflict (user_id) do update set
      stripe_customer_id = coalesce(billing_accounts.stripe_customer_id, excluded.stripe_customer_id),
      updated_at = now()
  `;
}

/** Stamps the Assessment credit as posted, with the amount that was posted. */
export async function markAssessmentCreditUsed(
  sql: Sql,
  userId: string,
  creditCents: number,
): Promise<void> {
  await sql`
    update billing_accounts
    set assessment_credit_used_at = now(), assessment_credit_cents = ${creditCents}, updated_at = now()
    where user_id = ${userId}
  `;
}

/**
 * Records that the posted credit is being taken back: the amount goes to
 * zero so a second refund or lost dispute on the same payment reverses
 * nothing twice. The stamp stays, so the refunded payment is never credited
 * again; only a new payment clears it (recordAssessmentPayment). A failed
 * reversal clears, since this call means Stripe just took the credit back.
 */
export async function markAssessmentCreditReversed(sql: Sql, userId: string): Promise<void> {
  await sql`
    update billing_accounts
    set assessment_credit_cents = 0, assessment_credit_reversal_failed_at = null, updated_at = now()
    where user_id = ${userId}
  `;
}

/**
 * Records that the Stripe-side reversal failed after the ledger already
 * zeroed the amount: the amount comes back so the row agrees with the
 * customer balance Stripe still holds, and the failure time marks the row
 * for the weekly retry (retryFailedCreditReversals). The Stripe call carries
 * a deterministic idempotency key, so a retry posts nothing twice.
 */
export async function markAssessmentCreditReversalFailed(
  sql: Sql,
  userId: string,
  creditCents: number,
): Promise<void> {
  await sql`
    update billing_accounts
    set assessment_credit_cents = ${creditCents},
      assessment_credit_reversal_failed_at = now(), updated_at = now()
    where user_id = ${userId}
  `;
}

/** Accounts whose credit reversal failed and still needs taking back, oldest failure first. */
export async function listFailedCreditReversals(
  sql: Sql,
): Promise<
  { userId: string; customerId: string; creditCents: number; assessmentPaidAt: string | null }[]
> {
  const rows = await sql<{
    user_id: string;
    stripe_customer_id: string | null;
    assessment_credit_cents: number | string | null;
    assessment_paid_at: string | null;
  }>`
    select user_id, stripe_customer_id, assessment_credit_cents, assessment_paid_at
    from billing_accounts
    where assessment_credit_reversal_failed_at is not null
      and coalesce(assessment_credit_cents, 0) > 0
    order by assessment_credit_reversal_failed_at asc
  `;
  return rows.flatMap((r) =>
    r.stripe_customer_id && r.assessment_credit_cents !== null
      ? [
          {
            userId: r.user_id,
            customerId: r.stripe_customer_id,
            creditCents: Number(r.assessment_credit_cents),
            assessmentPaidAt: toIsoTimestampOrNull(r.assessment_paid_at),
          },
        ]
      : [],
  );
}

/**
 * Records a paid assessment. A redelivery (the same payment intent) keeps
 * the first stamp; a new intent after a refund or lost dispute is a new
 * payment, so it stamps the event time and clears the refund and dispute
 * marks and the credit of the earlier payment (that credit was reversed
 * with the refund, so the new payment earns its own). An event without a
 * creation time stamps now.
 */
export async function recordAssessmentPayment(
  sql: Sql,
  input: {
    userId: string;
    stripeCustomerId: string | null;
    paymentIntentId: string | null;
    paidAt: string | null;
    /** The session's amount before tax, in cents; what the Assessment credit posts. */
    feeCents?: number | null;
  },
): Promise<void> {
  await sql`
    insert into billing_accounts
      (user_id, stripe_customer_id, assessment_paid_at, assessment_payment_intent,
        assessment_fee_cents, updated_at)
    values (
      ${input.userId}, ${input.stripeCustomerId}, coalesce(${input.paidAt}::timestamptz, now()),
      ${input.paymentIntentId}, ${input.feeCents ?? null}::integer, now()
    )
    on conflict (user_id) do update set
      stripe_customer_id = coalesce(excluded.stripe_customer_id, billing_accounts.stripe_customer_id),
      assessment_fee_cents = coalesce(excluded.assessment_fee_cents, billing_accounts.assessment_fee_cents),
      assessment_paid_at = case
        when excluded.assessment_payment_intent is distinct from billing_accounts.assessment_payment_intent
          then coalesce(excluded.assessment_paid_at, now())
        else coalesce(billing_accounts.assessment_paid_at, excluded.assessment_paid_at, now())
      end,
      assessment_refunded_at = case
        when excluded.assessment_payment_intent is distinct from billing_accounts.assessment_payment_intent
          then null
        else billing_accounts.assessment_refunded_at
      end,
      assessment_disputed_at = case
        when excluded.assessment_payment_intent is distinct from billing_accounts.assessment_payment_intent
          then null
        else billing_accounts.assessment_disputed_at
      end,
      assessment_credit_used_at = case
        when excluded.assessment_payment_intent is distinct from billing_accounts.assessment_payment_intent
          then null
        else billing_accounts.assessment_credit_used_at
      end,
      assessment_credit_cents = case
        when excluded.assessment_payment_intent is distinct from billing_accounts.assessment_payment_intent
          then null
        else billing_accounts.assessment_credit_cents
      end,
      assessment_credit_reversal_failed_at = case
        when excluded.assessment_payment_intent is distinct from billing_accounts.assessment_payment_intent
          then null
        else billing_accounts.assessment_credit_reversal_failed_at
      end,
      assessment_payment_intent = coalesce(excluded.assessment_payment_intent, billing_accounts.assessment_payment_intent),
      updated_at = now()
  `;
}

/** The account whose assessment payment a payment intent belongs to, or null. */
export async function userForAssessmentIntent(
  sql: Sql,
  paymentIntentId: string,
): Promise<string | null> {
  const rows = await sql<{ user_id: string }>`
    select user_id from billing_accounts where assessment_payment_intent = ${paymentIntentId}
  `;
  return rows[0]?.user_id ?? null;
}

/** Marks the assessment refunded, which closes the paid tools until a new payment. */
export async function recordAssessmentRefund(
  sql: Sql,
  userId: string,
  at: string | null,
): Promise<void> {
  await sql`
    update billing_accounts
    set assessment_refunded_at = coalesce(${at}::timestamptz, now()), updated_at = now()
    where user_id = ${userId}
  `;
}

/**
 * Records a dispute of the assessment: open marks it disputed, won clears
 * the mark, lost counts as a refund.
 */
export async function recordAssessmentDispute(
  sql: Sql,
  userId: string,
  status: "open" | "won" | "lost",
  at: string | null,
): Promise<void> {
  if (status === "open") {
    await sql`
      update billing_accounts
      set assessment_disputed_at = coalesce(${at}::timestamptz, now()), updated_at = now()
      where user_id = ${userId}
    `;
  } else if (status === "won") {
    await sql`
      update billing_accounts set assessment_disputed_at = null, updated_at = now()
      where user_id = ${userId}
    `;
  } else {
    await sql`
      update billing_accounts
      set assessment_disputed_at = null,
        assessment_refunded_at = coalesce(${at}::timestamptz, now()),
        updated_at = now()
      where user_id = ${userId}
    `;
  }
}

/**
 * Why a new Checkout for `plan` would double-charge the account, or null
 * when it may start: the Firm plan is already running, or the assessment is
 * already paid and not refunded. Reads the row the webhook writes, so it
 * cannot see a payment the webhook has not delivered yet; the Checkout
 * idempotency key covers that gap.
 */
export function checkoutRefusal(account: BillingAccount | null, plan: string): string | null {
  if (
    plan !== "assessment" &&
    account?.subscriptionStatus &&
    ACTIVE_SUBSCRIPTION_STATUSES.has(account.subscriptionStatus)
  ) {
    return "Your firm plan is already active. Use Manage billing to change it.";
  }
  if (plan === "assessment" && assessmentPaid(account)) {
    return "Your firm has already paid for the assessment.";
  }
  return null;
}

/**
 * Where a status sits in one subscription's life, for two events Stripe
 * created in the same second (event.created is in whole seconds, and a
 * Checkout's created(incomplete) and updated(active) routinely share one):
 * incomplete < trialing = active < past_due = unpaid < canceled =
 * incomplete_expired. A subscription moves up this order within a second,
 * never down: a payment that clears a past_due arrives on a later retry, and
 * nothing revives an ended subscription. A status not listed has no rank, so
 * the same-second event applies as before.
 */
const STATUS_RANK: Readonly<Record<string, number>> = {
  incomplete: 0,
  trialing: 1,
  active: 1,
  past_due: 2,
  unpaid: 2,
  canceled: 3,
  incomplete_expired: 3,
};

/**
 * True when an event must not overwrite the stored subscription state: it
 * was created before the newest subscription event already applied, or in
 * the same second for the same subscription with a status lower in
 * STATUS_RANK than the stored one. An event or a stored row without a time
 * skips the check; so does an event without a status (a checkout
 * completion), which keeps the stored status anyway.
 */
export function staleSubscriptionEvent(
  stored: { subscriptionId: string | null; status: string | null; eventAt: string | null },
  incoming: { subscriptionId: string; status: string | null; eventAt: string | null },
): boolean {
  if (!incoming.eventAt || !stored.eventAt) return false;
  const incomingAt = Date.parse(incoming.eventAt);
  const storedAt = Date.parse(stored.eventAt);
  if (incomingAt < storedAt) return true;
  if (incomingAt > storedAt || incoming.status === null || stored.status === null) return false;
  if (stored.subscriptionId !== incoming.subscriptionId) return false;
  const storedRank = STATUS_RANK[stored.status];
  const incomingRank = STATUS_RANK[incoming.status];
  return storedRank !== undefined && incomingRank !== undefined && incomingRank < storedRank;
}

/** What recordSubscription did; "account deleted" when the account's user row is gone. */
export type RecordedSubscription =
  | { accountDeleted: true }
  | {
      accountDeleted: false;
      status: string;
      ignoredOther: boolean;
      storedSubscriptionId: string | null;
    };

/**
 * Records a subscription change and returns the status now stored. A null
 * `status` (a checkout completion, which knows only the ids) keeps the status
 * and renewal date a subscription event already stored for the same
 * subscription, since Stripe does not deliver events in order; with nothing
 * stored yet, a completed checkout counts as active.
 *
 * A stale event changes nothing: one created before the newest subscription
 * event already applied (a retry or a late delivery), one from the same
 * second that would move the subscription down STATUS_RANK, or one for
 * another subscription while the stored one is still active (an old or
 * duplicate subscription being cancelled must not end the plan the firm
 * pays for). Only events that carry a status move the stored event time,
 * because a checkout completion can be created after the subscription
 * events it follows.
 *
 * Stripe delivers in parallel, so events for one account apply one at a
 * time: the account's user row is held against deletion first (the global
 * lock order: user rows, then the firm, then businesses), then an empty
 * billing row is inserted if none exists, so the row lock that orders the
 * events exists even for the account's first event. The upsert repeats the
 * event-time check as a second guard. An account whose user row is gone
 * (deleted before or while the event waited) gets nothing written and
 * reports `accountDeleted`, so the webhook acknowledges the event instead
 * of failing on it until Stripe gives up.
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
    /**
     * Stripe's `cancellation_details.reason` on a cancellation: "payment_failed"
     * when its retries ran out, which keeps `past_due_since` as the record of
     * why; any other reason (the firm asked) clears it.
     */
    cancellationReason?: string | null;
    /** The subscription's Stripe price (its tier); null keeps the stored one for the same subscription. */
    priceId?: string | null;
  },
): Promise<RecordedSubscription> {
  // A deletion holds the user row for update first (deleteAccountRows), so
  // this waits for it and then finds no row.
  const user = await sql<{ id: string }>`
    select id from "user" where id = ${input.userId} for key share
  `;
  if (user.length === 0) return { accountDeleted: true };
  await sql`
    insert into billing_accounts (user_id) values (${input.userId})
    on conflict (user_id) do nothing
  `;
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
    const older = staleSubscriptionEvent(
      {
        subscriptionId: current.subscription_id,
        status: current.subscription_status,
        eventAt: toIsoTimestampOrNull(current.subscription_event_at),
      },
      {
        subscriptionId: input.subscriptionId,
        status: input.status,
        eventAt: input.eventAt ?? null,
      },
    );
    if (otherWhileActive || older) {
      // A second subscription starting or running beside the one the firm
      // pays for (two Checkouts completed in the same second): Stripe charges
      // it, so the webhook reports it for the operator to cancel and refund.
      // A late event or the duplicate's own cancellation is not news.
      const ignoredOther =
        otherWhileActive &&
        !older &&
        input.status !== "canceled" &&
        input.status !== "incomplete_expired";
      return {
        accountDeleted: false,
        status: current.subscription_status,
        ignoredOther,
        storedSubscriptionId: current.subscription_id,
      };
    }
  }
  const eventAt = input.status === null ? null : (input.eventAt ?? null);
  const cancellationReason = input.cancellationReason ?? null;
  const priceId = input.priceId ?? null;
  const rows = await sql<{ subscription_status: string }>`
    insert into billing_accounts
      (user_id, stripe_customer_id, subscription_id, subscription_status, current_period_end,
        subscription_event_at, past_due_since, subscription_price_id, updated_at)
    values (
      ${input.userId}, ${input.stripeCustomerId}, ${input.subscriptionId},
      coalesce(${input.status}::text, 'active'), ${input.currentPeriodEnd}::timestamptz,
      ${eventAt}::timestamptz,
      case when ${input.status}::text in ('past_due', 'unpaid') then coalesce(${eventAt}::timestamptz, now()) end,
      ${priceId}::text,
      now()
    )
    on conflict (user_id) do update set
      stripe_customer_id = coalesce(excluded.stripe_customer_id, billing_accounts.stripe_customer_id),
      subscription_id = excluded.subscription_id,
      -- A later event for the same subscription without items keeps its price;
      -- a new subscription never inherits the old one's tier.
      subscription_price_id = case
        when billing_accounts.subscription_id = excluded.subscription_id
        then coalesce(excluded.subscription_price_id, billing_accounts.subscription_price_id)
        else excluded.subscription_price_id
      end,
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
      -- A checkout completion (null status) says nothing about dunning. A
      -- past_due or unpaid keeps the first start; a payment that goes through
      -- clears the episode; a cancellation keeps the record only when Stripe's
      -- retries ran out; anything else leaves it.
      past_due_since = case
        when ${input.status}::text is null then billing_accounts.past_due_since
        when excluded.subscription_status in ('past_due', 'unpaid')
          then coalesce(billing_accounts.past_due_since, excluded.subscription_event_at, now())
        when excluded.subscription_status in ('active', 'trialing') then null
        when excluded.subscription_status = 'canceled'
          and ${cancellationReason}::text is distinct from 'payment_failed' then null
        else billing_accounts.past_due_since
      end,
      payment_failed_email_sent_at = case
        when ${input.status}::text is not null
          and excluded.subscription_status in ('active', 'trialing') then null
        else billing_accounts.payment_failed_email_sent_at
      end,
      payment_failed_invoice_url = case
        when ${input.status}::text is not null
          and excluded.subscription_status in ('active', 'trialing') then null
        else billing_accounts.payment_failed_invoice_url
      end,
      updated_at = now()
    -- The second guard: never overwrite a newer subscription event's state.
    where ${input.eventAt ?? null}::timestamptz is null
      or billing_accounts.subscription_event_at is null
      or ${input.eventAt ?? null}::timestamptz >= billing_accounts.subscription_event_at
    returning subscription_status
  `;
  const written = rows[0];
  if (!written) {
    // The guard kept a newer row (the lock above makes this unreachable in practice).
    const kept = await sql<{ subscription_id: string | null; subscription_status: string | null }>`
      select subscription_id, subscription_status from billing_accounts where user_id = ${input.userId}
    `;
    return {
      accountDeleted: false,
      status: kept[0]?.subscription_status ?? "incomplete",
      ignoredOther: false,
      storedSubscriptionId: kept[0]?.subscription_id ?? null,
    };
  }
  return {
    accountDeleted: false,
    status: written.subscription_status,
    ignoredOther: false,
    storedSubscriptionId: input.subscriptionId,
  };
}

/**
 * A failed invoice payment on the subscription: keeps the first failure's
 * time and stores Stripe's hosted invoice link for the one email. The status
 * itself follows the subscription events. An invoice event created before
 * the newest subscription event already stored (a late delivery after the
 * payment that ended the episode went through) stamps no start, since a
 * stray stamp under an active row would shorten the next episode's grace;
 * an event with no creation time skips the order check, as recordSubscription
 * does. The link is kept either way; a payment that goes through clears it.
 */
export async function markPastDue(
  sql: Sql,
  userId: string,
  at: string | null,
  invoiceUrl: string | null,
): Promise<void> {
  await sql`
    update billing_accounts
    set past_due_since = case
        when ${at}::timestamptz is null
          or subscription_event_at is null
          or ${at}::timestamptz >= subscription_event_at
        then coalesce(past_due_since, ${at}::timestamptz, now())
        else past_due_since
      end,
      payment_failed_invoice_url = coalesce(${invoiceUrl}::text, payment_failed_invoice_url),
      updated_at = now()
    where user_id = ${userId}
  `;
}

/** Stamps the one failed-payment email as sent (or found suppressed) for this episode. */
export async function markPaymentFailedEmailSent(sql: Sql, userId: string): Promise<void> {
  await sql`
    update billing_accounts
    set payment_failed_email_sent_at = now(), updated_at = now()
    where user_id = ${userId}
  `;
}

/** The account a Stripe customer id belongs to, or null. */
export async function userForCustomer(sql: Sql, stripeCustomerId: string): Promise<string | null> {
  const rows = await sql<{ user_id: string }>`
    select user_id from billing_accounts where stripe_customer_id = ${stripeCustomerId}
  `;
  return rows[0]?.user_id ?? null;
}

/**
 * The refusal when a Stripe customer has no active, trialing or past_due
 * subscription: linking it would give the account a billing row with no
 * running plan, which closes a firm marked by hand. Checked Stripe-side by
 * the link script (scripts/lib/link-stripe-customer.mjs, which copies this
 * text and is pinned equal to it) and the operator page.
 */
export function NO_RUNNING_SUBSCRIPTION(customerId: string): string {
  return `Stripe customer ${customerId} has no running subscription. Create the subscription in Stripe first, then link.`;
}

export const CUSTOMER_OF_ANOTHER_ACCOUNT = "That customer belongs to another account in Precog.";

/**
 * Links a Stripe customer the owner set up outside Checkout (a net-30
 * invoice subscription, a firm marked by hand) to an account, so its
 * subscription events attribute. Refuses (409) a customer another account
 * holds, an account that already holds another customer unless `replace`,
 * and a member of a firm who is not its owner (the firm's plan reads the
 * owner's row). "unchanged" when the account already holds this customer.
 * The script runs the same statement (scripts/lib/link-stripe-customer.mjs).
 */
export async function setStripeCustomer(
  sql: Sql,
  userId: string,
  customerId: string,
  { replace = false }: { replace?: boolean } = {},
): Promise<"linked" | "unchanged"> {
  const owner = await userForCustomer(sql, customerId);
  if (owner && owner !== userId) throw new RequestError(409, CUSTOMER_OF_ANOTHER_ACCOUNT);
  const memberships = await sql<{ email: string | null; firm: string }>`
    select u.email, f.name as firm
    from firm_members m
    join firms f on f.user_id = m.firm_user_id
    join "user" u on u.id = m.member_user_id
    where m.member_user_id = ${userId} and m.role <> 'owner'
  `;
  const member = memberships[0];
  if (member) {
    throw new RequestError(
      409,
      `${member.email ?? userId} is a member of ${member.firm}, not its owner. Link the firm owner's account.`,
    );
  }
  const stored = await sql<{ stripe_customer_id: string | null }>`
    select stripe_customer_id from billing_accounts where user_id = ${userId}
  `;
  const current = stored[0]?.stripe_customer_id ?? null;
  if (current === customerId) return "unchanged";
  if (current && !replace) {
    throw new RequestError(
      409,
      `This account already has Stripe customer ${current}. Tick Replace to link another.`,
    );
  }
  await sql`
    insert into billing_accounts (user_id, stripe_customer_id, updated_at)
    values (${userId}, ${customerId}, now())
    on conflict (user_id) do update set
      stripe_customer_id = excluded.stripe_customer_id, updated_at = now()
  `;
  return "linked";
}

/**
 * A firm marked "monthly" by hand before Stripe was connected, with no
 * billing row: it keeps the Firm plan until HAND_MARKED_PLANS_UNTIL, and any
 * billing row ends that exception.
 */
export async function isHandMarked(sql: Sql, userId: string): Promise<boolean> {
  const rows = await sql<{ hand_marked: boolean }>`
    select exists (
      select 1 from firms f
      where f.user_id = ${userId} and f.plan = 'monthly'
        and not exists (select 1 from billing_accounts b where b.user_id = f.user_id)
    ) as hand_marked
  `;
  return Boolean(rows[0]?.hand_marked);
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
