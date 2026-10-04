import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { openTestDb, type TestDb } from "@/test/pglite";
import { digestAddressProblem } from "./store";
import { GOOGLE_ACCOUNT, TRUSTED_EMAIL, VOUCHED_EMAIL, X_ACCOUNT } from "./vouched-email";

/**
 * The five kinds of account the rules tell apart, each with the sign-ins
 * (`account` rows) and the confirmed flag the auth broker or Better Auth set.
 */
const ACCOUNTS: { id: string; verified: boolean; providers: string[] }[] = [
  { id: "password_confirmed", verified: true, providers: ["credential"] },
  { id: "google_confirmed", verified: true, providers: ["grok-google"] },
  { id: "google_unconfirmed", verified: false, providers: ["grok-google"] },
  { id: "x_only", verified: true, providers: ["grok-x"] },
  { id: "x_and_google", verified: true, providers: ["grok-x", "grok-google"] },
];

describe("vouched addresses", () => {
  let db: TestDb;
  beforeAll(async () => {
    db = await openTestDb();
    for (const a of ACCOUNTS) {
      await db.seedUser(a.id, `${a.id}@example.test`);
      await db.pg.query(`update "user" set "emailVerified" = $2 where id = $1`, [a.id, a.verified]);
      for (const p of a.providers) {
        await db.pg.query(
          `insert into account (id, "accountId", "providerId", "userId", "createdAt", "updatedAt")
           values ($1, $2, $3, $4, now(), now())`,
          [`${a.id}_${p}`, a.id, p, a.id],
        );
      }
    }
  }, 60_000);
  afterAll(async () => {
    await db.close();
  });

  async function verdicts(fragment: (alias: string) => string): Promise<Record<string, boolean>> {
    const rows = await db.sql.query<{ id: string; ok: boolean }>(
      `select u.id, ${fragment("u")} as ok from "user" u order by u.id`,
    );
    return Object.fromEntries(rows.map((r) => [r.id, r.ok]));
  }

  it("vouches as the firm join does: confirmed, and a password or Google sign-in or no X", async () => {
    expect(await verdicts(VOUCHED_EMAIL)).toEqual({
      google_confirmed: true,
      google_unconfirmed: false,
      password_confirmed: true,
      x_and_google: true,
      x_only: false,
    });
  });

  it("trusts for email a vouched address or any Google sign-in, never an X-only one", async () => {
    expect(await verdicts(TRUSTED_EMAIL)).toEqual({
      google_confirmed: true,
      google_unconfirmed: true,
      password_confirmed: true,
      x_and_google: true,
      x_only: false,
    });
  });

  it("names the sign-ins it reads", async () => {
    expect(await verdicts(GOOGLE_ACCOUNT)).toMatchObject({
      google_unconfirmed: true,
      x_only: false,
    });
    expect(await verdicts(X_ACCOUNT)).toMatchObject({ x_only: true, google_confirmed: false });
  });

  it("says why the digest cannot reach an address", async () => {
    const problems: Record<string, string | null> = {};
    for (const a of ACCOUNTS) problems[a.id] = await digestAddressProblem(db.sql, a.id);
    expect(problems).toEqual({
      password_confirmed: null,
      google_confirmed: null,
      google_unconfirmed: null,
      x_only: "x_only",
      x_and_google: null,
    });
    expect(await digestAddressProblem(db.sql, "nobody")).toBeNull();
  });
});
