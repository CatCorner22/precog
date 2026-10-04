import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { openTestDb, type TestDb } from "@/test/pglite";
import { requireIntegrationManager } from "./access.server";

let db: TestDb;

beforeAll(async () => {
  db = await openTestDb();
}, 60_000);

afterAll(async () => {
  await db.close();
});

beforeEach(async () => {
  await db.clear("firm_members", "firms", "businesses", '"user"');
  for (const user of ["owner", "preparer", "reviewer", "solo", "stranger"]) {
    await db.seedUser(user);
  }
  await db.pg.query(`insert into firms (user_id, name) values ('owner', 'North')`);
  await db.pg.query(
    `insert into firm_members (firm_user_id, member_user_id, role)
     values ('owner', 'owner', 'owner'),
            ('owner', 'preparer', 'preparer'),
            ('owner', 'reviewer', 'reviewer')`,
  );
  await db.pg.query(
    `insert into businesses (id, user_id, name, industry, profile, revision, firm_user_id)
     values ('biz_1', 'owner', 'Client', 'general', '{}'::jsonb, 1, 'owner'),
            ('biz_solo', 'solo', 'Solo Shop', 'general', '{}'::jsonb, 1, null)`,
  );
});

describe("requireIntegrationManager", () => {
  it("lets the account holding the business through, firm or not", async () => {
    await expect(requireIntegrationManager(db.sql, "solo", "biz_solo")).resolves.toBe("solo");
    await expect(requireIntegrationManager(db.sql, "owner", "biz_1")).resolves.toBe("owner");
  });

  it("lets a firm reviewer through on a client business", async () => {
    await expect(requireIntegrationManager(db.sql, "reviewer", "biz_1")).resolves.toBe("owner");
  });

  it("refuses a firm preparer on a client business", async () => {
    await expect(requireIntegrationManager(db.sql, "preparer", "biz_1")).rejects.toMatchObject({
      status: 403,
    });
  });

  it("answers a foreign business as missing", async () => {
    await expect(requireIntegrationManager(db.sql, "stranger", "biz_1")).rejects.toMatchObject({
      status: 404,
    });
  });
});
