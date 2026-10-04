import { createFileRoute } from "@tanstack/react-router";
import { withReporting } from "@/lib/observability/with-reporting";
import { isBusinessId } from "@/lib/precog/profile-input";
import { IMAGE_ID } from "@/lib/precog/procedures/normalize";

/**
 * One procedure step picture, for a signed-in viewer who owns the business or
 * belongs to the firm that holds it (`?b=<business id>&id=<image id>`).
 * Anything else, including a signed-out viewer, gets the same 404, so an
 * outsider cannot tell a foreign picture from a missing one. The type served
 * is the stored one (always JPEG, PNG or WebP), never sniffed by the browser,
 * and the response may only sit in the viewer's own cache. An id names one
 * upload and its bytes never change, so a found picture keeps for a day. A
 * miss keeps for a minute, so a step drawn again does not ask again, yet a
 * picture copied to this business on the next save, or one the viewer can
 * reach after signing in, shows up soon after.
 */
export const Route = createFileRoute("/api/procedure-image")({
  server: {
    handlers: {
      GET: withReporting(async ({ request }) => {
        const url = new URL(request.url);
        const businessId = url.searchParams.get("b");
        const id = url.searchParams.get("id");
        if (!isBusinessId(businessId) || !id || !IMAGE_ID.test(id)) return notFound();
        const { assertSameSiteRequest } = await import("@/lib/auth/isolation.server");
        try {
          // A sibling app on the same site rides this app's Lax session
          // cookie on scripted subrequests; refuse those as every other
          // signed-in read does. Answered as a miss, so a prober cannot
          // tell a blocked picture from a missing one.
          assertSameSiteRequest();
        } catch {
          return notFound();
        }
        const [{ requireUserId }, { getSql }, { resolveBusinessOwner }, { readProcedureImage }] =
          await Promise.all([
            import("@/lib/auth/verify.server"),
            import("@/lib/db"),
            import("@/lib/precog/business-store"),
            import("@/lib/precog/procedures/image-store.server"),
          ]);
        const userId = await requireUserId().catch(() => null);
        if (!userId) return notFound();
        const sql = await getSql();
        const owner = await resolveBusinessOwner(sql, userId, businessId);
        const image = owner ? await readProcedureImage(sql, owner, businessId, id) : null;
        if (!image) return notFound();
        return new Response(image.bytes, {
          status: 200,
          headers: {
            "content-type": image.contentType,
            "content-length": String(image.bytes.length),
            "cache-control": "private, max-age=86400",
            "x-content-type-options": "nosniff",
            "content-security-policy": "default-src 'none'",
            "content-disposition": "inline",
          },
        });
      }, "procedure-image"),
      ANY: () => new Response(null, { status: 405, headers: { ...NO_STORE, allow: "GET" } }),
    },
  },
});

function notFound(): Response {
  return new Response(null, { status: 404, headers: { "cache-control": "private, max-age=60" } });
}

const NO_STORE = { "cache-control": "no-store" } as const;
