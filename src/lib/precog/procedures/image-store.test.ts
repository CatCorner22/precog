import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { openTestDb, type TestDb } from "@/test/pglite";
import { resolveBusinessOwner } from "../business-store";
import {
  copyImagesFromOwnBusinesses,
  imageUsage,
  insertProcedureImage,
  MAX_IMAGE_BYTES_PER_ACCOUNT,
  MAX_IMAGES_PER_BUSINESS,
  readProcedureImage,
  referencedImageIds,
  sweepUnreferencedImages,
} from "./image-store.server";

/** A small PNG that differs by `seed`, with a text chunk that must not be stored. */
function png(seed: number): Uint8Array {
  const be32 = (n: number) => [(n >>> 24) & 0xff, (n >>> 16) & 0xff, (n >>> 8) & 0xff, n & 0xff];
  const text = (s: string) => [...s].map((c) => c.charCodeAt(0));
  const chunk = (type: string, data: number[]) => [
    ...be32(data.length),
    ...text(type),
    ...data,
    0,
    0,
    0,
    0,
  ];
  return new Uint8Array([
    0x89,
    0x50,
    0x4e,
    0x47,
    0x0d,
    0x0a,
    0x1a,
    0x0a,
    ...chunk("IHDR", [...be32(100), ...be32(50), 8, 6, 0, 0, 0]),
    ...chunk("tEXt", text("Author\u0000Dana")),
    ...chunk("IDAT", [seed & 0xff, (seed >> 8) & 0xff]),
    ...chunk("IEND", []),
  ]);
}

let db: TestDb;

beforeAll(async () => {
  db = await openTestDb();
}, 60_000);

afterAll(async () => {
  await db.close();
});

beforeEach(async () => {
  await db.clear("procedure_images", "firm_members", "firms", "businesses", '"user"');
  for (const id of ["owner", "stranger", "colleague"]) await db.seedUser(id);
  // The owner's business, and the stranger's own business that happens to share its id.
  for (const user of ["owner", "stranger"]) {
    await db.pg.query(
      `insert into businesses (id, user_id, name, industry, profile, revision)
       values ('biz_1', $1, 'Biz', 'general', '{}'::jsonb, 1)`,
      [user],
    );
  }
});

const upload = (seed: number, declaredType = "image/png", businessId = "biz_1") =>
  insertProcedureImage(db.sql, {
    ownerId: "owner",
    businessId,
    declaredType,
    bytes: png(seed),
    uploadedBy: "owner",
  });

describe("procedure image store", () => {
  it("stores an image without its metadata and reads it back for the owner", async () => {
    const { id } = await upload(1);
    const image = await readProcedureImage(db.sql, "owner", "biz_1", id);
    expect(image?.contentType).toBe("image/png");
    expect(new TextDecoder("latin1").decode(image!.bytes)).not.toContain("Dana");
  }, 60_000);

  it("refuses bytes that are not the declared type", async () => {
    await expect(upload(1, "image/jpeg")).rejects.toMatchObject({ status: 415 });
    await expect(
      insertProcedureImage(db.sql, {
        ownerId: "owner",
        businessId: "biz_1",
        declaredType: "image/png",
        bytes: new TextEncoder().encode("<svg xmlns='http://www.w3.org/2000/svg'/>"),
        uploadedBy: "owner",
      }),
    ).rejects.toMatchObject({ status: 415 });
  }, 60_000);

  it("stores an identical picture once", async () => {
    const a = await upload(7);
    const b = await upload(7);
    expect(b.id).toBe(a.id);
    expect((await imageUsage(db.sql, "owner", "biz_1")).count).toBe(1);
  }, 60_000);

  it("refuses an image past the per-business count", async () => {
    for (let i = 0; i < MAX_IMAGES_PER_BUSINESS; i++) {
      await db.pg.query(
        `insert into procedure_images (id, user_id, business_id, content_type, bytes, byte_size, width, height, sha256)
         values ($1, 'owner', 'biz_1', 'image/png', '\\x00', 1, 1, 1, $1)`,
        [`img_seed_${i}`],
      );
    }
    await expect(upload(1)).rejects.toMatchObject({ status: 409 });
  }, 60_000);

  it("never shows one account's picture to another, even for a business with the same id", async () => {
    const { id } = await upload(2);
    const owner = await resolveBusinessOwner(db.sql, "stranger", "biz_1");
    expect(owner).toBe("stranger");
    expect(await readProcedureImage(db.sql, owner!, "biz_1", id)).toBeNull();
  }, 60_000);

  it("shows the picture to a member of the firm that holds the business", async () => {
    const { id } = await upload(3);
    await db.pg.query("insert into firms (user_id, name) values ('owner', 'North Advisors')");
    await db.pg.query(
      "insert into firm_members (firm_user_id, member_user_id, role) values ('owner', 'colleague', 'preparer')",
    );
    await db.pg.query("update businesses set firm_user_id = 'owner' where user_id = 'owner'");
    const owner = await resolveBusinessOwner(db.sql, "colleague", "biz_1");
    expect(owner).toBe("owner");
    expect(await readProcedureImage(db.sql, owner!, "biz_1", id)).not.toBeNull();
  }, 60_000);

  it("sweeps only pictures no step has named for the grace period, counted from removal", async () => {
    const kept = await upload(4);
    const removedLongAgo = await upload(5);
    const justRemoved = await upload(6);
    // All three were uploaded long ago; one was removed from its step long ago.
    await db.pg.query("update procedure_images set created_at = now() - interval '40 days'");
    await sweepUnreferencedImages(db.sql, "owner", "biz_1", [kept.id, justRemoved.id]);
    await db.pg.query(
      "update procedure_images set unreferenced_since = now() - interval '40 days' where id = $1",
      [removedLongAgo.id],
    );

    // A save that no longer names the just-removed picture keeps it for the grace period.
    const removed = await sweepUnreferencedImages(db.sql, "owner", "biz_1", [kept.id]);
    expect(removed).toBe(1);
    expect(await readProcedureImage(db.sql, "owner", "biz_1", removedLongAgo.id)).toBeNull();
    expect(await readProcedureImage(db.sql, "owner", "biz_1", justRemoved.id)).not.toBeNull();
    expect(await readProcedureImage(db.sql, "owner", "biz_1", kept.id)).not.toBeNull();

    // Named again (an undo): its removal clock stops.
    await sweepUnreferencedImages(db.sql, "owner", "biz_1", [kept.id, justRemoved.id]);
    const rows = await db.pg.query<{ unreferenced_since: unknown }>(
      "select unreferenced_since from procedure_images where id = $1",
      [justRemoved.id],
    );
    expect(rows.rows[0].unreferenced_since).toBeNull();
  }, 60_000);

  it("frees a business's room as soon as a save stops naming pictures", async () => {
    for (let i = 0; i < MAX_IMAGES_PER_BUSINESS; i++) {
      await db.pg.query(
        `insert into procedure_images (id, user_id, business_id, content_type, bytes, byte_size, width, height, sha256)
         values ($1, 'owner', 'biz_1', 'image/png', '\\x00', 1, 1, 1, $1)`,
        [`img_seed_${i}`],
      );
    }
    await expect(upload(1)).rejects.toMatchObject({ status: 409 });
    // The owner removes thirty pictures from old steps; the autosave sweeps.
    const still = Array.from({ length: MAX_IMAGES_PER_BUSINESS - 30 }, (_, i) => `img_seed_${i}`);
    await sweepUnreferencedImages(db.sql, "owner", "biz_1", still);
    await expect(upload(1)).resolves.toMatchObject({ id: expect.any(String) });
  }, 60_000);

  it("bounds the pictures one account stores across its businesses, deleted ones included", async () => {
    await db.pg.query(
      "update businesses set deleted_at = now() where user_id = 'owner' and id = 'biz_1'",
    );
    await db.pg.query(
      `insert into businesses (id, user_id, name, industry, profile, revision)
       values ('biz_2', 'owner', 'Biz 2', 'general', '{}'::jsonb, 1)`,
    );
    // A deleted business still holds nearly the whole allowance, in pictures no step names.
    const full = 600 * 1024;
    const rows = Math.floor(MAX_IMAGE_BYTES_PER_ACCOUNT / full);
    await db.pg.query(
      `insert into procedure_images (id, user_id, business_id, content_type, bytes, byte_size, width, height, sha256, unreferenced_since)
       select 'img_big_' || n, 'owner', 'biz_1', 'image/png', '\\x00',
         case when n = 0 then $2::int else $1::int end, 1, 1, 'big_' || n, now()
       from generate_series(0, $3::int) as n`,
      [full, MAX_IMAGE_BYTES_PER_ACCOUNT - rows * full - 10, rows],
    );
    await expect(upload(1, "image/png", "biz_2")).rejects.toMatchObject({
      status: 409,
      message: expect.stringMatching(/still count for 30 days/),
    });
    // Once the grace period is over, Precog deletes them and the room comes back.
    await db.pg.query(
      "update procedure_images set unreferenced_since = now() - interval '31 days' where business_id = 'biz_1'",
    );
    await expect(upload(1, "image/png", "biz_2")).resolves.toMatchObject({
      id: expect.any(String),
    });
  }, 60_000);

  it("copies the pictures a kept copy names from the owner's other business", async () => {
    const { id } = await upload(9);
    await db.pg.query(
      `insert into businesses (id, user_id, name, industry, profile, revision)
       values ('biz_copy', 'owner', 'Biz (copy)', 'general', '{}'::jsonb, 1)`,
    );
    expect(await readProcedureImage(db.sql, "owner", "biz_copy", id)).toBeNull();
    expect(await copyImagesFromOwnBusinesses(db.sql, "owner", "biz_copy", [id])).toBe(1);
    expect(await readProcedureImage(db.sql, "owner", "biz_copy", id)).not.toBeNull();
    // Already there: nothing more to copy.
    expect(await copyImagesFromOwnBusinesses(db.sql, "owner", "biz_copy", [id])).toBe(0);
    // Another account's pictures never move.
    await db.pg.query(
      `insert into businesses (id, user_id, name, industry, profile, revision)
       values ('biz_copy', 'stranger', 'Theirs', 'general', '{}'::jsonb, 1)`,
    );
    expect(await copyImagesFromOwnBusinesses(db.sql, "stranger", "biz_copy", [id])).toBe(0);
  }, 60_000);

  it("goes with the business when the business row is deleted", async () => {
    await upload(8);
    await db.pg.query("delete from businesses where user_id = 'owner'");
    expect((await imageUsage(db.sql, "owner", "biz_1")).count).toBe(0);
  }, 60_000);

  it("lists the image ids a stored profile's procedures name", () => {
    expect(
      referencedImageIds({
        procedures: [
          { steps: [{ imageIds: ["img_a", "img_b"] }, { imageIds: ["img_a"] }, {}] },
          { steps: "not a list" },
        ],
      }).sort(),
    ).toEqual(["img_a", "img_b"]);
    expect(referencedImageIds(null)).toEqual([]);
  });
});
