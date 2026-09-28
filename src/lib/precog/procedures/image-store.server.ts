import { createHash } from "node:crypto";
import type { Sql } from "@/lib/db";
import { inTransaction } from "@/lib/sql-transaction";
import { RequestError } from "@/lib/request-errors";
import { uid } from "../text";
import { readImageInfo, stripImageMetadata, type ImageType } from "./image-bytes";

/**
 * Procedure step images, one table keyed by the business that owns them (see
 * migrations/0025_procedure_images.sql). Every read and write names the
 * owner, so callers resolve who owns a business (and whether the caller may
 * see it) first; this module never decides access.
 */

/** Largest image stored, in bytes, after the browser has downscaled and re-encoded it. */
export const MAX_IMAGE_BYTES = 600 * 1024;
/** Most images, and most bytes of images, one business keeps. */
export const MAX_IMAGES_PER_BUSINESS = 200;
export const MAX_IMAGE_BYTES_PER_BUSINESS = 50 * 1024 * 1024;
/** Largest width or height, in pixels. */
export const MAX_IMAGE_SIDE = 4096;
/** Unreferenced images are kept this long, so an undo or a history restore still finds them. */
export const UNREFERENCED_GRACE_DAYS = 30;

export interface StoredImage {
  contentType: ImageType;
  /** A copy in its own buffer, ready to send as a response body. */
  bytes: Uint8Array<ArrayBuffer>;
}

/**
 * Checks, strips and stores an uploaded image, and returns its id. The bytes
 * must really be the declared type; the same picture uploaded twice to one
 * business is stored once and returns the first id. Refuses (with the reason
 * the owner sees) an unreadable, oversized or over-quota image.
 */
export async function insertProcedureImage(
  sql: Sql,
  input: {
    ownerId: string;
    businessId: string;
    declaredType: string;
    bytes: Uint8Array;
    uploadedBy: string;
  },
): Promise<{ id: string }> {
  if (input.bytes.length === 0 || input.bytes.length > MAX_IMAGE_BYTES) {
    throw new RequestError(413, "The picture is too large. Try a smaller screenshot or photo.");
  }
  const info = readImageInfo(input.bytes);
  if (!info || info.type !== input.declaredType) {
    throw new RequestError(415, "Only JPEG, PNG and WebP pictures can be attached.");
  }
  if (info.width > MAX_IMAGE_SIDE || info.height > MAX_IMAGE_SIDE) {
    throw new RequestError(413, "The picture is too large. Try a smaller screenshot or photo.");
  }
  const stripped = stripImageMetadata(input.bytes, info.type);
  if (!stripped) throw new RequestError(415, "Precog could not read the picture.");
  const sha256 = createHash("sha256").update(stripped).digest("hex");

  return inTransaction(sql, async (tx) => {
    const same = await tx<{ id: string }>`
      select id from procedure_images
      where user_id = ${input.ownerId} and business_id = ${input.businessId} and sha256 = ${sha256}
    `;
    if (same[0]) return { id: same[0].id };
    const [usage] = await tx<{ count: number; bytes: number | null }>`
      select count(*) as count, sum(byte_size)::bigint as bytes from procedure_images
      where user_id = ${input.ownerId} and business_id = ${input.businessId}
    `;
    if (Number(usage?.count ?? 0) >= MAX_IMAGES_PER_BUSINESS) {
      throw new RequestError(
        409,
        `This business already holds ${MAX_IMAGES_PER_BUSINESS} pictures. Remove some from old steps first.`,
      );
    }
    if (Number(usage?.bytes ?? 0) + stripped.length > MAX_IMAGE_BYTES_PER_BUSINESS) {
      throw new RequestError(
        409,
        "This business has no room for more pictures. Remove some from old steps first.",
      );
    }
    const id = uid("img");
    await tx`
      insert into procedure_images
        (id, user_id, business_id, content_type, bytes, byte_size, width, height, sha256, uploaded_by)
      values (${id}, ${input.ownerId}, ${input.businessId}, ${info.type}, ${Buffer.from(stripped)},
        ${stripped.length}, ${info.width}, ${info.height}, ${sha256}, ${input.uploadedBy})
    `;
    return { id };
  });
}

/** One stored image of the business `ownerId` owns, or null. */
export async function readProcedureImage(
  sql: Sql,
  ownerId: string,
  businessId: string,
  id: string,
): Promise<StoredImage | null> {
  const rows = await sql<{ content_type: ImageType; bytes: Uint8Array }>`
    select content_type, bytes from procedure_images
    where user_id = ${ownerId} and business_id = ${businessId} and id = ${id}
  `;
  const row = rows[0];
  // pg returns a Buffer, PGlite a Uint8Array; both are Uint8Array views.
  return row ? { contentType: row.content_type, bytes: new Uint8Array(row.bytes) } : null;
}

/** How many images, and how many bytes, one business holds. */
export async function imageUsage(
  sql: Sql,
  ownerId: string,
  businessId: string,
): Promise<{ count: number; bytes: number }> {
  const [row] = await sql<{ count: number; bytes: number | null }>`
    select count(*) as count, sum(byte_size)::bigint as bytes from procedure_images
    where user_id = ${ownerId} and business_id = ${businessId}
  `;
  return { count: Number(row?.count ?? 0), bytes: Number(row?.bytes ?? 0) };
}

/**
 * Deletes the business's images that no procedure step names any more and
 * that are older than the grace period. Returns how many went.
 */
export async function sweepUnreferencedImages(
  sql: Sql,
  ownerId: string,
  businessId: string,
  keepIds: readonly string[],
  graceDays = UNREFERENCED_GRACE_DAYS,
): Promise<number> {
  const rows = await sql<{ id: string }>`
    delete from procedure_images
    where user_id = ${ownerId} and business_id = ${businessId}
      and not (id = any(${[...keepIds]}::text[]))
      and created_at < now() - make_interval(days => ${graceDays})
    returning id
  `;
  return rows.length;
}

/** Every image id the procedures of a stored business profile name. */
export function referencedImageIds(profile: unknown): string[] {
  const procedures = (profile as { procedures?: unknown } | null)?.procedures;
  if (!Array.isArray(procedures)) return [];
  const ids = new Set<string>();
  for (const p of procedures) {
    const steps = (p as { steps?: unknown } | null)?.steps;
    if (!Array.isArray(steps)) continue;
    for (const s of steps) {
      const imageIds = (s as { imageIds?: unknown } | null)?.imageIds;
      if (!Array.isArray(imageIds)) continue;
      for (const id of imageIds) if (typeof id === "string") ids.add(id);
    }
  }
  return [...ids];
}
