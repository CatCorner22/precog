import { getRequest } from "@tanstack/react-start/server";
import { RequestError } from "@/lib/request-errors";
import { auth, authConfigured } from "./server";
import { UnauthorizedError } from "./verify.server";

/**
 * Server-only: a recent sign-in for destructive account actions (deleting
 * the account; moving firm ownership). A session token that someone took, or
 * a browser left signed in on a shared office PC, stays valid for days, so
 * these actions also ask that the session itself began within the last few
 * minutes. Better Auth's own /delete-user makes the same check with its
 * `freshAge`.
 *
 * The age comes from the stored session's `createdAt`, which Better Auth sets
 * once at sign-in and never moves when it extends the session. The lookup
 * skips the signed `session_data` cookie cache (300 s), as `getSessionUser`
 * does, so a signed-out session cannot pass on a cached copy.
 */

/** How recent the sign-in must be, in minutes. */
export const FRESH_SESSION_MINUTES = 10;

/**
 * True when a session created at `createdAt` is younger than `minutes` at
 * `now`. A timestamp that cannot be read counts as stale.
 */
export function sessionIsFresh(
  createdAt: Date | string | number,
  minutes: number = FRESH_SESSION_MINUTES,
  now: Date = new Date(),
): boolean {
  const created = new Date(createdAt).getTime();
  if (!Number.isFinite(created)) return false;
  return now.getTime() - created < minutes * 60_000;
}

/**
 * Throws RequestError(403, message) unless the caller's session began within
 * `minutes`. `message` tells the person what to do, for example "For your
 * safety, sign in again, then delete your account." Call it after
 * authMiddleware, passing the verified `context.userId` and the
 * `context.bearerToken` that middleware forwards in the live preview.
 * Returns the signed-in address, for a confirmation email.
 *
 * With auth turned off (VITE_AUTH_ENABLED=false, no database) there is no
 * session to age, and requireUserId has already allowed the shared dev user.
 */
export async function requireFreshSession(options: {
  userId: string;
  message: string;
  bearerToken?: string;
  minutes?: number;
  now?: Date;
}): Promise<{ email: string | null }> {
  if (!authConfigured) return { email: null };
  const request = getRequest();
  if (!request) throw new UnauthorizedError();
  let headers = request.headers;
  if (options.bearerToken) {
    headers = new Headers(request.headers);
    headers.set("Authorization", `Bearer ${options.bearerToken}`);
  }
  const session = await auth.api.getSession({ headers, query: { disableCookieCache: true } });
  if (!session?.user || session.user.id !== options.userId) throw new UnauthorizedError();
  if (!sessionIsFresh(session.session.createdAt, options.minutes, options.now)) {
    throw new RequestError(403, options.message);
  }
  return { email: session.user.email ?? null };
}
