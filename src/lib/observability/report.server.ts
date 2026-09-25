import { randomUUID } from "node:crypto";
import { scrubText, toErrorEvent, type ErrorEvent } from "./error-event";

/**
 * Sends scrubbed error events to whichever tracker is configured:
 *
 *   SENTRY_DSN        — Sentry's envelope endpoint, spoken directly (no SDK,
 *                       so nothing runs at import time in the client bundle).
 *   ERROR_REPORT_URL  — any endpoint that accepts a JSON POST (a Slack or
 *                       Discord webhook relay, a log drain, an internal API).
 *   neither           — the server log, which is what a preview has.
 *
 * Client errors arrive through /api/errors already in event shape; server
 * errors are turned into events here. A per-process budget keeps a crash
 * loop from turning into a flood at the tracker.
 */
const BUDGET_PER_MINUTE = 30;
let windowStart = 0;
let sentInWindow = 0;

function withinBudget(now = Date.now()): boolean {
  if (now - windowStart >= 60_000) {
    windowStart = now;
    sentInWindow = 0;
  }
  sentInWindow += 1;
  return sentInWindow <= BUDGET_PER_MINUTE;
}

const env = (key: string): string | undefined => {
  const value = process.env[key]?.trim();
  return value || undefined;
};

function currentRelease(): string | null {
  return env("VERCEL_GIT_COMMIT_SHA")?.slice(0, 12) ?? null;
}

/** Sentry DSN → the envelope URL and the auth header it expects. */
export function sentryTarget(dsn: string): { url: string; auth: string } | null {
  let parsed: URL;
  try {
    parsed = new URL(dsn);
  } catch {
    return null;
  }
  const projectId = parsed.pathname.replace(/^\/+|\/+$/g, "");
  if (!parsed.username || !projectId) return null;
  return {
    url: `${parsed.protocol}//${parsed.host}/api/${projectId}/envelope/`,
    auth: `Sentry sentry_version=7, sentry_client=precog/1.0, sentry_key=${parsed.username}`,
  };
}

/** One Sentry envelope: header line, item header line, event line. */
export function sentryEnvelope(event: ErrorEvent, eventId: string): string {
  const frames = (event.stack ?? "")
    .split("\n")
    .slice(1)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => ({ function: line.slice(0, 200) }));
  const body = {
    event_id: eventId,
    timestamp: event.occurredAt,
    platform: "javascript",
    level: "error",
    release: event.release ?? undefined,
    environment: env("VERCEL_ENV") ?? "development",
    transaction: event.at ?? undefined,
    tags: { where: event.where },
    exception: {
      values: [
        {
          type: event.name,
          value: event.message,
          stacktrace: frames.length ? { frames } : undefined,
        },
      ],
    },
  };
  return [
    JSON.stringify({ event_id: eventId, sent_at: new Date().toISOString() }),
    JSON.stringify({ type: "event" }),
    JSON.stringify(body),
  ].join("\n");
}

async function deliver(event: ErrorEvent): Promise<void> {
  const dsn = env("SENTRY_DSN");
  const webhook = env("ERROR_REPORT_URL");
  const target = dsn ? sentryTarget(dsn) : null;
  if (target) {
    await fetch(target.url, {
      method: "POST",
      headers: { "content-type": "application/x-sentry-envelope", "x-sentry-auth": target.auth },
      body: sentryEnvelope(event, randomUUID().replace(/-/g, "")),
      signal: AbortSignal.timeout(4000),
    });
    return;
  }
  if (webhook) {
    await fetch(webhook, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(event),
      signal: AbortSignal.timeout(4000),
    });
    return;
  }
  console.error(`[error:${event.where}] ${event.name}: ${event.message}`, event.at ?? "");
}

/** Forward an already-shaped event (the client intake). Never throws. */
export async function forwardErrorEvent(event: ErrorEvent): Promise<void> {
  if (!withinBudget()) return;
  try {
    await deliver({
      ...event,
      message: scrubText(event.message, 500),
      stack: event.stack ? scrubText(event.stack, 4000) : null,
    });
  } catch (err) {
    console.error("[error] tracker unreachable:", err instanceof Error ? err.message : err);
  }
}

/** Report a server-side failure. Fire-and-forget; never throws. */
export function reportServerError(error: unknown, at?: string | null): void {
  void forwardErrorEvent(toErrorEvent(error, { where: "server", at, release: currentRelease() }));
}
