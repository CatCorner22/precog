import { createFileRoute } from "@tanstack/react-router";
import { serverUtcDay } from "@/lib/precog/dates";

const NO_STORE = { "cache-control": "no-store" } as const;

/**
 * The scheduled run (see vercel.json `crons`). Deleted businesses past their
 * grace period are purged, then the reminders go out by email, then connected
 * accounting systems are re-read, then firm owners are told once per problem
 * about a QuickBooks reading that failed or a permission about to end, then
 * shared-map view logs and failed passcode guesses past their retention are
 * purged, then the week's first-time milestones are counted into the answer,
 * and any Assessment-credit reversal a webhook parked is retried against
 * Stripe: the emails run before QuickBooks, so a slow or failing QuickBooks pass
 * cannot stop them, and the alerts run after it, so they name the failures
 * this run just recorded. Each stage runs on its own, so a failure in one is
 * reported in the answer and does not stop the others.
 * Emails that fail inside the digest or the alerts are reported; either
 * counts as a failed stage when it had errors and sent nothing. Vercel calls it with
 * `Authorization: Bearer $CRON_SECRET`; anything else is refused.
 */
export const Route = createFileRoute("/api/cron/digest")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        if (!(await authorized(request.headers.get("authorization")))) {
          return new Response("Unauthorized", { status: 401, headers: NO_STORE });
        }
        const [
          { getSql },
          { runDigest },
          mailer,
          store,
          firmStore,
          qbo,
          qboAlerts,
          shareStore,
          attempts,
          telemetry,
          billingWebhook,
        ] = await Promise.all([
          import("@/lib/db"),
          import("@/lib/precog/reminders/digest"),
          import("@/lib/precog/reminders/mailer.server"),
          import("@/lib/precog/business-store"),
          import("@/lib/precog/firm/store"),
          import("@/lib/precog/integrations/qbo/sync.server"),
          import("@/lib/precog/integrations/qbo/alerts.server"),
          import("@/lib/precog/share/share-store"),
          import("@/lib/precog/share/share-attempts"),
          import("@/lib/precog/telemetry/events.server"),
          import("@/lib/precog/billing/webhook"),
        ]);
        const sql = await getSql();
        const { originFrom } = await import("@/lib/request-origin.server");
        const appUrl = originFrom(request.url, request.headers);
        const today = serverUtcDay();
        const configured = mailer.mailConfigured();
        const failures: string[] = [];

        const purged = await stage("purge", failures, async () => {
          const count = await store.purgeDeletedBusinesses(sql);
          if (count > 0) await firmStore.deleteOrphanedClientAudit(sql);
          return count;
        });
        const digest = await stage("digest", failures, async () => {
          const outcome = await runDigest(sql, {
            today,
            appUrl,
            send: configured ? mailer.sendEmail : async () => undefined,
          });
          if (outcome.errors.length > 0) {
            // runDigest already reported each business it could not read.
            const unreported = outcome.errors.filter((e) => !e.startsWith("business "));
            if (unreported.length > 0) {
              const { reportServerError } = await import("@/lib/observability/report.server");
              await reportServerError(new Error(unreported.join("; ")), "cron-digest-errors");
            }
            if (outcome.advisors + outcome.owners === 0) failures.push("digest");
          }
          return outcome;
        });
        const synced = await stage("quickbooks", failures, () => qbo.syncDueConnections(sql));
        const quickbooksAlerts = await stage("quickbooks-alerts", failures, async () => {
          const outcome = await qboAlerts.alertQuickBooksProblems(sql, {
            today,
            appUrl,
            send: configured ? mailer.sendEmail : async () => undefined,
          });
          // alertQuickBooksProblems already reported the sends it gave up on.
          if (outcome.errors.length > 0 && outcome.emailed === 0)
            failures.push("quickbooks-alerts");
          return outcome;
        });
        const shareLogs = await stage("share-logs", failures, async () => {
          await shareStore.purgeOldShareViews(sql);
          await attempts.purgeOldPasscodeAttempts(sql);
          return true;
        });
        const activation = await stage("activation", failures, () =>
          telemetry.weeklyActivation(sql, today),
        );
        const creditReversals = await stage("credit-reversals", failures, () =>
          billingWebhook.retryFailedCreditReversals(sql),
        );

        return Response.json(
          {
            ok: failures.length === 0,
            today,
            mailConfigured: configured,
            digest,
            purged,
            synced,
            quickbooksAlerts,
            shareLogs,
            activation,
            creditReversals,
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
    await reportServerError(err, `cron-${name}`);
    return null;
  }
}
