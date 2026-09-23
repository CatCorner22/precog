import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { Sql } from "@/lib/db";
import {
  INACTIVE_SHARES_LISTED,
  insertMapShare,
  listMapShareSummaries,
  MAX_LIVE_SHARES,
  type NewMapShare,
} from "./share-store";

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
  await pg.exec('delete from map_shares; delete from "user";');
  await pg.query(
    `insert into "user" (id, name, email, "emailVerified", "createdAt", "updatedAt")
     values ('u1', 'u1', 'u1@example.test', true, now(), now())`,
  );
});

const tok = (i: number) => `tok${String(i).padStart(3, "0")}${"a".repeat(30)}`;

async function seedShare(
  i: number,
  opts: { minutesAgo: number; revoked?: boolean; expired?: boolean },
) {
  await pg.query(
    `insert into map_shares (token, user_id, payload, created_at, expires_at, revoked_at)
     values ($1, 'u1', '{}'::jsonb, now() - make_interval(mins => $2),
             case when $4 then now() - interval '1 day' else now() + interval '300 days' end,
             case when $3 then now() else null end)`,
    [tok(i), opts.minutesAgo, Boolean(opts.revoked), Boolean(opts.expired)],
  );
}

function newShare(token: string, userId = "u1"): NewMapShare {
  return {
    token,
    userId,
    businessName: "Biz",
    industry: "dental",
    payloadJson: JSON.stringify({ version: 1 }),
    expiresAt: new Date(Date.now() + 86_400_000).toISOString(),
    redacted: false,
    passcodeSalt: null,
    passcodeHash: null,
  };
}

describe("listMapShareSummaries", () => {
  it("lists every live link even when newer revoked ones exist", async () => {
    // The five oldest links are live; the twenty newest are revoked.
    for (let i = 0; i < 25; i += 1) await seedShare(i, { minutesAgo: 100 - i, revoked: i >= 5 });
    const list = await listMapShareSummaries(sql, "u1");
    const live = list.filter((s) => !s.revoked).map((s) => s.token);
    expect(live.sort()).toEqual([0, 1, 2, 3, 4].map(tok));
    expect(list.filter((s) => s.revoked)).toHaveLength(INACTIVE_SHARES_LISTED);
  });

  it("keeps expired links out of the live set and lists them after it", async () => {
    await seedShare(0, { minutesAgo: 5, expired: true });
    await seedShare(1, { minutesAgo: 50 });
    const list = await listMapShareSummaries(sql, "u1");
    expect(list.map((s) => s.token)).toEqual([tok(0), tok(1)]);
  });

  it("returns more live links than the old limit of 20, newest first", async () => {
    for (let i = 0; i < 30; i += 1) await seedShare(i, { minutesAgo: 100 - i });
    const list = await listMapShareSummaries(sql, "u1");
    expect(list).toHaveLength(30);
    expect(list[0].token).toBe(tok(29));
    expect(list[0].createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
  });

  it("never lists another user's links", async () => {
    await pg.query(
      `insert into "user" (id, name, email, "emailVerified", "createdAt", "updatedAt")
       values ('u2', 'u2', 'u2@example.test', true, now(), now())`,
    );
    expect(await insertMapShare(sql, newShare(tok(900), "u2"))).toBe(true);
    expect(await listMapShareSummaries(sql, "u1")).toEqual([]);
  });
});

describe("insertMapShare", () => {
  it("refuses a new link once the owner holds the live limit, and stores nothing", async () => {
    for (let i = 0; i < 3; i += 1)
      expect(await insertMapShare(sql, newShare(tok(i)), 3)).toBe(true);
    expect(await insertMapShare(sql, newShare(tok(3)), 3)).toBe(false);
    const rows = await pg.query<{ n: number }>("select count(*)::int as n from map_shares");
    expect(rows.rows[0].n).toBe(3);
  });

  it("does not count revoked or expired links toward the limit", async () => {
    await seedShare(0, { minutesAgo: 10, revoked: true });
    await seedShare(1, { minutesAgo: 10, expired: true });
    expect(await insertMapShare(sql, newShare(tok(2)), 1)).toBe(true);
    expect(await insertMapShare(sql, newShare(tok(3)), 1)).toBe(false);
  });

  it("defaults to a limit of MAX_LIVE_SHARES", async () => {
    for (let i = 0; i < MAX_LIVE_SHARES; i += 1) await seedShare(i, { minutesAgo: 10 });
    expect(await insertMapShare(sql, newShare(tok(MAX_LIVE_SHARES)))).toBe(false);
    await pg.query("update map_shares set revoked_at = now() where token = $1", [tok(0)]);
    expect(await insertMapShare(sql, newShare(tok(MAX_LIVE_SHARES)))).toBe(true);
  });

  it("stores the fields it was given", async () => {
    const share = { ...newShare(tok(7)), redacted: true, passcodeSalt: "s", passcodeHash: "h" };
    expect(await insertMapShare(sql, share)).toBe(true);
    const rows = await pg.query<Record<string, unknown>>(
      "select user_id, business_name, industry, payload, redacted, passcode_salt, passcode_hash from map_shares",
    );
    expect(rows.rows[0]).toEqual({
      user_id: "u1",
      business_name: "Biz",
      industry: "dental",
      payload: { version: 1 },
      redacted: true,
      passcode_salt: "s",
      passcode_hash: "h",
    });
  });
});
