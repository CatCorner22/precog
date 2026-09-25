import { createFileRoute } from "@tanstack/react-router";
import { isErrorEventPayload } from "@/lib/observability/error-event";

const MAX_BODY_BYTES = 16 * 1024;
const NO_STORE = { "cache-control": "no-store" } as const;

/**
 * Intake for browser-side errors. Accepts one scrubbed event per request,
 * refuses anything oversized or malformed, and answers 204 before the
 * tracker is contacted, so a failing tracker never slows the page down.
 * Anonymous by design: a crash on the public share page must report too.
 */
export const Route = createFileRoute("/api/errors")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const length = Number(request.headers.get("content-length") ?? 0);
        if (length > MAX_BODY_BYTES) return new Response(null, { status: 413, headers: NO_STORE });
        let payload: unknown;
        try {
          const text = await request.text();
          if (text.length > MAX_BODY_BYTES) {
            return new Response(null, { status: 413, headers: NO_STORE });
          }
          payload = JSON.parse(text);
        } catch {
          return new Response(null, { status: 400, headers: NO_STORE });
        }
        if (!isErrorEventPayload(payload)) {
          return new Response(null, { status: 400, headers: NO_STORE });
        }
        const { forwardErrorEvent } = await import("@/lib/observability/report.server");
        void forwardErrorEvent(payload);
        return new Response(null, { status: 204, headers: NO_STORE });
      },
      ANY: () => new Response(null, { status: 405, headers: { ...NO_STORE, allow: "POST" } }),
    },
  },
});
