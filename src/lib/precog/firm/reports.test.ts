import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { openTestDb, type TestDb } from "@/test/pglite";
import {
  listReportVersions,
  loadReportVersion,
  lockReportVersion,
  markReportVersionSent,
  ReportVersionError,
  signOffReportVersion,
} from "./reports";

let db: TestDb;

beforeAll(async () => {
  db = await openTestDb();
}, 60_000);

afterAll(async () => {
  await db.close();
});

beforeEach(async () => {
  await db.clear("report_versions", "businesses", '"user"');
  await db.seedUser("owner");
  await db.seedUser("reviewer");
  await db.pg.query(
    `insert into businesses (id, user_id, name, industry, profile, revision)
     values ('biz_1', 'owner', 'Client', 'general', '{"practiceName":"Client v3"}'::jsonb, 3)`,
  );
});

describe("report versions", () => {
  it("locks the saved profile under the next number and freezes it", async () => {
    const v1 = await lockReportVersion(db.sql, {
      ownerUserId: "owner",
      businessId: "biz_1",
      preparedBy: "owner",
      scopeNote: "Money duties as mapped in September.",
      id: "rv_1",
    });
    expect([v1.versionNo, v1.revision, v1.preparedByName]).toEqual([1, 3, "owner"]);

    await db.sql`update businesses set profile = '{"practiceName":"Client v4"}', revision = 4`;
    const v2 = await lockReportVersion(db.sql, {
      ownerUserId: "owner",
      businessId: "biz_1",
      preparedBy: "owner",
      scopeNote: "",
      id: "rv_2",
    });
    expect(v2.versionNo).toBe(2);

    const frozen = await loadReportVersion<{ practiceName: string }>(db.sql, "owner", "rv_1");
    expect(frozen?.profile.practiceName).toBe("Client v3");
    expect((await listReportVersions(db.sql, "owner", "biz_1")).map((v) => v.versionNo)).toEqual([
      2, 1,
    ]);
  });

  it("a reviewer other than the preparer signs off, once", async () => {
    await lockReportVersion(db.sql, {
      ownerUserId: "owner",
      businessId: "biz_1",
      preparedBy: "owner",
      scopeNote: "",
      id: "rv_1",
    });
    await expect(
      signOffReportVersion(db.sql, {
        ownerUserId: "owner",
        id: "rv_1",
        reviewedBy: "owner",
        note: "",
      }),
    ).rejects.toBeInstanceOf(ReportVersionError);
    const signed = await signOffReportVersion(db.sql, {
      ownerUserId: "owner",
      id: "rv_1",
      reviewedBy: "reviewer",
      note: "Agreed.",
    });
    expect([signed.reviewedByName, signed.reviewNote]).toEqual(["reviewer", "Agreed."]);
    expect(signed.reviewedAt).toBeTruthy();
    await expect(
      signOffReportVersion(db.sql, {
        ownerUserId: "owner",
        id: "rv_1",
        reviewedBy: "reviewer",
        note: "",
      }),
    ).rejects.toBeInstanceOf(ReportVersionError);

    await markReportVersionSent(db.sql, "owner", "rv_1");
    const sent = await loadReportVersion(db.sql, "owner", "rv_1");
    expect(sent?.version.sentAt).toBeTruthy();
  });

  it("refuses to lock a deleted or foreign business", async () => {
    await db.sql`update businesses set deleted_at = now()`;
    await expect(
      lockReportVersion(db.sql, {
        ownerUserId: "owner",
        businessId: "biz_1",
        preparedBy: "owner",
        scopeNote: "",
        id: "rv_x",
      }),
    ).rejects.toBeInstanceOf(ReportVersionError);
  });
});
