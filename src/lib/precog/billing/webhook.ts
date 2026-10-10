import type { Sql } from "@/lib/db";
import { RequestError } from "@/lib/request-errors";
import { inTransaction } from "@/lib/sql-transaction";
import {
  ACTIVE_SUBSCRIPTION_STATUSES,
  claimBillingEvent,
  listPendingCreditReversals,
  lockBillingAccount,
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
  type PendingReversal,
} from "../firm/billing-store";
import { setFirmPlan } from "../firm/store";
import { billingChangeFor, type StripeEvent } from "./stripe";
import { insertAudit } from "../firm/audit.server";
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
 * "account deleted": acknowledged, so Stripe stops retrying it. So is a paid
 * Assessment for a deleted account, which is reported
 * (billing-payment-for-deleted-account) for the operator to refund, since
 * no account is left to hold it. An event that waited on an ownership
 * transfer applies to the account that now holds the Stripe customer
 * (lockBillingAccount).
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
 * Work after the commit (the reversal and second-subscription report) never
 * throws: the claim has committed, so a failure is reported and the event
 * still answers 200, since Stripe's retry would only find a duplicate.
 * Plan changes are audited in their transaction order; a failed audit insert
 * is isolated with a savepoint and reported after the commit.
 */
export async function applyBillingEvent(
  sql: Sql,
  event: StripeEvent,
): Promise<"duplicate" | "ignored" | "applied" | "account deleted"> {
  // Lists, not nullable lets: assignments inside the transaction's
  // callback are invisible to narrowing after it.
  const reversals: PendingReversal[] = [];
  const secondSubscriptions: { userId: string; ignored: string; stored: string | null }[] = [];
  const planAuditFailures: unknown[] = [];
  const orphanPayments: {
    userId: string;
    customerId: string | null;
    paymentIntentId: string | null;
  }[] = [];
  const outcome = await inTransaction(
    sql,
    async (tx) => {
      // A deadlock victim runs again from nothing: what the first run noted goes.
      for (const list of [reversals, secondSubscriptions, orphanPayments, planAuditFailures]) {
        list.length = 0;
      }
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
        const userId = await lockBillingAccount(tx, change.userId, change.customerId);
        if (userId === null) {
          orphanPayments.push({
            userId: change.userId,
            customerId: change.customerId,
            paymentIntentId: change.paymentIntentId,
          });
          return "account deleted";
        }
        await recordAssessmentPayment(tx, {
          userId,
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
        if (change.status === "canceled" || change.status === "incomplete_expired")
          return "ignored";
        throw new RequestError(
          500,
          `Stripe subscription ${change.subscriptionId} names no account (customer ${change.customerId ?? "unknown"})`,
        );
      }
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
      // The account written to: a transfer may have moved the customer.
      const {
        userId: account,
        status,
        previousStatus,
        wrote,
        ignoredOther,
        storedSubscriptionId,
      } = recorded;
      // Reported once, on the Checkout completion that started it: the
      // subscription's own created and updated events (each renewal) are not
      // news again.
      if (ignoredOther && change.status === null) {
        secondSubscriptions.push({
          userId: account,
          ignored: change.subscriptionId,
          stored: storedSubscriptionId,
        });
      }
      // The plan on the firm row follows the subscription status as stored,
      // which a late checkout event does not overwrite.
      const ownsFirm = await setFirmPlan(
        tx,
        account,
        ACTIVE_SUBSCRIPTION_STATUSES.has(status) ? "monthly" : "assessment",
      );
      // Only the firm the account owns changes plan; a firm it merely joined
      // does not, so its log takes nothing. The audit row shares this
      // transaction and row lock, keeping concurrent changes in status order.
      if (ownsFirm && wrote && status !== previousStatus) {
        await tx`savepoint stripe_plan_audit`;
        try {
          await insertAudit(tx, {
            firmUserId: account,
            actorUserId: null,
            event: "plan_changed",
            detail: { from: previousStatus, to: status, priceId: change.priceId },
          });
        } catch (error) {
          await tx`rollback to savepoint stripe_plan_audit`;
          planAuditFailures.push(error);
        }
        await tx`release savepoint stripe_plan_audit`;
      }
      return "applied";
    },
    // Two accounts' rows are taken in ascending id order (lockBillingAccount),
    // as every other write does; a deadlock left over (a customer that moved
    // twice while the event waited) runs the event once more.
    { retryOnDeadlock: true },
  );
  for (const reversal of reversals) {
    await afterCommit(() => reverseAssessmentCredit(sql, reversal));
  }
  for (const second of secondSubscriptions) {
    await afterCommit(() => reportSecondSubscription(second));
  }
  for (const payment of orphanPayments) {
    await afterCommit(() => reportPaymentForDeletedAccount(payment));
  }
  for (const error of planAuditFailures) {
    await afterCommit(async () => {
      throw error;
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

/**
 * A paid Assessment Checkout whose account was deleted before the payment
 * arrived: nothing is written, the event is acknowledged, and this report
 * names the payment for the operator to refund in Stripe (OPERATIONS).
 */
async function reportPaymentForDeletedAccount(input: {
  userId: string;
  customerId: string | null;
  paymentIntentId: string | null;
}): Promise<void> {
  const message = `Assessment payment ${input.paymentIntentId ?? "unknown"} (customer ${input.customerId ?? "unknown"}) for deleted account ${input.userId}; refund it in Stripe`;
  console.error(`[billing] ${message}`);
  const { reportServerError } = await import("@/lib/observability/report.server");
  await reportServerError(new Error(message), "billing-payment-for-deleted-account");
}

/** Inline attempts before a reversal is left for the scheduled run. */
const REVERSAL_ATTEMPTS = 3;
/** Waits between attempts, in milliseconds; bounded for a webhook invocation. */
const REVERSAL_RETRY_MS = [500, 2000];

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
        paymentIntentId: input.paymentIntentId,
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
    await markAssessmentCreditReversed(sql, input);
    return true;
  }
  console.error(
    "[billing] Assessment credit not reversed:",
    last instanceof Error ? last.message : last,
  );
  await markAssessmentCreditReversalFailed(sql, input);
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
      paymentIntentId: row.paymentIntentId,
    };
    try {
      if (await findCreditReversal(reversal)) {
        alreadyPosted += 1;
      } else {
        await reverseCustomerBalance(reversal);
      }
      await markAssessmentCreditReversed(sql, row);
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
