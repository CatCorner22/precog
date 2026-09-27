import { randomUUID } from "node:crypto";
import {
  MAX_MESSAGE_CHARS,
  MAX_NAME_CHARS,
  MAX_STACK_CHARS,
  scrubLocation,
  scrubText,
  toErrorEvent,
  type ErrorEvent,
} from "./error-event";
import { env } from "@/lib/env.server";

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
 * errors are turned into events here. A per-process budget, kept separately
 * for browser and server events, keeps a crash loop from turning into a flood
 * at the tracker, and a flood of browser reports from starving server ones.
 */

/**
 * Report a server-side failure. Awaited by the caller before it answers, so a
 * serverless instance is not frozen with the delivery still in flight; the
 * delivery is bounded by its own timeout. Never throws.
 */
export function reportServerError(error: unknown, at?: string | null): Promise<void> {
  return forwardErrorEvent(toErrorEvent(error, { where: "server", at, release: currentRelease() }));
}

/** Forward an event, scrubbed again whatever its source. Never throws. */
export async function forwardErrorEvent(event: ErrorEvent): Promise<void> {
  if (!withinBudget(event.where)) return;
  try {
    await deliver(scrubEvent(event));
  } catch (err) {
    console.error("[error] tracker unreachable:", err instanceof Error ? err.message : err);
  }
}

/**
 * The event as the tracker may see it. Browser events arrive from anyone, so
 * every field is scrubbed or bounded here, not only the message and stack:
 * the location loses its query string, the name is capped, a release that is
 * not a version or commit id is dropped, and a timestamp the tracker could
 * not parse is replaced by the server's clock.
 */
export function scrubEvent(event: ErrorEvent, now = new Date()): ErrorEvent {
  const occurredAt = Date.parse(event.occurredAt);
  return {
    message: scrubText(event.message, MAX_MESSAGE_CHARS),
    name: scrubText(event.name, MAX_NAME_CHARS) || "Error",
    stack: event.stack ? scrubText(event.stack, MAX_STACK_CHARS) : null,
    where: event.where,
    at: scrubLocation(event.at),
    occurredAt: new Date(Number.isNaN(occurredAt) ? now.getTime() : occurredAt).toISOString(),
    release: event.release && RELEASE.test(event.release) ? event.release : null,
  };
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
  const frames = sentryFrames(event.stack);
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

interface SentryFrame {
  function: string;
  filename?: string;
  lineno?: number;
  colno?: number;
}

/**
 * Stack lines as Sentry frames, oldest caller first and the throwing frame
 * last, which is the order Sentry displays and groups on. V8 (`at fn (file:1:2)`)
 * and Firefox/Safari (`fn@file:1:2`) lines are split into function, file,
 * line and column; any other line is kept whole as the function name. The
 * leading `Name: message` line of a V8 stack is not a frame and is dropped.
 */
export function sentryFrames(stack: string | null): SentryFrame[] {
  const lines = (stack ?? "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  if (lines.length && !parseFrame(lines[0]) && !lines[0].startsWith("at ")) lines.shift();
  return lines.map((line) => parseFrame(line) ?? { function: line.slice(0, 200) }).reverse();
}

function parseFrame(line: string): SentryFrame | null {
  const match = V8_FRAME.exec(line) ?? GECKO_FRAME.exec(line);
  if (!match) return null;
  const [, fn, filename, lineno, colno] = match;
  return {
    function: fn?.slice(0, 200) || "?",
    filename,
    lineno: Number(lineno),
    colno: Number(colno),
  };
}

async function deliver(event: ErrorEvent): Promise<void> {
  const dsn = env("SENTRY_DSN");
  const webhook = env("ERROR_REPORT_URL");
  const target = dsn ? sentryTarget(dsn) : null;
  if (target) {
    const res = await fetch(target.url, {
      method: "POST",
      headers: { "content-type": "application/x-sentry-envelope", "x-sentry-auth": target.auth },
      body: sentryEnvelope(event, randomUUID().replace(/-/g, "")),
      signal: AbortSignal.timeout(DELIVERY_TIMEOUT_MS),
    });
    noteRefusal(res, "Sentry");
    return;
  }
  if (webhook) {
    const res = await fetch(webhook, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(event),
      signal: AbortSignal.timeout(DELIVERY_TIMEOUT_MS),
    });
    noteRefusal(res, "ERROR_REPORT_URL");
    return;
  }
  console.error(`[error:${event.where}] ${event.name}: ${event.message}`, event.at ?? "");
}

/**
 * A tracker that answers 401 (a mistyped key), 404 (a wrong URL) or 429 has
 * not stored the event. Said once a minute at most, so a refusing tracker
 * cannot turn every error into a second log line.
 */
function noteRefusal(res: Response, tracker: string, now = Date.now()): void {
  if (res.ok || now - lastRefusalLoggedAt < WINDOW_MS) return;
  lastRefusalLoggedAt = now;
  console.error(`[error] ${tracker} refused the event with HTTP ${res.status}`);
}

function withinBudget(where: ErrorEvent["where"], now = Date.now()): boolean {
  const budget = budgets[where];
  if (now - budget.windowStart >= WINDOW_MS) {
    budget.windowStart = now;
    budget.sent = 0;
  }
  budget.sent += 1;
  if (budget.sent <= BUDGET_PER_MINUTE) return true;
  if (budget.sent === BUDGET_PER_MINUTE + 1) {
    console.error(
      `[error] ${BUDGET_PER_MINUTE} ${where} errors this minute; dropping the rest until the next minute`,
    );
  }
  return false;
}

function currentRelease(): string | null {
  return env("VERCEL_GIT_COMMIT_SHA")?.slice(0, 12) ?? null;
}

const WINDOW_MS = 60_000;
const BUDGET_PER_MINUTE = 20;
const DELIVERY_TIMEOUT_MS = 4000;
/** A version or commit id: letters, digits, `.`, `_`, `+`, `-`. */
const RELEASE = /^[\w.+-]{1,64}$/;
const V8_FRAME = /^at (?:(.+?) \()?(.+?):(\d+):(\d+)\)?$/;
const GECKO_FRAME = /^(.*?)@(.+?):(\d+):(\d+)$/;

const budgets: Record<ErrorEvent["where"], { windowStart: number; sent: number }> = {
  client: { windowStart: 0, sent: 0 },
  server: { windowStart: 0, sent: 0 },
};
let lastRefusalLoggedAt = -Infinity;
