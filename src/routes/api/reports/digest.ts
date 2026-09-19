import { createFileRoute } from "@tanstack/react-router";
import { digestAllBusinesses } from "@/lib/precog/builder/digest-server";

/**
 * Scheduled digest endpoint — call from a cron (Vercel Cron, GitHub Actions, Zapier).
 *
 *   POST /api/reports/digest
 *   Authorization: Bearer $REPORT_SECRET      (required; route is disabled when unset)
 *   ?userId=<id>   optional — one user's businesses only
 *   ?dryRun=1      optional — build digests but skip forwarding
 *
 * Returns JSON with every digest. When DIGEST_WEBHOOK_URL is set, each digest is also
 * POSTed there (Slack incoming webhook, Zapier, Make, n8n, or any email bridge) as
 * { text, subject, body, businessName, healthScore, overdue }. No email vendor is bundled;
 * the webhook is the integration seam.
 */
export const Route = createFileRoute("/api/reports/digest")({
  server: {
    handlers: {
      GET: ({ request }) => handle(request),
      POST: ({ request }) => handle(request),
    },
  },
});

async function handle(request: Request): Promise<Response> {
  const secret = process.env.REPORT_SECRET;
  if (!secret) {
    return json({ ok: false, error: "REPORT_SECRET is not configured; scheduled digests are disabled." }, 503);
  }
  const auth = request.headers.get("authorization") ?? "";
  const url = new URL(request.url);
  const presented = auth.replace(/^Bearer\s+/i, "") || url.searchParams.get("secret") || "";
  if (!timingSafeEqual(presented, secret)) return json({ ok: false, error: "Unauthorized" }, 401);

  const userId = url.searchParams.get("userId") ?? undefined;
  const dryRun = url.searchParams.get("dryRun") === "1";
  const appUrl = process.env.PUBLIC_APP_URL ?? `${url.protocol}//${url.host}`;

  const digests = await digestAllBusinesses({ userId, appUrl });

  const webhook = process.env.DIGEST_WEBHOOK_URL;
  let forwarded = 0;
  const failures: string[] = [];
  if (webhook && !dryRun) {
    for (const d of digests) {
      try {
        const res = await fetch(webhook, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            text: `*${d.subject}*\n\`\`\`\n${d.body}\n\`\`\``,
            subject: d.subject,
            body: d.body,
            businessId: d.businessId,
            businessName: d.businessName,
            userId: d.userId,
            healthScore: d.healthScore,
            overdue: d.overdue,
          }),
        });
        if (res.ok) forwarded += 1;
        else failures.push(`${d.businessName}: HTTP ${res.status}`);
      } catch (e) {
        failures.push(`${d.businessName}: ${e instanceof Error ? e.message : "network error"}`);
      }
    }
  }

  return json({
    ok: true,
    generatedAt: new Date().toISOString(),
    count: digests.length,
    forwarded,
    webhookConfigured: Boolean(webhook),
    dryRun,
    failures,
    digests,
  });
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body, null, 2), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
  });
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
