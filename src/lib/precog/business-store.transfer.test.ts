import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { Sql } from "@/lib/db";
import { openTestDb, type TestDb } from "@/test/pglite";
import { acceptInvite, createInvite, removeMember, saveFirm } from "./firm/store";

let db: TestDb;

beforeAll(async () => {
  db = await openTestDb();
}, 60_000);

afterAll(async () => {
  await db.close();
});

beforeEach(async () => {
  await db.clear(
    "map_shares",
    "review_events",
    "engagement_marks",
    "report_versions",
    "business_history",
    "business_deletion_markers",
    "firm_invites",
    "firm_members",
    "firms",
    "businesses",
    "business_profiles",
    '"user"',
  );
  for (const id of ["ua", "ub"]) await db.seedUser(id);
});

/** Wraps `inner` so every statement it runs, inside transactions too, is counted. */
function counting(inner: Sql, statements: string[]): Sql {
  const sql = ((strings: TemplateStringsArray, ...values: unknown[]) => {
    statements.push(strings.join("$"));
    return inner(strings, ...values);
  }) as Sql;
  sql.query = (text, params) => {
    statements.push(text);
    return inner.query(text, params);
  };
  const begin = inner.transaction?.bind(inner);
  if (begin) sql.transaction = (work) => begin((tx) => work(counting(tx, statements)));
  return sql;
}

/**
 * A firm owned by ua, with ub as a member who set up `n` clients (biz_0 …),
 * each with a past version, a locked version, an engagement row, a review, a
 * colleague's share and a colleague's pointer. The owner holds biz_0 too.
 */
async function seed(n: number) {
  await saveFirm(db.sql, "ua", "North", "assessment");
  await createInvite(db.sql, {
    firmUserId: "ua",
    email: "ub@example.test",
    role: "preparer",
    token: "t1",
  });
  await acceptInvite(db.sql, "t1", "ub");
  await db.pg.query(
    `insert into businesses (id, user_id, name, industry, profile, revision, firm_user_id)
     values ('biz_0', 'ua', 'Owner own', 'general', '{}'::jsonb, 1, 'ua')`,
  );
  for (let i = 0; i < n; i += 1) {
    const id = `biz_${i}`;
    await db.pg.query(
      `insert into businesses (id, user_id, name, industry, profile, revision, firm_user_id)
       values ($1, 'ub', $2, 'dental', '{"k":1}'::jsonb, 3, 'ua')`,
      [id, `Client ${i}`],
    );
    await db.pg.query(
      `insert into business_history (user_id, business_id, revision, name, industry, profile)
       values ('ub', $1, 2, 'Before', 'dental', '{}'::jsonb)`,
      [id],
    );
    await db.pg.query(
      `insert into report_versions (id, user_id, business_id, version_no, profile)
       values ($1, 'ub', $2, 1, '{}'::jsonb)`,
      [`rv_${i}`, id],
    );
    await db.pg.query("insert into engagement_marks (user_id, business_id) values ('ub', $1)", [
      id,
    ]);
    await db.pg.query(
      `insert into review_events (user_id, business_id, period, item_key, result)
       values ('ub', $1, '2026-09', 'bank_statement', 'done')`,
      [id],
    );
    await db.pg.query(
      `insert into map_shares (token, user_id, business_owner_id, business_id, payload)
       values ($1, 'ua', 'ub', $2, '{}'::jsonb)`,
      [`share_${i}`, id],
    );
  }
  await db.pg.query(
    `insert into business_profiles (user_id, profile)
     values ('ua', '{"businessId":"biz_1","ownerUserId":"ub"}'::jsonb),
            ('ub', '{"businessId":"biz_1","ownerUserId":"ub"}'::jsonb)`,
  );
}

describe("a member's departure moves all their businesses at once (PERF-10)", () => {
  it("moves every client and its rows, renaming the one whose id the owner holds", async () => {
    await seed(3);
    const moved = await removeMember(db.sql, "ua", "ub");
    expect(moved).toEqual([
      { from: "biz_0", to: expect.stringMatching(/^biz_0-[0-9a-f]{8}$/), name: "Client 0" },
      { from: "biz_1", to: "biz_1", name: "Client 1" },
      { from: "biz_2", to: "biz_2", name: "Client 2" },
    ]);
    const renamed = moved?.[0].to ?? "";
    const businesses = await db.pg.query<{
      id: string;
      user_id: string;
      name: string;
      revision: number;
      saved_by: string | null;
      profile: unknown;
    }>("select id, user_id, name, revision, saved_by, profile from businesses order by name");
    expect(businesses.rows).toEqual([
      {
        id: renamed,
        user_id: "ua",
        name: "Client 0",
        revision: 4,
        saved_by: "ub",
        profile: { k: 1 },
      },
      {
        id: "biz_1",
        user_id: "ua",
        name: "Client 1",
        revision: 4,
        saved_by: "ub",
        profile: { k: 1 },
      },
      {
        id: "biz_2",
        user_id: "ua",
        name: "Client 2",
        revision: 4,
        saved_by: "ub",
        profile: { k: 1 },
      },
      { id: "biz_0", user_id: "ua", name: "Owner own", revision: 1, saved_by: null, profile: {} },
    ]);
    const children = await db.pg.query<{ t: string; owner: string; business_id: string }>(
      `select 'history' as t, user_id as owner, business_id from business_history
       union all select 'version', user_id, business_id from report_versions
       union all select 'engagement', user_id, business_id from engagement_marks
       union all select 'review', user_id, business_id from review_events
       union all select 'share', business_owner_id, business_id from map_shares
       order by 1, 3`,
    );
    const expected = (t: string) =>
      [renamed, "biz_1", "biz_2"].sort().map((business_id) => ({ t, owner: "ua", business_id }));
    expect(children.rows).toEqual(
      ["engagement", "history", "review", "share", "version"].flatMap(expected),
    );
    const pointers = await db.pg.query<{ user_id: string; profile: unknown }>(
      "select user_id, profile from business_profiles order by user_id",
    );
    expect(pointers.rows).toEqual([
      { user_id: "ua", profile: { businessId: "biz_1", ownerUserId: "ua" } },
    ]);
  });

  it("runs the same number of statements for one client as for twelve", async () => {
    const statementsFor = async (n: number) => {
      await seed(n);
      const statements: string[] = [];
      expect(await removeMember(counting(db.sql, statements), "ua", "ub")).toHaveLength(n);
      await db.clear(
        "map_shares",
        "review_events",
        "engagement_marks",
        "report_versions",
        "business_history",
        "business_deletion_markers",
        "firm_invites",
        "firm_members",
        "firms",
        "businesses",
        "business_profiles",
      );
      return statements.length;
    };
    const one = await statementsFor(1);
    expect(await statementsFor(12)).toBe(one);
  });
});
