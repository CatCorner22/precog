import { createFileRoute } from "@tanstack/react-router";
import { withReporting } from "@/lib/observability/with-reporting";

const NO_STORE = { "cache-control": "no-store" } as const;
const MAX_BODY_BYTES = 256 * 1024;

/**
 * Resend's webhook endpoint for bounces and complaints. The raw body is
 * verified against the signing secret (Svix scheme) before it is parsed; an
 * unverified or oversized delivery is refused. Each address the event names
 * goes into the suppression table, and the digest and owner notes skip it
 * from the next run. Resend retries on anything but 2xx, so a database
 * failure is reported and answers 500, and the event comes back later.
 */
export const Route = createFileRoute("/api/resend/webhook")({
  server: {
    handlers: {
      POST: withReporting(async ({ request }) => {
        const { env } = await import("@/lib/env.server");
        const secret = env("RESEND_WEBHOOK_SECRET");
        if (!secret)
          return new Response("Email events are not connected", { status: 404, headers: NO_STORE });
        const tooLarge = () =>
          new Response("Payload too large", { status: 413, headers: NO_STORE });
        // The declared length first, so an oversized delivery is refused unread.
        if (Number(request.headers.get("content-length") ?? 0) > MAX_BODY_BYTES) return tooLarge();
        const payload = await request.text();
        if (new TextEncoder().encode(payload).byteLength > MAX_BODY_BYTES) return tooLarge();
        const { parseResendEvent, suppressionsFrom, verifySvixSignature } =
          await import("@/lib/precog/reminders/resend-webhook");
        const headers = {
          id: request.headers.get("svix-id"),
          timestamp: request.headers.get("svix-timestamp"),
          signature: request.headers.get("svix-signature"),
        };
        if (!(await verifySvixSignature(payload, headers, secret))) {
          return new Response("Bad signature", { status: 400, headers: NO_STORE });
        }
        const event = parseResendEvent(payload);
        if (!event) return new Response("Bad event", { status: 400, headers: NO_STORE });
        const suppressions = suppressionsFrom(event);
        if (suppressions.length > 0) {
          const [{ getSql }, { suppressEmail }] = await Promise.all([
            import("@/lib/db"),
            import("@/lib/precog/reminders/suppression-store"),
          ]);
          const sql = await getSql();
          for (const { email, reason } of suppressions)
            await suppressEmail(sql, {
              email,
              reason,
              providerEventId: event.emailId ?? headers.id,
            });
        }
        return Response.json(
          { received: true, suppressed: suppressions.length },
          { headers: NO_STORE },
        );
      }, "resend-webhook"),
      ANY: () => new Response(null, { status: 405, headers: { ...NO_STORE, allow: "POST" } }),
    },
  },
});
