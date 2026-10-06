import type { Sql } from "@/lib/db";
import { RequestError } from "@/lib/request-errors";
import { inTransaction } from "@/lib/sql-transaction";
import {
  ACTIVE_SUBSCRIPTION_STATUSES,
  claimBillingEvent,
  listPendingCreditReversals,
  loadBillingAccount,
  markAssessmentCreditReversalPending,
  markAssessmentCreditReversed,
  markAssessmentCreditReversalFailed,
  markPastDue,
  recordAssessmentDispute,
  recordAssessmentPayment,
  recordAssessmentRefund,
  recordSubscription,
  userForAssessmentIntent,
  userForCustomer,
} from "../firm/billing-store";
import { setFirmPlan } from "../firm/store";
import { billingChangeFor, type StripeEvent } from "./stripe";
import { recordAudit } from "../firm/audit.server";
import { beforeDeadline } from "../cron/budget";

/**
 * Applies one verified Stripe event to the account it concerns. Idempotent:
 * a redelivered event id is acknowledged and skipped. The claim and the
 * change commit together, so a failure part-way rolls the claim back and
 * Stripe's retry applies the event. Returns what was done, for the route's
 * log line and for tests.
 *
 * A refund or dispute is attributed by its payment intent matching the one
 * stored with the assessment payment, and by nothing else: a dispute on a
 * Firm-plan invoice charge, a late refund of a superseded intent and a
 * payment made before the intent was stored are all "ignored".
 *
 * A checkout or subscription event the webhook cannot attribute is never
 * "ignored": a paid checkout that names no account, or a subscription event
 * for an unknown customer, throws, which rolls the claim back and answers
 * 500, so Stripe retries and the failure is reported instead of vanishing
 * with a 200. Linking the customer (OPERATIONS, Stripe) lets the retry of
 * a subscription event apply. A subscription that has ended
 * (canceled, incomplete_expired) for an unknown customer stays "ignored".
 * A subscription event for an account deleted before or while it waited is
 * "account deleted": acknowledged, so Stripe stops retrying it.
 *
 * After a refund or a lost dispute on an Assessment that was credited
 * against the Firm plan, the transaction marks the reversal pending (the
 * stored amount stays), so a second refund or lost dispute on the same
 * payment reverses nothing twice. Once it has committed, the credit is
 * reversed on the Stripe customer balance with a short inline retry, and
 * Stripe's confirmation zeroes the amount and clears the mark. A failure
 * that outlasts the retry marks the row failed; a webhook that dies before
 * Stripe answers leaves it pending. The scheduled run completes both
 * (retryFailedCreditReversals), looking for the reversal at Stripe before
 * it posts one.
 *
 * Work after the commit (the reversal, the second-subscription report, the
 * plan_changed audit row) never throws: the claim has committed, so a
 * failure is reported and the event still answers 200, since Stripe's retry
 * would only find a duplicate.
 */
export async function applyBillingEvent(
  sql: Sql,
  event: StripeEvent,
): Promise<"duplicate" | "ignored" | "applied" | "account deleted"> {
  // Lists, not nullable lets: assignments inside the transaction's
  // callback are invisible to narrowing after it.
  const reversals: {
    userId: string;
    customerId: string;
    creditCents: number;
    assessmentPaidAt: string | null;
  }[] = [];
  const secondSubscriptions: { userId: string; ignored: string; stored: string | null }[] = [];
  const planChanges: {
    userId: string;
    from: string | null;
    to: string;
    priceId: string | null;
  }[] = [];
  const outcome = await inTransaction(sql, async (tx) => {
    if (!(await claimBillingEvent(tx, event.id, event.type))) return "duplicate";
    const change = billingChangeFor(event);
    if (change.kind === "ignore") return "ignored";
    if (change.kind === "unattributed") {
      throw new RequestError(
        500,
        `Stripe event ${event.id} (${change.eventType}) names no account (customer ${change.customerId ?? "unknown"})`,
      );
    }
    if (change.kind === "assessment-paid") {
      await recordAssessmentPayment(tx, {
        userId: change.userId,
        stripeCustomerId: change.customerId,
        paymentIntentId: change.paymentIntentId,
        paidAt: change.eventAt,
        feeCents: change.amountSubtotalCents,
      });
      return "applied";
    }
    if (change.kind === "assessment-refunded" || change.kind === "assessment-dispute") {
      const userId = await userForAssessmentIntent(tx, change.paymentIntentId);
      if (!userId) return "ignored";
      if (change.kind === "assessment-refunded") {
        await recordAssessmentRefund(tx, userId, change.eventAt);
      } else {
        await recordAssessmentDispute(tx, userId, change.status, change.eventAt);
      }
      // After a refund or a lost dispute the firm is back on the assessment
      // stage, unless its subscription is still running.
      if (change.kind === "assessment-refunded" || change.status === "lost") {
        const account = await loadBillingAccount(tx, userId);
        const subscriptionActive = Boolean(
          account?.subscriptionStatus &&
          ACTIVE_SUBSCRIPTION_STATUSES.has(account.subscriptionStatus),
        );
        if (!subscriptionActive) await setFirmPlan(tx, userId, "assessment");
        const pending = await markAssessmentCreditReversalPending(tx, userId);
        if (pending) reversals.push({ userId, ...pending });
      }
      return "applied";
    }
    if (change.kind === "payment-failed") {
      const userId = change.customerId ? await userForCustomer(tx, change.customerId) : null;
      if (!userId) return "ignored";
      await markPastDue(tx, userId, change.eventAt, change.hostedInvoiceUrl);
      return "applied";
    }
    // A checkout completion (null status) names the account that started
    // it, which may be a new customer. A subscription event's metadata can
    // be stale after the firm changed owner, so the stored customer wins.
    const byCustomer = change.customerId ? await userForCustomer(tx, change.customerId) : null;
    const userId =
      change.status === null ? (change.userId ?? byCustomer) : (byCustomer ?? change.userId);
    if (!userId) {
      // An ended subscription moves no money, and a cancellation for a
      // customer no account holds (an old customer after a --replace link,
      // or an account already deleted) can never be attributed.
      if (change.status === "canceled" || change.status === "incomplete_expired") return "ignored";
      throw new RequestError(
        500,
        `Stripe subscription ${change.subscriptionId} names no account (customer ${change.customerId ?? "unknown"})`,
      );
    }
    const before = (await loadBillingAccount(tx, userId))?.subscriptionStatus ?? null;
    const recorded = await recordSubscription(tx, {
      userId,
      stripeCustomerId: change.customerId,
      subscriptionId: change.subscriptionId,
      status: change.status,
      currentPeriodEnd: change.currentPeriodEnd,
      eventAt: change.eventAt,
      cancellationReason: change.cancellationReason,
      priceId: change.priceId,
    });
    // The account was deleted before or while this event waited: nothing to
    // write, and the committed claim stops Stripe's retries.
    if (recorded.accountDeleted) return "account deleted";
    const { status, ignoredOther, storedSubscriptionId } = recorded;
    // Reported once, on the Checkout completion that started it: the
    // subscription's own created and updated events (each renewal) are not
    // news again.
    if (ignoredOther && change.status === null) {
      secondSubscriptions.push({
        userId,
        ignored: change.subscriptionId,
        stored: storedSubscriptionId,
      });
    }
    // The plan on the firm row follows the subscription status as stored,
    // which a late checkout event does not overwrite.
    const ownsFirm = await setFirmPlan(
      tx,
      userId,
      ACTIVE_SUBSCRIPTION_STATUSES.has(status) ? "monthly" : "assessment",
    );
    // Only the firm the account owns changes plan; a firm it merely joined
    // does not, so its log takes nothing.
    if (ownsFirm && status !== before) {
      planChanges.push({ userId, from: before, to: status, priceId: change.priceId });
    }
    return "applied";
  });
  for (const reversal of reversals) {
    await afterCommit(() => reverseAssessmentCredit(sql, reversal));
  }
  for (const second of secondSubscriptions) {
    await afterCommit(() => reportSecondSubscription(second));
  }
  // The firm's log takes a moved status once the change has committed; Stripe acted, so no actor.
  for (const { userId, ...detail } of planChanges) {
    await recordAudit(sql, {
      firmUserId: userId,
      actorUserId: null,
      event: "plan_changed",
      detail,
    });
  }
  return outcome;
}

/**
 * Runs one step after the event's claim has committed. A throw is logged and
 * reported (stripe-webhook-after-commit) instead of failing the delivery: a
 * 500 would bring the event back only as a duplicate.
 */
async function afterCommit(work: () => Promise<unknown>): Promise<void> {
  try {
    await work();
  } catch (error) {
    console.error(
      "[billing] step after the commit failed:",
      error instanceof Error ? error.message : error,
    );
    try {
      const { reportServerError } = await import("@/lib/observability/report.server");
      await reportServerError(error, "stripe-webhook-after-commit");
    } catch {
      // Already logged above; the delivery still answers 200.
    }
  }
}

/**
 * Two subscription Checkouts completed for one account (two tiers asked for
 * in the same second): Stripe charges the second while Precog keeps the
 * first. Reported for the operator to cancel and refund it (OPERATIONS).
 */
async function reportSecondSubscription(input: {
  userId: string;
  ignored: string;
  stored: string | null;
}): Promise<void> {
  const message = `second subscription ${input.ignored} beside ${input.stored ?? "none"} for account ${input.userId}`;
  console.error(`[billing] ${message}`);
  const { reportServerError } = await import("@/lib/observability/report.server");
  await reportServerError(new Error(message), "billing-second-subscription");
}

/** Inline attempts before a reversal is left for the scheduled run. */
const REVERSAL_ATTEMPTS = 3;
/** Waits between attempts, in milliseconds; bounded for a webhook invocation. */
const REVERSAL_RETRY_MS = [500, 2000];

type PendingReversal = {
  userId: string;
  customerId: string;
  creditCents: number;
  assessmentPaidAt: string | null;
};

/**
 * Takes back a posted Assessment credit on the Stripe customer balance,
 * once the refund's transaction has marked it pending. The Stripe call
 * carries a deterministic idempotency key, so the inline attempts post at
 * most once between them. Stripe's confirmation zeroes the amount and
 * clears the mark. When every inline attempt fails, the row keeps its
 * amount and pending mark (it agrees with the balance Stripe still holds),
 * is marked failed for the scheduled run, and the failure is reported.
 */
async function reverseAssessmentCredit(sql: Sql, input: PendingReversal): Promise<boolean> {
  if (input.creditCents <= 0) return true;
  const { reverseCustomerBalance } = await import("./stripe.server");
  let last: unknown = null;
  for (let attempt = 0; attempt < REVERSAL_ATTEMPTS; attempt += 1) {
    try {
      await reverseCustomerBalance({
        userId: input.userId,
        customerId: input.customerId,
        amountCents: input.creditCents,
        assessmentPaidAt: input.assessmentPaidAt,
      });
      last = null;
      break;
    } catch (err) {
      last = err;
      if (attempt < REVERSAL_RETRY_MS.length) {
        await new Promise((resolve) => setTimeout(resolve, REVERSAL_RETRY_MS[attempt]));
      }
    }
  }
  if (last === null) {
    // Stripe confirmed. If this write fails, the row stays pending and
    // the scheduled run finds the reversal at Stripe and only clears it.
    await markAssessmentCreditReversed(sql, input.userId);
    return true;
  }
  console.error(
    "[billing] Assessment credit not reversed:",
    last instanceof Error ? last.message : last,
  );
  await markAssessmentCreditReversalFailed(sql, input.userId);
  const { reportServerError } = await import("@/lib/observability/report.server");
  await reportServerError(last, "stripe-credit-reversal");
  return false;
}

/**
 * Completes every credit reversal a webhook left behind, for the scheduled
 * run: one whose inline attempts failed, and one still pending an hour after
 * its webhook (the function died between its commit and Stripe's answer).
 * Oldest first. For each, the customer's balance transactions are read
 * first: a reversal already there (tagged with its reversal_for metadata)
 * only clears the row, since Stripe forgets an idempotency key after about a
 * day; otherwise the reversal is posted, then the row cleared. A failure
 * keeps the row for the next run and is reported. Stops before the next row
 * once `deadline` passes. Returns what moved, for the run's answer.
 */
export async function retryFailedCreditReversals(
  sql: Sql,
  options: { deadline?: number } = {},
): Promise<{
  retried: number;
  alreadyPosted: number;
  failed: number;
  stopped: boolean;
  remaining: number;
}> {
  const pending = await listPendingCreditReversals(sql);
  const { findCreditReversal, reverseCustomerBalance } = await import("./stripe.server");
  const { reportServerError } = await import("@/lib/observability/report.server");
  let retried = 0;
  let alreadyPosted = 0;
  let failed = 0;
  for (const row of pending) {
    if (!beforeDeadline(options.deadline)) break;
    retried += 1;
    const reversal = {
      userId: row.userId,
      customerId: row.customerId,
      amountCents: row.creditCents,
      assessmentPaidAt: row.assessmentPaidAt,
    };
    try {
      if (await findCreditReversal(reversal)) {
        alreadyPosted += 1;
      } else {
        await reverseCustomerBalance(reversal);
      }
      await markAssessmentCreditReversed(sql, row.userId);
    } catch (err) {
      failed += 1;
      console.error(
        "[billing] Assessment credit reversal retry failed:",
        err instanceof Error ? err.message : err,
      );
      await reportServerError(err, "stripe-credit-reversal-retry");
    }
  }
  const remaining = pending.length - retried;
  return { retried, alreadyPosted, failed, stopped: remaining > 0, remaining };
}
