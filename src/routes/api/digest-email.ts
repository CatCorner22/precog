import { createFileRoute } from "@tanstack/react-router";
import { withReporting } from "@/lib/observability/with-reporting";
import { escapeHtml } from "@/lib/precog/reminders/email";

/**
 * The stop link in every weekly digest: `?do=stop&token=<the account's digest
 * token>`. Opening it shows a page with one button (a GET changes nothing,
 * so a mail scanner that opens links cannot turn the digest off on the
 * account's behalf); the button POSTs back here. A mail app's one-click
 * List-Unsubscribe POSTs to the link directly. Needs no sign-in: the token
 * names one account and can do nothing but turn its digest off.
 */
export const Route = createFileRoute("/api/digest-email")({
  server: {
    handlers: {
      GET: withReporting(async ({ request }) => {
        const token = parse(request.url);
        if (!token) return gone();
        const { getSql } = await import("@/lib/db");
        const sql = await getSql();
        const rows = await sql<{ one: number }>`
          select 1 as one from notification_settings where digest_token = ${token}
        `;
        if (rows.length === 0) return gone();
        return page(
          200,
          "Stop the weekly digest?",
          ["Precog will stop emailing you the weekly note about what is due on your businesses."],
          "Stop the weekly digest",
        );
      }, "digest-email"),
      POST: withReporting(async ({ request }) => {
        const token = parse(request.url);
        if (!token) return gone();
        const { getSql } = await import("@/lib/db");
        const { stopDigestByToken } = await import("@/lib/precog/firm/store");
        if (!(await stopDigestByToken(await getSql(), token))) return gone();
        return page(200, "Done", [
          "Precog will not send you the weekly digest again unless you turn it on.",
        ]);
      }, "digest-email"),
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

const TOKEN = /^[0-9a-f]{48}$/;

function parse(url: string): string | null {
  const params = new URL(url).searchParams;
  const token = params.get("token");
  if (params.get("do") !== "stop" || !token || !TOKEN.test(token)) return null;
  return token;
}

function gone(): Response {
  return page(404, "This link no longer works", [
    "The link may have changed since Precog sent the email. Turn the weekly digest off from the header after you sign in.",
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
