import { createFileRoute } from "@tanstack/react-router";
import { withReporting } from "@/lib/observability/with-reporting";

const NO_STORE = { "cache-control": "no-store" } as const;
const MAX_BODY_BYTES = 256 * 1024;

/**
 * Stripe's webhook endpoint. The raw body is verified against the endpoint
 * secret before it is parsed; an unverified or oversized delivery is
 * refused. Stripe retries on anything but 2xx, so a database failure before
 * the event's claim commits is reported and answers 500, and the event comes
 * back later. Work after the commit (the failed-payment email) is reported
 * on failure and answers 200, since a retry would find the claim and skip it.
 */
export const Route = createFileRoute("/api/stripe/webhook")({
  server: {
    handlers: {
      POST: withReporting(async ({ request }) => {
        const { stripeWebhookSecret } = await import("@/lib/precog/billing/stripe.server");
        const secret = stripeWebhookSecret();
        if (!secret)
          return new Response("Billing is not connected", { status: 404, headers: NO_STORE });
        const tooLarge = () =>
          new Response("Payload too large", { status: 413, headers: NO_STORE });
        // The declared length first, so an oversized delivery is refused unread.
        if (Number(request.headers.get("content-length") ?? 0) > MAX_BODY_BYTES) return tooLarge();
        const payload = await request.text();
        if (new TextEncoder().encode(payload).byteLength > MAX_BODY_BYTES) return tooLarge();
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
        if (outcome === "applied") {
          // The one failed-payment email goes after the change has committed,
          // so a rolled-back event never emails and a retry sends once. The
          // claim has committed too, so a failure here is reported and still
          // answers 200: a 500 would only bring the event back as a duplicate.
          try {
            const [{ afterBillingEvent }, { originFrom }] = await Promise.all([
              import("@/lib/precog/billing/dunning.server"),
              import("@/lib/request-origin.server"),
            ]);
            await afterBillingEvent(sql, event, {
              origin: originFrom(request.url, request.headers),
            });
          } catch (error) {
            const { reportServerError } = await import("@/lib/observability/report.server");
            await reportServerError(error, "stripe-webhook-after-commit");
          }
        }
        return Response.json({ received: true, outcome }, { headers: NO_STORE });
      }, "stripe-webhook"),
      ANY: () => new Response(null, { status: 405, headers: { ...NO_STORE, allow: "POST" } }),
    },
  },
});
