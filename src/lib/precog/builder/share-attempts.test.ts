import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { Sql } from "@/lib/db";
import {
  PASSCODE_ATTEMPT_LIMIT,
  passcodeLocked,
  recentPasscodeFailures,
  recordPasscodeFailure,
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

describe("share passcode attempts", () => {
  it("counts only failures inside the window and locks at the limit", async () => {
    expect(await recentPasscodeFailures(sql, TOKEN)).toBe(0);
    expect(await passcodeLocked(sql, TOKEN)).toBe(false);
    for (let i = 0; i < PASSCODE_ATTEMPT_LIMIT - 1; i += 1) {
      await recordPasscodeFailure(sql, TOKEN, "hash");
    }
    expect(await passcodeLocked(sql, TOKEN)).toBe(false);
    await recordPasscodeFailure(sql, TOKEN, null);
    expect(await recentPasscodeFailures(sql, TOKEN)).toBe(PASSCODE_ATTEMPT_LIMIT);
    expect(await passcodeLocked(sql, TOKEN)).toBe(true);
  });

  it("ignores failures older than the window", async () => {
    await pg.query(
      `insert into map_share_attempts (token, attempted_at) values ($1, now() - interval '16 minutes')`,
      [TOKEN],
    );
    expect(await recentPasscodeFailures(sql, TOKEN)).toBe(0);
  });

  it("drops the attempts with the share", async () => {
    await recordPasscodeFailure(sql, TOKEN, "hash");
    await pg.query("delete from map_shares where token = $1", [TOKEN]);
    const rows = await pg.query<{ n: number | string }>(
      "select count(*) as n from map_share_attempts",
    );
    expect(Number(rows.rows[0].n)).toBe(0);
  });
});
