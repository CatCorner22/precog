import { createFileRoute } from "@tanstack/react-router";
import { isErrorEventPayload } from "@/lib/observability/error-event";
import { readBody } from "@/lib/server-fn-guard";
import { SlidingWindowLimiter } from "@/lib/precog/llm/rate-limit";

/**
 * Intake for browser-side errors. Accepts one event per request, refuses
 * anything oversized or malformed, and gives one address a few reports a
 * minute, so one script cannot spend the whole delivery budget and crowd out
 * real crashes. The event is scrubbed again and forwarded before the answer,
 * because a serverless instance may be frozen once it has answered; the
 * browser sends it with a beacon and never waits. Anonymous by design: a
 * crash on the public share page must report too.
 */
export const Route = createFileRoute("/api/errors")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const declared = Number(request.headers.get("content-length") ?? 0);
        if (declared > MAX_BODY_BYTES) return empty(413);
        const body = await readBody(request, MAX_BODY_BYTES);
        if (body === null) return empty(413);
        let payload: unknown;
        try {
          payload = JSON.parse(new TextDecoder().decode(body));
        } catch {
          return empty(400);
        }
        if (!isErrorEventPayload(payload)) return empty(400);
        const { requestIp } = await import("@/lib/request-ip.server");
        if (!perAddress.take(requestIp()).allowed) return empty(429);
        const { forwardErrorEvent } = await import("@/lib/observability/report.server");
        await forwardErrorEvent(payload);
        return empty(204);
      },
      ANY: () => new Response(null, { status: 405, headers: { ...NO_STORE, allow: "POST" } }),
    },
  },
});

function empty(status: number): Response {
  return new Response(null, { status, headers: NO_STORE });
}

const MAX_BODY_BYTES = 16 * 1024;
const NO_STORE = { "cache-control": "no-store" } as const;
/** Reports one address may send a minute; a real crash loop repeats itself. */
const perAddress = new SlidingWindowLimiter({ limit: 5, windowMs: 60_000 });
