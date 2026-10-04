import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { openTestDb, type TestDb } from "@/test/pglite";
import {
  listReportVersions,
  loadReportVersion,
  lockReportVersion,
  markReportVersionSent,
  reportFirmName,
  reportVersionFor,
  ReportVersionError,
  signOffReportVersion,
  versionProvenance,
  type ReportVersionRow,
} from "./reports";

let db: TestDb;

beforeAll(async () => {
  db = await openTestDb();
}, 60_000);

afterAll(async () => {
  await db.close();
});

beforeEach(async () => {
  await db.clear(
    "report_versions",
    "engagement_marks",
    "firm_members",
    "firms",
    "businesses",
    '"user"',
  );
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

  it("a reviewer other than the preparer reviews it for issuance, once", async () => {
    await lockReportVersion(db.sql, {
      ownerUserId: "owner",
      businessId: "biz_1",
      preparedBy: "owner",
      scopeNote: "",
      id: "rv_1",
    });
    const selfReview = signOffReportVersion(db.sql, {
      ownerUserId: "owner",
      id: "rv_1",
      reviewedBy: "owner",
      note: "",
    });
    await expect(selfReview).rejects.toBeInstanceOf(ReportVersionError);
    await expect(selfReview).rejects.toMatchObject({
      message: "The preparer cannot review their own report for issuance",
    });
    const signed = await signOffReportVersion(db.sql, {
      ownerUserId: "owner",
      id: "rv_1",
      reviewedBy: "reviewer",
      note: "Agreed.",
    });
    expect([signed.reviewedByName, signed.reviewNote]).toEqual(["reviewer", "Agreed."]);
    expect(signed.reviewedAt).toBeTruthy();
    const second = signOffReportVersion(db.sql, {
      ownerUserId: "owner",
      id: "rv_1",
      reviewedBy: "reviewer",
      note: "",
    });
    await expect(second).rejects.toBeInstanceOf(ReportVersionError);
    await expect(second).rejects.toMatchObject({
      message: "Someone has already reviewed this version for issuance",
    });

    await markReportVersionSent(db.sql, "owner", "rv_1");
    const sent = await loadReportVersion(db.sql, "owner", "rv_1");
    expect(sent?.version.sentAt).toBeTruthy();
  });

  it("a preparer with colleagues cannot issue the file without an independent review", async () => {
    await lockReportVersion(db.sql, {
      ownerUserId: "owner",
      businessId: "biz_1",
      preparedBy: "owner",
      scopeNote: "",
      id: "rv_1",
    });
    await db.pg.query(`insert into firms (user_id, name) values ('owner', 'North')`);
    await db.pg.query(
      `insert into firm_members (firm_user_id, member_user_id, role)
       values ('owner', 'owner', 'owner'), ('owner', 'reviewer', 'reviewer')`,
    );
    await db.pg.query("update businesses set firm_user_id = 'owner'");
    await expect(
      signOffReportVersion(db.sql, {
        ownerUserId: "owner",
        id: "rv_1",
        reviewedBy: "owner",
        note: "",
        issueWithoutIndependentReview: true,
      }),
    ).rejects.toMatchObject({
      message: "A different person at the firm must review this report for issuance",
    });
  });

  it("names the firm only for a firm client, never for a solo business", async () => {
    await db.pg.query(`insert into firms (user_id, name) values ('owner', 'North Advisors')`);
    // The owner holds a firms row, but the business is not a firm client.
    expect(await reportFirmName(db.sql, "owner", "biz_1")).toBeNull();
    await db.pg.query("update businesses set firm_user_id = 'owner'");
    expect(await reportFirmName(db.sql, "owner", "biz_1")).toBe("North Advisors");
    expect(await reportFirmName(db.sql, "owner", "biz_missing")).toBeNull();
  });

  it("freezes the firm's name and letterhead into a firm client's version, and null for a solo one", async () => {
    const logo = "data:image/png;base64,iVBORw0KGgo=";
    await db.pg.query(
      `insert into firms (user_id, name, letterhead, logo_data_url)
       values ('owner', 'North Advisors', '12 Elm St', $1)`,
      [logo],
    );
    const solo = await lockReportVersion(db.sql, {
      ownerUserId: "owner",
      businessId: "biz_1",
      preparedBy: "owner",
      scopeNote: "",
      id: "rv_solo",
    });
    expect(solo.firm).toBeNull();
    await db.pg.query("update businesses set firm_user_id = 'owner'");
    const v = await lockReportVersion(db.sql, {
      ownerUserId: "owner",
      businessId: "biz_1",
      preparedBy: "owner",
      scopeNote: "",
      id: "rv_firm",
    });
    expect(v.firm).toEqual({ name: "North Advisors", letterhead: "12 Elm St", logoDataUrl: logo });
    // A later rename or new letterhead leaves the version as it was printed.
    await db.pg.query(
      "update firms set name = 'North & Co', letterhead = '', logo_data_url = null",
    );
    const kept = await loadReportVersion(db.sql, "owner", "rv_firm");
    expect(kept?.version.firm).toEqual({
      name: "North Advisors",
      letterhead: "12 Elm St",
      logoDataUrl: logo,
    });
    // The list carries the name and letterhead but never the logo, which only
    // the single-version load above carries.
    expect((await listReportVersions(db.sql, "owner", "biz_1")).map((r) => r.firm)).toEqual([
      { name: "North Advisors", letterhead: "12 Elm St", logoDataUrl: null },
      null,
    ]);
    // A version stored before the snapshot columns existed reads as null.
    await db.pg.query("update report_versions set firm_name = null where id = 'rv_firm'");
    expect((await loadReportVersion(db.sql, "owner", "rv_firm"))?.version.firm).toBeNull();
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

describe("report version access", () => {
  const lock = (id: string) =>
    lockReportVersion(db.sql, {
      ownerUserId: "owner",
      businessId: "biz_1",
      preparedBy: "owner",
      scopeNote: "",
      id,
    });

  it("is refused to an account whose own business merely shares the id", async () => {
    await lock("rv_1");
    await db.seedUser("stranger");
    await db.pg.query(
      `insert into businesses (id, user_id, name, industry, profile, revision)
       values ('biz_1', 'stranger', 'Mine', 'general', '{}'::jsonb, 1)`,
    );
    expect(await reportVersionFor(db.sql, "stranger", "rv_1")).toBeNull();
    expect(await reportVersionFor(db.sql, "owner", "rv_1")).toEqual({
      ownerUserId: "owner",
      businessId: "biz_1",
    });
  });

  it("is open to a member of the firm that holds the business", async () => {
    await lock("rv_1");
    await db.pg.query(`insert into firms (user_id, name) values ('owner', 'North')`);
    await db.pg.query(
      `insert into firm_members (firm_user_id, member_user_id, role)
       values ('owner', 'owner', 'owner'), ('owner', 'reviewer', 'reviewer')`,
    );
    expect(await reportVersionFor(db.sql, "reviewer", "rv_1")).toBeNull();
    await db.pg.query("update businesses set firm_user_id = 'owner'");
    expect(await reportVersionFor(db.sql, "reviewer", "rv_1")).toEqual({
      ownerUserId: "owner",
      businessId: "biz_1",
    });
  });

  it("marking a version sent stamps the client's engagement once", async () => {
    await lock("rv_1");
    await lock("rv_2");
    await markReportVersionSent(db.sql, "owner", "rv_1");
    const first = await db.pg.query<{ report_sent_at: string; open_findings: number | null }>(
      "select report_sent_at, open_findings from engagement_marks",
    );
    expect(first.rows).toHaveLength(1);
    expect(first.rows[0].open_findings).toBeNull();
    await markReportVersionSent(db.sql, "owner", "rv_2");
    const second = await db.pg.query<{ report_sent_at: string }>(
      "select report_sent_at from engagement_marks",
    );
    expect(second.rows[0].report_sent_at).toEqual(first.rows[0].report_sent_at);
  });

  it("two locks at once get consecutive numbers", async () => {
    const [a, b] = await Promise.all([lock("rv_a"), lock("rv_b")]);
    expect([a.versionNo, b.versionNo].sort()).toEqual([1, 2]);
  });
});

describe("versionProvenance", () => {
  const base: ReportVersionRow = {
    id: "rv_1",
    businessId: "biz_1",
    versionNo: 2,
    revision: 3,
    scopeNote: "",
    preparedBy: "ada",
    preparedByName: "Ada Park",
    preparedAt: "2026-09-26T12:00:00.000Z",
    reviewedBy: null,
    reviewedByName: null,
    reviewedAt: null,
    reviewNote: "",
    sentAt: null,
    firm: null,
  };

  it("says who prepared it and who reviewed it for issuance", () => {
    expect(versionProvenance(base)).toBe(
      "Version 2 · Prepared by Ada Park on Sep 26, 2026 · Not yet reviewed",
    );
    expect(
      versionProvenance({
        ...base,
        reviewedBy: "ben",
        reviewedByName: "Ben Ortiz",
        reviewedAt: "2026-09-28T12:00:00.000Z",
      }),
    ).toBe(
      "Version 2 · Prepared by Ada Park on Sep 26, 2026 · Reviewed for issuance by Ben Ortiz on Sep 28, 2026",
    );
    expect(
      versionProvenance({
        ...base,
        reviewedBy: "ada",
        reviewedByName: "Ada Park",
        reviewedAt: "2026-09-28T12:00:00.000Z",
      }),
    ).toBe(
      "Version 2 · Prepared by Ada Park on Sep 26, 2026 · Issued by Ada Park on Sep 28, 2026. Not an independent review",
    );
  });
});
