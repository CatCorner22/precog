import { SlidingWindowLimiter } from "../llm/rate-limit";

/**
 * Token-link opens one address may make a minute across the emailed-link
 * routes (owner-email, digest-email). The tokens are unguessable, so this
 * is not authentication: it only keeps a prober from hammering the
 * lookups, one database read each. Per-process memory like the other
 * limiters; the routes answer excess opens with their own 429 page.
 */
export const EMAIL_LINK_OPENS_PER_MINUTE = 60;
const emailLinkLimiter = new SlidingWindowLimiter({
  limit: EMAIL_LINK_OPENS_PER_MINUTE,
  windowMs: 60_000,
});

/** Whether the address may open another emailed link now. */
export function takeEmailLinkAllowance(ip: string, limiter = emailLinkLimiter): boolean {
  return limiter.take(ip).allowed;
}
