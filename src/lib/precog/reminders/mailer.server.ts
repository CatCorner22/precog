import type { RenderedEmail } from "./email";

/**
 * Sends through Resend's HTTP API when RESEND_API_KEY and EMAIL_FROM are
 * set. Without them nothing is sent and the digest job reports what it would
 * have sent, so a preview never emails anyone.
 */
const env = (key: string): string | undefined => {
  const value = process.env[key]?.trim();
  return value || undefined;
};

export function mailConfigured(): boolean {
  return Boolean(env("RESEND_API_KEY") && env("EMAIL_FROM"));
}

export async function sendEmail(to: string, message: RenderedEmail): Promise<void> {
  const key = env("RESEND_API_KEY");
  const from = env("EMAIL_FROM");
  if (!key || !from) throw new Error("Email is not configured");
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
    body: JSON.stringify({
      from,
      to: [to],
      subject: message.subject,
      text: message.text,
      html: message.html,
      ...(env("EMAIL_REPLY_TO") ? { reply_to: env("EMAIL_REPLY_TO") } : {}),
    }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Email provider answered ${res.status}: ${body.slice(0, 200)}`);
  }
}
