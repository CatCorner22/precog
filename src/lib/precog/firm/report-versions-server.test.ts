import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { Sql } from "@/lib/db";
import { toSql } from "@/lib/sql-transaction";
import { openTestDb, type TestDb } from "@/test/pglite";
import {
  ALREADY_REVIEWED,
  lockReportVersion,
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
  return toSql(async (text, params) => {
    if (!fired && text.includes(marker)) {
      fired = true;
      await between();
    }
    return db.sql.query(text, params);
  });
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
