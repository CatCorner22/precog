import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import type { Sql } from "@/lib/db";
import { inTransaction, toSql } from "@/lib/sql-transaction";
import { AUDIT_BYPASS_SQL } from "@/test/pglite";
import { openSafetyDb, type SafetyDb } from "@/test/safety-db";
import { businessLimitMessage } from "../business-lifecycle";
import { deleteBusinessRow, restoreBusinessRow, saveBusinessRevision } from "../business-store";
import { loadEntitlements } from "./entitlements.server";
import { acceptGrant, createGrant } from "./grant-store";
import { loadFirmFor, transferFirmOwnership } from "./store";

// acceptClientGrant runs as a plain handler against a stand-in database.
const ref = vi.hoisted(() => ({ sql: null as unknown }));
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
vi.mock("@/lib/db", () => ({ getSql: async () => ref.sql }));

const SAVE_AGAIN = "Your firm just changed owner. Save again.";
const ACCEPT_AGAIN = "Your firm changed owner while you accepted. Try again.";

function signal() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

/** Every statement carries `tag`, so pg_stat_activity can say whether it waits on a lock. */
function taggedSql(sql: Sql, tag: string): Sql {
  const wrapped = toSql(<T>(text: string, params: unknown[]) =>
    sql.query<T>(`/* ${tag} */ ${text}`, params),
  );
  wrapped.transaction = (work) => inTransaction(sql, (tx) => work(taggedSql(tx, tag)));
  return wrapped;
}

/** Like taggedSql, and pauses the transaction just before the first statement matching `at`. */
function pausedBefore(
  sql: Sql,
  tag: string,
  at: RegExp,
  reached: ReturnType<typeof signal>,
  release: ReturnType<typeof signal>,
): Sql {
  const wrapped = toSql(<T>(text: string, params: unknown[]) =>
    sql.query<T>(`/* ${tag} */ ${text}`, params),
  );
  wrapped.transaction = (work) =>
    inTransaction(sql, (tx) => {
      let paused = false;
      const inner = toSql(async <T>(text: string, params: unknown[]) => {
        if (!paused && at.test(text)) {
          paused = true;
          reached.resolve();
          await release.promise;
        }
        return tx.query<T>(`/* ${tag} */ ${text}`, params);
      });
      inner.transaction = (nested) => nested(inner);
      return work(inner);
    });
  return wrapped;
}

const settle = <T>(p: Promise<T>) =>
  p.then(
    (value) => ({ value, error: null as unknown }),
    (error: unknown) => ({ value: null, error }),
  );

const message = (error: unknown) => (error instanceof Error ? error.message : String(error));
const status = (error: unknown) => (error as { status?: number } | null)?.status;

/** Stripe "configured", so an account without a subscription is on the free plan (1 client). */
function freePlan() {
  vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_plan_limits");
  vi.stubEnv("STRIPE_PRICE_ASSESSMENT", "price_assessment");
  vi.stubEnv("STRIPE_PRICE_MONTHLY", "price_monthly");
}

describe("acceptClientGrant", () => {
  afterEach(() => {
    ref.sql = null;
  });

  it("answers a foreign-key failure left over from an ownership transfer with a 409", async () => {
    const fk = Object.assign(new Error('violates foreign key constraint "fk"'), { code: "23503" });
    const sql = toSql(async () => {
      throw fk;
    });
    sql.transaction = async () => {
      throw fk;
    };
    ref.sql = sql;
    const { acceptClientGrant } = await import("./grant-server");
    const call = acceptClientGrant as unknown as (args: {
      context: { userId: string };
      data: { token: string };
    }) => Promise<unknown>;
    const failed = await settle(
      call({ context: { userId: "o" }, data: { token: "a".repeat(48) } }),
    );
    expect({ status: status(failed.error), message: message(failed.error) }).toEqual({
      status: 409,
      message: ACCEPT_AGAIN,
    });
  });
});

// A skip in the ordinary embedded suite is explicit; real lock waits need
// separate PostgreSQL connections.
describe.runIf(process.env.PRECOG_LIFECYCLE_POSTGRES === "1")(
  "real PostgreSQL plan limits under the firm's lock",
  () => {
    let db: SafetyDb;
    beforeAll(async () => {
      db = await openSafetyDb();
    }, 60_000);
    afterAll(async () => {
      await db?.close();
    });
    afterEach(() => {
      vi.unstubAllEnvs();
    });

    async function reset(...users: string[]) {
      await db.pg.exec(`begin; ${AUDIT_BYPASS_SQL} delete from "user"; commit;`);
      for (const id of users) await db.seedUser(id);
    }

    /** Firm o (owner o) with members m and x. */
    async function firm() {
      await reset("o", "m", "x", "b");
      await db.sql`insert into firms (user_id, name) values ('o', 'Firm O')`;
      await db.sql`insert into firm_members (firm_user_id, member_user_id, role)
        values ('o', 'o', 'owner'), ('o', 'm', 'preparer'), ('o', 'x', 'preparer')`;
    }

    /** What profile-server hands the store: the plan's limit and its refusal. */
    async function planLimit(userId: string) {
      const e = await loadEntitlements(db.sql, userId);
      const firm = await loadFirmFor(db.sql, userId);
      return {
        limit: e.clientLimit,
        message: businessLimitMessage({
          plan: e.plan,
          limit: e.clientLimit,
          tier: e.tier,
          asMember: firm !== null && firm.role !== "owner",
        }),
      };
    }

    function firstSave(
      sql: Sql,
      saver: string,
      businessId: string,
      firmUserId: string | null,
      clientLimit?: { limit: number; message: string },
    ) {
      return saveBusinessRevision(sql, {
        userId: saver,
        businessId,
        name: businessId,
        industry: "general",
        profileJson: "{}",
        baseRevision: null,
        savedBy: saver,
        firmUserId,
        clientLimit,
      });
    }

    async function liveBusinesses() {
      return db.sql<{ user_id: string; id: string; firm_user_id: string | null }>`
        select user_id, id, firm_user_id from businesses where deleted_at is null
        order by user_id, id
      `;
    }

    describe("the plan's client limit (ST-RACE-3, STAB-S-3)", () => {
      it("10 first saves at once on the free plan create exactly 1 business", async () => {
        await reset("solo");
        freePlan();
        const limit = await planLimit("solo");
        expect(limit.limit).toBe(1);
        const out = await Promise.all(
          Array.from({ length: 10 }, (_, i) =>
            settle(firstSave(db.sql, "solo", `biz_${i}`, null, limit)),
          ),
        );
        expect(out.filter((o) => o.error === null)).toHaveLength(1);
        for (const o of out.filter((r) => r.error !== null)) {
          expect({ status: status(o.error), message: message(o.error) }).toEqual({
            status: 402,
            message: limit.message,
          });
        }
        expect(await liveBusinesses()).toHaveLength(1);
      });

      it("three members of one firm saving new clients at once create exactly 1", async () => {
        await firm();
        freePlan();
        const out = await Promise.all(
          ["o", "m", "x"].map(async (saver) =>
            settle(firstSave(db.sql, saver, `client_${saver}`, "o", await planLimit(saver))),
          ),
        );
        expect(out.filter((o) => o.error === null)).toHaveLength(1);
        for (const o of out.filter((r) => r.error !== null)) expect(status(o.error)).toBe(402);
        expect(await liveBusinesses()).toHaveLength(1);
      });

      it("3 restores at once on the free plan bring back exactly 1", async () => {
        await reset("solo");
        for (const id of ["r1", "r2", "r3"]) {
          await firstSave(db.sql, "solo", id, null);
          await deleteBusinessRow(db.sql, "solo", id);
        }
        freePlan();
        const out = await Promise.all(
          ["r1", "r2", "r3"].map((id) => settle(restoreBusinessRow(db.sql, "solo", id))),
        );
        expect(out.filter((o) => o.error === null)).toHaveLength(1);
        for (const o of out.filter((r) => r.error !== null)) expect(status(o.error)).toBe(402);
        expect(await liveBusinesses()).toHaveLength(1);
      });
    });

    describe("client grants (ST-RACE-4, ST-RACE-9)", () => {
      async function grantFrom(owner: string, businessId: string, email = "o@example.test") {
        await db.sql`insert into businesses (user_id, id, name, industry, profile)
          values (${owner}, ${businessId}, ${businessId}, 'general', '{}')`;
        return createGrant(db.sql, { ownerUserId: owner, businessId, email });
      }

      it("5 accepts at once against a limit of 1 accept exactly 1", async () => {
        await firm();
        const owners = ["b1", "b2", "b3", "b4", "b5"];
        for (const id of owners) await db.seedUser(id);
        const grants = [];
        for (const id of owners) grants.push(await grantFrom(id, `biz_${id}`));
        freePlan();
        const out = await Promise.all(grants.map((g) => settle(acceptGrant(db.sql, g.token, "o"))));
        expect(out.filter((o) => o.error === null)).toHaveLength(1);
        for (const o of out.filter((r) => r.error !== null)) expect(status(o.error)).toBe(402);
        const clients = await db.sql<{ n: number }>`
          select count(*)::int as n from businesses where firm_user_id = 'o'`;
        expect(clients[0].n).toBe(1);
      });

      it("an accept past its checks holds the firm; a transfer waits and carries the client", async () => {
        await firm();
        const grant = await grantFrom("b", "biz_b");
        const reached = signal();
        const release = signal();
        const accepting = settle(
          acceptGrant(
            pausedBefore(db.sql, "accept", /update businesses set firm_user_id/i, reached, release),
            grant.token,
            "o",
          ),
        );
        await reached.promise;
        const tag = `transfer_${randomUUID().replaceAll("-", "")}`;
        const transferring = settle(transferFirmOwnership(taggedSql(db.sql, tag), "o", "m"));
        try {
          await expect
            .poll(
              async () => {
                const [row] = await db.sql<{ n: number }>`select count(*)::int as n
                  from pg_stat_activity where query like ${`/* ${tag} */%`}
                    and wait_event_type = 'Lock'`;
                return row.n;
              },
              { timeout: 5_000, interval: 20 },
            )
            .toBeGreaterThan(0);
        } finally {
          release.resolve();
        }
        const [accepted, transferred] = [await accepting, await transferring];
        expect(message(accepted.error ?? "ok")).toBe("ok");
        expect(message(transferred.error ?? "ok")).toBe("ok");
        const rows = await db.sql<{ firm_user_id: string | null }>`
          select firm_user_id from businesses where user_id = 'b' and id = 'biz_b'`;
        expect(rows[0].firm_user_id).toBe("m");
      });

      it("an accept waits for a membership write that holds the business owner's account", async () => {
        await firm();
        const grant = await grantFrom("b", "biz_b");
        const held = signal();
        const release = signal();
        // A membership write (for example b joining a firm) holds b's account
        // FOR NO KEY UPDATE, as lockFirmMembershipWrite takes it.
        const membership = inTransaction(db.sql, async (tx) => {
          await tx`select id from "user" where id = 'b' for no key update`;
          held.resolve();
          await release.promise;
        });
        await held.promise;
        const tag = `accept_${randomUUID().replaceAll("-", "")}`;
        const accepting = settle(acceptGrant(taggedSql(db.sql, tag), grant.token, "o"));
        try {
          await expect
            .poll(
              async () => {
                const [row] = await db.sql<{ n: number }>`select count(*)::int as n
                  from pg_stat_activity where query like ${`/* ${tag} */%`}
                    and wait_event_type = 'Lock'`;
                return row.n;
              },
              { timeout: 5_000, interval: 20 },
            )
            .toBeGreaterThan(0);
        } finally {
          release.resolve();
          await membership;
        }
        expect(message((await accepting).error ?? "ok")).toBe("ok");
      });

      it("10 rounds of accept against transfer: success or a 409, never a raw database error", async () => {
        for (let i = 0; i < 10; i += 1) {
          await firm();
          const grant = await grantFrom("b", "biz_b");
          const ops: Promise<unknown>[] = [
            acceptGrant(db.sql, grant.token, "o"),
            transferFirmOwnership(db.sql, "o", "m"),
          ];
          if (i % 2) ops.reverse();
          const out = await Promise.all(ops.map(settle));
          if (i % 2) out.reverse();
          const [accepted, transferred] = out;
          expect(message(transferred.error ?? "ok")).toBe("ok");
          if (accepted.error) expect(status(accepted.error)).toBe(409);
          const rows = await db.sql<{ firm_user_id: string | null }>`
            select firm_user_id from businesses where user_id = 'b' and id = 'biz_b'`;
          expect(rows[0].firm_user_id).toBe(accepted.error ? null : "m");
        }
      }, 60_000);
    });

    describe("a member's new client during an ownership transfer (ST-RACE-10)", () => {
      it("a save that still names the old firm lands under the new one", async () => {
        await firm();
        await transferFirmOwnership(db.sql, "o", "m");
        const saved = await settle(firstSave(db.sql, "x", "late_client", "o"));
        expect(message(saved.error ?? "ok")).toBe("ok");
        expect(await liveBusinesses()).toEqual([
          { user_id: "x", id: "late_client", firm_user_id: "m" },
        ]);
      });

      it("10 rounds: the client saves under the new firm, or the save says to save again", async () => {
        for (let i = 0; i < 10; i += 1) {
          await firm();
          const saver = i % 2 ? "m" : "x";
          const ops: Promise<unknown>[] = [
            firstSave(db.sql, saver, `new_${i}`, "o"),
            transferFirmOwnership(db.sql, "o", "m"),
          ];
          if (i % 3 === 0) ops.reverse();
          const out = await Promise.all(ops.map(settle));
          if (i % 3 === 0) out.reverse();
          const [saved, transferred] = out;
          expect(message(transferred.error ?? "ok")).toBe("ok");
          if (saved.error) {
            expect({ status: status(saved.error), message: message(saved.error) }).toEqual({
              status: 409,
              message: SAVE_AGAIN,
            });
          } else {
            expect(await liveBusinesses()).toContainEqual({
              user_id: saver,
              id: `new_${i}`,
              firm_user_id: "m",
            });
          }
        }
      }, 60_000);
    });
  },
);
