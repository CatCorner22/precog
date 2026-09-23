import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { Sql } from "@/lib/db";
import { deleteAccountRows, exportAccountRows, purgeOldShareViews } from "./account-store";

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

async function count(table: string, where = "", params: unknown[] = []): Promise<number> {
  const rows = await pg.query<{ n: number | string }>(
    `select count(*) as n from ${table} ${where}`,
    params,
  );
  return Number(rows.rows[0].n);
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
  await pg.exec(
    'delete from map_share_attempts; delete from map_share_views; delete from map_shares; delete from assessment_snapshots; delete from businesses; delete from business_profiles; delete from "session"; delete from "user";',
  );
  for (const id of ["ua", "ub"]) {
    await pg.query(
      `insert into "user" (id, name, email, "emailVerified", "createdAt", "updatedAt")
       values ($1, $1, $2, true, now(), now())`,
      [id, `${id}@example.test`],
    );
    await pg.query(
      `insert into businesses (id, user_id, name, industry, profile, revision, updated_at)
       values ('biz_1', $1, 'Biz', 'dental', '{"practiceName":"Biz"}'::jsonb, 1, now())`,
      [id],
    );
    await pg.query(
      `insert into business_profiles (user_id, name, industry, profile, updated_at)
       values ($1, 'Biz', 'dental', '{"businessId":"biz_1"}'::jsonb, now())`,
      [id],
    );
    await pg.query(
      `insert into assessment_snapshots (id, user_id, title, practice_name, profile_json, model_version, corpus_version)
       values ($1, $2, 'Snap', 'Biz', '{}'::jsonb, 'm', 'c')`,
      [`snap_${id}`, id],
    );
    await pg.query(
      `insert into map_shares (token, user_id, business_name, industry, payload, expires_at, passcode_hash, passcode_salt)
       values ($1, $2, 'Biz', 'dental', '{"v":1}'::jsonb, now() + interval '1 day', 'hash', 'salt')`,
      [`${id.repeat(12)}`, id],
    );
    await pg.query(`insert into map_share_views (token, viewed_at) values ($1, now())`, [
      `${id.repeat(12)}`,
    ]);
    await pg.query(
      `insert into "session" (id, "expiresAt", token, "updatedAt", "userId") values ($1, now() + interval '1 day', $2, now(), $3)`,
      [`sess_${id}`, `tok_${id}`, id],
    );
  }
});

describe("account export", () => {
  it("returns only the caller's rows and never the passcode hash", async () => {
    const out = await exportAccountRows(sql, "ua");
    expect(out.user?.email).toBe("ua@example.test");
    expect(out.businesses.map((b) => b.name)).toEqual(["Biz"]);
    expect(out.snapshots).toHaveLength(1);
    expect(out.shares).toHaveLength(1);
    expect(out.shares[0].token).toBe("ua".repeat(12));
    expect(JSON.stringify(out)).not.toContain("hash");
    expect(JSON.stringify(out)).not.toContain("salt");
  });

  it("writes every timestamp as ISO 8601 with milliseconds", async () => {
    await pg.query("update map_shares set revoked_at = now() where user_id = 'ua'");
    const out = await exportAccountRows(sql, "ua");
    const iso = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
    expect(out.user?.createdAt).toMatch(iso);
    expect(out.businesses[0].updatedAt).toMatch(iso);
    expect(out.snapshots[0].createdAt).toMatch(iso);
    expect(out.shares[0].createdAt).toMatch(iso);
    expect(out.shares[0].expiresAt).toMatch(iso);
    expect(out.shares[0].revokedAt).toMatch(iso);
  });
});

describe("account deletion", () => {
  it("removes everything the account owns, cascades, and leaves other accounts intact", async () => {
    await deleteAccountRows(sql, "ua");
    expect(await count('"user"', "where id = $1", ["ua"])).toBe(0);
    expect(await count("businesses", "where user_id = $1", ["ua"])).toBe(0);
    expect(await count("business_profiles", "where user_id = $1", ["ua"])).toBe(0);
    expect(await count("assessment_snapshots", "where user_id = $1", ["ua"])).toBe(0);
    expect(await count("map_shares", "where user_id = $1", ["ua"])).toBe(0);
    expect(await count("map_share_views", "where token = $1", ["ua".repeat(12)])).toBe(0);
    expect(await count('"session"', 'where "userId" = $1', ["ua"])).toBe(0);
    expect(await count('"user"', "where id = $1", ["ub"])).toBe(1);
    expect(await count("businesses", "where user_id = $1", ["ub"])).toBe(1);
    expect(await count("assessment_snapshots", "where user_id = $1", ["ub"])).toBe(1);
    expect(await count("map_shares", "where user_id = $1", ["ub"])).toBe(1);
  });
});

describe("share view retention", () => {
  it("purges views older than the retention window and keeps recent ones", async () => {
    await pg.query(
      `insert into map_share_views (token, viewed_at) values ($1, now() - interval '91 days')`,
      ["ua".repeat(12)],
    );
    expect(await count("map_share_views")).toBe(3);
    await purgeOldShareViews(sql);
    expect(await count("map_share_views")).toBe(2);
  });
});
