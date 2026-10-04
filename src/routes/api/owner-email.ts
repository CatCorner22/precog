import { createFileRoute } from "@tanstack/react-router";
import { withReporting } from "@/lib/observability/with-reporting";
import { escapeHtml } from "@/lib/precog/reminders/email";
import { isOwnerConsentToken } from "@/lib/precog/reminders/owner-consent";
import { SUPPORT_EMAIL } from "@/lib/precog/legal/operator";

/**
 * The links in a client owner's emails: `?do=confirm` agrees to reminders,
 * `?do=stop` stops them. Opening a link shows a page with one button (a GET
 * changes nothing, so a mail scanner that opens links cannot agree or stop
 * on the owner's behalf); the button POSTs back here. A mail app's one-click
 * List-Unsubscribe POSTs to the stop link directly. Needs no sign-in: the
 * token is the owner's.
 */
export const Route = createFileRoute("/api/owner-email")({
  server: {
    handlers: {
      GET: withReporting(async ({ request }) => {
        const link = parse(request.url);
        if (!link) return gone();
        if (await throttled()) return throttledPage();
        const { getSql } = await import("@/lib/db");
        const { findOwnerConsent } = await import("@/lib/precog/reminders/owner-consent");
        const consent = await findOwnerConsent(await getSql(), link.token);
        if (!consent) return gone();
        const name = consent.businessName;
        return link.action === "confirm"
          ? page(
              200,
              `Reminders about ${name}`,
              [
                `Precog will email you when something is due on ${name}. Each reminder has a link to stop them.`,
              ],
              "Yes, send me reminders",
            )
          : page(
              200,
              `Stop reminders about ${name}?`,
              [`Precog will stop emailing you reminders about ${name}.`],
              "Stop reminders",
            );
      }, "owner-email"),
      POST: withReporting(async ({ request }) => {
        const link = parse(request.url);
        if (!link) return gone();
        if (await throttled()) return throttledPage();
        const { getSql } = await import("@/lib/db");
        const consent = await import("@/lib/precog/reminders/owner-consent");
        const sql = await getSql();
        const found = await consent.findOwnerConsent(sql, link.token);
        if (!found) return gone();
        const name = found.businessName;
        if (link.action === "confirm") {
          await consent.confirmOwnerEmail(sql, link.token);
          return page(200, "Done", [
            `Precog will email you reminders about ${name}. Each one has a link to stop them.`,
          ]);
        }
        await consent.stopOwnerEmail(sql, link.token);
        return page(200, "Done", [
          `Precog will not email you reminders about ${name} again unless you agree to them again.`,
        ]);
      }, "owner-email"),
      ANY: () => new Response(null, { status: 405, headers: { ...HEADERS, allow: "GET, POST" } }),
    },
  },
});

const HEADERS = {
  "cache-control": "no-store",
  "referrer-policy": "no-referrer",
  "content-security-policy":
    "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; frame-ancestors 'none'",
} as const;

function parse(url: string): { token: string; action: "confirm" | "stop" } | null {
  const params = new URL(url).searchParams;
  const token = params.get("token");
  const action = params.get("do");
  if (!isOwnerConsentToken(token) || (action !== "confirm" && action !== "stop")) return null;
  return { token, action };
}

function gone(): Response {
  return page(404, "This link no longer works", [
    "The address may have changed since Precog sent the email. Ask the advisor who set up the reminders.",
    `If you still get this page, write to ${SUPPORT_EMAIL}.`,
  ]);
}

/** Whether the caller's address already opened enough emailed links this minute. */
async function throttled(): Promise<boolean> {
  try {
    const [{ requestIp }, limits] = await Promise.all([
      import("@/lib/request-ip.server"),
      import("@/lib/precog/reminders/email-link-limits"),
    ]);
    return !limits.takeEmailLinkAllowance(requestIp());
  } catch {
    // The allowance must never break the link flow (no request context in
    // scripts and tests, or a limiter fault): the tokens stay unguessable
    // either way.
    return false;
  }
}

function throttledPage(): Response {
  return page(429, "Too many tries", [
    "Too many opens from this address. Wait a minute, then open the link again.",
  ]);
}

function page(status: number, title: string, lines: string[], button?: string): Response {
  const form = button
    ? `<form method="post"><button type="submit" style="margin-top:12px;padding:8px 14px;border-radius:8px;border:1px solid #111;background:#111;color:#fff;font:inherit;cursor:pointer">${escapeHtml(button)}</button></form>`
    : "";
  const html =
    `<!doctype html><html lang="en"><head><meta charset="utf-8">` +
    `<meta name="viewport" content="width=device-width, initial-scale=1">` +
    `<title>${escapeHtml(title)} · Precog</title></head>` +
    `<body style="font:15px/1.5 -apple-system,Segoe UI,sans-serif;color:#111;max-width:520px;margin:48px auto;padding:0 16px">` +
    `<p style="font-size:12px;letter-spacing:.1em;text-transform:uppercase;color:#6b7280;margin:0">Precog</p>` +
    `<h1 style="font-size:20px;margin:4px 0 12px">${escapeHtml(title)}</h1>` +
    lines.map((line) => `<p>${escapeHtml(line)}</p>`).join("") +
    form +
    `</body></html>`;
  return new Response(html, {
    status,
    headers: { ...HEADERS, "content-type": "text/html; charset=utf-8" },
  });
}
