import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { openTestDb, type TestDb } from "@/test/pglite";
import {
  assignedReviewerFor,
  engagementLine,
  ISSUE_ALONE_ALLOWED,
  ISSUE_ALONE_REFUSED,
  issueAloneFor,
  listReportVersions,
  loadReportVersion,
  lockReportVersion,
  markReportVersionSent,
  NOT_INDEPENDENT,
  NOTHING_TO_WITHDRAW,
  OVERRIDE_NOTE_MIN,
  OVERRIDE_NOTE_REQUIRED,
  REPORT_LIST_LIMIT,
  reportVersionFor,
  ReportVersionError,
  REVIEW_BEFORE_SENT,
  signOffReportVersion,
  versionFirmName,
  versionProvenance,
  WITHDRAW_AFTER_SENT,
  WITHDRAW_REFUSED,
  WITHDRAW_ROLE_REFUSED,
  withdrawReportVersionReview,
  withoutReviewRouting,
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

  it("says whether a version stores its figures", async () => {
    const bare = await lockReportVersion(db.sql, {
      ownerUserId: "owner",
      businessId: "biz_1",
      preparedBy: "owner",
      scopeNote: "",
      id: "rv_bare",
    });
    expect(bare.hasFigures).toBe(false);
    const stored = await lockReportVersion(db.sql, {
      ownerUserId: "owner",
      businessId: "biz_1",
      preparedBy: "owner",
      scopeNote: "",
      id: "rv_stored",
      freeze: () => ({ scoringVersion: "1.0.0", layoutVersion: 3, model: { summary: [] } }),
    });
    expect(stored.hasFigures).toBe(true);
    // A lock that ran but could not store the model reads as without figures.
    const dropped = await lockReportVersion(db.sql, {
      ownerUserId: "owner",
      businessId: "biz_1",
      preparedBy: "owner",
      scopeNote: "",
      id: "rv_dropped",
      freeze: () => ({ scoringVersion: "1.0.0", layoutVersion: 3, model: null }),
    });
    expect(dropped.hasFigures).toBe(false);
    expect(
      (await listReportVersions(db.sql, "owner", "biz_1")).map((v) => [v.id, v.hasFigures]),
    ).toEqual([
      ["rv_dropped", false],
      ["rv_stored", true],
      ["rv_bare", false],
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
    await lockReportVersion(db.sql, {
      ownerUserId: "owner",
      businessId: "biz_1",
      preparedBy: "owner",
      scopeNote: "",
      id: "rv_1",
    });
    // The owner holds a firms row, but the business is not a firm client.
    expect(await versionFirmName(db.sql, "owner", "rv_1")).toBeNull();
    await db.pg.query("update businesses set firm_user_id = 'owner'");
    expect(await versionFirmName(db.sql, "owner", "rv_1")).toBe("North Advisors");
    expect(await versionFirmName(db.sql, "owner", "rv_missing")).toBeNull();
    // Shared with that firm by its owner, the version locked alone is not the firm's.
    await db.pg.query("update businesses set granted_at = now()");
    expect(await versionFirmName(db.sql, "owner", "rv_1")).toBeNull();
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
    // Inserted as such: the frozen-column trigger (migration 0048) refuses
    // clearing firm_name on a locked version.
    await db.pg.query(
      `insert into report_versions (id, user_id, business_id, version_no, profile, firm_name)
       values ('rv_old', 'owner', 'biz_1', 9, '{}'::jsonb, null)`,
    );
    expect((await loadReportVersion(db.sql, "owner", "rv_old"))?.version.firm).toBeNull();
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

  it("stores the firm a version was locked for, and the firm reads only its own", async () => {
    await db.seedUser("cpa");
    await db.pg.exec(`
      insert into firms (user_id, name) values ('cpa', 'North');
      insert into firm_members (firm_user_id, member_user_id, role)
        values ('cpa', 'cpa', 'owner'), ('cpa', 'reviewer', 'reviewer');
      update businesses set firm_user_id = 'cpa';
    `);
    await lock("rv_1");
    const stored = await db.pg.query<{ firm_user_id: string | null }>(
      "select firm_user_id from report_versions where id = 'rv_1'",
    );
    expect(stored.rows[0].firm_user_id).toBe("cpa");
    expect(await reportVersionFor(db.sql, "reviewer", "rv_1")).not.toBeNull();
    // Locked for another firm: the business's own account reads it, this firm does not.
    await db.pg.exec(`update report_versions set firm_user_id = 'elsewhere' where id = 'rv_1'`);
    expect(await reportVersionFor(db.sql, "reviewer", "rv_1")).toBeNull();
    expect(await listReportVersions(db.sql, "owner", "biz_1", "reviewer")).toEqual([]);
    expect(await reportVersionFor(db.sql, "owner", "rv_1")).not.toBeNull();
    expect((await listReportVersions(db.sql, "owner", "biz_1")).length).toBe(1);
  });

  it("reads a version locked before the firm was kept for the firm, unless the owner shared the business", async () => {
    await db.seedUser("cpa");
    await db.pg.exec(`
      insert into firms (user_id, name) values ('cpa', 'North');
      insert into firm_members (firm_user_id, member_user_id, role)
        values ('cpa', 'cpa', 'owner'), ('cpa', 'reviewer', 'reviewer');
      update businesses set firm_user_id = 'cpa';
    `);
    await lock("rv_1");
    await db.pg.exec(`update report_versions set firm_user_id = null`);
    expect(await reportVersionFor(db.sql, "reviewer", "rv_1")).not.toBeNull();
    expect((await listReportVersions(db.sql, "owner", "biz_1", "reviewer")).length).toBe(1);
    await db.pg.exec(`update businesses set granted_at = now()`);
    expect(await reportVersionFor(db.sql, "reviewer", "rv_1")).toBeNull();
    expect(await listReportVersions(db.sql, "owner", "biz_1", "reviewer")).toEqual([]);
    expect(await reportVersionFor(db.sql, "owner", "rv_1")).not.toBeNull();
  });

  it("refuses the sent stamp until the version is signed off", async () => {
    await lock("rv_1");
    await expect(markReportVersionSent(db.sql, "owner", "rv_1")).rejects.toMatchObject({
      status: 409,
    });
    await expect(markReportVersionSent(db.sql, "owner", "rv_missing")).rejects.toMatchObject({
      status: 404,
    });
    await signOffReportVersion(db.sql, {
      ownerUserId: "owner",
      id: "rv_1",
      reviewedBy: "reviewer",
      note: "",
    });
    await markReportVersionSent(db.sql, "owner", "rv_1");
    const sent = await loadReportVersion(db.sql, "owner", "rv_1");
    expect(sent?.version.sentAt).toBeTruthy();
  });

  it("marking a version sent stamps the client's engagement once", async () => {
    for (const id of ["rv_1", "rv_2"]) {
      await lock(id);
      await signOffReportVersion(db.sql, {
        ownerUserId: "owner",
        id,
        reviewedBy: "reviewer",
        note: "",
      });
    }
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

  it("lists the newest REPORT_LIST_LIMIT versions, the cap the engagement archive reads", async () => {
    expect(REPORT_LIST_LIMIT).toBe(50);
    await db.pg.query(
      `insert into report_versions (id, user_id, business_id, version_no, profile)
       select 'rv_' || n, 'owner', 'biz_1', n, '{}'::jsonb from generate_series(1, $1::int) n`,
      [REPORT_LIST_LIMIT + 1],
    );
    const listed = await listReportVersions(db.sql, "owner", "biz_1");
    expect(listed).toHaveLength(REPORT_LIST_LIMIT);
    expect([listed[0].versionNo, listed.at(-1)?.versionNo]).toEqual([REPORT_LIST_LIMIT + 1, 2]);
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
    reviewOverrideNote: null,
    sentAt: null,
    hasFigures: false,
    firm: null,
    engagement: null,
    reviewRequestedAt: null,
    reviewRequestedFrom: null,
    reviewRequestedFromName: null,
    returnedAt: null,
    returnedBy: null,
    returnedByName: null,
    returnNote: "",
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

  it("says who a review was requested from, or that the firm's reviewers may take it", () => {
    const requested = {
      ...base,
      reviewRequestedAt: "2026-10-06T12:00:00.000Z",
      reviewRequestedFrom: "bea",
      reviewRequestedFromName: "Bea Lin",
    };
    expect(versionProvenance(requested)).toBe(
      "Version 2 · Prepared by Ada Park on Sep 26, 2026 · Review requested from Bea Lin on Oct 6, 2026",
    );
    expect(
      versionProvenance({ ...requested, reviewRequestedFrom: null, reviewRequestedFromName: null }),
    ).toBe(
      "Version 2 · Prepared by Ada Park on Sep 26, 2026 · Review requested from the firm's reviewers on Oct 6, 2026",
    );
    // Once reviewed, the review line replaces the request.
    expect(
      versionProvenance({
        ...requested,
        reviewedBy: "bea",
        reviewedByName: "Bea Lin",
        reviewedAt: "2026-10-07T12:00:00.000Z",
      }),
    ).toBe(
      "Version 2 · Prepared by Ada Park on Sep 26, 2026 · Reviewed for issuance by Bea Lin on Oct 7, 2026",
    );
  });

  it("says who returned a version and when", () => {
    expect(
      versionProvenance({
        ...base,
        reviewRequestedAt: "2026-10-06T12:00:00.000Z",
        reviewRequestedFrom: "bea",
        reviewRequestedFromName: "Bea Lin",
        returnedAt: "2026-10-07T12:00:00.000Z",
        returnedBy: "bea",
        returnedByName: "Bea Lin",
        returnNote: "Add the payroll duties.",
      }),
    ).toBe("Version 2 · Prepared by Ada Park on Sep 26, 2026 · Returned by Bea Lin on Oct 7, 2026");
  });

  it("hands a report link no request-and-return routing, and prints the same line", () => {
    const reviewed = {
      ...base,
      reviewRequestedAt: "2026-10-06T12:00:00.000Z",
      reviewRequestedFrom: "own",
      reviewRequestedFromName: "Olu Firm-Owner",
      reviewedBy: "bea",
      reviewedByName: "Bea Lin",
      reviewedAt: "2026-10-07T12:00:00.000Z",
    };
    const shared = withoutReviewRouting(reviewed);
    expect(shared).toEqual({
      ...reviewed,
      reviewRequestedAt: null,
      reviewRequestedFrom: null,
      reviewRequestedFromName: null,
      returnedAt: null,
      returnedBy: null,
      returnedByName: null,
      returnNote: "",
    });
    expect(JSON.stringify(shared)).not.toMatch(/"own"|Olu/);
    expect(versionProvenance(shared)).toBe(versionProvenance(reviewed));
  });
});

describe("the sent stamp's refusal", () => {
  it("asks for the review for issuance first, in those words", async () => {
    await lockReportVersion(db.sql, {
      ownerUserId: "owner",
      businessId: "biz_1",
      preparedBy: "owner",
      scopeNote: "",
      id: "rv_1",
    });
    await expect(markReportVersionSent(db.sql, "owner", "rv_1")).rejects.toMatchObject({
      status: 409,
      message: "Review this version for issuance before marking it sent.",
    });
    expect(REVIEW_BEFORE_SENT).toBe("Review this version for issuance before marking it sent.");
  });
});

describe("the engagement frozen at lock", () => {
  async function lockAs(id: string) {
    return lockReportVersion(db.sql, {
      ownerUserId: "owner",
      businessId: "biz_1",
      preparedBy: "owner",
      scopeNote: "",
      id,
    });
  }

  it("copies the scope and period in, and a later edit leaves the version's line as it was", async () => {
    await db.pg.query(`insert into firms (user_id, name) values ('owner', 'North Advisors')`);
    await db.pg.query("update businesses set firm_user_id = 'owner'");
    expect((await lockAs("rv_none")).engagement).toBeNull();
    await db.pg.query(
      `insert into engagement_marks (user_id, business_id, scope, period_start, period_end)
       values ('owner', 'biz_1', 'Duty map and monthly review', '2026-01-01', '2026-12-31')`,
    );
    const v = await lockAs("rv_eng");
    expect(v.engagement).toEqual({
      scope: "Duty map and monthly review",
      periodStart: "2026-01-01",
      periodEnd: "2026-12-31",
    });
    expect(engagementLine(v)).toBe(
      "Engagement: Duty map and monthly review · Jan 1, 2026 to Dec 31, 2026",
    );
    await db.pg.query(
      `update engagement_marks set scope = 'Something else', period_end = '2027-06-30'`,
    );
    const kept = await loadReportVersion(db.sql, "owner", "rv_eng");
    expect(kept && engagementLine(kept.version)).toBe(
      "Engagement: Duty map and monthly review · Jan 1, 2026 to Dec 31, 2026",
    );
    expect((await listReportVersions(db.sql, "owner", "biz_1")).map((r) => r.engagement)).toEqual([
      v.engagement,
      null,
    ]);
    // An engagement row with an empty scope and no period freezes nothing.
    await db.pg.query(
      `update engagement_marks set scope = '', period_start = null, period_end = null`,
    );
    expect((await lockAs("rv_empty")).engagement).toBeNull();
  });

  it("prints each form of the line, and nothing for a version without one", () => {
    const line = (scope: string, periodStart: string | null, periodEnd: string | null) =>
      engagementLine({ engagement: { scope, periodStart, periodEnd } });
    expect(line("Map", "2026-01-01", "2026-12-31")).toBe(
      "Engagement: Map · Jan 1, 2026 to Dec 31, 2026",
    );
    expect(line("Map", null, null)).toBe("Engagement: Map");
    expect(line("", "2026-01-01", "2026-12-31")).toBe("Engagement: Jan 1, 2026 to Dec 31, 2026");
    expect(line("", "2026-01-01", null)).toBe("Engagement: from Jan 1, 2026");
    expect(line("Map", null, "2026-12-31")).toBe("Engagement: Map · to Dec 31, 2026");
    expect(line("", null, null)).toBeNull();
    expect(engagementLine({ engagement: null })).toBeNull();
  });
});

/**
 * The review rules (CPA-8, CPA-13): the engagement's assigned reviewer, sole
 * issuance when nobody else at the firm can review, and withdrawing a review
 * before the version is sent. Firm "owner" (owner `owner`, reviewer
 * `reviewer`, preparer `prep`) holds `biz_1`.
 */
describe("review rules", () => {
  beforeEach(async () => {
    await db.seedUser("prep");
    await db.pg.exec(`
      insert into firms (user_id, name) values ('owner', 'North');
      insert into firm_members (firm_user_id, member_user_id, role) values
        ('owner', 'owner', 'owner'), ('owner', 'reviewer', 'reviewer'), ('owner', 'prep', 'preparer');
      update businesses set firm_user_id = 'owner';
    `);
  });

  const lock = (id: string, preparedBy = "prep") =>
    lockReportVersion(db.sql, {
      ownerUserId: "owner",
      businessId: "biz_1",
      preparedBy,
      scopeNote: "",
      id,
    });
  const signOff = (id: string, reviewedBy: string, extra: { overrideNote?: string } = {}) =>
    signOffReportVersion(db.sql, { ownerUserId: "owner", id, reviewedBy, note: "", ...extra });
  const assign = (reviewer: string) =>
    db.pg.query(
      `insert into engagement_marks (user_id, business_id, reviewer_user_id)
       values ('owner', 'biz_1', $1)`,
      [reviewer],
    );

  it("pins the new refusals and the stamp", () => {
    expect(NOT_INDEPENDENT).toBe("Not an independent review");
    expect(OVERRIDE_NOTE_MIN).toBe(10);
    expect(OVERRIDE_NOTE_REQUIRED).toBe(
      "Someone else at the firm is this client's assigned reviewer. To review this version in their place, add a note of at least 10 characters saying why.",
    );
    expect(ISSUE_ALONE_REFUSED).toBe(
      "A different person at the firm must review this report for issuance",
    );
    expect(ISSUE_ALONE_ALLOWED).toBe(
      'No one else at the firm holds the owner or reviewer role, so you can issue this version alone. It prints as "Not an independent review".',
    );
    expect(WITHDRAW_AFTER_SENT).toBe(
      "This version was already sent, so its review cannot be withdrawn.",
    );
    expect(WITHDRAW_REFUSED).toBe(
      "Only the firm owner or the person who reviewed this version can withdraw its review.",
    );
    expect(NOTHING_TO_WITHDRAW).toBe(
      "This version has not been reviewed for issuance, so there is no review to withdraw.",
    );
  });

  it("refuses a review in the assigned reviewer's place without a note, and stores the note", async () => {
    await assign("reviewer");
    await lock("rv_1");
    expect(
      await assignedReviewerFor(db.sql, {
        ownerUserId: "owner",
        businessId: "biz_1",
        preparedBy: "prep",
      }),
    ).toBe("reviewer");
    await expect(signOff("rv_1", "owner")).rejects.toMatchObject({
      status: 400,
      message: OVERRIDE_NOTE_REQUIRED,
    });
    // Nine characters after trimming is still too short.
    await expect(signOff("rv_1", "owner", { overrideNote: "  Too short  " })).rejects.toMatchObject(
      { status: 400, message: OVERRIDE_NOTE_REQUIRED },
    );
    await expect(signOff("rv_1", "owner", { overrideNote: "x".repeat(601) })).rejects.toMatchObject(
      { status: 400, message: "Keep the note to 600 characters or fewer." },
    );
    expect((await loadReportVersion(db.sql, "owner", "rv_1"))?.version.reviewedAt).toBeNull();
    const signed = await signOff("rv_1", "owner", {
      overrideNote: "  Reviewer is on leave this month.  ",
    });
    expect([signed.reviewedBy, signed.reviewOverrideNote]).toEqual([
      "owner",
      "Reviewer is on leave this month.",
    ]);
    const listed = await listReportVersions(db.sql, "owner", "biz_1");
    expect(listed[0].reviewOverrideNote).toBe("Reviewer is on leave this month.");
  });

  it("needs no note from the assigned reviewer, nor when nobody who can review is assigned", async () => {
    await assign("reviewer");
    await lock("rv_1");
    const byAssigned = await signOff("rv_1", "reviewer", { overrideNote: "Not needed here." });
    expect(byAssigned.reviewOverrideNote).toBeNull();
    // The assigned reviewer, demoted to preparer, can no longer review: no note.
    await db.pg.query(
      `update firm_members set role = 'preparer' where member_user_id = 'reviewer'`,
    );
    await lock("rv_2");
    expect((await signOff("rv_2", "owner")).reviewOverrideNote).toBeNull();
    // On a version the assigned reviewer prepared, someone else reviews it without a note.
    await db.pg.query(
      `update firm_members set role = 'reviewer' where member_user_id = 'reviewer'`,
    );
    await lock("rv_3", "reviewer");
    expect((await signOff("rv_3", "owner")).reviewOverrideNote).toBeNull();
  });

  it("lets the owner of an owner-plus-preparer firm issue alone, stamped as not independent", async () => {
    await db.pg.query(`delete from firm_members where member_user_id = 'reviewer'`);
    await lock("rv_1", "owner");
    const where = { ownerUserId: "owner", businessId: "biz_1" };
    expect(await issueAloneFor(db.sql, { ...where, preparedBy: "owner" })).toEqual({
      canIssueAlone: true,
      reason: ISSUE_ALONE_ALLOWED,
    });
    // The preparer-role colleague cannot: the owner can review their work.
    expect(await issueAloneFor(db.sql, { ...where, preparedBy: "prep" })).toEqual({
      canIssueAlone: false,
      reason: ISSUE_ALONE_REFUSED,
    });
    // The owner still cannot review their own version without saying so.
    await expect(signOff("rv_1", "owner")).rejects.toMatchObject({
      message: "The preparer cannot review their own report for issuance",
    });
    const issued = await signOffReportVersion(db.sql, {
      ownerUserId: "owner",
      id: "rv_1",
      reviewedBy: "owner",
      note: "Checked twice.",
      issueWithoutIndependentReview: true,
    });
    expect(issued.reviewNote).toBe("Not an independent review. Checked twice.");
    expect(versionProvenance(issued)).toMatch(/Not an independent review$/);
  });

  it("refuses sole issuance while another member holds the reviewer role", async () => {
    await lock("rv_1", "owner");
    expect(
      await issueAloneFor(db.sql, {
        ownerUserId: "owner",
        businessId: "biz_1",
        preparedBy: "owner",
      }),
    ).toEqual({ canIssueAlone: false, reason: ISSUE_ALONE_REFUSED });
    await expect(
      signOffReportVersion(db.sql, {
        ownerUserId: "owner",
        id: "rv_1",
        reviewedBy: "owner",
        note: "",
        issueWithoutIndependentReview: true,
      }),
    ).rejects.toMatchObject({ status: 409, message: ISSUE_ALONE_REFUSED });
  });

  it("withdraws a review before the version is sent, and refuses after", async () => {
    await assign("reviewer");
    await lock("rv_1");
    await signOff("rv_1", "owner", { overrideNote: "Reviewer is on leave this month." });
    const withdraw = (by: string, id = "rv_1") =>
      withdrawReportVersionReview(db.sql, { ownerUserId: "owner", id, withdrawnBy: by });
    // Neither the preparer nor another reviewer may withdraw it.
    await expect(withdraw("prep")).rejects.toMatchObject({
      status: 403,
      message: WITHDRAW_REFUSED,
    });
    await expect(withdraw("reviewer")).rejects.toMatchObject({
      status: 403,
      message: WITHDRAW_REFUSED,
    });
    // The signer withdraws; the version reads as unreviewed and can be reviewed again.
    const { version, withdrawnReviewer } = await withdraw("owner");
    expect(withdrawnReviewer).toBe("owner");
    expect([
      version.reviewedBy,
      version.reviewedAt,
      version.reviewNote,
      version.reviewOverrideNote,
    ]).toEqual([null, null, "", null]);
    await expect(withdraw("owner")).rejects.toMatchObject({
      status: 409,
      message: NOTHING_TO_WITHDRAW,
    });
    await expect(markReportVersionSent(db.sql, "owner", "rv_1")).rejects.toMatchObject({
      message: REVIEW_BEFORE_SENT,
    });
    // The assigned reviewer reviews it; the firm owner may withdraw that review too.
    await signOff("rv_1", "reviewer");
    expect((await withdraw("owner")).withdrawnReviewer).toBe("reviewer");
    await signOff("rv_1", "reviewer");
    await markReportVersionSent(db.sql, "owner", "rv_1");
    await expect(withdraw("reviewer")).rejects.toMatchObject({
      status: 409,
      message: WITHDRAW_AFTER_SENT,
    });
    await expect(withdraw("owner")).rejects.toMatchObject({
      status: 409,
      message: WITHDRAW_AFTER_SENT,
    });
    const sent = await loadReportVersion(db.sql, "owner", "rv_1");
    expect([sent?.version.reviewedBy, Boolean(sent?.version.sentAt)]).toEqual(["reviewer", true]);
    await expect(withdraw("owner", "rv_missing")).rejects.toMatchObject({ status: 404 });
  });

  it("refuses a withdrawal on an ended engagement", async () => {
    await lock("rv_1");
    await signOff("rv_1", "reviewer");
    await db.pg.query(
      `insert into engagement_marks (user_id, business_id, status, ended_at)
       values ('owner', 'biz_1', 'ended', now())`,
    );
    await expect(
      withdrawReportVersionReview(db.sql, {
        ownerUserId: "owner",
        id: "rv_1",
        withdrawnBy: "reviewer",
      }),
    ).rejects.toMatchObject({ status: 409 });
  });

  const withdrawAs = (by: string, id: string, ownerUserId = "owner") =>
    withdrawReportVersionReview(db.sql, { ownerUserId, id, withdrawnBy: by });
  const reviewedBy = async (id: string, ownerUserId = "owner") =>
    (await loadReportVersion(db.sql, ownerUserId, id))?.version.reviewedBy ?? null;

  it("refuses the signer once their role no longer reviews, and the firm owner still withdraws", async () => {
    expect(WITHDRAW_ROLE_REFUSED).toBe(
      "Your role at the firm no longer lets you withdraw this review. Ask the firm owner to withdraw it.",
    );
    await lock("rv_1");
    await signOff("rv_1", "reviewer");
    await db.pg.query(
      `update firm_members set role = 'preparer' where member_user_id = 'reviewer'`,
    );
    await expect(withdrawAs("reviewer", "rv_1")).rejects.toMatchObject({
      status: 403,
      message: WITHDRAW_ROLE_REFUSED,
    });
    expect(await reviewedBy("rv_1")).toBe("reviewer");
    // Removed from the firm, likewise.
    await db.pg.query(`delete from firm_members where member_user_id = 'reviewer'`);
    await expect(withdrawAs("reviewer", "rv_1")).rejects.toMatchObject({
      status: 403,
      message: WITHDRAW_ROLE_REFUSED,
    });
    expect(await reviewedBy("rv_1")).toBe("reviewer");
    expect((await withdrawAs("owner", "rv_1")).withdrawnReviewer).toBe("reviewer");
  });

  it("lets a person who issued a version alone withdraw it while still a member, whatever their role", async () => {
    // Issued alone (preparer and reviewer the same person), for example by a
    // firm owner who has since handed the firm on and holds another role.
    await lock("rv_1", "prep");
    const issueAlone = () =>
      db.pg.query(
        `update report_versions set reviewed_by = prepared_by, reviewed_at = now(),
           review_note = 'Not an independent review.' where id = 'rv_1'`,
      );
    await issueAlone();
    expect((await withdrawAs("prep", "rv_1")).withdrawnReviewer).toBe("prep");
    expect(await reviewedBy("rv_1")).toBeNull();
    // No longer a member, they cannot.
    await issueAlone();
    await db.pg.query(`delete from firm_members where member_user_id = 'prep'`);
    await expect(withdrawAs("prep", "rv_1")).rejects.toMatchObject({
      status: 403,
      message: WITHDRAW_ROLE_REFUSED,
    });
    expect(await reviewedBy("rv_1")).toBe("prep");
  });

  it("lets a business's own account withdraw a review it issued alone outside any firm", async () => {
    await db.seedUser("solo");
    await db.pg.exec(`
      insert into businesses (id, user_id, name, industry, profile, revision)
        values ('biz_s', 'solo', 'Solo', 'general', '{}'::jsonb, 1);
    `);
    const lockSolo = (id: string) =>
      lockReportVersion(db.sql, {
        ownerUserId: "solo",
        businessId: "biz_s",
        preparedBy: "solo",
        scopeNote: "",
        id,
      });
    const issueSolo = (id: string) =>
      signOffReportVersion(db.sql, {
        ownerUserId: "solo",
        id,
        reviewedBy: "solo",
        note: "",
        issueWithoutIndependentReview: true,
      });
    await lockSolo("rv_s1");
    await issueSolo("rv_s1");
    expect((await withdrawAs("solo", "rv_s1", "solo")).withdrawnReviewer).toBe("solo");
    // Shared with the firm later, the version stays the account's own: the
    // firm does not read it, so its role rules do not reach it.
    await lockSolo("rv_s2");
    await issueSolo("rv_s2");
    await db.pg.query(
      `update businesses set firm_user_id = 'owner', granted_at = now() where id = 'biz_s'`,
    );
    await expect(withdrawAs("owner", "rv_s2", "solo")).rejects.toMatchObject({
      status: 403,
      message: WITHDRAW_REFUSED,
    });
    expect((await withdrawAs("solo", "rv_s2", "solo")).withdrawnReviewer).toBe("solo");
  });
});
