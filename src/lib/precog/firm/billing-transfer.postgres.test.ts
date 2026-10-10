import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { Sql } from "@/lib/db";
import { inTransaction, isDeadlock, toSql } from "@/lib/sql-transaction";
import { AUDIT_BYPASS_SQL } from "@/test/pglite";
import { openSafetyDb, type SafetyDb } from "@/test/safety-db";
import { applyBillingEvent } from "../billing/webhook";
import type { StripeEvent } from "../billing/stripe";
import { deleteAccountRows } from "../account-store";
import { recordSubscription, setStripeCustomer } from "./billing-store";
import { transferFirmOwnership } from "./store";

const report = vi.hoisted(() => vi.fn(async (_error: unknown, _at?: string | null) => {}));
vi.mock("@/lib/observability/report.server", () => ({ reportServerError: report }));

/** Stripe's event.created is in whole seconds. */
const T = 1_790_000_000;

function signal() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

/**
 * `sql`, except that its transaction stops before the first statement
 * matching `at` until `release` resolves, and says so through `reached`.
 */
function pausedBefore(
  sql: Sql,
  at: RegExp,
  reached: ReturnType<typeof signal>,
  release: ReturnType<typeof signal>,
  /** Pause only on a matching statement whose first parameter is this. */
  firstParam?: string,
): Sql {
  const wrapped = toSql(<R>(text: string, params: unknown[]) => sql.query<R>(text, params));
  wrapped.transaction = (work) =>
    inTransaction(sql, (tx) => {
      let paused = false;
      const inner = toSql(async <R>(text: string, params: unknown[]) => {
        if (!paused && at.test(text) && (firstParam === undefined || params[0] === firstParam)) {
          paused = true;
          reached.resolve();
          await release.promise;
        }
        return tx.query<R>(text, params);
      });
      inner.transaction = (nested) => nested(inner);
      return work(inner);
    });
  return wrapped;
}

/** `sql`, counting the transactions Postgres aborted as deadlock victims. */
function countingDeadlocks(sql: Sql): { sql: Sql; deadlocks: () => number } {
  let deadlocks = 0;
  const counted = toSql(<R>(text: string, params: unknown[]) => sql.query<R>(text, params));
  counted.transaction = async (work) => {
    try {
      return await inTransaction(sql, work);
    } catch (error) {
      if (isDeadlock(error)) deadlocks += 1;
      throw error;
    }
  };
  return { sql: counted, deadlocks: () => deadlocks };
}

const settle = <R>(p: Promise<R>) =>
  p.then(
    (value) => ({ value, error: null as unknown }),
    (error: unknown) => ({ value: null as R | null, error }),
  );
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const subscriptionEvent = (
  id: string,
  type: string,
  status: string,
  created: number,
): StripeEvent =>
  ({
    id,
    type,
    created,
    data: { object: { id: "sub_1", status, customer: "cus_1", metadata: { userId: "o" } } },
  }) as StripeEvent;

// A skip in the ordinary embedded suite is explicit: PGlite runs one
// connection, so these interleavings only exist on real PostgreSQL.
describe.runIf(process.env.PRECOG_LIFECYCLE_POSTGRES === "1")(
  "Stripe events beside an ownership transfer and an account deletion, on real PostgreSQL",
  () => {
    let db: SafetyDb;
    beforeAll(async () => {
      db = await openSafetyDb();
    }, 60_000);
    afterAll(async () => {
      await db?.close();
    });
    beforeEach(async () => {
      report.mockClear();
      await db.pg.exec(
        `begin; ${AUDIT_BYPASS_SQL} delete from billing_events; delete from "user"; commit;`,
      );
      for (const id of ["o", "n"]) await db.seedUser(id);
      await db.sql`insert into firms (user_id, name, plan) values ('o', 'Firm O', 'monthly')`;
      await db.sql`insert into firm_members (firm_user_id, member_user_id, role)
        values ('o', 'o', 'owner'), ('o', 'n', 'reviewer')`;
      await db.sql`insert into billing_accounts
        (user_id, stripe_customer_id, subscription_id, subscription_status, subscription_event_at)
        values ('o', 'cus_1', 'sub_1', 'active', to_timestamp(${T}))`;
    });

    const billingRows = () =>
      db.sql<{ user_id: string; stripe_customer_id: string | null; subscription_status: string }>`
        select user_id, stripe_customer_id, subscription_status from billing_accounts
        order by user_id`;
    // Ordered by id, the insert order. occurred_at is now(), the time each
    // transaction began, so an event that waited on the billing row can carry
    // an earlier time than the row it followed.
    const planChanges = () =>
      db.sql<{ firm_user_id: string; from: string | null; to: string }>`
        select firm_user_id, detail->>'from' as "from", detail->>'to' as "to"
        from firm_audit_log where event = 'plan_changed' order by id`;

    it("applies a subscription event that waited on a transfer to the new owner, with one billing row", async () => {
      const reached = signal();
      const release = signal();
      const transfer = settle(
        transferFirmOwnership(
          pausedBefore(db.sql, /insert into firms/i, reached, release),
          "o",
          "n",
        ),
      );
      await reached.promise;
      const hook = settle(
        applyBillingEvent(
          db.sql,
          subscriptionEvent("ev_a", "customer.subscription.updated", "past_due", T + 10),
        ),
      );
      await sleep(300);
      release.resolve();
      const [t, h] = [await transfer, await hook];
      expect(t.error).toBeNull();
      expect(h).toEqual({ value: "applied", error: null });
      expect(await billingRows()).toEqual([
        { user_id: "n", stripe_customer_id: "cus_1", subscription_status: "past_due" },
      ]);
      expect(await planChanges()).toEqual([{ firm_user_id: "n", from: "active", to: "past_due" }]);
    });

    it("never deadlocks a transfer against a subscription event that holds the billing row", async () => {
      const reached = signal();
      const release = signal();
      const hook = settle(
        applyBillingEvent(
          pausedBefore(db.sql, /update firms set plan/i, reached, release),
          subscriptionEvent("ev_b", "customer.subscription.updated", "past_due", T + 10),
        ),
      );
      await reached.promise;
      const counted = countingDeadlocks(db.sql);
      const transfer = settle(transferFirmOwnership(counted.sql, "o", "n"));
      await sleep(300);
      release.resolve();
      const [t, h] = [await transfer, await hook];
      expect(counted.deadlocks()).toBe(0);
      expect(h).toEqual({ value: "applied", error: null });
      // The event committed first: the firm is overdue, so the transfer refuses.
      expect(String((t.error as Error | null)?.message)).toContain("cannot change owner");
      expect(await billingRows()).toEqual([
        { user_id: "o", stripe_customer_id: "cus_1", subscription_status: "past_due" },
      ]);
    });

    it("takes the billing row before the firm row, so a refund under way never deadlocks a transfer", async () => {
      await db.sql`update billing_accounts
        set subscription_status = 'canceled', assessment_paid_at = to_timestamp(${T}),
          assessment_payment_intent = 'pi_1'
        where user_id = 'o'`;
      const reached = signal();
      const release = signal();
      const refund = {
        id: "ev_refund",
        type: "charge.refunded",
        created: T + 20,
        data: { object: { refunded: true, payment_intent: "pi_1", invoice: null } },
      } as StripeEvent;
      const hook = settle(
        applyBillingEvent(pausedBefore(db.sql, /update firms set plan/i, reached, release), refund),
      );
      await reached.promise;
      const counted = countingDeadlocks(db.sql);
      const transfer = settle(transferFirmOwnership(counted.sql, "o", "n"));
      await sleep(300);
      release.resolve();
      const [t, h] = [await transfer, await hook];
      expect(counted.deadlocks()).toBe(0);
      expect(h).toEqual({ value: "applied", error: null });
      expect(t.error).toBeNull();
      const firms = await db.sql<{ user_id: string; plan: string }>`
        select user_id, plan from firms`;
      expect(firms).toEqual([{ user_id: "n", plan: "assessment" }]);
    });

    it("never deadlocks a transfer against an event that names the new owner while the old one holds the customer", async () => {
      // `z` sorts after `o`: the transfer locks o, then z. The event names z
      // (its Checkout was started by z) for the customer o still holds.
      await db.seedUser("z");
      await db.sql`insert into firm_members (firm_user_id, member_user_id, role)
        values ('o', 'z', 'reviewer')`;
      const reached = signal();
      const release = signal();
      const transferDeadlocks = countingDeadlocks(
        pausedBefore(db.sql, /from "user" where id = .* for no key update/i, reached, release, "z"),
      );
      const transfer = settle(transferFirmOwnership(transferDeadlocks.sql, "o", "z"));
      await reached.promise;
      const paid = {
        id: "ev_paid_z",
        type: "checkout.session.completed",
        created: T + 30,
        data: {
          object: {
            mode: "payment",
            payment_status: "paid",
            customer: "cus_1",
            client_reference_id: "z",
            payment_intent: "pi_z",
            amount_subtotal: 50_000,
          },
        },
      } as StripeEvent;
      const hookDeadlocks = countingDeadlocks(db.sql);
      const hook = settle(applyBillingEvent(hookDeadlocks.sql, paid));
      await sleep(300);
      release.resolve();
      const [t, h] = [await transfer, await hook];
      expect(transferDeadlocks.deadlocks()).toBe(0);
      expect(hookDeadlocks.deadlocks()).toBe(0);
      expect(t.error).toBeNull();
      expect(h).toEqual({ value: "applied", error: null });
      // The payment went to the account that holds the customer once the transfer committed.
      const rows = await db.sql<{ user_id: string; intent: string | null }>`
        select user_id, assessment_payment_intent as intent from billing_accounts`;
      expect(rows).toEqual([{ user_id: "z", intent: "pi_z" }]);
    });

    it("never deadlocks an operator link against the account's deletion", async () => {
      await db.sql`update billing_accounts set subscription_status = 'canceled' where user_id = 'o'`;
      await db.sql`delete from firm_members where member_user_id = 'n'`;
      const reached = signal();
      const release = signal();
      // The operator's link transaction: the customer, then its subscription.
      const link = settle(
        inTransaction(
          pausedBefore(
            db.sql,
            /select stripe_customer_id, subscription_id, subscription_status/i,
            reached,
            release,
          ),
          async (tx) => {
            await setStripeCustomer(tx, "o", "cus_2", { replace: true });
            await tx`select stripe_customer_id, subscription_id, subscription_status
              from billing_accounts where user_id = 'o'`;
            return recordSubscription(tx, {
              userId: "o",
              stripeCustomerId: "cus_2",
              subscriptionId: "sub_2",
              status: "active",
              currentPeriodEnd: null,
              eventAt: new Date().toISOString(),
            });
          },
        ),
      );
      await reached.promise;
      const deletion = settle(deleteAccountRows(db.sql, "o"));
      await sleep(300);
      release.resolve();
      const [l, d] = [await link, await deletion];
      expect(isDeadlock(l.error)).toBe(false);
      expect(isDeadlock(d.error)).toBe(false);
      expect(l.error).toBeNull();
      // The link committed first: the plan now runs, so the deletion refuses.
      expect(String((d.error as Error | null)?.message)).toContain("firm plan is still active");
    });

    it("acknowledges a paid Assessment for a deleted account and reports it for a refund", async () => {
      await db.pg.exec(`begin; ${AUDIT_BYPASS_SQL} delete from "user" where id = 'n'; commit;`);
      const paid = {
        id: "ev_paid",
        type: "checkout.session.completed",
        created: T,
        data: {
          object: {
            mode: "payment",
            payment_status: "paid",
            customer: "cus_9",
            client_reference_id: "n",
            payment_intent: "pi_9",
            amount_subtotal: 50_000,
          },
        },
      } as StripeEvent;
      vi.spyOn(console, "error").mockImplementation(() => undefined);
      expect(await applyBillingEvent(db.sql, paid)).toBe("account deleted");
      expect(await applyBillingEvent(db.sql, paid)).toBe("duplicate");
      expect(report).toHaveBeenCalledTimes(1);
      expect(report.mock.calls[0]?.[1]).toBe("billing-payment-for-deleted-account");
      expect(String((report.mock.calls[0]?.[0] as Error).message)).toContain("pi_9");
      expect(await billingRows()).toHaveLength(1);
      vi.restoreAllMocks();
    });

    it("logs each plan change once, from the status it replaced, when events arrive together", async () => {
      for (let round = 0; round < 15; round += 1) {
        await db.pg.exec(
          `begin; ${AUDIT_BYPASS_SQL} delete from firm_audit_log; delete from billing_events; delete from billing_accounts; commit;`,
        );
        await Promise.all(
          [
            subscriptionEvent(`c${round}`, "customer.subscription.created", "incomplete", T),
            subscriptionEvent(`u${round}`, "customer.subscription.updated", "active", T),
          ].map((e) => applyBillingEvent(db.sql, e)),
        );
        const changes = await planChanges();
        // Either incomplete then active, or active alone (the incomplete was stale).
        const chain = changes.map((c) => `${c.from ?? "none"}->${c.to}`);
        expect([["none->incomplete", "incomplete->active"], ["none->active"]]).toContainEqual(
          chain,
        );
      }
    });
  },
);
