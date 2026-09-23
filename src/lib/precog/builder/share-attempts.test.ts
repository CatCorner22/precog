import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { Sql } from "@/lib/db";
import {
  checkPasscodeGuess,
  PASSCODE_ATTEMPT_LIMIT,
  PASSCODE_ATTEMPT_RETENTION_DAYS,
  passcodeLocked,
  purgeOldPasscodeAttempts,
  recordPasscodeFailure,
  reservePasscodeGuess,
} from "./share-attempts";

/** Same PGLite harness as business-store.test.ts: every migration applied for real. */
const MIGRATIONS_DIR = join(process.cwd(), "migrations");

let pg: PGlite;
let sql: Sql;

function pgliteSql(db: PGlite): Sql {
  const run = async <T>(text: string, params: unknown[]) => (await db.query<T>(text, params)).rows;
  const tagged = (async <T = Record<string, unknown>>(
    strings: TemplateStringsArray,
    ...values: unknown[]
  ): Promise<T[]> => {
    let text = strings[0];
    for (let i = 0; i < values.length; i += 1) text += `$${i + 1}${strings[i + 1]}`;
    return run<T>(text, values);
  }) as unknown as Sql;
  tagged.query = <T = Record<string, unknown>>(text: string, params: unknown[] = []) =>
    run<T>(text, params);
  return tagged;
}

beforeAll(async () => {
  pg = new PGlite();
  const files = (await readdir(MIGRATIONS_DIR)).filter((f) => f.endsWith(".sql")).sort();
  for (const name of files) await pg.exec(await readFile(join(MIGRATIONS_DIR, name), "utf8"));
  sql = pgliteSql(pg);
});

afterAll(async () => {
  await pg.close();
});

beforeEach(async () => {
  await pg.exec('delete from map_share_attempts; delete from map_shares; delete from "user";');
  await pg.query(
    `insert into "user" (id, name, email, "emailVerified", "createdAt", "updatedAt")
     values ('u1', 'u1', 'u1@example.test', true, now(), now())`,
  );
  await pg.query(
    `insert into map_shares (token, user_id, business_name, industry, payload, expires_at)
     values ('abcdef0123456789abcdef0123456789abcd', 'u1', 'Biz', 'dental', '{}'::jsonb, now() + interval '1 day')`,
  );
});

const TOKEN = "abcdef0123456789abcdef0123456789abcd";

const wrong = () => checkPasscodeGuess(sql, TOKEN, "hash", async () => false);
const right = () => checkPasscodeGuess(sql, TOKEN, "hash", async () => true);

async function logRows(): Promise<number> {
  const rows = await pg.query<{ n: number }>("select count(*)::int as n from map_share_attempts");
  return rows.rows[0].n;
}

describe("share passcode lock", () => {
  it("locks after the limit of wrong guesses in the window", async () => {
    expect(await passcodeLocked(sql, TOKEN)).toBe(false);
    for (let i = 0; i < PASSCODE_ATTEMPT_LIMIT - 1; i += 1) expect(await wrong()).toBe("wrong");
    expect(await passcodeLocked(sql, TOKEN)).toBe(false);
    expect(await wrong()).toBe("wrong");
    expect(await passcodeLocked(sql, TOKEN)).toBe(true);
    expect(await wrong()).toBe("locked");
    // A locked share refuses even the right passcode until the window ends.
    expect(await right()).toBe("locked");
    expect(await logRows()).toBe(PASSCODE_ATTEMPT_LIMIT);
  });

  it("evaluates no more than the limit when many guesses arrive at once", async () => {
    // Regression: the lock was checked, the passcode hashed, and only then the
    // failure recorded, so 40 concurrent guesses were all evaluated.
    let evaluated = 0;
    const slowWrong = () =>
      checkPasscodeGuess(sql, TOKEN, "hash", async () => {
        evaluated += 1;
        await new Promise((resolve) => setTimeout(resolve, 20));
        return false;
      });
    const results = await Promise.all(Array.from({ length: 40 }, slowWrong));
    expect(evaluated).toBe(PASSCODE_ATTEMPT_LIMIT);
    expect(results.filter((r) => r === "wrong")).toHaveLength(PASSCODE_ATTEMPT_LIMIT);
    expect(results.filter((r) => r === "locked")).toHaveLength(40 - PASSCODE_ATTEMPT_LIMIT);
    expect(await wrong()).toBe("locked");
  });

  it("does not count right guesses toward the lock", async () => {
    for (let i = 0; i < PASSCODE_ATTEMPT_LIMIT * 2; i += 1) expect(await right()).toBe("correct");
    for (let i = 0; i < PASSCODE_ATTEMPT_LIMIT - 1; i += 1) await wrong();
    expect(await right()).toBe("correct");
    expect(await passcodeLocked(sql, TOKEN)).toBe(false);
    expect(await logRows()).toBe(PASSCODE_ATTEMPT_LIMIT - 1);
  });

  it("gives the place back when checking the passcode throws", async () => {
    for (let i = 0; i < PASSCODE_ATTEMPT_LIMIT - 1; i += 1) await wrong();
    await expect(
      checkPasscodeGuess(sql, TOKEN, "hash", async () => {
        throw new Error("scrypt failed");
      }),
    ).rejects.toThrow("scrypt failed");
    expect(await passcodeLocked(sql, TOKEN)).toBe(false);
    expect(await wrong()).toBe("wrong");
    expect(await passcodeLocked(sql, TOKEN)).toBe(true);
  });

  it("starts a new window once the old one is over", async () => {
    for (let i = 0; i < PASSCODE_ATTEMPT_LIMIT; i += 1) await wrong();
    expect(await passcodeLocked(sql, TOKEN)).toBe(true);
    await pg.query(
      "update map_shares set passcode_window_started_at = now() - interval '16 minutes' where token = $1",
      [TOKEN],
    );
    expect(await passcodeLocked(sql, TOKEN)).toBe(false);
    expect(await wrong()).toBe("wrong");
    const rows = await pg.query<{ passcode_attempts: number }>(
      "select passcode_attempts from map_shares where token = $1",
      [TOKEN],
    );
    expect(rows.rows[0].passcode_attempts).toBe(1);
  });

  it("keeps each share's count separate", async () => {
    const other = "0123456789abcdef0123456789abcdef0123";
    await pg.query(
      `insert into map_shares (token, user_id, business_name, industry, payload, expires_at)
       values ($1, 'u1', 'Biz', 'dental', '{}'::jsonb, now() + interval '1 day')`,
      [other],
    );
    for (let i = 0; i < PASSCODE_ATTEMPT_LIMIT; i += 1) await wrong();
    expect(await reservePasscodeGuess(sql, other)).toBe(true);
    expect(await passcodeLocked(sql, other)).toBe(false);
  });

  it("reserves nothing for a token that does not exist", async () => {
    expect(await reservePasscodeGuess(sql, "f".repeat(36))).toBe(false);
  });
});

describe("failed-guess log", () => {
  it("purges rows older than the retention period and keeps recent ones", async () => {
    await pg.query(
      `insert into map_share_attempts (token, attempted_at)
       values ($1, now() - make_interval(days => $2))`,
      [TOKEN, PASSCODE_ATTEMPT_RETENTION_DAYS + 1],
    );
    await recordPasscodeFailure(sql, TOKEN, "hash");
    await purgeOldPasscodeAttempts(sql);
    expect(await logRows()).toBe(1);
  });

  it("drops the log with the share", async () => {
    await recordPasscodeFailure(sql, TOKEN, "hash");
    await pg.query("delete from map_shares where token = $1", [TOKEN]);
    expect(await logRows()).toBe(0);
  });
});
