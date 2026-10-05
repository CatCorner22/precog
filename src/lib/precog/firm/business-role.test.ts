import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { openTestDb, type TestDb } from "@/test/pglite";
import { BUSINESS_ROLE_REFUSED } from "./access.server";
import { lockReportVersion } from "./reports";

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
vi.mock("@/lib/observability/report.server", () => ({
  reportServerError: vi.fn(async () => undefined),
}));

const server = await import("./server");
const review = await import("./review-server");
const engagement = await import("./engagement-server");

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

afterEach(() => {
  vi.unstubAllEnvs();
});

/**
 * Stripe is configured. Firm North (`fo`, on an active Firm plan) has
 * reviewer `rv` and preparer `pp`. `bo` shared biz_1 with North and also
 * owns an empty firm of their own, on no plan. `so` is a solo account with
 * biz_s, on no plan.
 */
beforeEach(async () => {
  vi.stubEnv("STRIPE_SECRET_KEY", "sk_test");
  vi.stubEnv("STRIPE_PRICE_ASSESSMENT", "price_a");
  vi.stubEnv("STRIPE_PRICE_MONTHLY", "price_m");
  await db.clear(
    "product_events",
    "report_versions",
    "engagement_marks",
    "billing_accounts",
    "firm_members",
    "firms",
    "businesses",
    '"user"',
  );
  for (const id of ["fo", "rv", "pp", "bo", "so"]) await db.seedUser(id);
  await db.pg.exec(`
    insert into firms (user_id, name, plan) values ('fo', 'North', 'monthly'), ('bo', 'Bo Firm', 'assessment');
    insert into firm_members (firm_user_id, member_user_id, role) values
      ('fo', 'fo', 'owner'), ('fo', 'rv', 'reviewer'), ('fo', 'pp', 'preparer'),
      ('bo', 'bo', 'owner');
    insert into billing_accounts (user_id, subscription_id, subscription_status)
      values ('fo', 'sub_1', 'active');
    insert into businesses (id, user_id, name, industry, profile, revision, firm_user_id, granted_at)
      values ('biz_1', 'bo', 'Ortiz Dental', 'general', '{}'::jsonb, 1, 'fo', now()),
        ('biz_s', 'so', 'Solo Shop', 'general', '{}'::jsonb, 1, null, null);
  `);
});

async function refusal(work: Promise<unknown>): Promise<{ status: number; message: string }> {
  const err = (await work.then(
    () => null,
    (e: unknown) => e,
  )) as { status: number; message: string } | null;
  if (!err) throw new Error("expected a refusal");
  return { status: err.status, message: err.message };
}

const lockAs = (preparedBy: string, id: string, ownerUserId = "bo", businessId = "biz_1") =>
  lockReportVersion(db.sql, { ownerUserId, businessId, preparedBy, scopeNote: "", id });

describe("the firm's work on a business needs a role in that business's firm", () => {
  it("pins the refusal", () => {
    expect(BUSINESS_ROLE_REFUSED).toBe(
      "The firm working on this business does that. You can read every version it locked.",
    );
  });

  it("refuses a free owner who shared the business: lock, owner email, request, send", async () => {
    const refused = { status: 403, message: BUSINESS_ROLE_REFUSED };
    expect(await refusal(call(server.lockReport, "bo", { businessId: "biz_1" }))).toEqual(refused);
    expect(
      await refusal(
        call(server.setClientOwnerEmail, "bo", { businessId: "biz_1", email: "r@ortiz.test" }),
      ),
    ).toEqual(refused);
    const v = await lockAs("pp", "rv_1");
    expect(await refusal(call(review.requestReportReview, "bo", { id: v.id }))).toEqual(refused);
    await call(server.signOffReport, "rv", { id: v.id });
    expect(await refusal(call(server.markReportSent, "bo", { id: v.id }))).toEqual(refused);
  });

  it("refuses that owner a change to the firm's engagement, and lets a firm member make it", async () => {
    const fields = {
      businessId: "biz_1",
      scope: "Rewritten by the owner",
      periodStart: null,
      periodEnd: null,
      preparerUserId: null,
      reviewerUserId: null,
    };
    expect(await refusal(call(engagement.saveEngagement, "bo", fields))).toEqual({
      status: 403,
      message: BUSINESS_ROLE_REFUSED,
    });
    expect(
      (await db.pg.query("select scope from engagement_marks where business_id = 'biz_1'")).rows,
    ).toEqual([]);
    const saved = (await call(engagement.saveEngagement, "pp", {
      ...fields,
      scope: "Monthly close",
    })) as { engagement: { scope: string } };
    expect(saved.engagement.scope).toBe("Monthly close");
  });

  it("refuses that owner review and return although they own an empty firm of their own", async () => {
    const v = await lockAs("pp", "rv_1");
    const refused = { status: 403, message: BUSINESS_ROLE_REFUSED };
    expect(await refusal(call(server.signOffReport, "bo", { id: v.id }))).toEqual(refused);
    expect(await refusal(call(review.returnReport, "bo", { id: v.id, note: "Fix it" }))).toEqual(
      refused,
    );
  });

  it("lets the firm's reviewer review, and its preparer lock under the firm's plan", async () => {
    const locked = (await call(server.lockReport, "pp", { businessId: "biz_1" })) as {
      version: { id: string; preparedBy: string };
    };
    expect(locked.version.preparedBy).toBe("pp");
    const reviewed = (await call(server.signOffReport, "rv", { id: locked.version.id })) as {
      version: { reviewedBy: string };
    };
    expect(reviewed.version.reviewedBy).toBe("rv");
    await call(server.markReportSent, "pp", { id: locked.version.id });
  });

  it("refuses the firm's preparer a review with the role refusal", async () => {
    const v = await lockAs("fo", "rv_1");
    expect(await refusal(call(server.signOffReport, "pp", { id: v.id }))).toEqual({
      status: 403,
      message: "Only a firm owner or reviewer can do that",
    });
    expect(await refusal(call(review.returnReport, "pp", { id: v.id, note: "Fix it" }))).toEqual({
      status: 403,
      message: "Only a firm owner or reviewer can do that",
    });
  });

  it("keeps a solo business as before: its account locks under its own plan", async () => {
    // A solo account on no plan: the plan refuses, not the role.
    expect((await refusal(call(server.lockReport, "so", { businessId: "biz_s" }))).status).toBe(
      402,
    );
    const v = await lockAs("so", "rv_s", "so", "biz_s");
    // Review without a firm still needs the caller's own firm role.
    expect(await refusal(call(server.signOffReport, "so", { id: v.id }))).toEqual({
      status: 404,
      message: "Set up the firm first",
    });
    vi.unstubAllEnvs();
    const open = (await call(server.lockReport, "so", { businessId: "biz_s" })) as {
      version: { preparedBy: string };
    };
    expect(open.version.preparedBy).toBe("so");
  });
});
