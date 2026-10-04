import type { PGlite } from "@electric-sql/pglite";
import { toCrossJSON } from "seroval";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { Sql } from "@/lib/db";
import { openTestDb, type TestDb } from "@/test/pglite";
import {
  deleteAccountRows,
  encodeHistoryPage,
  exportAccountRows,
  exportBusinessHistoryPage,
  HISTORY_PAGE_BYTES,
  listAccountHistoryBusinesses,
} from "./account-store";

/** Vercel's response body limit. */
const VERCEL_RESPONSE_BYTES = 4.5 * 1024 * 1024;

/** Bytes of the response body TanStack Start sends for a server function's result. */
function wireBytes(result: unknown): number {
  return Buffer.byteLength(JSON.stringify(toCrossJSON(result, { refs: new Map() })));
}

function decodeHistoryPage(base64: string): unknown[] {
  return JSON.parse(Buffer.from(base64, "base64").toString("utf8")) as unknown[];
}

let db: TestDb;
let pg: PGlite;
let sql: Sql;

async function count(table: string, where = "", params: unknown[] = []): Promise<number> {
  const rows = await pg.query<{ n: number | string }>(
    `select count(*) as n from ${table} ${where}`,
    params,
  );
  return Number(rows.rows[0].n);
}

beforeAll(async () => {
  db = await openTestDb();
  pg = db.pg;
  sql = db.sql;
}, 60_000);

afterAll(() => db.close());

beforeEach(async () => {
  await pg.exec(
    'delete from llm_daily_usage; delete from map_share_attempts; delete from map_share_views; delete from map_shares; delete from assessment_snapshots; delete from businesses; delete from business_profiles; delete from billing_accounts; delete from firms; delete from "session"; delete from "user";',
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

  it("lists step pictures and the stored reminder and review fields", async () => {
    await pg.query(
      `insert into procedure_images (id, user_id, business_id, content_type, bytes, byte_size, width, height, sha256, uploaded_by)
       values ('img_a', 'ua', 'biz_1', 'image/png', '\\x0102', 2, 10, 20, 'abc', 'ua')`,
    );
    await pg.query(
      `insert into engagement_marks (user_id, business_id, owner_email) values ('ua', 'biz_1', 'client@example.test')`,
    );
    await pg.query(
      `insert into review_events (user_id, business_id, period, item_key, due_on, result, recorded_by)
       values ('ua', 'biz_1', '2026-08', 'bank_rec', '2026-09-05', 'done', 'ua')`,
    );
    const out = await exportAccountRows(sql, "ua");
    expect(out.procedureImages).toEqual([
      {
        id: "img_a",
        businessId: "biz_1",
        contentType: "image/png",
        byteSize: 2,
        width: 10,
        height: 20,
        sha256: "abc",
        uploadedBy: "ua",
        createdAt: expect.stringMatching(/Z$/),
        unreferencedSince: null,
        path: "/api/procedure-image?b=biz_1&id=img_a",
      },
    ]);
    expect(out.engagements[0].ownerEmail).toBe("client@example.test");
    expect(out.reviews[0]).toMatchObject({ dueOn: "2026-09-05", recordedBy: "ua" });
    expect(JSON.stringify(out)).not.toContain('"bytes"');
    await pg.exec(
      "delete from procedure_images; delete from engagement_marks; delete from review_events;",
    );
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

describe("account deletion and model usage", () => {
  it("removes the account's daily model-usage rows and keeps the global count", async () => {
    await pg.exec(
      `insert into llm_daily_usage (scope, day, calls) values
         ('user:ua', current_date, 4), ('user:ua', current_date - 1, 2),
         ('user:ub', current_date, 3), ('global', current_date, 7)`,
    );
    await deleteAccountRows(sql, "ua");
    expect(await count("llm_daily_usage", "where scope = $1", ["user:ua"])).toBe(0);
    expect(await count("llm_daily_usage", "where scope = $1", ["user:ub"])).toBe(1);
    expect(await count("llm_daily_usage", "where scope = 'global'")).toBe(1);
  });
});

async function seedFirm(ownerId: string, name: string): Promise<void> {
  await pg.query(`insert into firms (user_id, name) values ($1, $2)`, [ownerId, name]);
  await pg.query(
    `insert into firm_members (firm_user_id, member_user_id, role) values ($1, $1, 'owner')`,
    [ownerId],
  );
}

describe("account export covers every table the account owns", () => {
  it("includes history, report versions, firm, reminders, billing and QuickBooks rows", async () => {
    await seedFirm("ua", "Alpha CPA");
    await pg.query(
      `insert into firm_members (firm_user_id, member_user_id, role) values ('ua', 'ub', 'preparer')`,
    );
    await pg.query(
      `insert into firm_invites (token, firm_user_id, email, role, expires_at)
       values ('INVITE_TOKEN_SECRET', 'ua', 'new@example.test', 'reviewer', now() + interval '1 day')`,
    );
    await pg.query(
      `insert into business_history (user_id, business_id, revision, name, industry, profile)
       values ('ua', 'biz_1', 0, 'Biz before', 'dental', '{}'::jsonb)`,
    );
    await pg.query(
      `insert into report_versions (id, user_id, business_id, version_no, profile, scope_note)
       values ('rv_1', 'ua', 'biz_1', 1, '{}'::jsonb, 'Year-end review')`,
    );
    await pg.query(
      `insert into notification_settings (user_id, weekly_digest, owner_reminders) values ('ua', false, true)`,
    );
    await pg.query(
      `insert into reminder_log (user_id, business_id, item_key, due_on, recipient)
       values ('ua', 'biz_1', 'bank-rec', '2026-09-30', 'owner@example.test')`,
    );
    await pg.query(
      `insert into billing_accounts (user_id, stripe_customer_id, subscription_id, subscription_status)
       values ('ua', 'cus_1', 'sub_1', 'canceled')`,
    );
    await pg.query(
      `insert into integration_connections (user_id, business_id, provider, realm_id, access_token_enc,
         refresh_token_enc, access_expires_at, refresh_expires_at)
       values ('ua', 'biz_1', 'qbo', 'realm_1', 'ACCESS_SECRET', 'REFRESH_SECRET', now(), now())`,
    );
    await pg.query(
      `insert into integration_snapshots (user_id, business_id, provider, vendors)
       values ('ua', 'biz_1', 'qbo', '[{"name":"Acme"}]'::jsonb)`,
    );
    await pg.query(
      `insert into business_deletion_markers (user_id, business_id) values ('ua', 'biz_gone')`,
    );

    const out = await exportAccountRows(sql, "ua");
    expect(out).not.toHaveProperty("businessHistory");
    const history = await exportBusinessHistoryPage(sql, "ua", "biz_1", null);
    expect(history.rows.map((h) => h.name)).toEqual(["Biz before"]);
    expect(out.reportVersions.map((r) => r.scopeNote)).toEqual(["Year-end review"]);
    expect(out.firm?.name).toBe("Alpha CPA");
    expect(out.firmMemberships).toEqual([
      expect.objectContaining({ firmUserId: "ua", role: "owner" }),
    ]);
    expect(out.firmMembers.map((m) => m.email).sort()).toEqual([
      "ua@example.test",
      "ub@example.test",
    ]);
    expect(out.firmInvites.map((i) => i.email)).toEqual(["new@example.test"]);
    expect(out.reminderSettings).toEqual({ weeklyDigest: false, ownerReminders: true });
    expect(out.remindersSent[0]).toMatchObject({ itemKey: "bank-rec", dueOn: "2026-09-30" });
    expect(out.billing).toMatchObject({
      stripeCustomerId: "cus_1",
      subscriptionStatus: "canceled",
    });
    expect(out.quickBooksConnections.map((c) => c.realmId)).toEqual(["realm_1"]);
    expect(out.quickBooksSnapshots[0].vendors).toEqual([{ name: "Acme" }]);
    expect(out.deletedBusinesses.map((d) => d.businessId)).toEqual(["biz_gone"]);
    const json = JSON.stringify(out);
    expect(json).not.toContain("INVITE_TOKEN_SECRET");
    expect(json).not.toContain("ACCESS_SECRET");
    expect(json).not.toContain("REFRESH_SECRET");
  });
});

describe("a firm owner's export", () => {
  it("lists the firm's client businesses that members set up as summaries, never their profiles", async () => {
    await seedFirm("ua", "Alpha CPA");
    await pg.query(
      `insert into firm_members (firm_user_id, member_user_id, role) values ('ua', 'ub', 'preparer')`,
    );
    await pg.exec(`
      update businesses set firm_user_id = 'ua';
      update businesses set profile = '{"practiceName":"Member secret"}'::jsonb where user_id = 'ub';
      insert into businesses (id, user_id, name, industry, profile, revision, updated_at)
        values ('biz_private', 'ub', 'Private', 'dental', '{}'::jsonb, 1, now());
    `);
    const owner = await exportAccountRows(sql, "ua", "ua");
    expect(owner.businesses.map((b) => b.id)).toEqual(["biz_1"]);
    expect(owner.firmClients).toEqual([
      {
        id: "biz_1",
        name: "Biz",
        industry: "dental",
        ownerUserId: "ub",
        revision: 1,
        updatedAt: expect.stringMatching(/Z$/),
        deletedAt: null,
      },
    ]);
    expect(JSON.stringify(owner)).not.toContain("Member secret");
    // A member's export, and an owner's without the firm, hold no colleagues' rows.
    expect((await exportAccountRows(sql, "ub", null)).firmClients).toEqual([]);
    expect((await exportAccountRows(sql, "ua")).firmClients).toEqual([]);
  });
});

describe("account deletion safeguards", () => {
  it("rolls every statement back when a later one fails", async () => {
    await pg.exec(`
      create or replace function refuse_user_delete() returns trigger as $$
      begin raise exception 'connection lost'; end $$ language plpgsql;
      create trigger refuse_user_delete before delete on "user"
        for each row when (old.id = 'ua') execute function refuse_user_delete();
    `);
    try {
      await expect(deleteAccountRows(sql, "ua")).rejects.toThrow(/connection lost/);
      expect(await count("assessment_snapshots", "where user_id = $1", ["ua"])).toBe(1);
      expect(await count("businesses", "where user_id = $1", ["ua"])).toBe(1);
      expect(await count('"user"', "where id = $1", ["ua"])).toBe(1);
    } finally {
      await pg.exec(
        `drop trigger refuse_user_delete on "user"; drop function refuse_user_delete();`,
      );
    }
  });

  it("refuses while the firm plan is still billing, and deletes once it is cancelled", async () => {
    await pg.query(
      `insert into billing_accounts (user_id, stripe_customer_id, subscription_id, subscription_status)
       values ('ua', 'cus_1', 'sub_1', 'active')`,
    );
    await expect(deleteAccountRows(sql, "ua")).rejects.toMatchObject({
      status: 409,
      message: expect.stringMatching(/Cancel it with Manage billing/),
    });
    await expect(deleteAccountRows(sql, "ua")).rejects.toMatchObject({
      message: expect.stringMatching(
        /then delete your account\. If you cannot, write to \[SUPPORT EMAIL\]\.$/,
      ),
    });
    expect(await count('"user"', "where id = $1", ["ua"])).toBe(1);
    await pg.exec(
      `update billing_accounts set subscription_status = 'canceled' where user_id = 'ua'`,
    );
    // The Stripe customer comes back so the server can delete it at Stripe.
    await expect(deleteAccountRows(sql, "ua")).resolves.toMatchObject({
      stripeCustomerId: "cus_1",
    });
    expect(await count('"user"', "where id = $1", ["ua"])).toBe(0);
    await expect(deleteAccountRows(sql, "ub")).resolves.toMatchObject({ stripeCustomerId: null });
  });

  it("refuses while a member holds client businesses they set up for another firm", async () => {
    await seedFirm("ua", "Alpha CPA");
    await pg.query(
      `insert into firm_members (firm_user_id, member_user_id, role) values ('ua', 'ub', 'preparer')`,
    );
    await pg.exec(`update businesses set firm_user_id = 'ua' where user_id = 'ub'`);
    await expect(deleteAccountRows(sql, "ub")).rejects.toMatchObject({
      status: 409,
      message: expect.stringMatching(/1 client business for Alpha CPA/),
    });
    await expect(deleteAccountRows(sql, "ub")).rejects.toMatchObject({
      message: expect.stringMatching(
        /then delete your account\. Need help\? Write to \[SUPPORT EMAIL\]\.$/,
      ),
    });
    expect(await count("businesses", "where user_id = $1", ["ub"])).toBe(1);
    await pg.exec(`update businesses set deleted_at = now() where user_id = 'ub'`);
    await deleteAccountRows(sql, "ub");
    expect(await count('"user"', "where id = $1", ["ub"])).toBe(0);
  });

  it("releases members' client businesses from a deleted owner's firm", async () => {
    await seedFirm("ua", "Alpha CPA");
    await pg.exec(`update businesses set firm_user_id = 'ua'`);
    await deleteAccountRows(sql, "ua");
    const rows = await pg.query<{ firm_user_id: string | null }>(
      `select firm_user_id from businesses where user_id = 'ub'`,
    );
    expect(rows.rows).toEqual([{ firm_user_id: null }]);
  });

  it("returns the QuickBooks refresh tokens it removed, for revoking at Intuit", async () => {
    await pg.query(
      `insert into integration_connections (user_id, business_id, provider, realm_id, access_token_enc,
         refresh_token_enc, access_expires_at, refresh_expires_at)
       values ('ua', 'biz_1', 'qbo', 'realm_1', 'sealed_access', 'sealed_refresh', now(), now())`,
    );
    const deleted = await deleteAccountRows(sql, "ua");
    expect(deleted.quickBooksRefreshTokens).toEqual(["sealed_refresh"]);
    expect(await count("integration_connections", "where user_id = $1", ["ua"])).toBe(0);
  });
});

describe("past versions download apart from the account export", () => {
  it("keeps a large account's export small and pages its history under the limit", async () => {
    // 200 past versions of about 50-150 KB each: about 20 MB in all.
    await pg.exec(`
      insert into business_history (user_id, business_id, revision, name, industry, profile)
      select 'ua', 'biz_1', g, 'Biz', 'dental',
        jsonb_build_object('notes', repeat('x', 50000 + g * 500))
      from generate_series(1, 200) as g
    `);

    const json = JSON.stringify(await exportAccountRows(sql, "ua"), null, 2);
    expect(Buffer.byteLength(json)).toBeLessThan(1024 * 1024);
    expect(JSON.parse(json)).not.toHaveProperty("businessHistory");

    const revisions: number[] = [];
    let before: number | null = null;
    let pages = 0;
    do {
      const page = await exportBusinessHistoryPage(sql, "ua", "biz_1", before);
      const body = JSON.stringify(page.rows);
      expect(Buffer.byteLength(body)).toBeLessThanOrEqual(HISTORY_PAGE_BYTES);
      const base64 = encodeHistoryPage(page.rows);
      expect(wireBytes({ base64, nextBeforeRevision: page.nextBeforeRevision })).toBeLessThan(
        VERCEL_RESPONSE_BYTES,
      );
      expect(decodeHistoryPage(base64)).toHaveLength(page.rows.length);
      revisions.push(...page.rows.map((r) => r.revision));
      before = page.nextBeforeRevision;
      pages += 1;
    } while (before !== null && pages < 50);
    expect(pages).toBeGreaterThan(1);
    expect(revisions).toEqual(Array.from({ length: 200 }, (_, i) => 200 - i));

    expect(await listAccountHistoryBusinesses(sql, "ua")).toEqual([
      { businessId: "biz_1", name: "Biz", versions: 200, ownerUserId: "ua" },
    ]);
  }, 60_000);

  it("keeps pages of quote-heavy profiles under the response limit on the wire", async () => {
    // Quotes, backslashes and `<` grow four to five times when a JSON string
    // travels inside the transport's JSON; base64 keeps them at 4/3.
    await pg.exec(`
      insert into business_history (user_id, business_id, revision, name, industry, profile)
      select 'ua', 'biz_1', g, 'Biz', 'dental',
        (select jsonb_agg(jsonb_build_object('k', '"<\\', 'v', '"q"')) from generate_series(1, 9000))
      from generate_series(1, 12) as g
    `);
    const revisions: number[] = [];
    let before: number | null = null;
    let pages = 0;
    do {
      const page = await exportBusinessHistoryPage(sql, "ua", "biz_1", before);
      const raw = { json: JSON.stringify(page.rows), nextBeforeRevision: page.nextBeforeRevision };
      const sent = {
        base64: encodeHistoryPage(page.rows),
        nextBeforeRevision: page.nextBeforeRevision,
      };
      if (page.rows.length > 1) expect(wireBytes(raw)).toBeGreaterThan(VERCEL_RESPONSE_BYTES);
      expect(wireBytes(sent)).toBeLessThan(VERCEL_RESPONSE_BYTES);
      expect(decodeHistoryPage(sent.base64)).toEqual(JSON.parse(raw.json));
      revisions.push(...page.rows.map((r) => r.revision));
      before = page.nextBeforeRevision;
      pages += 1;
    } while (before !== null && pages < 20);
    expect(pages).toBeGreaterThan(1);
    expect(revisions).toEqual(Array.from({ length: 12 }, (_, i) => 12 - i));
  }, 60_000);

  it("returns history only to the account that owns it", async () => {
    await pg.exec(`
      insert into business_history (user_id, business_id, revision, name, industry, profile)
      values ('ua', 'biz_1', 1, 'Biz', 'dental', '{"notes":"ua only"}'::jsonb)
    `);
    const own = await exportBusinessHistoryPage(sql, "ua", "biz_1", null);
    expect(own.rows.map((r) => r.profile)).toEqual([{ notes: "ua only" }]);
    expect(own.nextBeforeRevision).toBeNull();
    const other = await exportBusinessHistoryPage(sql, "ub", "biz_1", null);
    expect(other).toEqual({ rows: [], nextBeforeRevision: null });
    expect(await listAccountHistoryBusinesses(sql, "ub")).toEqual([]);
  });

  it("lists and pages a member's firm client for the firm owner, and nobody else's", async () => {
    await seedFirm("ua", "Alpha CPA");
    await pg.query(
      `insert into firm_members (firm_user_id, member_user_id, role) values ('ua', 'ub', 'preparer')`,
    );
    await pg.exec(`
      update businesses set firm_user_id = 'ua';
      insert into businesses (id, user_id, name, industry, profile, revision, updated_at)
        values ('biz_private', 'ub', 'Private', 'dental', '{}'::jsonb, 1, now());
      insert into business_history (user_id, business_id, revision, name, industry, profile)
      values ('ua', 'biz_1', 1, 'Biz', 'dental', '{"notes":"owner"}'::jsonb),
        ('ub', 'biz_1', 1, 'Biz', 'dental', '{"notes":"member"}'::jsonb),
        ('ub', 'biz_private', 1, 'Private', 'dental', '{"notes":"private"}'::jsonb);
    `);
    // The owner lists their own row and the member's firm client, not the
    // member's private business; the member lists only their own rows.
    expect(await listAccountHistoryBusinesses(sql, "ua", "ua")).toEqual([
      { businessId: "biz_1", name: "Biz", versions: 1, ownerUserId: "ua" },
      { businessId: "biz_1", name: "Biz", versions: 1, ownerUserId: "ub" },
    ]);
    expect((await listAccountHistoryBusinesses(sql, "ub")).map((b) => b.ownerUserId)).toEqual([
      "ub",
      "ub",
    ]);
    // The owner's own row wins the shared id; a member's firm client pages for the owner.
    const own = await exportBusinessHistoryPage(sql, "ua", "biz_1", null, undefined, "ua");
    expect(own.rows.map((r) => r.profile)).toEqual([{ notes: "owner" }]);
    await pg.exec(`delete from businesses where user_id = 'ua'`);
    const theirs = await exportBusinessHistoryPage(sql, "ua", "biz_1", null, undefined, "ua");
    expect(theirs.rows.map((r) => r.profile)).toEqual([{ notes: "member" }]);
    const outside = await exportBusinessHistoryPage(
      sql,
      "ua",
      "biz_private",
      null,
      undefined,
      "ua",
    );
    expect(outside.rows).toEqual([]);
    // Without the firm (a member, or a solo account) the member's row is out of reach.
    expect((await exportBusinessHistoryPage(sql, "ua", "biz_1", null)).rows).toEqual([]);
  });

  it("puts a version larger than the page budget on a page of its own", async () => {
    await pg.exec(`
      insert into business_history (user_id, business_id, revision, name, industry, profile)
      select 'ua', 'biz_1', g, 'Biz', 'dental', jsonb_build_object('notes', repeat('y', 2000))
      from generate_series(1, 3) as g
    `);
    const first = await exportBusinessHistoryPage(sql, "ua", "biz_1", null, 100);
    expect(first.rows.map((r) => r.revision)).toEqual([3]);
    expect(first.nextBeforeRevision).toBe(3);
    const rest = await exportBusinessHistoryPage(sql, "ua", "biz_1", 3, 10_000);
    expect(rest.rows.map((r) => r.revision)).toEqual([2, 1]);
    expect(rest.nextBeforeRevision).toBeNull();
  });
});
