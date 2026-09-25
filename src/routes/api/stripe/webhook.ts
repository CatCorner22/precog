import { createFileRoute } from "@tanstack/react-router";

const NO_STORE = { "cache-control": "no-store" } as const;
const MAX_BODY_BYTES = 256 * 1024;

/**
 * Stripe's webhook endpoint. The raw body is verified against the endpoint
 * secret before it is parsed; an unverified or oversized delivery is
 * refused. Stripe retries on anything but 2xx, so a database failure answers
 * 500 and the event comes back later.
 */
export const Route = createFileRoute("/api/stripe/webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { stripeWebhookSecret } = await import("@/lib/precog/billing/stripe.server");
        const secret = stripeWebhookSecret();
        if (!secret)
          return new Response("Billing is not connected", { status: 404, headers: NO_STORE });
        const payload = await request.text();
        if (payload.length > MAX_BODY_BYTES) {
          return new Response("Payload too large", { status: 413, headers: NO_STORE });
        }
        const { parseStripeEvent, verifyStripeSignature } =
          await import("@/lib/precog/billing/stripe");
        if (
          !(await verifyStripeSignature(payload, request.headers.get("stripe-signature"), secret))
        ) {
          return new Response("Bad signature", { status: 400, headers: NO_STORE });
        }
        const event = parseStripeEvent(payload);
        if (!event) return new Response("Bad event", { status: 400, headers: NO_STORE });
        const [{ getSql }, { applyBillingEvent }] = await Promise.all([
          import("@/lib/db"),
          import("@/lib/precog/billing/webhook"),
        ]);
        const sql = await getSql();
        const outcome = await applyBillingEvent(sql, event);
        return Response.json({ received: true, outcome }, { headers: NO_STORE });
      },
      ANY: () => new Response(null, { status: 405, headers: { ...NO_STORE, allow: "POST" } }),
    },
  },
});
