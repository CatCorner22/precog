import type { Sql } from "@/lib/db";
import { inTransaction } from "@/lib/sql-transaction";
import {
  ACTIVE_SUBSCRIPTION_STATUSES,
  claimBillingEvent,
  loadBillingAccount,
  markAssessmentCreditReversed,
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
 * balance once the transaction has committed, best effort: a failure is
 * logged and reported, never retried through Stripe's redelivery (the event
 * is already claimed). The stored credit amount goes to zero inside the
 * transaction, so a second refund or lost dispute on the same payment
 * reverses nothing twice.
 */
export async function applyBillingEvent(
  sql: Sql,
  event: StripeEvent,
): Promise<"duplicate" | "ignored" | "applied"> {
  let reversal: {
    customerId: string;
    creditCents: number;
    assessmentPaidAt: string | null;
  } | null = null;
  let secondSubscription: { userId: string; ignored: string; stored: string | null } | null = null;
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
    const { status, ignoredOther, storedSubscriptionId } = await recordSubscription(tx, {
      userId,
      stripeCustomerId: change.customerId,
      subscriptionId: change.subscriptionId,
      status: change.status,
      currentPeriodEnd: change.currentPeriodEnd,
      eventAt: change.eventAt,
      cancellationReason: change.cancellationReason,
      priceId: change.priceId,
    });
    // Reported once, on the Checkout completion that started it: the
    // subscription's own created and updated events (each renewal) are not
    // news again.
    if (ignoredOther && change.status === null) {
      secondSubscription = {
        userId,
        ignored: change.subscriptionId,
        stored: storedSubscriptionId,
      };
    }
    // The plan on the firm row follows the subscription status as stored,
    // which a late checkout event does not overwrite.
    await setFirmPlan(
      tx,
      userId,
      ACTIVE_SUBSCRIPTION_STATUSES.has(status) ? "monthly" : "assessment",
    );
    return "applied";
  });
  if (reversal) await reverseAssessmentCredit(reversal);
  if (secondSubscription) await reportSecondSubscription(secondSubscription);
  return outcome;
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

async function reverseAssessmentCredit(input: {
  customerId: string;
  creditCents: number;
  assessmentPaidAt: string | null;
}): Promise<void> {
  if (input.creditCents <= 0) return;
  try {
    const { reverseCustomerBalance } = await import("./stripe.server");
    await reverseCustomerBalance(input.customerId, input.creditCents, input.assessmentPaidAt);
  } catch (err) {
    console.error(
      "[billing] Assessment credit not reversed:",
      err instanceof Error ? err.message : err,
    );
    const { reportServerError } = await import("@/lib/observability/report.server");
    await reportServerError(err, "stripe-credit-reversal");
  }
}
