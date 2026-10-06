import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { openSafetyDb, type SafetyDb } from "@/test/safety-db";
import { AUDIT_BYPASS_SQL } from "@/test/pglite";
import { applyBillingEvent } from "../billing/webhook";
import type { StripeEvent } from "../billing/stripe";
import { loadBillingAccount } from "./billing-store";

/** Stripe's event.created is in whole seconds; every event below shares or nearly shares one. */
const T = 1_790_000_000;

function subscriptionEvent(
  id: string,
  type: string,
  status: string,
  created: number,
  userId = "u1",
): StripeEvent {
  return {
    id,
    type,
    created,
    data: { object: { id: "sub_1", status, customer: "cus_1", metadata: { userId } } },
  } as StripeEvent;
}

function checkoutCompleted(id: string, created: number): StripeEvent {
  return {
    id,
    type: "checkout.session.completed",
    created,
    data: {
      object: {
        mode: "subscription",
        subscription: "sub_1",
        customer: "cus_1",
        client_reference_id: "u1",
      },
    },
  } as StripeEvent;
}

function shuffled<T>(items: T[]): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

function signal() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

// A skip in the ordinary embedded suite is explicit: PGlite runs one
// connection, so these interleavings only exist on real PostgreSQL.
describe.runIf(process.env.PRECOG_LIFECYCLE_POSTGRES === "1")(
  "Stripe subscription events on real PostgreSQL",
  () => {
    let db: SafetyDb;
    beforeAll(async () => {
      db = await openSafetyDb();
    }, 60_000);
    afterAll(async () => {
      await db?.close();
    });
    beforeEach(async () => {
      await db.pg.exec(
        `begin; ${AUDIT_BYPASS_SQL} delete from billing_events; delete from "user"; commit;`,
      );
      await db.seedUser("u1");
    });

    const reset = () =>
      db.pg.exec(
        `begin; ${AUDIT_BYPASS_SQL} delete from billing_events; delete from billing_accounts; commit;`,
      );
    const statusOf = async () =>
      (await loadBillingAccount(db.sql, "u1"))?.subscriptionStatus ?? "none";

    it("ends active after 20 rounds of concurrent first events from the same second", async () => {
      const results: string[] = [];
      for (let round = 0; round < 20; round += 1) {
        await reset();
        const events = shuffled([
          subscriptionEvent(`c${round}`, "customer.subscription.created", "incomplete", T),
          subscriptionEvent(`u${round}`, "customer.subscription.updated", "active", T),
          checkoutCompleted(`k${round}`, T),
        ]);
        const outcomes = await Promise.all(events.map((e) => applyBillingEvent(db.sql, e)));
        expect(outcomes.every((o) => o === "applied")).toBe(true);
        results.push(await statusOf());
      }
      expect(results).toEqual(Array.from({ length: 20 }, () => "active"));
    });

    it("ends active when a Checkout's events from two seconds arrive at once", async () => {
      const results: string[] = [];
      for (let round = 0; round < 20; round += 1) {
        await reset();
        await Promise.all(
          shuffled([
            subscriptionEvent(`c${round}`, "customer.subscription.created", "incomplete", T),
            subscriptionEvent(`u${round}`, "customer.subscription.updated", "active", T + 2),
            checkoutCompleted(`k${round}`, T + 2),
          ]).map((e) => applyBillingEvent(db.sql, e)),
        );
        results.push(await statusOf());
      }
      expect(results).toEqual(Array.from({ length: 20 }, () => "active"));
    });

    it("never revives a canceled subscription, later or in the same second", async () => {
      const results: string[] = [];
      for (let round = 0; round < 20; round += 1) {
        await reset();
        const cancelAt = round % 2 === 0 ? T + 60 : T;
        await Promise.all(
          shuffled([
            subscriptionEvent(`d${round}`, "customer.subscription.deleted", "canceled", cancelAt),
            subscriptionEvent(`u${round}`, "customer.subscription.updated", "active", T),
          ]).map((e) => applyBillingEvent(db.sql, e)),
        );
        results.push(await statusOf());
      }
      expect(results).toEqual(Array.from({ length: 20 }, () => "canceled"));
    });

    it("acknowledges an event for a deleted account, so Stripe stops retrying", async () => {
      await db.pg.exec(`begin; ${AUDIT_BYPASS_SQL} delete from "user"; commit;`);
      const event = subscriptionEvent("evt_gone", "customer.subscription.updated", "active", T);
      expect(await applyBillingEvent(db.sql, event)).toBe("account deleted");
      // The claim committed, so a redelivery is a duplicate, not a retry.
      expect(await applyBillingEvent(db.sql, event)).toBe("duplicate");
      expect(await loadBillingAccount(db.sql, "u1")).toBeNull();
    });

    it("acknowledges an event that waited on the account's deletion", async () => {
      const locked = signal();
      const release = signal();
      const deletion = db.sql.transaction!(async (tx) => {
        await tx`select set_config('precog.audit_bypass', 'on', true)`;
        await tx`select id from "user" where id = 'u1' for update`;
        await tx`delete from "user" where id = 'u1'`;
        locked.resolve();
        await release.promise;
      });
      await locked.promise;
      let settled = false;
      const event = subscriptionEvent("evt_wait", "customer.subscription.updated", "active", T);
      const applying = applyBillingEvent(db.sql, event).finally(() => {
        settled = true;
      });
      await new Promise((resolve) => setTimeout(resolve, 300));
      // The event waits for the deletion instead of reading a row that is going away.
      expect(settled).toBe(false);
      release.resolve();
      await deletion;
      expect(await applying).toBe("account deleted");
      expect(await loadBillingAccount(db.sql, "u1")).toBeNull();
    });
  },
);
