import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { openTestDb, type TestDb } from "@/test/pglite";
import { defaultProfile } from "./practice-profile";

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
vi.mock("@/lib/observability/report.server", () => ({ reportServerError: vi.fn() }));

const { saveBusinessProfile } = await import("./profile-server");
const { restoreDeletedClient } = await import("./firm/server");

type Call = (args: { context: { userId: string }; data: unknown }) => Promise<unknown>;
const call = (fn: unknown, userId: string, data: unknown) =>
  (fn as Call)({ context: { userId }, data });

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

afterEach(() => {
  vi.unstubAllEnvs();
});

/**
 * Firm North (owner `fo`, preparer `pp`) on the Starter tier, holding its
 * five clients; c5 deleted, so the restore refusal reads with four live
 * plus a sixth new one.
 */
beforeEach(async () => {
  vi.stubEnv("STRIPE_SECRET_KEY", "sk_test");
  vi.stubEnv("STRIPE_PRICE_ASSESSMENT", "price_a");
  vi.stubEnv("STRIPE_PRICE_MONTHLY", "price_m");
  vi.stubEnv("STRIPE_PRICE_TIER_1", "price_t1");
  await db.clear(
    "business_deletion_markers",
    "billing_accounts",
    "firm_members",
    "firms",
    "businesses",
    '"user"',
  );
  for (const id of ["fo", "pp"]) await db.seedUser(id);
  await db.pg.exec(`
    insert into firms (user_id, name, plan) values ('fo', 'North', 'monthly');
    insert into firm_members (firm_user_id, member_user_id, role)
      values ('fo', 'fo', 'owner'), ('fo', 'pp', 'preparer');
    insert into billing_accounts (user_id, subscription_id, subscription_status, subscription_price_id)
      values ('fo', 'sub_1', 'active', 'price_t1');
    insert into businesses (id, user_id, name, industry, profile, revision, firm_user_id)
      select 'c' || n, 'fo', 'Client ' || n, 'general', '{}'::jsonb, 1, 'fo'
      from generate_series(1, 5) n;
  `);
});

const save = (userId: string) =>
  call(saveBusinessProfile, userId, {
    expectedAccountId: userId,
    profile: { ...defaultProfile("dental"), practiceName: "Sixth", businessId: "biz_new" },
  });

describe("the tier's limit on a new or restored client", () => {
  it("tells the firm owner to move up a tier in Manage billing", async () => {
    expect(await refusal(save("fo"))).toEqual({
      status: 402,
      message:
        "Your firm's Starter tier holds 5 client businesses. Move up a tier in Manage billing on the Firm page, or delete a client you no longer need.",
    });
  });

  it("tells a member to ask the firm owner, who alone opens Manage billing", async () => {
    expect(await refusal(save("pp"))).toEqual({
      status: 402,
      message:
        "Your firm's Starter tier holds 5 client businesses. Ask the firm owner to move up a tier, or to delete a client the firm no longer needs.",
    });
  });

  it("refuses a restore past the tier's limit the same way, by role", async () => {
    await db.pg.exec(`
      update businesses set deleted_at = now() where id = 'c5';
      insert into businesses (id, user_id, name, industry, profile, revision, firm_user_id)
        values ('c6', 'pp', 'Client 6', 'general', '{}'::jsonb, 1, 'fo');
    `);
    expect((await refusal(call(restoreDeletedClient, "fo", { businessId: "c5" }))).message).toBe(
      "Your firm's Starter tier holds 5 client businesses. Move up a tier in Manage billing on the Firm page, or delete a client you no longer need.",
    );
    expect((await refusal(call(restoreDeletedClient, "pp", { businessId: "c5" }))).message).toBe(
      "Your firm's Starter tier holds 5 client businesses. Ask the firm owner to move up a tier, or to delete a client the firm no longer needs.",
    );
  });
});
