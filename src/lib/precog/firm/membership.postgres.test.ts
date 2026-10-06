import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { Sql } from "@/lib/db";
import { inTransaction, isDeadlock, toSql } from "@/lib/sql-transaction";
import { AUDIT_BYPASS_SQL } from "@/test/pglite";
import { openSafetyDb, type SafetyDb } from "@/test/safety-db";
import {
  acceptInvite,
  createInvite,
  leaveFirm,
  removeMember,
  saveFirm,
  transferFirmOwnership,
} from "./store";

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

/**
 * Counts the deadlocks Postgres reports on `sql`'s transactions, including
 * the ones `inTransaction`'s retry absorbs, so a test can tell the lock order
 * from the retry.
 */
function deadlockCounter(sql: Sql): { sql: Sql; deadlocks: () => number } {
  let deadlocks = 0;
  const wrapped = toSql(<T>(text: string, params: unknown[]) => sql.query<T>(text, params));
  wrapped.transaction = async (work) => {
    try {
      return await inTransaction(sql, work);
    } catch (error) {
      if (isDeadlock(error)) deadlocks += 1;
      throw error;
    }
  };
  return { sql: wrapped, deadlocks: () => deadlocks };
}

const settle = <T>(p: Promise<T>) =>
  p.then(
    (value) => ({ value, error: null as unknown }),
    (error: unknown) => ({ value: null, error }),
  );

const message = (error: unknown) => (error instanceof Error ? error.message : String(error));

// A skip in the ordinary embedded suite is explicit; real lock waits and
// deadlocks need separate PostgreSQL connections.
describe.runIf(process.env.PRECOG_LIFECYCLE_POSTGRES === "1")(
  "real PostgreSQL firm membership interleavings",
  () => {
    let db: SafetyDb;
    beforeAll(async () => {
      db = await openSafetyDb();
    }, 60_000);
    afterAll(async () => {
      await db?.close();
    });

    async function reset() {
      await db.pg.exec(`begin; ${AUDIT_BYPASS_SQL} delete from "user"; commit;`);
      for (const id of ["o", "m", "j"]) await db.seedUser(id);
    }

    /** Firm o with member m, as the stress reproductions start. */
    async function firmWithMember() {
      await db.sql`insert into firms (user_id, name) values ('o', 'Firm O')`;
      await db.sql`insert into firm_members (firm_user_id, member_user_id, role)
        values ('o', 'o', 'owner'), ('o', 'm', 'preparer')`;
    }

    async function membershipsOf(userId: string) {
      return db.sql<{ firm_user_id: string; role: string }>`
        select firm_user_id, role from firm_members where member_user_id = ${userId}
        order by firm_user_id
      `;
    }

    /** Waits until the tagged statement waits on a lock, or `outcome` settled without waiting. */
    async function waitingOrDone(tag: string, outcome: Promise<unknown>) {
      let done = false;
      void outcome.then(() => {
        done = true;
      });
      await expect
        .poll(
          async () => {
            if (done) return true;
            const [row] = await db.sql<{ n: number }>`select count(*)::int as n
              from pg_stat_activity where query like ${`/* ${tag} */%`} and wait_event_type = 'Lock'`;
            return row.n > 0;
          },
          { timeout: 5_000, interval: 20 },
        )
        .toBe(true);
    }

    beforeEach(reset);

    describe("starting a firm while joining another (PR209-1)", () => {
      beforeEach(async () => {
        await saveFirm(db.sql, "o", "Firm O", null);
        await createInvite(db.sql, {
          firmUserId: "o",
          email: "j@example.test",
          role: "reviewer",
          token: "t_j",
        });
      });

      it("an invitation accepted while the save is past its check waits, then refuses", async () => {
        const reached = signal();
        const release = signal();
        const tag = `accept_${randomUUID().replaceAll("-", "")}`;
        const saving = settle(
          saveFirm(
            pausedBefore(db.sql, "save", /insert into firms/i, reached, release),
            "j",
            "Firm J",
            null,
          ),
        );
        await reached.promise;
        const accepting = settle(acceptInvite(taggedSql(db.sql, tag), "t_j", "j"));
        try {
          await waitingOrDone(tag, accepting);
        } finally {
          release.resolve();
        }
        const [saved, accepted] = [await saving, await accepting];
        expect(saved.error).toBeNull();
        expect(message(accepted.error)).toMatch(/You already belong to Firm J/);
        expect(await membershipsOf("j")).toEqual([{ firm_user_id: "j", role: "owner" }]);
      });

      it("a save started while the invitation is past its check waits, then refuses", async () => {
        const reached = signal();
        const release = signal();
        const tag = `save_${randomUUID().replaceAll("-", "")}`;
        const accepting = settle(
          acceptInvite(
            pausedBefore(db.sql, "accept", /insert into firm_members/i, reached, release),
            "t_j",
            "j",
          ),
        );
        await reached.promise;
        const saving = settle(saveFirm(taggedSql(db.sql, tag), "j", "Firm J", null));
        try {
          await waitingOrDone(tag, saving);
        } finally {
          release.resolve();
        }
        const [accepted, saved] = [await accepting, await saving];
        expect(accepted.error).toBeNull();
        expect(message(saved.error)).toMatch(/You are a member of Firm O/);
        expect(await membershipsOf("j")).toEqual([{ firm_user_id: "o", role: "reviewer" }]);
      });

      it("20 unpaused rounds never leave an owner who is a member elsewhere", async () => {
        for (let i = 0; i < 20; i += 1) {
          await db.pg.exec(`begin; ${AUDIT_BYPASS_SQL}
            delete from firms where user_id = 'j';
            delete from firm_members where member_user_id = 'j';
            commit;`);
          await createInvite(db.sql, {
            firmUserId: "o",
            email: "j@example.test",
            role: "reviewer",
            token: `t_${i}`,
          });
          const ops: Promise<unknown>[] = [
            saveFirm(db.sql, "j", "Firm J", null),
            acceptInvite(db.sql, `t_${i}`, "j"),
          ];
          if (i % 2) ops.reverse();
          const out = await Promise.all(ops.map(settle));
          expect(out.filter((o) => o.error === null)).toHaveLength(1);
          expect(await membershipsOf("j")).toHaveLength(1);
        }
      });
    });

    describe("ownership transfer against other membership writes (ST-RACE-8)", () => {
      async function state() {
        const firms = await db.sql<{ user_id: string }>`select user_id from firms order by 1`;
        const owners = await db.sql<{ firm_user_id: string }>`
          select firm_user_id from firm_members where role = 'owner' order by 1
        `;
        return { firms: firms.map((f) => f.user_id), owners: owners.map((o) => o.firm_user_id) };
      }

      it("against removal and leaving: 30 rounds, no deadlock, one owner", async () => {
        const counter = deadlockCounter(db.sql);
        for (let i = 0; i < 30; i += 1) {
          await reset();
          await firmWithMember();
          const ops: Promise<unknown>[] = [
            transferFirmOwnership(counter.sql, "o", "m"),
            i % 2 ? removeMember(counter.sql, "o", "m") : leaveFirm(counter.sql, "o", "m"),
          ];
          if (i % 3 === 0) ops.reverse();
          const out = await Promise.all(ops.map(settle));
          for (const o of out) expect(isDeadlock(o.error)).toBe(false);
          const s = await state();
          expect(s.firms).toHaveLength(1);
          expect(s.owners).toEqual(s.firms);
        }
        // The lock order, not the retry, keeps them apart.
        expect(counter.deadlocks()).toBe(0);
      }, 60_000);

      it("against an invitation being accepted: 30 rounds, no deadlock, the joiner lands in the firm", async () => {
        const counter = deadlockCounter(db.sql);
        for (let i = 0; i < 30; i += 1) {
          await reset();
          await firmWithMember();
          await createInvite(db.sql, {
            firmUserId: "o",
            email: "j@example.test",
            role: "preparer",
            token: `t${i}`,
          });
          const ops: Promise<unknown>[] = [
            transferFirmOwnership(counter.sql, "o", "m"),
            acceptInvite(counter.sql, `t${i}`, "j"),
          ];
          if (i % 2) ops.reverse();
          const out = await Promise.all(ops.map(settle));
          expect(out.map((o) => message(o.error ?? "ok"))).toEqual(["ok", "ok"]);
          expect(await state()).toEqual({ firms: ["m"], owners: ["m"] });
          expect(await membershipsOf("j")).toEqual([{ firm_user_id: "m", role: "preparer" }]);
        }
        expect(counter.deadlocks()).toBe(0);
      }, 60_000);
    });

    it("a transfer moves the old owner's own clients to the new owner and leaves granted ones", async () => {
      await firmWithMember();
      await db.sql`insert into businesses (user_id, id, name, industry, profile, firm_user_id)
        values ('o', 'own_1', 'Own one', 'general', '{}', 'o'),
          ('m', 'm_1', 'Member client', 'general', '{}', 'o'),
          ('j', 'granted_1', 'Shared by its owner', 'general', '{}', 'o')`;
      await db.sql`update businesses set granted_at = now() where id = 'granted_1'`;
      const moved = await transferFirmOwnership(db.sql, "o", "m");
      expect(moved).toEqual([{ from: "own_1", to: "own_1", name: "Own one" }]);
      const rows = await db.sql<{ id: string; user_id: string; firm_user_id: string }>`
        select id, user_id, firm_user_id from businesses order by id
      `;
      expect(rows).toEqual([
        { id: "granted_1", user_id: "j", firm_user_id: "m" },
        { id: "m_1", user_id: "m", firm_user_id: "m" },
        { id: "own_1", user_id: "m", firm_user_id: "m" },
      ]);
    });
  },
);
