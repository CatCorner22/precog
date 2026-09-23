/**
 * Responses for the public /api/health route, kept apart from the route file
 * so they can be tested without starting the database.
 *
 * The body says only whether a trivial query answered and how long it took.
 * It does not name the database backend: an anonymous caller has no use for
 * that, and it tells a scanner which engine sits behind the app.
 */
export const HEALTH_ALLOWED_METHODS = "GET, HEAD";

const NO_STORE = { "cache-control": "no-store" } as const;

export async function healthResponse(checkDatabase: () => Promise<void>): Promise<Response> {
  const startedAt = Date.now();
  try {
    await checkDatabase();
    return Response.json({ ok: true, latencyMs: Date.now() - startedAt }, { headers: NO_STORE });
  } catch (error) {
    console.error("[health] database check failed", error);
    return Response.json(
      { ok: false, latencyMs: Date.now() - startedAt },
      { status: 503, headers: NO_STORE },
    );
  }
}

/**
 * Every method other than GET and HEAD. Without it the route falls through to
 * the app shell, so a monitor using POST would read 200 even with the
 * database down.
 */
export function healthMethodNotAllowed(): Response {
  return Response.json(
    { ok: false, error: "Method not allowed" },
    { status: 405, headers: { ...NO_STORE, allow: HEALTH_ALLOWED_METHODS } },
  );
}
