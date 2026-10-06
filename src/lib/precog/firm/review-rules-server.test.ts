import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { RequestError } from "@/lib/request-errors";
import { openTestDb, type TestDb } from "@/test/pglite";
import { lockReportVersion, WITHDRAW_AFTER_SENT, WITHDRAW_REFUSED } from "./reports";

/**
 * The review rules as the server functions apply them (CPA-8, CPA-13,
 * SEC-5): only the firm owner sets the engagement's assignments and scope,
 * the versions list carries the rules the panel offers, a review is
 * withdrawn with a log row, and a stale session cannot transfer the firm.
 * The handlers run as plain functions against this file's PGlite; the
 * recent-sign-in check is a stand-in (fresh-session.test.ts covers it).
 */
const ref = vi.hoisted(() => ({ db: null as null | { sql: unknown } }));
const session = vi.hoisted(() => ({
  fresh: true,
  asked: [] as { userId: string; message: string }[],
}));
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
vi.mock("@/lib/auth/fresh-session", () => ({
  requireFreshSession: async (options: { userId: string; message: string }) => {
    session.asked.push({ userId: options.userId, message: options.message });
    if (!session.fresh) throw new RequestError(403, options.message);
    return { email: null };
  },
}));
vi.mock("@/lib/db", () => ({ getSql: async () => ref.db?.sql }));
vi.mock("@/lib/observability/report.server", () => ({
  reportServerError: vi.fn(async () => undefined),
}));

const server = await import("./server");
const engagement = await import("./engagement-server");

type Call = (args: { context: { userId: string }; data: unknown }) => Promise<unknown>;
const call = <T = unknown>(fn: unknown, userId: string, data: unknown = {}) =>
  (fn as Call)({ context: { userId }, data }) as Promise<T>;

async function refusal(work: Promise<unknown>): Promise<{ status: number; message: string }> {
  const err = (await work.then(
    () => null,
    (e: unknown) => e,
  )) as { status: number; message: string } | null;
  if (!err) throw new Error("expected a refusal");
  return { status: err.status, message: err.message };
}

let db: TestDb;

beforeAll(async () => {
  db = await openTestDb();
  ref.db = db;
}, 60_000);

afterAll(async () => {
  await db.close();
});

/** Firm North: owner `fo`, reviewer `rv`, preparer `pp`; client `biz_1` under `fo`. */
beforeEach(async () => {
  session.fresh = true;
  session.asked = [];
  await db.clear(
    "firm_audit_log",
    "report_versions",
    "engagement_marks",
    "billing_accounts",
    "firm_members",
    "firms",
    "businesses",
    '"user"',
  );
  for (const id of ["fo", "rv", "pp"]) await db.seedUser(id);
  await db.pg.exec(`
    insert into firms (user_id, name) values ('fo', 'North');
    insert into firm_members (firm_user_id, member_user_id, role) values
      ('fo', 'fo', 'owner'), ('fo', 'rv', 'reviewer'), ('fo', 'pp', 'preparer');
    insert into businesses (id, user_id, name, industry, profile, revision, firm_user_id)
      values ('biz_1', 'fo', 'Ortiz Dental', 'general', '{}'::jsonb, 1, 'fo');
  `);
});

const lock = (id: string, preparedBy = "pp") =>
  lockReportVersion(db.sql, {
    ownerUserId: "fo",
    businessId: "biz_1",
    preparedBy,
    scopeNote: "",
    id,
  });

const fields = {
  businessId: "biz_1",
  scope: "Monthly close",
  periodStart: null,
  periodEnd: null,
  preparerUserId: "pp",
  reviewerUserId: "rv",
};

describe("the engagement's assignments and scope", () => {
  it("refuses a preparer who sets the reviewer, and the firm owner sets it", async () => {
    expect(
      await refusal(call(engagement.saveEngagement, "pp", { ...fields, reviewerUserId: "fo" })),
    ).toEqual({ status: 403, message: "Only a firm owner can do that" });
    expect(await refusal(call(engagement.saveEngagement, "rv", fields))).toEqual({
      status: 403,
      message: "Only a firm owner can do that",
    });
    const saved = await call<{ engagement: { reviewerUserId: string | null } }>(
      engagement.saveEngagement,
      "fo",
      fields,
    );
    expect(saved.engagement.reviewerUserId).toBe("rv");
  });
});

describe("the review rules the versions list carries", () => {
  type Listed = {
    review: { canIssueAlone: boolean; issueAloneReason: string; assignedReviewerUserId: string };
  };
  const rules = async (userId: string) =>
    (await call<Listed>(server.listReports, userId, { businessId: "biz_1" })).review;

  it("names the assigned reviewer and whether the caller may issue alone", async () => {
    expect(await rules("fo")).toEqual({
      canIssueAlone: false,
      issueAloneReason: "A different person at the firm must review this report for issuance",
      assignedReviewerUserId: null,
    });
    await call(engagement.saveEngagement, "fo", fields);
    expect((await rules("pp")).assignedReviewerUserId).toBe("rv");
    // Without the reviewer, the owner's only colleague is a preparer.
    await db.pg.query(`delete from firm_members where member_user_id = 'rv'`);
    expect(await rules("fo")).toEqual({
      canIssueAlone: true,
      issueAloneReason:
        'No one else at the firm holds the owner or reviewer role, so you can issue this version alone. It prints as "Not an independent review".',
      assignedReviewerUserId: null,
    });
    expect((await rules("pp")).canIssueAlone).toBe(false);
  });
});

describe("a review in the assigned reviewer's place", () => {
  it("needs the override note, and logs that one was given", async () => {
    await call(engagement.saveEngagement, "fo", fields);
    await lock("rv_1");
    expect((await refusal(call(server.signOffReport, "fo", { id: "rv_1" }))).status).toBe(400);
    const { version } = await call<{ version: { reviewOverrideNote: string | null } }>(
      server.signOffReport,
      "fo",
      { id: "rv_1", overrideNote: "Reviewer is on leave this month." },
    );
    expect(version.reviewOverrideNote).toBe("Reviewer is on leave this month.");
    const rows = await db.pg.query<{ event: string; detail: Record<string, unknown> }>(
      `select event, detail from firm_audit_log where event = 'version_reviewed'`,
    );
    expect(rows.rows).toEqual([
      {
        event: "version_reviewed",
        detail: { versionId: "rv_1", versionNo: 1, inPlaceOfAssignedReviewer: true },
      },
    ]);
  });

  it("lets the owner of an owner-plus-preparer firm issue alone through the server", async () => {
    await db.pg.query(`delete from firm_members where member_user_id = 'rv'`);
    await lock("rv_1", "fo");
    const { version } = await call<{ version: { reviewNote: string } }>(
      server.signOffReport,
      "fo",
      { id: "rv_1", note: "Checked twice.", issueWithoutIndependentReview: true },
    );
    expect(version.reviewNote).toBe("Not an independent review. Checked twice.");
  });
});

describe("withdrawReportReview", () => {
  it("withdraws before the version is sent, writes the log, and refuses after", async () => {
    await lock("rv_1");
    await call(server.signOffReport, "rv", { id: "rv_1" });
    expect(await refusal(call(server.withdrawReportReview, "pp", { id: "rv_1" }))).toEqual({
      status: 403,
      message: WITHDRAW_REFUSED,
    });
    const { version } = await call<{ version: { reviewedAt: string | null } }>(
      server.withdrawReportReview,
      "fo",
      { id: "rv_1" },
    );
    expect(version.reviewedAt).toBeNull();
    const rows = await db.pg.query<{
      event: string;
      actor_user_id: string;
      subject_user_id: string;
      business_id: string;
      detail: Record<string, unknown>;
    }>(
      `select event, actor_user_id, subject_user_id, business_id, detail from firm_audit_log
       where event = 'version_review_withdrawn'`,
    );
    expect(rows.rows).toEqual([
      {
        event: "version_review_withdrawn",
        actor_user_id: "fo",
        subject_user_id: "rv",
        business_id: "biz_1",
        detail: { versionId: "rv_1", versionNo: 1 },
      },
    ]);
    await call(server.signOffReport, "rv", { id: "rv_1" });
    await call(server.markReportSent, "pp", { id: "rv_1" });
    expect(await refusal(call(server.withdrawReportReview, "rv", { id: "rv_1" }))).toEqual({
      status: 409,
      message: WITHDRAW_AFTER_SENT,
    });
  });
});

describe("transferFirmOwnership", () => {
  it("refuses a stale session, and moves nothing", async () => {
    session.fresh = false;
    expect(await refusal(call(server.transferFirmOwnership, "fo", { userId: "rv" }))).toEqual({
      status: 403,
      message: "For your safety, sign in again, then transfer the firm.",
    });
    expect(server.SIGN_IN_AGAIN_TO_TRANSFER).toBe(
      "For your safety, sign in again, then transfer the firm.",
    );
    expect(session.asked).toEqual([
      { userId: "fo", message: "For your safety, sign in again, then transfer the firm." },
    ]);
    const firms = await db.pg.query<{ user_id: string }>("select user_id from firms");
    expect(firms.rows).toEqual([{ user_id: "fo" }]);
    const log = await db.pg.query("select 1 from firm_audit_log");
    expect(log.rows).toEqual([]);
  });

  it("transfers with a recent sign-in", async () => {
    await call(server.transferFirmOwnership, "fo", { userId: "rv" });
    const firms = await db.pg.query<{ user_id: string }>("select user_id from firms");
    expect(firms.rows).toEqual([{ user_id: "rv" }]);
  });
});
