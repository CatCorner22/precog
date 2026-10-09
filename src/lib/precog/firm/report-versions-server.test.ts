import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { Sql } from "@/lib/db";
import { toSql } from "@/lib/sql-transaction";
import { openTestDb, type TestDb } from "@/test/pglite";
import { defaultProfile } from "../practice-profile";
import { saveEngagement } from "./engagement-store";
import {
  ALREADY_REVIEWED,
  lockReportVersion,
  OVERRIDE_NOTE_REQUIRED,
  requestReportVersionReview,
  returnReportVersion,
  signOffReportVersion,
  VERSION_RETURNED,
} from "./reports";

// The server functions run as plain handlers: the validator, then the
// handler with the caller's id, against this file's PGlite (or a wrapper
// over it that lets another reviewer act between a read and a write).
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
vi.mock("@/lib/observability/report.server", () => ({
  reportServerError: vi.fn(async () => undefined),
}));

const server = await import("./server");

type Call = (args: {
  context: { userId: string };
  data: Record<string, unknown>;
}) => Promise<unknown>;
const call = (fn: unknown, userId: string, data: Record<string, unknown>) =>
  (fn as Call)({ context: { userId }, data });

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
 * with client `biz_1` under the owner's account.
 */
beforeEach(async () => {
  ref.db = db;
  await db.clear(
    "report_versions",
    "engagement_marks",
    "firm_members",
    "firms",
    "businesses",
    '"user"',
  );
  for (const id of ["own", "rev", "rev2", "prep"]) await db.seedUser(id);
  await db.pg.exec(`
    insert into firms (user_id, name) values ('own', 'North Advisors');
    insert into firm_members (firm_user_id, member_user_id, role) values
      ('own', 'own', 'owner'), ('own', 'rev', 'reviewer'),
      ('own', 'rev2', 'reviewer'), ('own', 'prep', 'preparer');
    insert into businesses (id, user_id, name, industry, profile, revision, firm_user_id) values
      ('biz_1', 'own', 'Client', 'general', '{}'::jsonb, 1, 'own');
  `);
});

const lock = (id: string, preparedBy = "prep") =>
  lockReportVersion(db.sql, {
    ownerUserId: "own",
    businessId: "biz_1",
    preparedBy,
    scopeNote: "",
    id,
  });

/**
 * This file's database, except that `between` runs once, on the real
 * database, just before the first statement whose text holds `marker`: the
 * other reviewer acts after the caller's read and before its write.
 */
function racing(marker: string, between: () => Promise<unknown>): Sql {
  let fired = false;
  const sql = toSql(async (text, params) => {
    if (!fired && text.includes(marker)) {
      fired = true;
      await between();
    }
    return db.sql.query(text, params);
  });
  // A write inside a transaction: the other reviewer acts just before the
  // unit opens, after the caller's read. The embedded database runs one
  // connection, so nothing can act while the unit is open; on PostgreSQL the
  // unit's row lock makes the other reviewer wait for it instead.
  sql.transaction = async (work) => {
    if (!fired) {
      fired = true;
      await between();
    }
    return db.sql.transaction!(work);
  };
  return sql;
}

const returnedBy =
  (reviewer: string, id = "rv_1") =>
  () =>
    returnReportVersion(db.sql, { ownerUserId: "own", id, returnedBy: reviewer, note: "Fix it" });
const reviewedBy =
  (reviewer: string, id = "rv_1") =>
  () =>
    signOffReportVersion(db.sql, { ownerUserId: "own", id, reviewedBy: reviewer, note: "" });

async function refusal(work: Promise<unknown>): Promise<{ status: number; message: string }> {
  const err = (await work.then(
    () => null,
    (e: unknown) => e,
  )) as { status: number; message: string } | null;
  if (!err) throw new Error("expected a refusal");
  return { status: err.status, message: err.message };
}

describe("a reviewer acting between the read and the write", () => {
  it("requires the override note when the client's reviewer was reassigned meanwhile", async () => {
    await lock("rv_1");
    const assign = (reviewerUserId: string) =>
      saveEngagement(db.sql, {
        ownerUserId: "own",
        businessId: "biz_1",
        actorUserId: "own",
        scope: "Monthly review",
        periodStart: "2026-09-01",
        periodEnd: "2026-09-30",
        preparerUserId: "prep",
        reviewerUserId,
      });
    await assign("rev");
    // rev is the assigned reviewer when the sign-off reads the version; the
    // owner reassigns the client to rev2 before the sign-off's write.
    const sql = racing("set reviewed_by", () => assign("rev2"));
    expect(
      await refusal(
        signOffReportVersion(sql, { ownerUserId: "own", id: "rv_1", reviewedBy: "rev", note: "" }),
      ),
    ).toEqual({ status: 400, message: OVERRIDE_NOTE_REQUIRED });
    const [row] = await db.sql<{ reviewed_by: string | null; review_override_note: string | null }>`
      select reviewed_by, review_override_note from report_versions where id = 'rv_1'
    `;
    expect(row).toEqual({ reviewed_by: null, review_override_note: null });
    // With the note, rev reviews in rev2's place and the note is stored.
    const signed = await signOffReportVersion(db.sql, {
      ownerUserId: "own",
      id: "rv_1",
      reviewedBy: "rev",
      note: "",
      overrideNote: "rev2 is out this week; the client asked for the file today.",
    });
    expect(signed.reviewedBy).toBe("rev");
    expect(signed.reviewOverrideNote).toContain("rev2 is out this week");
  });

  it("refuses a review for issuance of a version returned meanwhile, and stores no review", async () => {
    await lock("rv_1");
    const sql = racing("set reviewed_by", returnedBy("rev"));
    expect(
      await refusal(
        signOffReportVersion(sql, { ownerUserId: "own", id: "rv_1", reviewedBy: "rev2", note: "" }),
      ),
    ).toEqual({ status: 409, message: VERSION_RETURNED });
    const stored = await db.pg.query<{ reviewed_by: string | null; returned_by: string | null }>(
      "select reviewed_by, returned_by from report_versions where id = 'rv_1'",
    );
    expect(stored.rows).toEqual([{ reviewed_by: null, returned_by: "rev" }]);
  });

  it("refuses a second review for issuance as the stale read would have", async () => {
    await lock("rv_1");
    const sql = racing("set reviewed_by", reviewedBy("rev"));
    expect(
      await refusal(
        signOffReportVersion(sql, { ownerUserId: "own", id: "rv_1", reviewedBy: "rev2", note: "" }),
      ),
    ).toEqual({ status: 409, message: "Someone has already reviewed this version for issuance" });
    const stored = await db.pg.query<{ reviewed_by: string }>(
      "select reviewed_by from report_versions where id = 'rv_1'",
    );
    expect(stored.rows[0].reviewed_by).toBe("rev");
  });

  it("says a request for review met a version returned meanwhile, not a reviewed one", async () => {
    await lock("rv_1");
    const sql = racing("set review_requested_at", returnedBy("rev"));
    expect(
      await refusal(
        requestReportVersionReview(sql, { ownerUserId: "own", id: "rv_1", requestedBy: "prep" }),
      ),
    ).toEqual({ status: 409, message: VERSION_RETURNED });
    // A review for issuance landing in the same window still reads as reviewed.
    await lock("rv_2");
    const signed = racing("set review_requested_at", reviewedBy("rev", "rv_2"));
    expect(
      await refusal(
        requestReportVersionReview(signed, { ownerUserId: "own", id: "rv_2", requestedBy: "prep" }),
      ),
    ).toEqual({ status: 409, message: ALREADY_REVIEWED });
  });

  it("says a return met a version another reviewer returned meanwhile", async () => {
    await lock("rv_1");
    const sql = racing("set returned_at", returnedBy("rev"));
    expect(
      await refusal(
        returnReportVersion(sql, {
          ownerUserId: "own",
          id: "rv_1",
          returnedBy: "rev2",
          note: "No",
        }),
      ),
    ).toEqual({ status: 409, message: VERSION_RETURNED });
    const stored = await db.pg.query<{ returned_by: string; return_note: string }>(
      "select returned_by, return_note from report_versions where id = 'rv_1'",
    );
    expect(stored.rows).toEqual([{ returned_by: "rev", return_note: "Fix it" }]);
  });

  it("writes no review to the activity log when the version was returned meanwhile", async () => {
    await lock("rv_1");
    ref.db = { sql: racing("set reviewed_by", returnedBy("rev")) };
    expect(await refusal(call(server.signOffReport, "rev2", { id: "rv_1" }))).toEqual({
      status: 409,
      message: VERSION_RETURNED,
    });
    const events = await db.pg.query<{ event: string }>(
      "select event from firm_audit_log where business_id = 'biz_1' order by id",
    );
    expect(events.rows.map((r) => r.event)).not.toContain("version_reviewed");
  });
});

describe("the firm a version names when it froze none", () => {
  /** `bo` owns biz_b, outside any firm until it is shared with North below. */
  beforeEach(async () => {
    await db.seedUser("bo");
    await db.pg.query(
      `insert into businesses (id, user_id, name, industry, profile, revision) values
         ('biz_b', 'bo', 'Bo Shop', 'dental', $1::jsonb, 1)`,
      [JSON.stringify({ ...defaultProfile("dental"), practiceName: "Bo Shop" })],
    );
  });

  type Loaded = { firm: { name: string } | null };
  const open = (userId: string, id: string) =>
    call(server.getReport, userId, { id, today: "2026-10-05" }) as Promise<Loaded>;

  it("names no firm on a version its owner locked alone, after the business is shared", async () => {
    await lockReportVersion(db.sql, {
      ownerUserId: "bo",
      businessId: "biz_b",
      preparedBy: "bo",
      scopeNote: "",
      id: "rv_alone",
    });
    expect((await open("bo", "rv_alone")).firm).toBeNull();
    await db.pg.exec(
      "update businesses set firm_user_id = 'own', granted_at = now() where id = 'biz_b'",
    );
    expect((await open("bo", "rv_alone")).firm).toBeNull();
    // A version the firm locks from then on prints the firm as frozen.
    await lockReportVersion(db.sql, {
      ownerUserId: "bo",
      businessId: "biz_b",
      preparedBy: "prep",
      scopeNote: "",
      id: "rv_firm",
    });
    expect((await open("bo", "rv_firm")).firm?.name).toBe("North Advisors");
    expect((await open("prep", "rv_firm")).firm?.name).toBe("North Advisors");
  });

  it("names the firm's current name on a version locked before the firm was frozen in", async () => {
    // Inserted as such: the frozen-column trigger (migration 0048) refuses
    // clearing firm_name on a locked version.
    await db.pg.query(
      `insert into report_versions (id, user_id, business_id, version_no, profile, firm_name)
       values ('rv_old', 'own', 'biz_1', 1, $1::jsonb, null)`,
      [JSON.stringify({ ...defaultProfile("dental"), practiceName: "Client" })],
    );
    expect((await open("own", "rv_old")).firm?.name).toBe("North Advisors");
    expect((await open("rev", "rv_old")).firm?.name).toBe("North Advisors");
  });
});

describe("the versions list tells the panel what work the caller does on the business", () => {
  /**
   * `bo` shared biz_b with North and owns an empty firm of their own; `so`
   * owns biz_s and is in no firm; `prep` keeps a private business, prep_own.
   */
  beforeEach(async () => {
    for (const id of ["bo", "so"]) await db.seedUser(id);
    await db.pg.exec(`
      insert into firms (user_id, name) values ('bo', 'Bo Firm');
      insert into firm_members (firm_user_id, member_user_id, role) values ('bo', 'bo', 'owner');
      insert into businesses (id, user_id, name, industry, profile, revision, firm_user_id, granted_at)
        values ('biz_b', 'bo', 'Bo Shop', 'general', '{}'::jsonb, 1, 'own', now()),
          ('biz_s', 'so', 'Solo Shop', 'general', '{}'::jsonb, 1, null, null),
          ('prep_own', 'prep', 'Prep Own', 'general', '{}'::jsonb, 1, null, null);
    `);
  });

  type Listed = { versions: { id: string }[]; work: { firm: boolean; role: string | null } };
  const list = (userId: string, businessId: string) =>
    call(server.listReports, userId, { businessId }) as Promise<Listed>;

  it("gives the business's own account, which shared it, no role, though it owns a firm", async () => {
    await lockReportVersion(db.sql, {
      ownerUserId: "bo",
      businessId: "biz_b",
      preparedBy: "prep",
      scopeNote: "",
      id: "rv_1",
    });
    const own = await list("bo", "biz_b");
    expect(own.work).toEqual({ firm: true, role: null });
    // It reads every version all the same.
    expect(own.versions.map((v) => v.id)).toEqual(["rv_1"]);
  });

  it("gives a member of the business's firm their role there", async () => {
    expect((await list("rev", "biz_b")).work).toEqual({ firm: true, role: "reviewer" });
    expect((await list("prep", "biz_1")).work).toEqual({ firm: true, role: "preparer" });
    expect((await list("own", "biz_1")).work).toEqual({ firm: true, role: "owner" });
  });

  it("gives a business with no firm the caller's own firm role, or none", async () => {
    expect((await list("so", "biz_s")).work).toEqual({ firm: false, role: null });
    expect((await list("prep", "prep_own")).work).toEqual({ firm: false, role: "preparer" });
  });
});

describe("the client list's sent date", () => {
  type Listed = { clients: { id: string; reportSentAt: string | null }[] };
  const sentAt = async () =>
    ((await call(server.listFirmClients, "own", {})) as Listed).clients.find(
      (c) => c.id === "biz_1",
    )?.reportSentAt ?? null;
  const pageOpen = (reportSentAt: string) =>
    call(server.recordEngagement, "own", {
      businessId: "biz_1",
      reportSentAt,
      openFindings: 2,
      acceptedFindings: 0,
    });

  it("takes no sent date from the browser, only from a reviewed version marked sent", async () => {
    await pageOpen("2026-09-01T00:00:00.000Z");
    expect(await sentAt()).toBeNull();

    await lock("rv_1");
    await reviewedBy("rev")();
    await call(server.markReportSent, "own", { id: "rv_1" });
    const stamped = await sentAt();
    expect(stamped).not.toBeNull();

    await pageOpen("2026-09-02T00:00:00.000Z");
    expect(await sentAt()).toBe(stamped);
  });
});
