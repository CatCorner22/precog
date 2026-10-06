import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { Sql } from "@/lib/db";
import { toSql } from "@/lib/sql-transaction";
import { openTestDb, type TestDb } from "@/test/pglite";
import { applyBillingEvent, retryFailedCreditReversals } from "./webhook";
import { saveFirm } from "../firm/store";

const report = vi.hoisted(() => ({
  failAt: null as string | null,
  error: vi.fn(async (_error: unknown, _at?: string | null) => undefined),
}));
vi.mock("@/lib/observability/report.server", () => ({
  reportServerError: async (error: unknown, at?: string | null) => {
    await report.error(error, at);
    if (at && at === report.failAt) throw new Error(`tracker down at ${at}`);
  },
}));

/** One balance transaction as Stripe lists it. */
type Txn = {
  id: string;
  amount: number;
  created: number;
  description: string | null;
  metadata: Record<string, string>;
};

const PAID_AT = "2026-09-01T00:00:00.000Z";
/** The reversal_for tag: the Stripe customer and the Assessment payment. */
const TAG = `cus_1:${PAID_AT}`;
/** The tag reversals carried before it named the customer: the account. */
const ACCOUNT_TAG = `owner:${PAID_AT}`;

describe("Assessment credit reversal, across a crash", () => {
  let db: TestDb;
  /** The customer's balance at Stripe, newest first, as the stand-in Stripe holds it. */
  let balance: Txn[];
  let calls: { method: string; url: string; body: string; key: string | undefined }[];
  /** Set to make every POST hang (the function is killed before Stripe answers). */
  let hang: boolean;

  beforeAll(async () => {
    db = await openTestDb();
  }, 60_000);
  afterAll(async () => {
    await db.close();
  });
  beforeEach(async () => {
    await db.clear("billing_events", "billing_accounts", "firm_members", "firms", '"user"');
    await db.seedUser("owner", "o@example.com");
    await saveFirm(db.sql, "owner", "North", "assessment");
    await db.sql`insert into billing_accounts
      (user_id, stripe_customer_id, assessment_paid_at, assessment_payment_intent,
        assessment_fee_cents, assessment_credit_used_at, assessment_credit_cents)
      values ('owner', 'cus_1', ${PAID_AT}, 'pi_1', 100000, now(), 100000)`;
    balance = [
      {
        id: "cbtxn_credit",
        amount: -100_000,
        created: Date.parse("2026-09-02T00:00:00Z") / 1000,
        description: "Assessment credit",
        metadata: {},
      },
    ];
    calls = [];
    hang = false;
    report.failAt = null;
    report.error.mockClear();
    vi.stubEnv("STRIPE_SECRET_KEY", "sk_test");
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init: RequestInit) => {
        const headers = init.headers as Record<string, string>;
        const method = String(init.method ?? "GET");
        const body = String(init.body ?? "");
        calls.push({ method, url, body, key: headers["idempotency-key"] });
        if (method === "GET") return Response.json({ data: balance, has_more: false });
        if (hang) return new Promise<Response>(() => undefined);
        const params = new URLSearchParams(body);
        const txn: Txn = {
          id: `cbtxn_${calls.length}`,
          amount: Number(params.get("amount")),
          created: Math.floor(Date.now() / 1000),
          description: params.get("description"),
          metadata: { reversal_for: params.get("metadata[reversal_for]") ?? "" },
        };
        balance.unshift(txn);
        return Response.json(txn);
      }),
    );
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  const refund = (id: string) => ({
    id,
    type: "charge.refunded",
    created: 1_790_000_000,
    data: { object: { refunded: true, payment_intent: "pi_1", invoice: null } },
  });
  const posts = () => calls.filter((c) => c.method === "POST");
  const row = async () =>
    (
      await db.sql<{
        cents: number | null;
        pending: string | null;
        failed: string | null;
      }>`select assessment_credit_cents as cents,
          assessment_credit_reversal_pending_at as pending,
          assessment_credit_reversal_failed_at as failed
        from billing_accounts where user_id = 'owner'`
    )[0];
  /** Ages the pending mark past the hour the scheduled run waits. */
  const agePending = () => db.sql`update billing_accounts
    set assessment_credit_reversal_pending_at = now() - interval '2 hours'
    where user_id = 'owner'`;

  it("tags the inline reversal and clears the pending mark once Stripe confirms", async () => {
    expect(await applyBillingEvent(db.sql, refund("evt_r1"))).toBe("applied");
    expect(posts()).toHaveLength(1);
    expect(posts()[0].body).toContain("amount=100000");
    expect(new URLSearchParams(posts()[0].body).get("metadata[reversal_for]")).toBe(TAG);
    expect(posts()[0].key).toBe(`credit-reversal-cus_1-${PAID_AT}`);
    expect(await row()).toEqual({ cents: 0, pending: null, failed: null });
    // Nothing is left for the scheduled run.
    expect(await retryFailedCreditReversals(db.sql)).toMatchObject({ retried: 0 });
    expect(posts()).toHaveLength(1);
  });

  it("completes the reversal from the scheduled run after a crash between commit and Stripe", async () => {
    hang = true;
    // The function is killed while Stripe has not answered: never awaited.
    void applyBillingEvent(db.sql, refund("evt_r1"));
    await vi.waitFor(() => expect(posts()).toHaveLength(1));
    // The refund committed and the reversal is pending, with the amount kept.
    const crashed = await row();
    expect(crashed.cents).toBe(100_000);
    expect(crashed.pending).not.toBeNull();
    expect(crashed.failed).toBeNull();
    // Stripe redelivers the refund: a duplicate, which posts nothing.
    expect(await applyBillingEvent(db.sql, refund("evt_r1"))).toBe("duplicate");
    expect(posts()).toHaveLength(1);
    // Within the hour, the run leaves it alone (an inline attempt may still run).
    hang = false;
    expect(await retryFailedCreditReversals(db.sql)).toMatchObject({ retried: 0 });
    await agePending();
    expect(await retryFailedCreditReversals(db.sql)).toEqual({
      retried: 1,
      alreadyPosted: 0,
      failed: 0,
      stopped: false,
      remaining: 0,
    });
    // It read the balance before it posted.
    expect(calls.slice(-2).map((c) => c.method)).toEqual(["GET", "POST"]);
    expect(calls.at(-2)?.url).toBe(
      "https://api.stripe.com/v1/customers/cus_1/balance_transactions?limit=100",
    );
    expect(new URLSearchParams(posts()[1].body).get("metadata[reversal_for]")).toBe(TAG);
    expect(await row()).toEqual({ cents: 0, pending: null, failed: null });
  });

  it("retries a pending reversal once", async () => {
    await db.sql`update billing_accounts
      set assessment_credit_reversal_pending_at = now() where user_id = 'owner'`;
    await agePending();
    expect(await retryFailedCreditReversals(db.sql)).toMatchObject({ retried: 1, failed: 0 });
    expect(posts()).toHaveLength(1);
    expect(posts()[0].body).toContain("amount=100000");
    expect(await row()).toEqual({ cents: 0, pending: null, failed: null });
    // The next run finds nothing to do.
    expect(await retryFailedCreditReversals(db.sql)).toMatchObject({ retried: 0 });
    expect(posts()).toHaveLength(1);
  });

  it("does not post a reversal Stripe already holds, and only clears the row", async () => {
    // The inline attempt reached Stripe, but the function died before it
    // recorded the answer; days later Stripe has forgotten the key.
    balance.unshift({
      id: "cbtxn_rev",
      amount: 100_000,
      created: Date.parse("2026-09-20T00:00:00Z") / 1000,
      description: "Assessment credit reversed",
      metadata: { reversal_for: TAG },
    });
    await db.sql`update billing_accounts
      set assessment_credit_reversal_failed_at = now() where user_id = 'owner'`;
    await agePending();
    expect(await retryFailedCreditReversals(db.sql)).toEqual({
      retried: 1,
      alreadyPosted: 1,
      failed: 0,
      stopped: false,
      remaining: 0,
    });
    expect(posts()).toHaveLength(0);
    expect(await row()).toEqual({ cents: 0, pending: null, failed: null });
  });

  it("finds a reversal posted before an ownership transfer moved the row, and posts nothing twice", async () => {
    hang = true;
    // The inline reversal reaches Stripe, then the function dies.
    void applyBillingEvent(db.sql, refund("evt_r1"));
    await vi.waitFor(() => expect(posts()).toHaveLength(1));
    hang = false;
    // Stripe holds the reversal; the firm changes owner before the run.
    balance.unshift({
      id: "cbtxn_rev",
      amount: 100_000,
      created: Date.parse("2026-09-20T00:00:00Z") / 1000,
      description: "Assessment credit reversed",
      metadata: { reversal_for: TAG },
    });
    await db.seedUser("heir", "h@example.com");
    await db.sql`update billing_accounts set user_id = 'heir' where user_id = 'owner'`;
    await db.sql`update billing_accounts
      set assessment_credit_reversal_pending_at = now() - interval '2 hours'
      where user_id = 'heir'`;
    expect(await retryFailedCreditReversals(db.sql)).toMatchObject({
      retried: 1,
      alreadyPosted: 1,
      failed: 0,
    });
    expect(posts()).toHaveLength(1);
  });

  it("recognises a reversal tagged with the account, also the account before a transfer", async () => {
    balance.unshift({
      id: "cbtxn_rev",
      amount: 100_000,
      created: Date.parse("2026-09-20T00:00:00Z") / 1000,
      description: "Assessment credit reversed",
      metadata: { reversal_for: ACCOUNT_TAG },
    });
    await db.sql`update billing_accounts
      set assessment_credit_reversal_failed_at = now() where user_id = 'owner'`;
    expect(await retryFailedCreditReversals(db.sql)).toMatchObject({ alreadyPosted: 1 });
    await db.seedUser("heir", "h@example.com");
    await db.sql`update billing_accounts
      set user_id = 'heir', assessment_credit_cents = 100000,
        assessment_credit_reversal_failed_at = now()
      where user_id = 'owner'`;
    expect(await retryFailedCreditReversals(db.sql)).toMatchObject({ alreadyPosted: 1 });
    expect(posts()).toHaveLength(0);
  });

  it("recognises an untagged reversal posted before the tag, but not one for an earlier payment", async () => {
    // Parked before migration 0053: a failure time and no pending mark.
    await db.sql`update billing_accounts
      set assessment_credit_reversal_failed_at = now() where user_id = 'owner'`;
    balance.unshift({
      id: "cbtxn_old",
      amount: 100_000,
      created: Date.parse("2026-08-01T00:00:00Z") / 1000,
      description: "Assessment credit reversed",
      metadata: {},
    });
    expect(await retryFailedCreditReversals(db.sql)).toMatchObject({ alreadyPosted: 0 });
    expect(posts()).toHaveLength(1);

    await db.sql`update billing_accounts
      set assessment_credit_cents = 100000, assessment_credit_reversal_failed_at = now()
      where user_id = 'owner'`;
    balance = [
      {
        id: "cbtxn_legacy",
        amount: 100_000,
        created: Date.parse("2026-09-20T00:00:00Z") / 1000,
        description: "Assessment credit reversed",
        metadata: {},
      },
    ];
    expect(await retryFailedCreditReversals(db.sql)).toMatchObject({ alreadyPosted: 1 });
    expect(posts()).toHaveLength(1);
  });

  it("posts nothing when Stripe cannot list the balance, and keeps the row", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    await db.sql`update billing_accounts
      set assessment_credit_reversal_pending_at = now() where user_id = 'owner'`;
    await agePending();
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init: RequestInit) => {
        calls.push({ method: String(init.method ?? "GET"), url: "", body: "", key: undefined });
        return Response.json({ error: { message: "down" } }, { status: 500 });
      }),
    );
    expect(await retryFailedCreditReversals(db.sql)).toMatchObject({ retried: 1, failed: 1 });
    expect(posts()).toHaveLength(0);
    expect((await row()).cents).toBe(100_000);
    expect(report.error).toHaveBeenCalledWith(expect.any(Error), "stripe-credit-reversal-retry");
  });

  it("stops before the next reversal once its deadline passes", async () => {
    await db.sql`update billing_accounts
      set assessment_credit_reversal_pending_at = now() where user_id = 'owner'`;
    await agePending();
    expect(await retryFailedCreditReversals(db.sql, { deadline: Date.now() - 1 })).toEqual({
      retried: 0,
      alreadyPosted: 0,
      failed: 0,
      stopped: true,
      remaining: 1,
    });
    expect(calls).toHaveLength(0);
  });

  it("reverses nothing twice for a second refund while the first is still pending", async () => {
    hang = true;
    void applyBillingEvent(db.sql, refund("evt_r1"));
    await vi.waitFor(() => expect(posts()).toHaveLength(1));
    hang = false;
    expect(await applyBillingEvent(db.sql, refund("evt_r2"))).toBe("applied");
    expect(posts()).toHaveLength(1);
  });
});

describe("Stripe webhook work after the commit", () => {
  let db: TestDb;

  beforeAll(async () => {
    db = await openTestDb();
  }, 60_000);
  afterAll(async () => {
    await db.close();
  });
  beforeEach(async () => {
    await db.clear("billing_events", "billing_accounts", "firm_members", "firms", '"user"');
    await db.seedUser("owner", "o@example.com");
    await saveFirm(db.sql, "owner", "North", "assessment");
    report.failAt = null;
    report.error.mockClear();
    vi.stubEnv("STRIPE_SECRET_KEY", "sk_test");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Response.json({ id: "cbtxn_1" })),
    );
    vi.spyOn(console, "error").mockImplementation(() => undefined);
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  /** db.sql, except that the statement matching `failing` throws outside a transaction. */
  const failingOutsideTransaction = (failing: RegExp): Sql => {
    const wrapped = toSql(async <T>(text: string, params: unknown[]) => {
      if (failing.test(text)) throw new Error("connection lost");
      return db.sql.query<T>(text, params);
    });
    wrapped.transaction = db.sql.transaction;
    return wrapped;
  };

  it("answers the reversal's event when recording Stripe's confirmation fails, and leaves the row pending", async () => {
    await db.sql`insert into billing_accounts
      (user_id, stripe_customer_id, assessment_paid_at, assessment_payment_intent,
        assessment_fee_cents, assessment_credit_used_at, assessment_credit_cents)
      values ('owner', 'cus_1', ${PAID_AT}, 'pi_1', 100000, now(), 100000)`;
    const sql = failingOutsideTransaction(/assessment_credit_cents = 0/);
    await expect(
      applyBillingEvent(sql, {
        id: "evt_r1",
        type: "charge.refunded",
        created: 1_790_000_000,
        data: { object: { refunded: true, payment_intent: "pi_1", invoice: null } },
      }),
    ).resolves.toBe("applied");
    expect(report.error).toHaveBeenCalledWith(expect.any(Error), "stripe-webhook-after-commit");
    // The scheduled run finds the reversal at Stripe after the hour and clears it.
    const [left] = await db.sql<{ cents: number; pending: string | null }>`
      select assessment_credit_cents as cents, assessment_credit_reversal_pending_at as pending
      from billing_accounts where user_id = 'owner'`;
    expect(left.cents).toBe(100_000);
    expect(left.pending).not.toBeNull();
  });

  it("answers a second subscription's checkout when its report fails", async () => {
    await db.sql`insert into billing_accounts
      (user_id, stripe_customer_id, subscription_id, subscription_status, subscription_event_at)
      values ('owner', 'cus_1', 'sub_1', 'active', '2026-09-01T00:00:00Z')`;
    report.failAt = "billing-second-subscription";
    await expect(
      applyBillingEvent(db.sql, {
        id: "evt_c2",
        type: "checkout.session.completed",
        created: 1_790_000_000,
        data: {
          object: {
            mode: "subscription",
            subscription: "sub_2",
            customer: "cus_1",
            client_reference_id: "owner",
            metadata: { userId: "owner" },
          },
        },
      }),
    ).resolves.toBe("applied");
    expect(report.error).toHaveBeenCalledWith(expect.any(Error), "billing-second-subscription");
    expect(report.error).toHaveBeenCalledWith(expect.any(Error), "stripe-webhook-after-commit");
  });
});
