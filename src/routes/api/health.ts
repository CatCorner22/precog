import { createFileRoute } from "@tanstack/react-router";
import { dbSource, getSql } from "@/lib/db";

/**
 * Liveness and database check for uptime monitors. Returns 200 with the active
 * database backend when a trivial query succeeds, 503 otherwise. Carries no
 * user data and needs no session.
 */
export const Route = createFileRoute("/api/health")({
  server: {
    handlers: {
      GET: async () => {
        const startedAt = Date.now();
        try {
          const sql = await getSql();
          await sql`select 1 as ok`;
          return Response.json(
            { ok: true, db: dbSource, latencyMs: Date.now() - startedAt },
            { headers: { "cache-control": "no-store" } },
          );
        } catch (error) {
          console.error("[health] database check failed", error);
          return Response.json(
            { ok: false, db: dbSource, latencyMs: Date.now() - startedAt },
            { status: 503, headers: { "cache-control": "no-store" } },
          );
        }
      },
    },
  },
});
