import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { authMiddleware } from "@/lib/auth/middleware";
import { getSql } from "@/lib/db";
import { RequestError, requireObject } from "@/lib/request-errors";
import { loadBillingAccount } from "../firm/billing-store";
import { requireFirmRole } from "../firm/access.server";
import type { CheckoutPlan } from "./stripe";
import { createCheckoutSession, createPortalSession, stripeConfigured } from "./stripe.server";

function requestOrigin(): string {
  const request = getRequest();
  const url = new URL(request.url);
  const proto = request.headers.get("x-forwarded-proto") ?? url.protocol.replace(":", "");
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host") ?? url.host;
  return `${proto}://${host}`;
}

export const getBillingStatus = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const sql = await getSql();
    return {
      configured: stripeConfigured(),
      account: await loadBillingAccount(sql, context.userId),
    };
  });

/** Starts Stripe Checkout for the firm owner; the webhook records the result. */
export const startCheckout = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { plan: CheckoutPlan }) => {
    const raw = requireObject(input);
    if (raw.plan !== "assessment" && raw.plan !== "monthly") {
      throw new RequestError(400, "Unknown plan");
    }
    return { plan: raw.plan as CheckoutPlan };
  })
  .handler(async ({ context, data }) => {
    if (!stripeConfigured())
      throw new RequestError(409, "Billing is not connected on this deployment");
    const sql = await getSql();
    await requireFirmRole(sql, context.userId, ["owner"]);
    const users = await sql<{ email: string | null }>`
      select email from "user" where id = ${context.userId}
    `;
    return createCheckoutSession({
      userId: context.userId,
      email: users[0]?.email ?? null,
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
    return createPortalSession({ customerId: account.stripeCustomerId, origin: requestOrigin() });
  });
