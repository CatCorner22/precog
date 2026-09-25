import type { Sql } from "@/lib/db";
import {
  ACTIVE_SUBSCRIPTION_STATUSES,
  claimBillingEvent,
  recordAssessmentPayment,
  recordSubscription,
  userForCustomer,
} from "../firm/billing-store";
import { setFirmPlan } from "../firm/store";
import { billingChangeFor, type StripeEvent } from "./stripe";

/**
 * Applies one verified Stripe event to the account it concerns. Idempotent:
 * a redelivered event id is acknowledged and skipped. Returns what was done,
 * for the route's log line and for tests.
 */
export async function applyBillingEvent(
  sql: Sql,
  event: StripeEvent,
): Promise<"duplicate" | "ignored" | "applied"> {
  if (!(await claimBillingEvent(sql, event.id, event.type))) return "duplicate";
  const change = billingChangeFor(event);
  if (change.kind === "ignore") return "ignored";
  if (change.kind === "assessment-paid") {
    await recordAssessmentPayment(sql, change.userId, change.customerId);
    return "applied";
  }
  const userId =
    change.userId ?? (change.customerId ? await userForCustomer(sql, change.customerId) : null);
  if (!userId) return "ignored";
  await recordSubscription(sql, {
    userId,
    stripeCustomerId: change.customerId,
    subscriptionId: change.subscriptionId,
    status: change.status,
    currentPeriodEnd: change.currentPeriodEnd,
  });
  // The plan on the firm row follows the subscription, so the report footer
  // and the client limit read one source.
  await setFirmPlan(
    sql,
    userId,
    ACTIVE_SUBSCRIPTION_STATUSES.has(change.status) ? "monthly" : "assessment",
  );
  return "applied";
}
