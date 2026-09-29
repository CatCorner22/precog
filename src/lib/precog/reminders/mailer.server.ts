import { createHash } from "node:crypto";
import type { RenderedEmail } from "./email";
import { env } from "@/lib/env.server";

/**
 * Sends through Resend's HTTP API when RESEND_API_KEY and EMAIL_FROM are
 * set. Without them nothing is sent and the digest job reports what it would
 * have sent, so a preview never emails anyone.
 */
export function mailConfigured(): boolean {
  return Boolean(env("RESEND_API_KEY") && env("EMAIL_FROM"));
}

/**
 * One message. Each carries an idempotency key made from its content, and a
 * request that times out is tried once more with the same key: when Resend
 * had already accepted the first, it does not send the message again.
 */
export async function sendEmail(to: string, message: RenderedEmail): Promise<void> {
  const key = env("RESEND_API_KEY");
  const from = env("EMAIL_FROM");
  if (!key || !from) throw new Error("This copy of Precog has no email set up");
  const replyTo = message.replyTo ?? env("EMAIL_REPLY_TO");
  const request = {
    method: "POST",
    headers: {
      authorization: `Bearer ${key}`,
      "content-type": "application/json",
      "idempotency-key": idempotencyKey(to, message),
    },
    body: JSON.stringify({
      from,
      to: [to],
      subject: message.subject,
      text: message.text,
      html: message.html,
      ...(replyTo ? { reply_to: replyTo } : {}),
    }),
  };
  let res: Response;
  try {
    res = await fetch(RESEND_URL, { ...request, signal: AbortSignal.timeout(TIMEOUT_MS) });
  } catch (err) {
    if (!(err instanceof Error && err.name === "TimeoutError")) throw err;
    res = await fetch(RESEND_URL, { ...request, signal: AbortSignal.timeout(TIMEOUT_MS) });
  }
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Email provider answered ${res.status}: ${body.slice(0, 200)}`);
  }
}

const RESEND_URL = "https://api.resend.com/emails";
const TIMEOUT_MS = 10_000;

function idempotencyKey(to: string, message: RenderedEmail): string {
  return createHash("sha256")
    .update(`${to}\n${message.subject}\n${message.text}`, "utf8")
    .digest("hex");
}
