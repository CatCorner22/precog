import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { isDeadlock } from "@/lib/sql-transaction";
import { AUDIT_BYPASS_SQL } from "@/test/pglite";
import { openSafetyDb, type SafetyDb } from "@/test/safety-db";
import { deleteAccountRows } from "./account-store";
import { applyBillingEvent } from "./billing/webhook";
import { saveBusinessRevision } from "./business-store";
import { acceptGrant, createGrant } from "./firm/grant-store";

const settle = <T>(p: Promise<T>) =>
  p.then(
    (value) => ({ value, error: null as unknown }),
    (error: unknown) => ({ value: null, error }),
  );

const message = (error: unknown) => (error instanceof Error ? error.message : String(error));

// A skip in the ordinary embedded suite is explicit; real lock waits need
// separate PostgreSQL connections. The rounds reproduce the stress test's
// races (ST-RACE-5, ST-RACE-6, ST-RACE-7) in both start orders.
describe.runIf(process.env.PRECOG_LIFECYCLE_POSTGRES === "1")(
  "real PostgreSQL account deletion against concurrent writes",
  () => {
    let db: SafetyDb;
    beforeAll(async () => {
      db = await openSafetyDb();
    }, 60_000);
    afterAll(async () => {
      await db?.close();
    });

    async function reset(users: string[]) {
      await db.pg.exec(
        `begin; ${AUDIT_BYPASS_SQL} delete from billing_events; delete from "user"; commit;`,
      );
      for (const id of users) await db.seedUser(id);
    }

    beforeEach(() => reset([]));

    it("a parallel delete and Firm subscription webhook never leave a live subscription (ST-RACE-5)", async () => {
      for (let i = 0; i < 30; i += 1) {
        await reset(["o"]);
        await db.sql`insert into firms (user_id, name) values ('o', 'Firm')`;
        await db.sql`insert into firm_members (firm_user_id, member_user_id, role)
          values ('o', 'o', 'owner')`;
        // Half the rounds start with the billing row Checkout leaves, so the
        // webhook updates it rather than inserting it.
        if (i % 4 >= 2) {
          await db.sql`insert into billing_accounts (user_id, stripe_customer_id)
            values ('o', 'cus_1')`;
        }
        const event = {
          id: `evt_${i}`,
          type: "customer.subscription.created",
          created: 1_790_000_000,
          data: {
            object: {
              id: "sub_1",
              status: "active",
              customer: "cus_1",
              metadata: { userId: "o" },
            },
          },
        };
        const ops = [
          settle(applyBillingEvent(db.sql, event)),
          settle(deleteAccountRows(db.sql, "o")),
        ];
        if (i % 2) ops.reverse();
        const out = await Promise.all(ops);
        const [billed, deleted] = i % 2 ? [out[1], out[0]] : out;
        for (const o of out) expect(isDeadlock(o.error)).toBe(false);
        const [user] = await db.sql<{ n: number }>`
          select count(*)::int as n from "user" where id = 'o'
        `;
        if (deleted.error === null) {
          // The account went first: the webhook finds it gone, records no
          // running subscription and acknowledges the event (S08a), so
          // Stripe does not retry an event for an account that no longer
          // exists.
          expect(user.n).toBe(0);
          expect(billed.error).toBeNull();
          expect(billed.value).toBe("account deleted");
          const [billing] = await db.sql<{ n: number }>`
            select count(*)::int as n from billing_accounts where user_id = 'o'
          `;
          expect(billing.n).toBe(0);
        } else {
          // The webhook went first: the deletion saw the running plan.
          expect(message(deleted.error)).toMatch(/Your firm plan is still active/);
          expect(billed.error).toBeNull();
          expect(user.n).toBe(1);
        }
      }
    }, 60_000);

    it("a delete during a member's client save never removes the client (ST-RACE-6)", async () => {
      for (let i = 0; i < 30; i += 1) {
        await reset(["o", "m"]);
        await db.sql`insert into firms (user_id, name) values ('o', 'Firm')`;
        await db.sql`insert into firm_members (firm_user_id, member_user_id, role)
          values ('o', 'o', 'owner'), ('o', 'm', 'preparer')`;
        const ops = [
          settle(
            saveBusinessRevision(db.sql, {
              userId: "m",
              businessId: "client",
              baseRevision: null,
              name: "Acme",
              industry: "general",
              profileJson: '{"x":1}',
              firmUserId: "o",
              savedBy: "m",
            }),
          ),
          settle(deleteAccountRows(db.sql, "m")),
        ];
        if (i % 2) ops.reverse();
        const out = await Promise.all(ops);
        const [saved, deleted] = i % 2 ? [out[1], out[0]] : out;
        for (const o of out) expect(isDeadlock(o.error)).toBe(false);
        const [clients] = await db.sql<{ n: number }>`
          select count(*)::int as n from businesses where firm_user_id = 'o'
        `;
        if (saved.error === null) {
          // The save went first: the client stays and the deletion refuses.
          expect(clients.n).toBe(1);
          expect(message(deleted.error)).toMatch(/You set up 1 client business for Firm/);
        } else {
          // The deletion went first: the save found no account.
          expect(message(saved.error)).toMatch(/Unauthorized/);
          expect(deleted.error).toBeNull();
          expect(clients.n).toBe(0);
        }
      }
    }, 60_000);

    /** Firm f, and `own`'s business b with an open invitation to f; returns its token. */
    async function grantToFirm(): Promise<string> {
      await reset(["f", "own"]);
      await db.sql`insert into firms (user_id, name) values ('f', 'Firm')`;
      await db.sql`insert into firm_members (firm_user_id, member_user_id, role)
        values ('f', 'f', 'owner')`;
      await saveBusinessRevision(db.sql, {
        userId: "own",
        businessId: "b",
        name: "B",
        industry: "general",
        profileJson: "{}",
        baseRevision: null,
      });
      const { token } = await createGrant(db.sql, {
        ownerUserId: "own",
        businessId: "b",
        email: "f@example.test",
      });
      return token;
    }

    it("a business owner's deletion during a grant accept waits or refuses, never deadlocks", async () => {
      for (let i = 0; i < 20; i += 1) {
        const token = await grantToFirm();
        const ops = [
          settle(acceptGrant(db.sql, token, "f")),
          settle(deleteAccountRows(db.sql, "own")),
        ];
        if (i % 2) ops.reverse();
        const out = await Promise.all(ops);
        for (const o of out) expect(isDeadlock(o.error)).toBe(false);
        const deleted = i % 2 ? out[0] : out[1];
        expect(deleted.error).toBeNull();
        const [left] = await db.sql<{ n: number }>`select count(*)::int as n from businesses`;
        expect(left.n).toBe(0);
      }
    }, 60_000);

    it("a firm owner's deletion during a grant accept leaves no link to the gone firm (ST-RACE-7)", async () => {
      for (let i = 0; i < 20; i += 1) {
        const token = await grantToFirm();
        const ops = [
          settle(acceptGrant(db.sql, token, "f")),
          settle(deleteAccountRows(db.sql, "f")),
        ];
        if (i % 2) ops.reverse();
        const out = await Promise.all(ops);
        for (const o of out) expect(isDeadlock(o.error)).toBe(false);
        const deleted = i % 2 ? out[0] : out[1];
        expect(deleted.error).toBeNull();
        const rows = await db.sql<{ firm_user_id: string | null }>`
          select firm_user_id from businesses where user_id = 'own' and id = 'b'
        `;
        expect(rows).toEqual([{ firm_user_id: null }]);
        // The owner can invite a firm again.
        await expect(
          createGrant(db.sql, {
            ownerUserId: "own",
            businessId: "b",
            email: "other@example.test",
          }),
        ).resolves.toMatchObject({ token: expect.any(String) });
      }
    }, 60_000);
  },
);
