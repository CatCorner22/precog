import { createFileRoute } from "@tanstack/react-router";
import { getSql } from "@/lib/db";
import { healthMethodNotAllowed, healthResponse } from "@/lib/health";

/**
 * Liveness and database check for uptime monitors. Returns 200 when a trivial
 * query succeeds, 503 otherwise, and 405 for any method but GET and HEAD
 * (HEAD reuses GET without a body). Carries no user data and needs no session.
 */
export const Route = createFileRoute("/api/health")({
  server: {
    handlers: {
      GET: () =>
        healthResponse(async () => {
          const sql = await getSql();
          await sql`select 1 as ok`;
        }),
      ANY: () => healthMethodNotAllowed(),
    },
  },
});
