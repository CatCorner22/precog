import { createFileRoute } from "@tanstack/react-router";
import { isBusinessId } from "@/lib/precog/profile-input";
import { IMAGE_ID } from "@/lib/precog/procedures/normalize";

/**
 * One procedure step picture, for a signed-in viewer who owns the business or
 * belongs to the firm that holds it (`?b=<business id>&id=<image id>`).
 * Anything else, including a signed-out viewer, gets the same 404, so an
 * outsider cannot tell a foreign picture from a missing one. The type served
 * is the stored one (always JPEG, PNG or WebP), never sniffed by the browser,
 * and the response may only sit in the viewer's own cache.
 */
export const Route = createFileRoute("/api/procedure-image")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const businessId = url.searchParams.get("b");
        const id = url.searchParams.get("id");
        if (!isBusinessId(businessId) || !id || !IMAGE_ID.test(id)) return notFound();
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
      },
      ANY: () => new Response(null, { status: 405, headers: { ...NO_STORE, allow: "GET" } }),
    },
  },
});

function notFound(): Response {
  return new Response(null, { status: 404, headers: NO_STORE });
}

const NO_STORE = { "cache-control": "no-store" } as const;
