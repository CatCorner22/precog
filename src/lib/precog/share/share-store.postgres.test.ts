import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { AUDIT_BYPASS_SQL } from "@/test/pglite";
import { openSafetyDb, type SafetyDb } from "@/test/safety-db";
import { checkPasscodeGuess, PASSCODE_ATTEMPT_LIMIT } from "./share-attempts";
import { insertMapShare, revokeShareOnce } from "./share-store";

const TOKEN = "f".repeat(36);

const settle = <T>(p: Promise<T>) =>
  p.then(
    (value) => ({ value, error: null as unknown }),
    (error: unknown) => ({ value: null, error }),
  );

// A skip in the ordinary embedded suite is explicit; row locks only contend
// on separate PostgreSQL connections, which PGlite's one connection never has.
describe.runIf(process.env.PRECOG_LIFECYCLE_POSTGRES === "1")(
  "real PostgreSQL share revocation and passcode guesses",
  () => {
    let db: SafetyDb;
    beforeAll(async () => {
      db = await openSafetyDb();
    }, 60_000);
    afterAll(async () => {
      await db?.close();
    });

    async function reset() {
      await db.pg.exec(
        `begin; ${AUDIT_BYPASS_SQL} delete from map_share_attempts; delete from map_shares; delete from "user"; commit;`,
      );
      await db.seedUser("u1");
      const stored = await insertMapShare(db.sql, {
        token: TOKEN,
        userId: "u1",
        businessName: "Biz",
        industry: "dental",
        payloadJson: JSON.stringify({ version: 1 }),
        expiresAt: new Date(Date.now() + 86_400_000).toISOString(),
        redacted: false,
        passcodeSalt: "salt",
        passcodeHash: "00",
      });
      expect(stored).toBe(true);
    }

    beforeEach(reset);

    async function shareRow() {
      const rows = await db.sql<{ revoked: boolean; passcode_attempts: number }>`
        select revoked_at is not null as revoked, passcode_attempts
        from map_shares where token = ${TOKEN}`;
      return rows[0];
    }

    it("two revokes at once: one ends the link, the other reads it as already revoked", async () => {
      for (let i = 0; i < 20; i += 1) {
        await reset();
        const results = await Promise.all([
          settle(revokeShareOnce(db.sql, "u1", TOKEN)),
          settle(revokeShareOnce(db.sql, "u1", TOKEN)),
        ]);
        expect(results.map((r) => r.error)).toEqual([null, null]);
        expect(results.map((r) => r.value?.outcome).sort()).toEqual(["already", "revoked"]);
        expect((await shareRow()).revoked).toBe(true);
      }
    });

    it("a revoke during wrong passcode guesses ends the link once and keeps an exact guess count", async () => {
      const guesses = 4;
      for (let i = 0; i < 15; i += 1) {
        await reset();
        const wrong = Array.from({ length: guesses }, () =>
          settle(checkPasscodeGuess(db.sql, TOKEN, "ip", async () => false)),
        );
        const revoke = settle(revokeShareOnce(db.sql, "u1", TOKEN));
        const order = i % 2 === 0 ? [revoke, ...wrong] : [...wrong, revoke];
        const results = await Promise.all(order);
        expect(results.map((r) => r.error)).toEqual(results.map(() => null));
        const revoked = await revoke;
        expect(revoked.value?.outcome).toBe("revoked");
        for (const guess of wrong) expect((await guess).value).toBe("wrong");
        const row = await shareRow();
        expect(row.revoked).toBe(true);
        expect(row.passcode_attempts).toBe(guesses);
        const logged = await db.sql<{ n: number }>`
          select count(*)::int as n from map_share_attempts where token = ${TOKEN}`;
        expect(logged[0].n).toBe(guesses);
      }
    });

    it("a burst of wrong guesses on separate connections takes exactly the attempt limit", async () => {
      const burst = PASSCODE_ATTEMPT_LIMIT + 6;
      const results = await Promise.all(
        Array.from({ length: burst }, () =>
          settle(checkPasscodeGuess(db.sql, TOKEN, "ip", async () => false)),
        ),
      );
      expect(results.map((r) => r.error)).toEqual(results.map(() => null));
      const outcomes = results.map((r) => r.value);
      expect(outcomes.filter((o) => o === "wrong")).toHaveLength(PASSCODE_ATTEMPT_LIMIT);
      expect(outcomes.filter((o) => o === "locked")).toHaveLength(burst - PASSCODE_ATTEMPT_LIMIT);
      expect((await shareRow()).passcode_attempts).toBe(PASSCODE_ATTEMPT_LIMIT);
    });
  },
);
