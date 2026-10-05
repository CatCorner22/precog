import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { openTestDb, type TestDb } from "@/test/pglite";
import { NO_RUNNING_SUBSCRIPTION } from "../firm/billing-store";
import type { Entitlements } from "../firm/entitlements";

// The server functions run as plain handlers: the validator, then the
// handler with the caller's id, against this file's PGlite.
const ref = vi.hoisted(() => ({ db: null as null | { sql: unknown } }));
const report = vi.hoisted(() => ({ error: vi.fn(async (_err: unknown, _at?: string) => {}) }));
const audit = vi.hoisted(() => ({ fail: false }));
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
vi.mock("@/lib/observability/report.server", () => ({ reportServerError: report.error }));
vi.mock("../firm/audit.server", async (importOriginal) => {
  const original = await importOriginal<typeof import("../firm/audit.server")>();
  return {
    ...original,
    insertAudit: async (...args: Parameters<typeof original.insertAudit>) => {
      if (audit.fail) throw new Error("audit insert failed");
      return original.insertAudit(...args);
    },
  };
});

const server = await import("./server");
const texts = await import("./texts");
const { applyBillingEvent } = await import("../billing/webhook");

type Call = (args: { context: { userId: string }; data: unknown }) => Promise<unknown>;
const call = <T = unknown>(fn: unknown, userId: string, data: unknown = {}) =>
  (fn as Call)({ context: { userId }, data }) as Promise<T>;

let db: TestDb;

beforeAll(async () => {
  db = await openTestDb();
  ref.db = db;
}, 60_000);

afterAll(async () => {
  await db.close();
});

/**
 * `op` is the operator. Firm North: owner `fo`, member `pp`; `so` is in no
 * firm. `hm` owns a firm marked "monthly" by hand with no billing row.
 */
beforeEach(async () => {
  report.error.mockClear();
  audit.fail = false;
  vi.stubEnv("PRECOG_OPERATOR_IDS", "op, other-op");
  for (const name of ["STRIPE_SECRET_KEY", "STRIPE_PRICE_ASSESSMENT", "STRIPE_PRICE_MONTHLY"]) {
    vi.stubEnv(name, "");
  }
  await db.clear(
    "llm_daily_usage",
    "product_events",
    "reminder_log",
    "email_suppressions",
    "notification_settings",
    "billing_events",
    "billing_accounts",
    "integration_connections",
    "report_versions",
    "engagement_marks",
    "firm_members",
    "firms",
    "businesses",
    "account",
    '"user"',
  );
  for (const id of ["op", "fo", "pp", "so", "hm"]) await db.seedUser(id);
  await db.pg.exec(`
    update "user" set name = 'Olive Operator' where id = 'op';
    update "user" set name = 'Fay Owner', email = 'Fay@Firm.test' where id = 'fo';
    insert into firms (user_id, name) values ('fo', 'North'), ('hm', 'Hand');
    update firms set plan = 'monthly' where user_id = 'hm';
    insert into firm_members (firm_user_id, member_user_id, role) values
      ('fo', 'fo', 'owner'), ('fo', 'pp', 'preparer'), ('hm', 'hm', 'owner');
    insert into account (id, "accountId", "providerId", "userId", "updatedAt") values
      ('a1', 'g1', 'grok-google', 'fo', now()), ('a2', 'c1', 'credential', 'fo', now());
  `);
  await db.pg.query(
    `insert into businesses (id, user_id, name, industry, profile, revision, firm_user_id, deleted_at)
     values ('b1', 'fo', 'One', 'dental', '{}'::jsonb, 1, 'fo', null),
            ('b2', 'pp', 'Two', 'dental', '{}'::jsonb, 1, 'fo', null),
            ('b3', 'fo', 'Three', 'dental', '{}'::jsonb, 1, 'fo', now()),
            ('b4', 'so', 'Solo', 'dental', '{}'::jsonb, 1, null, null)`,
  );
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

async function log(): Promise<{ firm: string; actor: string; event: string; subject: string }[]> {
  return db.sql`
    select firm_user_id as firm, actor_user_id as actor, event, subject_user_id as subject
    from firm_audit_log order by id
  `;
}

function stripeOn() {
  vi.stubEnv("STRIPE_SECRET_KEY", "sk_test");
  vi.stubEnv("STRIPE_PRICE_ASSESSMENT", "price_a");
  vi.stubEnv("STRIPE_PRICE_MONTHLY", "price_m");
}

/**
 * Stripe answering the subscription list with `subscriptions` (given newest
 * first, cut at the request's limit, as Stripe pages), and any POST with {}.
 */
function stripeAnswers(subscriptions: Record<string, unknown>[]) {
  const fetchMock = vi.fn(async (url: string, init?: { method?: string }) => {
    if (init?.method === "GET" && url.includes("/v1/subscriptions?customer=")) {
      const limit = Number(new URL(url).searchParams.get("limit") ?? 10);
      return new Response(JSON.stringify({ data: subscriptions.slice(0, limit) }), {
        status: 200,
      });
    }
    return new Response("{}", { status: 200 });
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

const RUNNING = {
  id: "sub_1",
  status: "active",
  created: 1_790_000_000,
  current_period_end: 1_793_000_000,
  items: { data: [{ price: { id: "price_m" } }] },
};

describe("the operator gate", () => {
  const calls: [string, unknown, unknown][] = [
    ["getOperatorStatus", server.getOperatorStatus, {}],
    ["findOperatorAccount", server.findOperatorAccount, { email: "so@example.test" }],
    ["runOperatorCount", server.runOperatorCount, { name: "past-due" }],
    [
      "linkStripeCustomerForAccount",
      server.linkStripeCustomerForAccount,
      { userId: "so", customerId: "cus_1", replace: false },
    ],
    ["liftDailyCapToday", server.liftDailyCapToday, { userId: "so" }],
  ];

  it.each(calls)("%s answers 404 to an account that is not an operator", async (_, fn, data) => {
    await expect(call(fn, "fo", data)).rejects.toMatchObject({ status: 404, message: "Not found" });
  });

  it.each(calls)("%s answers 404 to everyone while the list is unset", async (_, fn, data) => {
    vi.stubEnv("PRECOG_OPERATOR_IDS", "");
    await expect(call(fn, "op", data)).rejects.toMatchObject({ status: 404 });
  });

  it("answers 404 before reading a malformed input", async () => {
    await expect(call(server.findOperatorAccount, "fo", null)).rejects.toMatchObject({
      status: 404,
    });
    await expect(call(server.findOperatorAccount, "op", null)).rejects.toMatchObject({
      status: 400,
    });
  });

  it("knows an operator by the listed user ids", async () => {
    await expect(call(server.getOperatorStatus, "op")).resolves.toEqual({ operator: true });
    await expect(call(server.getOperatorStatus, "other-op")).resolves.toEqual({ operator: true });
  });
});

describe("findOperatorAccount", () => {
  it("is a POST, so the address never sits in a URL", () => {
    const source = readFileSync(join(process.cwd(), "src/lib/precog/operator/server.ts"), "utf8");
    expect(source).toContain(
      'export const findOperatorAccount = createServerFn({ method: "POST" })',
    );
    const ids = JSON.parse(
      readFileSync(join(process.cwd(), "scripts/server-fn-ids.json"), "utf8"),
    ) as Record<string, string>;
    expect(Object.keys(ids)).toEqual(
      expect.arrayContaining([
        "src/lib/precog/operator/server.ts#getOperatorStatus",
        "src/lib/precog/operator/server.ts#findOperatorAccount",
        "src/lib/precog/operator/server.ts#runOperatorCount",
        "src/lib/precog/operator/server.ts#linkStripeCustomerForAccount",
        "src/lib/precog/operator/server.ts#liftDailyCapToday",
      ]),
    );
  });

  it("finds by the exact address, case aside, and never by a prefix", async () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    const found = await call<{ account: { userId: string } | null }>(
      server.findOperatorAccount,
      "op",
      { email: "  fay@firm.TEST " },
    );
    expect(found.account?.userId).toBe("fo");
    const prefix = await call<{ account: unknown }>(server.findOperatorAccount, "op", {
      email: "fay@firm",
    });
    expect(prefix.account).toBeNull();
    expect(info).toHaveBeenCalledWith("[operator] lookup", "fo", "by", "op");
    expect(info).toHaveBeenCalledWith("[operator] lookup", "no-match", "by", "op");
  });

  it("answers the account's support facts and logs the lookup to its firm", async () => {
    await db.pg.exec(`
      insert into llm_daily_usage (scope, day, calls) values ('user:fo', current_date, 37),
        ('user:fo', current_date - 1, 99);
      insert into reminder_log (user_id, business_id, item_key, due_on, recipient, sent_at)
        values ('fo', 'b1', 'k', null, 'Fay@Firm.test', '2026-09-28T12:00:00Z');
      insert into integration_connections (user_id, business_id, provider, realm_id,
        access_token_enc, refresh_token_enc, access_expires_at, refresh_expires_at,
        last_error, last_error_at)
        values ('pp', 'b2', 'qbo', 'r', 'x', 'y', now(), now() + interval '90 days',
          'invalid_grant', '2026-10-01T12:00:00Z');
      insert into email_suppressions (email, reason) values ('fay@firm.test', 'bounced');
      insert into product_events (user_id, event, occurred_at)
        values ('fo', 'first_business', '2026-09-01T12:00:00Z');
    `);
    const { account } = await call<{ account: import("./texts").OperatorAccount }>(
      server.findOperatorAccount,
      "op",
      { email: "fay@firm.test" },
    );
    expect(account).toMatchObject({
      userId: "fo",
      name: "Fay Owner",
      emailVerified: true,
      providers: ["credential", "grok-google"],
      firm: { firmUserId: "fo", name: "North", role: "owner" },
      businesses: { live: 2, deleted: 1 },
      stripeCustomerId: null,
      subscriptionLabel: "None",
      // Without Stripe every account has every feature and the paid allowance.
      planLabel: "Everything open (billing is not connected on this deployment)",
      lastDigest: { recipient: "Fay@Firm.test" },
      suppression: "bounced",
      quickBooksFailure: { error: "invalid_grant" },
      modelCalls: { today: 37, limit: 400 },
      milestones: [{ event: "first_business" }],
    });
    expect(await log()).toEqual([
      { firm: "fo", actor: "op", event: "operator_lookup", subject: "fo" },
    ]);
  });

  it("names the stored plan once billing is connected", async () => {
    stripeOn();
    const { account } = await call<{ account: import("./texts").OperatorAccount }>(
      server.findOperatorAccount,
      "op",
      { email: "fay@firm.test" },
    );
    expect(account.planLabel).toBe("Free");
    expect(account.modelCalls.limit).toBe(100);
  });

  it("reads the last weekly digest, never an owner reminder sent to the same address", async () => {
    await db.pg.query(
      `insert into businesses (id, user_id, name, industry, profile, revision, firm_user_id, deleted_at)
       values ('b5', 'hm', 'Elsewhere', 'dental', '{}'::jsonb, 1, 'hm', null)`,
    );
    await db.pg.exec(`
      insert into engagement_marks (user_id, business_id, owner_email)
        values ('hm', 'b5', 'fay@firm.test'), ('fo', 'b1', 'fay@firm.test');
      insert into reminder_log (user_id, business_id, item_key, due_on, recipient, sent_at) values
        ('pp', 'b2', 'k', null, 'Fay@Firm.test', '2026-09-21T12:00:00Z'),
        ('hm', 'b5', 'k', null, 'Fay@Firm.test', '2026-09-28T12:00:00Z'),
        ('fo', 'b1', 'k', null, 'Fay@Firm.test', '2026-09-29T12:00:00Z');
    `);
    const { account } = await call<{ account: import("./texts").OperatorAccount }>(
      server.findOperatorAccount,
      "op",
      { email: "fay@firm.test" },
    );
    // b2 is a client of Fay's firm; b5 is another firm's client and b1 her
    // own business, each with her address as the owner's.
    expect(account.lastDigest).toEqual({
      sentAt: "2026-09-21T12:00:00.000Z",
      recipient: "Fay@Firm.test",
    });
    await db.pg.exec(`delete from reminder_log where business_id = 'b2'`);
    const again = await call<{ account: import("./texts").OperatorAccount }>(
      server.findOperatorAccount,
      "op",
      { email: "fay@firm.test" },
    );
    expect(again.account.lastDigest).toBeNull();
  });

  it("writes nothing to any log for a solo account", async () => {
    const { account } = await call<{ account: { firm: unknown } }>(
      server.findOperatorAccount,
      "op",
      { email: "so@example.test" },
    );
    expect(account.firm).toBeNull();
    expect(await log()).toEqual([]);
  });

  it("fails the lookup when its log row cannot be written", async () => {
    audit.fail = true;
    await expect(
      call(server.findOperatorAccount, "op", { email: "fay@firm.test" }),
    ).rejects.toThrow("audit insert failed");
  });
});

describe("linkStripeCustomerForAccount", () => {
  async function customerOf(userId: string): Promise<string | null> {
    const rows = await db.sql<{ stripe_customer_id: string | null }>`
      select stripe_customer_id from billing_accounts where user_id = ${userId}
    `;
    return rows[0]?.stripe_customer_id ?? null;
  }

  it("is refused without billing connected, and Stripe is never called", async () => {
    const fetchMock = stripeAnswers([RUNNING]);
    await expect(
      call(server.linkStripeCustomerForAccount, "op", { userId: "fo", customerId: "cus_1" }),
    ).rejects.toMatchObject({
      status: 409,
      message: "Billing is not connected on this deployment",
    });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(await customerOf("fo")).toBeNull();
  });

  it("refuses an id that is not a Stripe customer's", async () => {
    stripeOn();
    await expect(
      call(server.linkStripeCustomerForAccount, "op", { userId: "fo", customerId: "sub_1" }),
    ).rejects.toMatchObject({ status: 400, message: "A Stripe customer id starts with cus_." });
  });

  it("links a firm owner, applies the running subscription and logs it in one transaction", async () => {
    stripeOn();
    const fetchMock = stripeAnswers([RUNNING]);
    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    const answer = await call(server.linkStripeCustomerForAccount, "op", {
      userId: "fo",
      customerId: "cus_1",
      replace: false,
    });
    // The account comes back as the lookup now reads it, so the page shows
    // the subscription and the customer the link stored.
    expect(answer).toMatchObject({
      outcome: "linked",
      name: "Fay Owner",
      planLabel: "Firm plan",
      account: {
        userId: "fo",
        stripeCustomerId: "cus_1",
        subscriptionLabel: "Active",
        planLabel: "Firm plan",
      },
    });
    const rows = await db.sql<{ subscription_id: string; subscription_status: string }>`
      select subscription_id, subscription_status from billing_accounts where user_id = 'fo'
    `;
    expect(rows[0]).toEqual({ subscription_id: "sub_1", subscription_status: "active" });
    expect(await customerOf("fo")).toBe("cus_1");
    const plan = await db.sql<{ plan: string }>`select plan from firms where user_id = 'fo'`;
    expect(plan[0].plan).toBe("monthly");
    expect(await log()).toEqual([
      { firm: "fo", actor: "op", event: "operator_linked_stripe", subject: "fo" },
    ]);
    expect(info).toHaveBeenCalledWith("[operator] link", "fo", "by", "op");
    // Stripe's largest page, so a running subscription behind failed attempts is seen.
    const list = fetchMock.mock.calls.find(([, init]) => init?.method === "GET");
    expect(list?.[0]).toBe(
      "https://api.stripe.com/v1/subscriptions?customer=cus_1&status=all&limit=100",
    );
    // After the commit, the customer names the account.
    const post = fetchMock.mock.calls.find(([, init]) => init?.method === "POST");
    expect(post?.[0]).toBe("https://api.stripe.com/v1/customers/cus_1");
  });

  it("finds a running subscription behind newer ones that are not running", async () => {
    stripeOn();
    const failed = (id: string, created: number) => ({
      ...RUNNING,
      id,
      status: "incomplete_expired",
      created,
    });
    stripeAnswers([
      failed("sub_f1", 1_790_000_300),
      failed("sub_f2", 1_790_000_200),
      failed("sub_f3", 1_790_000_100),
      RUNNING,
    ]);
    await call(server.linkStripeCustomerForAccount, "op", { userId: "fo", customerId: "cus_1" });
    const rows = await db.sql<{ subscription_id: string; subscription_status: string }>`
      select subscription_id, subscription_status from billing_accounts where user_id = 'fo'
    `;
    expect(rows[0]).toEqual({ subscription_id: "sub_1", subscription_status: "active" });
  });

  describe("on Replace while the account's own subscription still runs", () => {
    beforeEach(async () => {
      await db.pg.exec(`
        insert into billing_accounts
          (user_id, stripe_customer_id, subscription_id, subscription_status,
            subscription_event_at, current_period_end)
          values ('fo', 'cus_old', 'sub_old', 'active', now() - interval '1 day',
            now() + interval '20 days');
        update firms set plan = 'monthly' where user_id = 'fo';
      `);
    });

    async function stored() {
      const rows = await db.sql<{
        stripe_customer_id: string;
        subscription_id: string;
        subscription_status: string;
      }>`
        select stripe_customer_id, subscription_id, subscription_status
        from billing_accounts where user_id = 'fo'
      `;
      const plan = await db.sql<{ plan: string }>`select plan from firms where user_id = 'fo'`;
      return { ...rows[0], plan: plan[0].plan };
    }

    it("stores the new customer's running subscription, so cancelling the old one changes nothing", async () => {
      stripeOn();
      stripeAnswers([{ ...RUNNING, id: "sub_new" }]);
      const answer = await call<{ account: { subscriptionLabel: string } }>(
        server.linkStripeCustomerForAccount,
        "op",
        { userId: "fo", customerId: "cus_new", replace: true },
      );
      expect(answer.account.subscriptionLabel).toBe("Active");
      const linked = {
        stripe_customer_id: "cus_new",
        subscription_id: "sub_new",
        subscription_status: "active",
        plan: "monthly",
      };
      expect(await stored()).toEqual(linked);

      // Moving a card-paying firm to invoices: the operator then cancels the
      // old subscription in Stripe. Its cancellation names the account
      // through the subscription's metadata, since no account holds cus_old.
      const now = Math.floor(Date.now() / 1000);
      expect(
        await applyBillingEvent(db.sql, {
          id: "evt_old_cancel",
          type: "customer.subscription.deleted",
          created: now + 60,
          data: {
            object: {
              id: "sub_old",
              status: "canceled",
              customer: "cus_old",
              metadata: { userId: "fo" },
            },
          },
        }),
      ).toBe("applied");
      expect(await stored()).toEqual(linked);

      // The new subscription's next event still finds the account by its customer.
      expect(
        await applyBillingEvent(db.sql, {
          id: "evt_new_renewed",
          type: "customer.subscription.updated",
          created: now + 120,
          data: { object: { id: "sub_new", status: "active", customer: "cus_new" } },
        }),
      ).toBe("applied");
      expect(await stored()).toEqual(linked);
    });

    it("refuses a customer with no running subscription, naming the one still running", async () => {
      stripeOn();
      stripeAnswers([{ ...RUNNING, id: "sub_new", status: "canceled" }]);
      await expect(
        call(server.linkStripeCustomerForAccount, "op", {
          userId: "fo",
          customerId: "cus_new",
          replace: true,
        }),
      ).rejects.toMatchObject({
        status: 409,
        message:
          "This account's subscription sub_old is still running. Cancel it in Stripe, then link.",
      });
      expect(await stored()).toEqual({
        stripe_customer_id: "cus_old",
        subscription_id: "sub_old",
        subscription_status: "active",
        plan: "monthly",
      });
      expect(await log()).toEqual([]);
    });
  });

  it("links a solo account with no log row", async () => {
    stripeOn();
    stripeAnswers([RUNNING]);
    await call(server.linkStripeCustomerForAccount, "op", { userId: "so", customerId: "cus_2" });
    expect(await customerOf("so")).toBe("cus_2");
    expect(await log()).toEqual([]);
  });

  it("rolls the link back when the log row cannot be written", async () => {
    stripeOn();
    stripeAnswers([RUNNING]);
    audit.fail = true;
    await expect(
      call(server.linkStripeCustomerForAccount, "op", { userId: "fo", customerId: "cus_1" }),
    ).rejects.toThrow("audit insert failed");
    expect(await customerOf("fo")).toBeNull();
  });

  it("refuses a customer with no running subscription, naming it", async () => {
    stripeOn();
    stripeAnswers([{ ...RUNNING, status: "canceled" }]);
    await expect(
      call(server.linkStripeCustomerForAccount, "op", { userId: "fo", customerId: "cus_1" }),
    ).rejects.toMatchObject({ status: 409, message: NO_RUNNING_SUBSCRIPTION("cus_1") });
    expect(NO_RUNNING_SUBSCRIPTION("cus_1")).toBe(
      "Stripe customer cus_1 has no running subscription. Create the subscription in Stripe first, then link.",
    );
    expect(await customerOf("fo")).toBeNull();
  });

  it("keeps a hand-marked firm's plan after a refused link, Replace or not", async () => {
    stripeOn();
    stripeAnswers([]);
    for (const replace of [false, true]) {
      await expect(
        call(server.linkStripeCustomerForAccount, "op", {
          userId: "hm",
          customerId: "cus_9",
          replace,
        }),
      ).rejects.toMatchObject({ status: 409, message: NO_RUNNING_SUBSCRIPTION("cus_9") });
    }
    expect(await customerOf("hm")).toBeNull();
    const plan = await db.sql<{ plan: string }>`select plan from firms where user_id = 'hm'`;
    expect(plan[0].plan).toBe("monthly");
  });

  it("links a customer with no running subscription on Replace for an account not marked by hand", async () => {
    stripeOn();
    stripeAnswers([]);
    const answer = await call<{ outcome: string }>(server.linkStripeCustomerForAccount, "op", {
      userId: "so",
      customerId: "cus_3",
      replace: true,
    });
    expect(answer.outcome).toBe("linked");
    expect(await customerOf("so")).toBe("cus_3");
  });

  it("passes the member and other-account refusals through", async () => {
    stripeOn();
    stripeAnswers([RUNNING]);
    await expect(
      call(server.linkStripeCustomerForAccount, "op", { userId: "pp", customerId: "cus_1" }),
    ).rejects.toMatchObject({
      status: 409,
      message:
        "pp@example.test is a member of North, not its owner. Link the firm owner's account.",
    });
    await call(server.linkStripeCustomerForAccount, "op", { userId: "so", customerId: "cus_1" });
    await expect(
      call(server.linkStripeCustomerForAccount, "op", { userId: "fo", customerId: "cus_1" }),
    ).rejects.toMatchObject({
      status: 409,
      message: "That customer belongs to another account in Precog.",
    });
    await expect(
      call(server.linkStripeCustomerForAccount, "op", { userId: "so", customerId: "cus_5" }),
    ).rejects.toMatchObject({
      status: 409,
      message: "This account already has Stripe customer cus_1. Tick Replace to link another.",
    });
  });

  it("names a customer Stripe does not have, and an unknown account", async () => {
    stripeOn();
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(JSON.stringify({ error: { code: "resource_missing", message: "x" } }), {
            status: 404,
          }),
      ),
    );
    await expect(
      call(server.linkStripeCustomerForAccount, "op", { userId: "fo", customerId: "cus_404" }),
    ).rejects.toMatchObject({ status: 409, message: "Stripe has no customer cus_404." });
    await expect(
      call(server.linkStripeCustomerForAccount, "op", { userId: "nobody", customerId: "cus_1" }),
    ).rejects.toMatchObject({ status: 404, message: "No Precog account has nobody." });
  });
});

describe("liftDailyCapToday", () => {
  it("deletes only today's row for that account and logs it to the firm", async () => {
    await db.pg.exec(`
      insert into llm_daily_usage (scope, day, calls) values
        ('user:fo', current_date, 100), ('user:fo', current_date - 1, 80),
        ('user:so', current_date, 50), ('global', current_date, 400);
    `);
    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    const answer = await call(server.liftDailyCapToday, "op", { userId: "fo" });
    expect(answer).toEqual({ email: "Fay@Firm.test" });
    expect(texts.liftedToast("Fay@Firm.test")).toBe(
      "Today's model-call count for Fay@Firm.test is back to 0.",
    );
    const rows = await db.sql<{ scope: string; calls: number }>`
      select scope, calls from llm_daily_usage order by scope, day
    `;
    expect(rows).toEqual([
      { scope: "global", calls: 400 },
      { scope: "user:fo", calls: 80 },
      { scope: "user:so", calls: 50 },
    ]);
    expect(await log()).toEqual([
      { firm: "fo", actor: "op", event: "operator_lifted_cap", subject: "fo" },
    ]);
    expect(info).toHaveBeenCalledWith("[operator] lift", "fo", "by", "op");
  });

  it("writes no log row for a solo account", async () => {
    await call(server.liftDailyCapToday, "op", { userId: "so" });
    expect(await log()).toEqual([]);
  });
});

describe("runOperatorCount", () => {
  it("answers 404 to a name it does not offer", async () => {
    await expect(call(server.runOperatorCount, "op", { name: "select 1" })).rejects.toMatchObject({
      status: 404,
    });
  });

  it.each(texts.OPERATOR_COUNTS.map((c) => [c.name, c.label]))(
    "runs %s on the database and logs the run",
    async (name, label) => {
      const info = vi.spyOn(console, "info").mockImplementation(() => {});
      const result = await call<import("./texts").OperatorCountResult>(
        server.runOperatorCount,
        "op",
        { name },
      );
      expect(result.name).toBe(name);
      expect(result.label).toBe(label);
      expect(info).toHaveBeenCalledWith("[operator] count", name, "by", "op");
    },
  );

  it("counts what the owner asks before a release", async () => {
    await db.pg.exec(`
      insert into billing_accounts (user_id, subscription_id, subscription_status)
        values ('fo', 'sub_1', 'past_due');
      insert into notification_settings (user_id, weekly_digest) values ('fo', true);
    `);
    const running = await call<import("./texts").OperatorCountResult>(
      server.runOperatorCount,
      "op",
      { name: "running-subscriptions" },
    );
    expect(running.columns).toEqual(["user_id", "subscription_id", "clients"]);
    expect(running.rows).toEqual([["fo", "sub_1", 2]]);
    const handMarked = await call<import("./texts").OperatorCountResult>(
      server.runOperatorCount,
      "op",
      { name: "hand-marked" },
    );
    expect(handMarked.rows).toEqual([["hm", "Hand"]]);
    const pastDue = await call<import("./texts").OperatorCountResult>(
      server.runOperatorCount,
      "op",
      { name: "past-due" },
    );
    expect(pastDue.rows).toEqual([[1]]);
    const google = await call<import("./texts").OperatorCountResult>(
      server.runOperatorCount,
      "op",
      { name: "google-digest" },
    );
    expect(google.rows).toEqual([[1]]);
    const weeks = await call<import("./texts").OperatorCountResult>(server.runOperatorCount, "op", {
      name: "weekly-activation",
    });
    expect(weeks.rows).toHaveLength(8);
  });

  it("labels the counts as the owner's queries name them", () => {
    expect(texts.OPERATOR_COUNTS.map((c) => c.label)).toEqual([
      "Running subscriptions and their live clients",
      "Firms marked monthly by hand with no billing row",
      "X-only accounts with the digest on",
      "Google accounts without a confirmed address and the digest on",
      "Google accounts with the digest on",
      "Firm plans past due",
      "QuickBooks connections failing or lapsing within 30 days",
      "Firms with more than one member",
      "Deleted firm clients the retention rule now keeps",
      "Running subscriptions with no stored price yet",
      "Picture storage",
      "Accounts that set up a first business, by week (last 8 weeks)",
    ]);
  });
});

describe("operator texts", () => {
  const base: Entitlements = {
    plan: "free",
    features: {
      quickbooks: false,
      lockedVersions: false,
      members: false,
      ownerReminders: false,
      moreClients: false,
    },
    clientLimit: 1,
    tier: null,
    paidUntil: null,
    assessmentEndedAt: null,
    pastDueSince: null,
    graceEndsAt: null,
    closedAt: null,
    aiPlan: "free",
  };

  it("names the plan as the Plan card does, and the hand-marked exception", () => {
    expect(texts.operatorPlanLabel(base, false, true)).toBe("Free");
    expect(
      texts.operatorPlanLabel({ ...base, plan: "firm", tier: 1, clientLimit: 5 }, false, true),
    ).toBe("Firm plan · Starter, up to 5 client businesses");
    expect(texts.operatorPlanLabel({ ...base, plan: "firm", clientLimit: 50 }, true, true)).toBe(
      "Firm plan (marked by hand, no billing row)",
    );
    expect(
      texts.operatorPlanLabel(
        { ...base, plan: "firm", clientLimit: 50, graceEndsAt: "2026-11-02T00:00:00.000Z" },
        false,
        true,
      ),
    ).toBe("Firm plan (payment overdue, closes 2026-11-02)");
    expect(
      texts.operatorPlanLabel(
        { ...base, plan: "assessment", paidUntil: "2026-12-30T00:00:00.000Z" },
        false,
        true,
      ),
    ).toBe("Assessment (until 2026-12-30)");
    expect(
      texts.operatorPlanLabel(
        { ...base, assessmentEndedAt: "2026-09-30T00:00:00.000Z" },
        false,
        true,
      ),
    ).toBe("Assessment (ended 2026-09-30)");
    expect(
      texts.operatorPlanLabel(
        { ...base, closedAt: "2026-10-20T00:00:00.000Z", pastDueSince: "2026-10-06T00:00:00.000Z" },
        false,
        true,
      ),
    ).toBe("Firm plan (closed 2026-10-20)");
    // Without billing every plan is open, whatever the firm row says.
    expect(
      texts.operatorPlanLabel({ ...base, plan: "assessment", aiPlan: "paid" }, false, false),
    ).toBe("Everything open (billing is not connected on this deployment)");
    expect(texts.operatorPlanLabel({ ...base, plan: "firm", clientLimit: 50 }, true, false)).toBe(
      texts.PLAN_WITHOUT_BILLING,
    );
    expect(texts.linkedToast("Fay Owner", "cus_1", "Firm plan")).toBe(
      "Linked Fay Owner to Stripe customer cus_1; plan now Firm plan.",
    );
  });

  it("prints the support lines", () => {
    const lines = texts.accountLines({
      userId: "fo",
      name: "Fay Owner",
      email: "fay@firm.test",
      emailVerified: true,
      providers: ["grok-google", "credential"],
      createdAt: "2026-09-01",
      firm: { firmUserId: "fo", name: "North", role: "owner" },
      businesses: { live: 2, deleted: 1 },
      stripeCustomerId: "cus_1",
      subscriptionLabel: "Active",
      planLabel: "Firm plan",
      lastDigest: { sentAt: "2026-09-28", recipient: "fay@firm.test" },
      suppression: "bounced",
      quickBooksFailure: { at: "2026-10-01", error: "invalid_grant" },
      modelCalls: { today: 37, limit: 400 },
      milestones: [{ event: "first_business", occurredAt: "2026-09-02" }],
    });
    expect(lines).toEqual([
      "fay@firm.test · address confirmed",
      "Signs in with: Google, email and password",
      "Account created Sep 1, 2026",
      "Plan: Firm plan",
      "Firm: North (owner)",
      "Businesses: 2 live, 1 deleted",
      "Subscription: Active",
      "Stripe customer: cus_1",
      "Last weekly digest: Sep 28, 2026 to fay@firm.test",
      "Email to this address is stopped (bounced)",
      "QuickBooks: last reading failed on Oct 1, 2026 (invalid_grant)",
      "Model calls today: 37 of 400",
      "Milestones: first business Sep 2, 2026",
    ]);
    const empty = texts.accountLines({
      userId: "so",
      name: "",
      email: "so@example.test",
      emailVerified: false,
      providers: [],
      createdAt: "2026-09-01",
      firm: null,
      businesses: { live: 0, deleted: 0 },
      stripeCustomerId: null,
      subscriptionLabel: "None",
      planLabel: "Free",
      lastDigest: null,
      suppression: null,
      quickBooksFailure: null,
      modelCalls: { today: 0, limit: 100 },
      milestones: [],
    });
    expect(empty).toEqual([
      "so@example.test · address not confirmed",
      "Signs in with: nothing on record",
      "Account created Sep 1, 2026",
      "Plan: Free",
      "Firm: none",
      "Businesses: 0 live, 0 deleted",
      "Subscription: None",
      "Stripe customer: none",
      "No weekly digest sent yet",
      "QuickBooks: no failure on record",
      "Model calls today: 0 of 100",
      "Milestones: none yet",
    ]);
    const other = texts.accountLines({
      userId: "xo",
      name: "",
      email: "xo@x.invalid",
      emailVerified: false,
      providers: ["grok-x"],
      createdAt: "2026-09-01",
      firm: null,
      businesses: { live: 1, deleted: 0 },
      stripeCustomerId: null,
      subscriptionLabel: "None",
      planLabel: "Free",
      lastDigest: null,
      suppression: null,
      quickBooksFailure: { at: null, error: "invalid_grant" },
      modelCalls: { today: 0, limit: 100 },
      milestones: [
        { event: "first_locked_version", occurredAt: "2026-09-03" },
        { event: "first_report_sent", occurredAt: "2026-09-04" },
        { event: "first_monthly_review", occurredAt: "2026-09-05" },
      ],
    });
    expect(other).toContain("Signs in with: X");
    expect(other).toContain("QuickBooks: last reading failed on an unknown day (invalid_grant)");
    expect(other).toContain(
      "Milestones: first locked version Sep 3, 2026; first report sent Sep 4, 2026; first monthly review Sep 5, 2026",
    );
  });
});
