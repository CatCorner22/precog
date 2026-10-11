import { createServerFn } from "@tanstack/react-start";
import { assertExpectedAccount } from "@/lib/auth/expected-account";
import { authMiddleware } from "@/lib/auth/middleware";
import { getSql } from "@/lib/db";
import { invalidRequest, RequestError, requireObject } from "@/lib/request-errors";
import { isBusinessId } from "../profile-input";
import { SlidingWindowLimiter } from "../llm/rate-limit";

/** Upload types the app accepts; the server checks the bytes match. */
const TYPES = new Set(["image/webp", "image/jpeg", "image/png"]);
/** Base64 of the largest image the store accepts (600 KB), with room for padding. */
const MAX_BASE64_CHARS = Math.ceil((600 * 1024) / 3) * 4 + 4;
const BASE64 = /^[A-Za-z0-9+/]*={0,2}$/;
/**
 * Uploads one account may make a minute. Per server instance, like the model
 * limits; the account's storage bound (image-store.server.ts) is what caps
 * the bytes it can keep.
 */
export const UPLOADS_PER_MINUTE = 30;
const uploadLimiter = new SlidingWindowLimiter({ limit: UPLOADS_PER_MINUTE, windowMs: 60_000 });

/** Refuses (429) an account past its per-minute upload allowance. */
export function takeUploadAllowance(userId: string, limiter = uploadLimiter): void {
  if (limiter.take(userId).allowed) return;
  throw new RequestError(
    429,
    `Precog takes at most ${UPLOADS_PER_MINUTE} pictures a minute from one account. Wait a minute, then add the picture again.`,
  );
}

export interface UploadImageInput {
  expectedAccountId: string;
  businessId: string;
  contentType: string;
  /** The image bytes, base64-encoded. */
  data: string;
}

/**
 * Stores one step picture for a business the caller owns or shares through
 * their firm, and returns its id. The business must already be saved to the
 * account: a 409 tells the browser to save first and try again.
 */
export const uploadProcedureImage = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: UploadImageInput) => parseUploadInput(input))
  .handler(async ({ context, data }) => {
    assertExpectedAccount(data.expectedAccountId, context.userId);
    const [{ resolveBusinessOwner }, { insertProcedureImage }, { assertEngagementOpen }] =
      await Promise.all([
        import("../business-store"),
        import("./image-store.server"),
        import("../firm/engagement-store"),
      ]);
    const sql = await getSql();
    return storeUploadFor(context.userId, {
      resolveOwner: () => resolveBusinessOwner(sql, context.userId, data.businessId),
      assertEngagementOpen: (owner) =>
        assertEngagementOpen(sql, owner, data.businessId, context.userId),
      insert: (owner) =>
        insertProcedureImage(sql, {
          ownerId: owner,
          businessId: data.businessId,
          declaredType: data.contentType,
          bytes: new Uint8Array(Buffer.from(data.data, "base64")),
          uploadedBy: context.userId,
        }),
    });
  });

/** The checks and the write behind one upload, passed in so the order can be tested. */
export interface UploadSteps<T> {
  /** The account that owns the business, or null when it is not saved to one the caller reaches. */
  resolveOwner: () => Promise<string | null>;
  /** Throws (409) when the caller is a member of the business's firm and its engagement has ended. */
  assertEngagementOpen: (owner: string) => Promise<void>;
  insert: (owner: string) => Promise<T>;
}

/**
 * Runs an upload's checks, then spends one of the account's uploads a minute,
 * then stores it. An upload refused by those checks (409: not saved, or the
 * engagement has ended; 403: no access) spends nothing, so it never
 * uses up the allowance for the pictures that follow.
 */
export async function storeUploadFor<T>(
  userId: string,
  steps: UploadSteps<T>,
  limiter = uploadLimiter,
): Promise<T> {
  const owner = await steps.resolveOwner();
  if (!owner)
    throw new RequestError(
      409,
      "Save the business to your account first, then add the picture again.",
    );
  await steps.assertEngagementOpen(owner);
  takeUploadAllowance(userId, limiter);
  return steps.insert(owner);
}

/** The upload request, bounded before any decoding. */
export function parseUploadInput(input: unknown): UploadImageInput {
  const raw = requireObject(input);
  const { expectedAccountId, businessId, contentType, data } = raw;
  if (typeof expectedAccountId !== "string" || !expectedAccountId) throw invalidRequest();
  if (!isBusinessId(businessId)) throw invalidRequest();
  if (typeof contentType !== "string" || !TYPES.has(contentType)) {
    throw new RequestError(415, "Only JPEG, PNG and WebP pictures can be attached.");
  }
  if (typeof data !== "string" || data.length === 0) throw invalidRequest();
  if (data.length > MAX_BASE64_CHARS) {
    throw new RequestError(413, "The picture is too large. Try a smaller screenshot or photo.");
  }
  if (!BASE64.test(data)) throw invalidRequest();
  return { expectedAccountId, businessId, contentType, data };
}
