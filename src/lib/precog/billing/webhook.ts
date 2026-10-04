import type { Sql } from "@/lib/db";
import { inTransaction } from "@/lib/sql-transaction";
import {
  ACTIVE_SUBSCRIPTION_STATUSES,
  claimBillingEvent,
  listFailedCreditReversals,
  loadBillingAccount,
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
 * After a refund or a lost dispute on an Assessment that was credited
 * against the Firm plan, the credit is reversed on the Stripe customer
 * balance once the transaction has committed, with a short inline retry; a
 * failure that outlasts the retry restores the stored amount and marks the
 * row, and the weekly run retries it (retryFailedCreditReversals). The
 * stored credit amount goes to zero inside the transaction, so a second
 * refund or lost dispute on the same payment reverses nothing twice.
 */
export async function applyBillingEvent(
  sql: Sql,
  event: StripeEvent,
): Promise<"duplicate" | "ignored" | "applied"> {
  let reversal: {
    userId: string;
    customerId: string;
    creditCents: number;
    assessmentPaidAt: string | null;
  } | null = null;
  const outcome = await inTransaction(sql, async (tx) => {
    if (!(await claimBillingEvent(tx, event.id, event.type))) return "duplicate";
    const change = billingChangeFor(event);
    if (change.kind === "ignore") return "ignored";
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
        if (
          account?.assessmentCreditUsedAt &&
          account.stripeCustomerId &&
          (account.assessmentCreditCents ?? 0) > 0
        ) {
          reversal = {
            userId,
            customerId: account.stripeCustomerId,
            creditCents: account.assessmentCreditCents ?? 0,
            assessmentPaidAt: account.assessmentPaidAt,
          };
          await markAssessmentCreditReversed(tx, userId);
        }
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
    if (!userId) return "ignored";
    const status = await recordSubscription(tx, {
      userId,
      stripeCustomerId: change.customerId,
      subscriptionId: change.subscriptionId,
      status: change.status,
      currentPeriodEnd: change.currentPeriodEnd,
      eventAt: change.eventAt,
      cancellationReason: change.cancellationReason,
    });
    // The plan on the firm row follows the subscription status as stored,
    // which a late checkout event does not overwrite.
    await setFirmPlan(
      tx,
      userId,
      ACTIVE_SUBSCRIPTION_STATUSES.has(status) ? "monthly" : "assessment",
    );
    return "applied";
  });
  if (reversal) await reverseAssessmentCredit(sql, reversal);
  return outcome;
}

/** Inline attempts before a reversal is parked for the weekly run. */
const REVERSAL_ATTEMPTS = 3;
/** Waits between attempts, in milliseconds; bounded for a webhook invocation. */
const REVERSAL_RETRY_MS = [500, 2000];

/**
 * Takes back a posted Assessment credit on the Stripe customer balance. The
 * Stripe call carries a deterministic idempotency key, so every attempt and
 * every weekly retry posts at most once. When every inline attempt fails,
 * the stored amount comes back (the row agrees with the balance Stripe
 * still holds) and the row is marked for the weekly run; the outcome is
 * reported either way a failure outlasts the retry.
 */
async function reverseAssessmentCredit(
  sql: Sql,
  input: {
    userId: string;
    customerId: string;
    creditCents: number;
    assessmentPaidAt: string | null;
  },
): Promise<boolean> {
  if (input.creditCents <= 0) return true;
  const { reverseCustomerBalance } = await import("./stripe.server");
  let last: unknown = null;
  for (let attempt = 0; attempt < REVERSAL_ATTEMPTS; attempt += 1) {
    try {
      await reverseCustomerBalance(input.customerId, input.creditCents, input.assessmentPaidAt);
      return true;
    } catch (err) {
      last = err;
      if (attempt < REVERSAL_RETRY_MS.length) {
        await new Promise((resolve) => setTimeout(resolve, REVERSAL_RETRY_MS[attempt]));
      }
    }
  }
  console.error(
    "[billing] Assessment credit not reversed:",
    last instanceof Error ? last.message : last,
  );
  await markAssessmentCreditReversalFailed(sql, input.userId, input.creditCents);
  const { reportServerError } = await import("@/lib/observability/report.server");
  await reportServerError(last, "stripe-credit-reversal");
  return false;
}

/**
 * Retries every credit reversal a webhook parked, for the weekly run: one
 * Stripe attempt each, oldest failure first. A success zeroes the amount and
 * clears the mark; a failure keeps both for the week after and is reported.
 * Returns what moved, for the run's answer.
 */
export async function retryFailedCreditReversals(
  sql: Sql,
): Promise<{ retried: number; failed: number }> {
  const pending = await listFailedCreditReversals(sql);
  const { reverseCustomerBalance } = await import("./stripe.server");
  const { reportServerError } = await import("@/lib/observability/report.server");
  let failed = 0;
  for (const row of pending) {
    try {
      await reverseCustomerBalance(row.customerId, row.creditCents, row.assessmentPaidAt);
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
  return { retried: pending.length, failed };
}
