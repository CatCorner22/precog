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
/**
 * Most images, and most bytes of images, one business's procedures name.
 * Pictures removed from every step do not count (see `unreferenced_since`).
 */
export const MAX_IMAGES_PER_BUSINESS = 200;
export const MAX_IMAGE_BYTES_PER_BUSINESS = 50 * 1024 * 1024;
/**
 * Most bytes of images one account stores across all its businesses, deleted
 * ones and removed pictures included: the bound on what one account can put
 * in the database, however many businesses it creates and deletes.
 */
export const MAX_IMAGE_BYTES_PER_ACCOUNT = 250 * 1024 * 1024;
/** Largest width or height, in pixels. */
export const MAX_IMAGE_SIDE = 4096;
/** Images are kept this long after no step names them, so an undo or a history restore still finds them. */
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

  await purgeExpiredImages(sql, input.ownerId);
  return inTransaction(sql, async (tx) => {
    // The same picture again: a step names it once more.
    const same = await tx<{ id: string }>`
      update procedure_images set unreferenced_since = null
      where user_id = ${input.ownerId} and business_id = ${input.businessId} and sha256 = ${sha256}
      returning id
    `;
    if (same[0]) return { id: same[0].id };
    const [usage] = await tx<{ count: number; bytes: number | null }>`
      select count(*) as count, sum(byte_size)::bigint as bytes from procedure_images
      where user_id = ${input.ownerId} and business_id = ${input.businessId}
        and unreferenced_since is null
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
    if (
      (await accountImageBytes(tx, input.ownerId)) + stripped.length >
      MAX_IMAGE_BYTES_PER_ACCOUNT
    ) {
      throw new RequestError(
        409,
        `This account already stores ${MAX_IMAGE_BYTES_PER_ACCOUNT / 1024 / 1024} MB of pictures, the most Precog keeps. Pictures you remove from steps, and those of deleted businesses, still count for ${UNREFERENCED_GRACE_DAYS} days.`,
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
 * After a save: notes when each of the business's images stopped being named
 * by a procedure step (and clears that for one named again), then deletes
 * those no step has named for the grace period. Returns how many went.
 */
export async function sweepUnreferencedImages(
  sql: Sql,
  ownerId: string,
  businessId: string,
  keepIds: readonly string[],
  graceDays = UNREFERENCED_GRACE_DAYS,
): Promise<number> {
  const keep = [...keepIds];
  return inTransaction(sql, async (tx) => {
    await tx`
      update procedure_images set unreferenced_since = null
      where user_id = ${ownerId} and business_id = ${businessId}
        and unreferenced_since is not null and id = any(${keep}::text[])
    `;
    await tx`
      update procedure_images set unreferenced_since = now()
      where user_id = ${ownerId} and business_id = ${businessId}
        and unreferenced_since is null and not (id = any(${keep}::text[]))
    `;
    const rows = await tx<{ id: string }>`
      delete from procedure_images
      where user_id = ${ownerId} and business_id = ${businessId}
        and unreferenced_since < now() - make_interval(days => ${graceDays})
      returning id
    `;
    return rows.length;
  });
}

/**
 * Deletes the account's images no step has named for the grace period, in
 * every business: the sweep after a save reaches only the business saved.
 * Run before the storage bound is checked, outside a transaction a refusal
 * would roll back.
 */
async function purgeExpiredImages(sql: Sql, ownerId: string): Promise<void> {
  await sql`
    delete from procedure_images
    where user_id = ${ownerId}
      and unreferenced_since < now() - make_interval(days => ${UNREFERENCED_GRACE_DAYS})
  `;
}

/** Bytes of images the account stores across all its businesses. */
async function accountImageBytes(tx: Sql, ownerId: string): Promise<number> {
  const [row] = await tx<{ bytes: number | null }>`
    select sum(byte_size)::bigint as bytes from procedure_images where user_id = ${ownerId}
  `;
  return Number(row?.bytes ?? 0);
}

/**
 * A business saved as a copy of another (a version kept after a save
 * conflict) names pictures stored under the original. Copies them into this
 * business, so its steps show them, within the account's storage bound.
 * The source is any business the owner can open: their own (deleted ones
 * too), or a live business of a firm they own or belong to, the same
 * businesses whose pictures they can already see. Returns how many were
 * copied.
 */
export async function copyImagesFromReachableBusinesses(
  sql: Sql,
  ownerId: string,
  businessId: string,
  ids: readonly string[],
): Promise<number> {
  if (!ids.length) return 0;
  const held = await sql<{ id: string }>`
    select id from procedure_images
    where user_id = ${ownerId} and business_id = ${businessId} and id = any(${[...ids]}::text[])
  `;
  const heldIds = new Set(held.map((r) => r.id));
  const missing = ids.filter((id) => !heldIds.has(id)).slice(0, MAX_IMAGES_PER_BUSINESS);
  if (!missing.length) return 0;
  await purgeExpiredImages(sql, ownerId);
  return inTransaction(sql, async (tx) => {
    const [incoming] = await tx<{ bytes: number | null }>`
      select sum(byte_size)::bigint as bytes from (
        select distinct on (p.id) p.byte_size
        from procedure_images p
        join businesses b on b.user_id = p.user_id and b.id = p.business_id
        where p.id = any(${missing}::text[])
          and not (p.user_id = ${ownerId} and p.business_id = ${businessId})
          and (
            b.user_id = ${ownerId}
            or (
              b.deleted_at is null
              and (
                b.firm_user_id = ${ownerId}
                or exists (
                  select 1 from firm_members m
                  where m.firm_user_id = b.firm_user_id and m.member_user_id = ${ownerId}
                )
              )
            )
          )
        order by p.id
      ) as src
    `;
    const bytes = Number(incoming?.bytes ?? 0);
    if (!bytes || (await accountImageBytes(tx, ownerId)) + bytes > MAX_IMAGE_BYTES_PER_ACCOUNT)
      return 0;
    const rows = await tx<{ id: string }>`
      insert into procedure_images
        (id, user_id, business_id, content_type, bytes, byte_size, width, height, sha256, uploaded_by, created_at)
      select distinct on (p.id)
        p.id, ${ownerId}, ${businessId}, p.content_type, p.bytes, p.byte_size, p.width, p.height,
        p.sha256, p.uploaded_by, p.created_at
      from procedure_images p
        join businesses b on b.user_id = p.user_id and b.id = p.business_id
        where p.id = any(${missing}::text[])
          and not (p.user_id = ${ownerId} and p.business_id = ${businessId})
          and (
            b.user_id = ${ownerId}
            or (
              b.deleted_at is null
              and (
                b.firm_user_id = ${ownerId}
                or exists (
                  select 1 from firm_members m
                  where m.firm_user_id = b.firm_user_id and m.member_user_id = ${ownerId}
                )
              )
            )
          )
        order by p.id
      on conflict do nothing
      returning id
    `;
    return rows.length;
  });
}

/**
 * Whether the sweep after a save has anything to do. It has nothing when
 * neither the replaced nor the new procedures name a picture and the
 * business held none still counted as named: nothing to copy in, mark or
 * clear. Pictures already marked wait for the purge before the owner's next
 * upload, as those of every other business do.
 */
export function imageSweepNeeded(
  saved: { previousProcedures: unknown; heldNamedImages: boolean },
  profile: unknown,
): boolean {
  return (
    saved.heldNamedImages ||
    referencedImageIds(profile).length > 0 ||
    referencedImageIds({ procedures: saved.previousProcedures }).length > 0
  );
}

/**
 * The sweep after a save: bring in the pictures a copy of another business
 * the owner can open names (see copyImagesFromReachableBusinesses), then
 * delete the business's step pictures no procedure has named for the grace
 * period. Does nothing when imageSweepNeeded says so.
 */
export async function sweepImagesAfterSave(
  sql: Sql,
  ownerId: string,
  businessId: string,
  profile: unknown,
  options: { copyFromOwn: boolean; previousProcedures: unknown; heldNamedImages: boolean },
): Promise<void> {
  if (!imageSweepNeeded(options, profile)) return;
  const ids = referencedImageIds(profile);
  if (options.copyFromOwn) await copyImagesFromReachableBusinesses(sql, ownerId, businessId, ids);
  await sweepUnreferencedImages(sql, ownerId, businessId, ids);
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
