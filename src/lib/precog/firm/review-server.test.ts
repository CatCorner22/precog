import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { openTestDb, type TestDb } from "@/test/pglite";
import { ENGAGEMENT_ENDED } from "./engagement-row";
import {
  ALREADY_REVIEWED,
  lockReportVersion,
  NO_ELIGIBLE_REVIEWER,
  PREPARER_CANNOT_RETURN,
  RETURN_NOTE_REQUIRED,
  RETURN_NOTE_TOO_LONG,
  REVIEW_REQUEST_REFUSED,
  signOffReportVersion,
  VERSION_RETURNED,
  type ReportVersionRow,
} from "./reports";
import { requestReportReview, returnReport } from "./review-server";

// The server functions run as plain handlers: the validator, then the
// handler with the caller's id, against this file's PGlite.
const ref = vi.hoisted(() => ({ db: null as null | { sql: unknown } }));
vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => {
    let validate = (input: unknown) => input;
    const chain = {
      middleware: () => chain,
      validator: (fn: (input: unknown) => unknown) => {
        validate = fn;
        return chain;
      },
      handler:
        (fn: (args: { context: unknown; data: unknown }) => unknown) =>
        (args: { context: unknown; data: unknown }) =>
          fn({ context: args.context, data: validate(args.data) }),
    };
    return chain;
  },
}));
vi.mock("@/lib/auth/middleware", () => ({ authMiddleware: {} }));
vi.mock("@/lib/db", () => ({ getSql: async () => ref.db?.sql }));

type Call = (args: {
  context: { userId: string };
  data: Record<string, unknown>;
}) => Promise<{ version: ReportVersionRow }>;
const ask = (userId: string, id: string) =>
  (requestReportReview as unknown as Call)({ context: { userId }, data: { id } });
const giveBack = (userId: string, id: string, note: string) =>
  (returnReport as unknown as Call)({ context: { userId }, data: { id, note } });

let db: TestDb;

beforeAll(async () => {
  db = await openTestDb();
  ref.db = db;
}, 60_000);

afterAll(async () => {
  await db.close();
});

/**
 * Firm "own" (owner `own`, reviewers `rev` and `rev2`, preparer `prep`)
 * with client `biz_1` under the owner's account; `out` is in no firm.
 */
beforeEach(async () => {
  await db.clear(
    "report_versions",
    "engagement_marks",
    "firm_members",
    "firms",
    "businesses",
    '"user"',
  );
  for (const id of ["own", "rev", "rev2", "prep", "out"]) await db.seedUser(id);
  await db.pg.exec(`
    update "user" set name = 'Owen Owner' where id = 'own';
    update "user" set name = 'Bea Lin' where id = 'rev2';
    insert into firms (user_id, name) values ('own', 'North Advisors');
    insert into firm_members (firm_user_id, member_user_id, role) values
      ('own', 'own', 'owner'), ('own', 'rev', 'reviewer'),
      ('own', 'rev2', 'reviewer'), ('own', 'prep', 'preparer');
    insert into businesses (id, user_id, name, industry, profile, revision, firm_user_id) values
      ('biz_1', 'own', 'Client', 'general', '{}'::jsonb, 1, 'own');
  `);
});

function lock(id: string, preparedBy: string) {
  return lockReportVersion(db.sql, {
    ownerUserId: "own",
    businessId: "biz_1",
    preparedBy,
    scopeNote: "",
    id,
  });
}

const assignReviewer = (userId: string) =>
  db.pg.query(
    `insert into engagement_marks (user_id, business_id, reviewer_user_id)
     values ('own', 'biz_1', $1)
     on conflict (user_id, business_id) do update set reviewer_user_id = excluded.reviewer_user_id`,
    [userId],
  );

describe("asking for review", () => {
  it("goes to the engagement's reviewer when one is set", async () => {
    await lock("rv_1", "prep");
    await assignReviewer("rev2");
    const { version } = await ask("prep", "rv_1");
    expect(version.reviewRequestedFrom).toBe("rev2");
    expect(version.reviewRequestedFromName).toBe("Bea Lin");
    expect(version.reviewRequestedAt).toBeTruthy();
    const stored = await db.pg.query<{ review_requested_by: string }>(
      "select review_requested_by from report_versions where id = 'rv_1'",
    );
    expect(stored.rows[0].review_requested_by).toBe("prep");
  });

  it("goes to the firm owner without an engagement reviewer", async () => {
    await lock("rv_1", "prep");
    expect((await ask("prep", "rv_1")).version.reviewRequestedFrom).toBe("own");
  });

  it("goes to every reviewer of the firm when the owner prepared it", async () => {
    await lock("rv_1", "own");
    const { version } = await ask("own", "rv_1");
    expect(version.reviewRequestedAt).toBeTruthy();
    expect(version.reviewRequestedFrom).toBeNull();
  });

  it("skips an engagement reviewer who left the firm, or whose role became preparer, for the owner", async () => {
    await lock("rv_1", "prep");
    await assignReviewer("rev2");
    await db.pg.query(`update firm_members set role = 'preparer' where member_user_id = 'rev2'`);
    expect((await ask("prep", "rv_1")).version.reviewRequestedFrom).toBe("own");

    await lock("rv_2", "prep");
    await db.pg.query(`update firm_members set role = 'reviewer' where member_user_id = 'rev2'`);
    await db.pg.query(`delete from firm_members where member_user_id = 'rev2'`);
    expect((await ask("prep", "rv_2")).version.reviewRequestedFrom).toBe("own");
  });

  it("is refused when nobody else at the firm can review it", async () => {
    await db.pg.query(`update firm_members set role = 'preparer' where role = 'reviewer'`);
    await lock("rv_1", "own");
    await expect(ask("own", "rv_1")).rejects.toMatchObject({
      status: 409,
      message:
        "No one else at the firm can review this version. Give a member the reviewer role on the Firm page, then ask again.",
    });
    expect(NO_ELIGIBLE_REVIEWER).toBe(
      "No one else at the firm can review this version. Give a member the reviewer role on the Firm page, then ask again.",
    );
  });

  it("is refused to anyone but the preparer and the firm owner", async () => {
    await lock("rv_1", "prep");
    await expect(ask("rev", "rv_1")).rejects.toMatchObject({
      status: 403,
      message: "Only the preparer or the firm owner can ask for review of this version.",
    });
    expect(REVIEW_REQUEST_REFUSED).toBe(
      "Only the preparer or the firm owner can ask for review of this version.",
    );
    // An account outside the firm cannot even see the version.
    await expect(ask("out", "rv_1")).rejects.toMatchObject({ status: 404 });
    // The firm owner may ask on the preparer's behalf.
    expect((await ask("own", "rv_1")).version.reviewRequestedAt).toBeTruthy();
  });

  it("is refused on a version already reviewed or returned", async () => {
    await lock("rv_1", "prep");
    await signOffReportVersion(db.sql, {
      ownerUserId: "own",
      id: "rv_1",
      reviewedBy: "rev",
      note: "",
    });
    await expect(ask("prep", "rv_1")).rejects.toMatchObject({
      status: 409,
      message: "This version has already been reviewed for issuance.",
    });
    expect(ALREADY_REVIEWED).toBe("This version has already been reviewed for issuance.");

    await lock("rv_2", "prep");
    await giveBack("rev", "rv_2", "Add the payroll duties.");
    await expect(ask("prep", "rv_2")).rejects.toMatchObject({
      status: 409,
      message: "This version was returned to its preparer. Lock a new version for review.",
    });
    expect(VERSION_RETURNED).toBe(
      "This version was returned to its preparer. Lock a new version for review.",
    );
  });
});

describe("returning a version", () => {
  it("stores the note and who returned it, and the version can no longer be reviewed", async () => {
    await lock("rv_1", "prep");
    await ask("prep", "rv_1");
    const { version } = await giveBack("rev", "rv_1", "  Add the payroll duties.  ");
    expect(version.returnNote).toBe("Add the payroll duties.");
    expect([version.returnedBy, version.returnedAt === null]).toEqual(["rev", false]);
    expect(version.reviewedAt).toBeNull();
    await expect(
      signOffReportVersion(db.sql, { ownerUserId: "own", id: "rv_1", reviewedBy: "own", note: "" }),
    ).rejects.toMatchObject({ status: 409, message: VERSION_RETURNED });
    await expect(giveBack("own", "rv_1", "Again.")).rejects.toMatchObject({
      status: 409,
      message: VERSION_RETURNED,
    });
  });

  it("is refused for the preparer, and for a member without the owner or reviewer role", async () => {
    await lock("rv_1", "own");
    await expect(giveBack("own", "rv_1", "Mine.")).rejects.toMatchObject({
      status: 409,
      message: "The preparer cannot return their own version.",
    });
    expect(PREPARER_CANNOT_RETURN).toBe("The preparer cannot return their own version.");
    await expect(giveBack("prep", "rv_1", "Not mine to return.")).rejects.toMatchObject({
      status: 403,
    });
  });

  it("needs a note of 1 to 600 characters", async () => {
    await lock("rv_1", "prep");
    await expect(giveBack("rev", "rv_1", "   ")).rejects.toMatchObject({
      status: 400,
      message: "Add a note saying what to change.",
    });
    expect(RETURN_NOTE_REQUIRED).toBe("Add a note saying what to change.");
    await expect(giveBack("rev", "rv_1", "x".repeat(601))).rejects.toMatchObject({
      status: 400,
      message: "Keep the note to 600 characters or fewer.",
    });
    expect(RETURN_NOTE_TOO_LONG).toBe("Keep the note to 600 characters or fewer.");
    expect((await giveBack("rev", "rv_1", "x".repeat(600))).version.returnNote).toHaveLength(600);
  });

  it("is refused on a version already reviewed for issuance", async () => {
    await lock("rv_1", "prep");
    await signOffReportVersion(db.sql, {
      ownerUserId: "own",
      id: "rv_1",
      reviewedBy: "rev",
      note: "",
    });
    await expect(giveBack("rev2", "rv_1", "Too late.")).rejects.toMatchObject({
      status: 409,
      message: ALREADY_REVIEWED,
    });
  });
});

describe("an ended engagement", () => {
  it("refuses both the request and the return", async () => {
    await lock("rv_1", "prep");
    await db.pg.query(
      `insert into engagement_marks (user_id, business_id, status, ended_at)
       values ('own', 'biz_1', 'ended', now())`,
    );
    await expect(ask("prep", "rv_1")).rejects.toMatchObject({
      status: 409,
      message: ENGAGEMENT_ENDED,
    });
    await expect(giveBack("rev", "rv_1", "Add the payroll duties.")).rejects.toMatchObject({
      status: 409,
      message: ENGAGEMENT_ENDED,
    });
  });
});
