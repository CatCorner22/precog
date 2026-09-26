import { createFileRoute } from "@tanstack/react-router";
import { serverUtcDay } from "@/lib/precog/dates";

const NO_STORE = { "cache-control": "no-store" } as const;

/**
 * The scheduled run (see vercel.json `crons`). Housekeeping first: deleted
 * businesses past their grace period are purged and connected accounting
 * systems are re-read. Then the reminders go out by email. Each stage runs on
 * its own, so a failure in one is reported in the answer and does not stop
 * the others. Vercel calls it with `Authorization: Bearer $CRON_SECRET`;
 * anything else is refused.
 */
export const Route = createFileRoute("/api/cron/digest")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        if (!(await authorized(request.headers.get("authorization")))) {
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
        const today = serverUtcDay();
        const configured = mailer.mailConfigured();
        const failures: string[] = [];

        const purged = await stage("purge", failures, async () => {
          const count = await store.purgeDeletedBusinesses(sql);
          if (count > 0) await firmStore.deleteOrphanedClientAudit(sql);
          return count;
        });
        const synced = await stage("quickbooks", failures, () => qbo.syncDueConnections(sql));
        const digest = await stage("digest", failures, () =>
          runDigest(sql, {
            today,
            appUrl,
            send: configured ? mailer.sendEmail : async () => undefined,
          }),
        );

        return Response.json(
          {
            ok: failures.length === 0,
            today,
            mailConfigured: configured,
            digest,
            purged,
            synced,
            failures,
          },
          { status: failures.length === 0 ? 200 : 500, headers: NO_STORE },
        );
      },
      ANY: () => new Response(null, { status: 405, headers: { ...NO_STORE, allow: "GET" } }),
    },
  },
});

/** The bearer secret, compared in constant time like the Stripe and QuickBooks signatures. */
async function authorized(given: string | null): Promise<boolean> {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret || !given) return false;
  const { createHash, timingSafeEqual } = await import("node:crypto");
  const digest = (text: string) => createHash("sha256").update(text, "utf8").digest();
  return timingSafeEqual(digest(given), digest(`Bearer ${secret}`));
}

/** Runs one stage; a throw is logged and named in the answer instead of ending the run. */
async function stage<T>(
  name: string,
  failures: string[],
  work: () => Promise<T>,
): Promise<T | null> {
  try {
    return await work();
  } catch (err) {
    failures.push(name);
    const { reportServerError } = await import("@/lib/observability/report.server");
    reportServerError(err, `cron-${name}`);
    return null;
  }
}
