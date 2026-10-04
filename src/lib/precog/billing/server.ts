import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "@/lib/auth/middleware";
import { getSql } from "@/lib/db";
import { RequestError, requireObject } from "@/lib/request-errors";
import { checkoutRefusal, loadBillingAccount } from "../firm/billing-store";
import { requireFirmRole } from "../firm/access.server";
import { isSubscriptionPlan, type CheckoutPlan } from "../firm/pricing";
import {
  applyAssessmentCredit,
  assertPlanOffered,
  createCheckoutSession,
  createPortalSession,
  loadPlanPrices,
  parseCheckoutPlan,
  stripeConfigured,
} from "./stripe.server";

export const getBillingStatus = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const sql = await getSql();
    return {
      configured: stripeConfigured(),
      account: await loadBillingAccount(sql, context.userId),
    };
  });

/**
 * What the checkout buttons charge, read from Stripe; `prices` is null when
 * billing is not connected or Stripe did not answer. Open to anyone, since
 * the sign-in page prints the Firm plan's price; Stripe is asked at most
 * once per cache window (loadPlanPrices).
 */
export const getPlanPrices = createServerFn({ method: "GET" }).handler(async () => ({
  configured: stripeConfigured(),
  prices: await loadPlanPrices(),
}));

/** Starts Stripe Checkout for the firm owner; the webhook records the result. */
export const startCheckout = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { plan: CheckoutPlan }) => ({
    plan: parseCheckoutPlan(requireObject(input).plan),
  }))
  .handler(async ({ context, data }) => {
    if (!stripeConfigured())
      throw new RequestError(409, "Billing is not connected on this deployment");
    assertPlanOffered(data.plan);
    const sql = await getSql();
    await requireFirmRole(sql, context.userId, ["owner"]);
    const account = await loadBillingAccount(sql, context.userId);
    const refusal = checkoutRefusal(account, data.plan);
    if (refusal) throw new RequestError(409, refusal);
    const users = await sql<{ email: string | null }>`
      select email from "user" where id = ${context.userId}
    `;
    const email = users[0]?.email ?? null;
    // The first Firm plan Checkout of an Assessment payer: the fee goes onto
    // the Stripe customer balance first, so the plan's invoices draw it down.
    const credit = isSubscriptionPlan(data.plan)
      ? await applyAssessmentCredit(sql, { userId: context.userId, email, account })
      : { customerId: account?.stripeCustomerId ?? null, creditedCents: null };
    // A posted credit moved the row, so the session's idempotency key moves too.
    const current =
      credit.creditedCents === null ? account : await loadBillingAccount(sql, context.userId);
    const { requestOrigin } = await import("@/lib/request-origin.server");
    return createCheckoutSession({
      userId: context.userId,
      email,
      customerId: credit.customerId,
      billingVersion: current?.updatedAt ?? null,
      plan: data.plan,
      origin: requestOrigin(),
    });
  });

export const openBillingPortal = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    if (!stripeConfigured())
      throw new RequestError(409, "Billing is not connected on this deployment");
    const sql = await getSql();
    await requireFirmRole(sql, context.userId, ["owner"]);
    const account = await loadBillingAccount(sql, context.userId);
    if (!account?.stripeCustomerId) throw new RequestError(404, "No billing account yet");
    const { requestOrigin } = await import("@/lib/request-origin.server");
    return createPortalSession({ customerId: account.stripeCustomerId, origin: requestOrigin() });
  });
