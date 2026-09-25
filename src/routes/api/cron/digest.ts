import { createFileRoute } from "@tanstack/react-router";

const NO_STORE = { "cache-control": "no-store" } as const;

/**
 * The scheduled run (see vercel.json `crons`): reminders out by email, then
 * housekeeping — deleted businesses past their grace period are purged and
 * connected accounting systems are re-read. Vercel calls it with
 * `Authorization: Bearer $CRON_SECRET`; anything else is refused.
 */
export const Route = createFileRoute("/api/cron/digest")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const secret = process.env.CRON_SECRET?.trim();
        const given = request.headers.get("authorization");
        if (!secret || given !== `Bearer ${secret}`) {
          return new Response("Unauthorized", { status: 401, headers: NO_STORE });
        }
        const [{ getSql }, { runDigest }, mailer, store, firmStore, qbo] = await Promise.all([
          import("@/lib/db"),
          import("@/lib/precog/reminders/digest"),
          import("@/lib/precog/reminders/mailer.server"),
          import("@/lib/precog/business-store"),
          import("@/lib/precog/firm/store"),
          import("@/lib/precog/integrations/qbo/sync.server"),
        ]);
        const sql = await getSql();
        const url = new URL(request.url);
        const appUrl = process.env.PUBLIC_APP_URL?.trim() || `${url.protocol}//${url.host}`;
        const today = new Date().toISOString().slice(0, 10);

        const configured = mailer.mailConfigured();
        const digest = await runDigest(sql, {
          today,
          appUrl,
          send: configured ? mailer.sendEmail : async () => undefined,
        });
        const purged = await store.purgeDeletedBusinesses(sql);
        if (purged > 0) await firmStore.deleteOrphanedClientAudit(sql);
        const synced = await qbo.syncDueConnections(sql);

        return Response.json(
          { ok: true, today, mailConfigured: configured, digest, purged, synced },
          { headers: NO_STORE },
        );
      },
      ANY: () => new Response(null, { status: 405, headers: { ...NO_STORE, allow: "GET" } }),
    },
  },
});
