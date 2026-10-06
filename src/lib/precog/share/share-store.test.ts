import type { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { Sql } from "@/lib/db";
import { openTestDb, type TestDb } from "@/test/pglite";
import {
  INACTIVE_SHARES_LISTED,
  insertMapShare,
  listMapShareSummaries,
  MAX_LIVE_SHARES,
  recordShareView,
  revokeShareOnce,
  shareStillReachable,
  type NewMapShare,
  purgeOldShareViews,
} from "./share-store";
import { deleteBusinessRow } from "../business-store";
import { leaveFirm, removeMember } from "../firm/store";

let db: TestDb;
let pg: PGlite;
let sql: Sql;

beforeAll(async () => {
  db = await openTestDb();
  pg = db.pg;
  sql = db.sql;
}, 60_000);

afterAll(() => db.close());

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

  it("stores the fields it was given, and lists a map link as a map", async () => {
    const share = { ...newShare(tok(7)), redacted: true, passcodeSalt: "s", passcodeHash: "h" };
    expect(await insertMapShare(sql, share)).toBe(true);
    const [listed] = await listMapShareSummaries(sql, "u1");
    expect([listed.kind, listed.reportVersionId, listed.versionNo, listed.businessId]).toEqual([
      "map",
      null,
      null,
      null,
    ]);
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

describe("share view retention", () => {
  it("purges views older than the retention window and keeps recent ones", async () => {
    await seedShare(1, { minutesAgo: 5 });
    await pg.query(
      `insert into map_share_views (token, viewed_at) values ($1, now()), ($1, now() - interval '91 days')`,
      [tok(1)],
    );
    await purgeOldShareViews(sql);
    const rows = await pg.query<{ n: number }>("select count(*)::int as n from map_share_views");
    expect(rows.rows[0].n).toBe(1);
  });
});

describe("recordShareView", () => {
  it("logs one view per address per minute, however often the page is loaded", async () => {
    await seedShare(0, { minutesAgo: 10 });
    const view = (ipHash: string) =>
      recordShareView(sql, { token: tok(0), ipHash, userAgent: "test" });
    for (let i = 0; i < 5; i += 1) await view("ip-a");
    await view("ip-b");
    const count = async () =>
      (await pg.query<{ n: number }>("select count(*)::int as n from map_share_views")).rows[0].n;
    expect(await count()).toBe(2);
    await pg.query("update map_share_views set viewed_at = now() - interval '2 minutes'");
    await view("ip-a");
    expect(await count()).toBe(3);
  });
});

describe("revoking links with the business and the firm", () => {
  // Firm "owner" with member "prep"; "own_biz" belongs to the owner and
  // "prep_biz" to the member, both in the firm; "outsider" is in no firm.
  beforeEach(async () => {
    for (const id of ["owner", "prep", "outsider"]) {
      await pg.query(
        `insert into "user" (id, name, email, "emailVerified", "createdAt", "updatedAt")
         values ($1, $1, $1 || '@example.test', true, now(), now())`,
        [id],
      );
    }
    await pg.exec(`
      insert into firms (user_id, name) values ('owner', 'North');
      insert into firm_members (firm_user_id, member_user_id, role)
        values ('owner', 'owner', 'owner'), ('owner', 'prep', 'preparer');
      insert into businesses (id, user_id, name, industry, profile, revision, firm_user_id)
        values ('own_biz', 'owner', 'Own', 'dental', '{}'::jsonb, 1, 'owner'),
          ('prep_biz', 'prep', 'Prep', 'dental', '{}'::jsonb, 1, 'owner');
    `);
  });

  const linkTo = (token: string, maker: string, businessOwnerId: string, businessId: string) =>
    insertMapShare(sql, { ...newShare(token, maker), businessOwnerId, businessId });
  const revoked = async (token: string) =>
    (
      await pg.query<{ r: boolean }>(
        "select revoked_at is not null as r from map_shares where token = $1",
        [token],
      )
    ).rows[0].r;
  /** What revoking `token` as `userId` says: "revoked", "already" or null. */
  const revoke = async (userId: string, token: string) =>
    (await revokeShareOnce(sql, userId, token))?.outcome ?? null;

  it("lets the firm owner list and revoke a colleague's link to a firm client, and nobody else", async () => {
    await linkTo(tok(1), "prep", "owner", "own_biz");
    const listed = await listMapShareSummaries(sql, "owner");
    expect(listed.map((l) => [l.token, l.createdBy, l.createdByFirm])).toEqual([
      [tok(1), "prep", "North"],
    ]);
    expect(await listMapShareSummaries(sql, "outsider")).toEqual([]);
    expect(await revoke("outsider", tok(1))).toBe(null);
    expect(await revoked(tok(1))).toBe(false);
    expect(await revoke("owner", tok(1))).toBe("revoked");
    expect(await revoked(tok(1))).toBe(true);
  });

  it("revokes through revokeShareOnce alone, the call the share panel's revoke makes", async () => {
    const store = await import("./share-store");
    expect(Object.keys(store)).toContain("revokeShareOnce");
    expect(Object.keys(store)).not.toContain("revokeShare");
  });

  it("leaves the links a business's own account made to it out of the firm owner's reach, once shared", async () => {
    // The outsider shared out_biz with the firm; the firm's preparer works on it.
    await pg.exec(`
      insert into businesses (id, user_id, name, industry, profile, revision, firm_user_id, granted_at)
        values ('out_biz', 'outsider', 'Shared', 'dental', '{}'::jsonb, 1, 'owner', now());
    `);
    await linkTo(tok(1), "outsider", "outsider", "out_biz"); // the business's own account's link
    await linkTo(tok(2), "prep", "outsider", "out_biz"); // the firm's link
    await linkTo(tok(3), "outsider", "outsider", "out_biz");
    await pg.query("update map_shares set revoked_at = now() where token = $1", [tok(3)]);
    // The firm owner lists and revokes the firm's link, never the owner's own, live or past.
    expect((await listMapShareSummaries(sql, "owner")).map((l) => l.token)).toEqual([tok(2)]);
    expect(await revoke("owner", tok(1))).toBe(null);
    expect(await revoked(tok(1))).toBe(false);
    expect(await revoke("owner", tok(2))).toBe("revoked");
    // The business's own account keeps listing and revoking its links, and
    // lists the firm's link too, named as the firm's.
    const own = await listMapShareSummaries(sql, "outsider");
    expect(own.map((l) => [l.token, l.createdBy, l.createdByFirm]).sort()).toEqual([
      [tok(1), null, null],
      [tok(2), "prep", "North"],
      [tok(3), null, null],
    ]);
    expect(await revoke("outsider", tok(1))).toBe("revoked");
    expect(await revoke("outsider", tok(2))).toBe("already");
  });

  it("says whether a revoke ended a live link or found it revoked already", async () => {
    await linkTo(tok(1), "prep", "owner", "own_biz");
    expect(await revoke("outsider", tok(1))).toBe(null);
    expect(await revoke("prep", tok(1))).toBe("revoked");
    const first = await pg.query<{ at: string }>(
      "select revoked_at::text as at from map_shares where token = $1",
      [tok(1)],
    );
    expect(await revoke("owner", tok(1))).toBe("already");
    expect(await revoke("prep", tok(1))).toBe("already");
    const again = await pg.query<{ at: string }>(
      "select revoked_at::text as at from map_shares where token = $1",
      [tok(1)],
    );
    expect(again.rows[0].at).toBe(first.rows[0].at);
    expect(await revoke("prep", tok(9))).toBe(null);
  });

  it("hands back the business the revoked link copies, for the activity log", async () => {
    await linkTo(tok(1), "prep", "owner", "own_biz");
    await insertMapShare(sql, newShare(tok(2), "prep")); // made before links named a business
    expect(await revokeShareOnce(sql, "owner", tok(1))).toEqual({
      outcome: "revoked",
      businessOwnerId: "owner",
      businessId: "own_biz",
    });
    expect(await revokeShareOnce(sql, "prep", tok(1))).toEqual({
      outcome: "already",
      businessOwnerId: "owner",
      businessId: "own_biz",
    });
    expect(await revokeShareOnce(sql, "prep", tok(2))).toEqual({
      outcome: "revoked",
      businessOwnerId: null,
      businessId: null,
    });
  });

  it("shows the firm owner a colleague's revoked and expired links for audit", async () => {
    await linkTo(tok(1), "prep", "owner", "own_biz");
    await linkTo(tok(2), "prep", "owner", "own_biz");
    await pg.query("update map_shares set revoked_at = now() where token = $1", [tok(1)]);
    await pg.query("update map_shares set expires_at = now() - interval '1 day' where token = $1", [
      tok(2),
    ]);
    const listed = await listMapShareSummaries(sql, "owner");
    expect(listed.map((l) => [l.token, l.createdBy]).sort()).toEqual([
      [tok(1), "prep"],
      [tok(2), "prep"],
    ]);
    expect(await listMapShareSummaries(sql, "outsider")).toEqual([]);
  });

  it("revokes every link to a business when it is deleted", async () => {
    await linkTo(tok(1), "prep", "owner", "own_biz");
    await linkTo(tok(2), "owner", "owner", "own_biz");
    await linkTo(tok(3), "owner", "prep", "prep_biz");
    await deleteBusinessRow(sql, "owner", "own_biz");
    expect([await revoked(tok(1)), await revoked(tok(2)), await revoked(tok(3))]).toEqual([
      true,
      true,
      false,
    ]);
  });

  it("revokes the departing member's links to the firm's clients and keeps colleagues' links", async () => {
    await linkTo(tok(1), "prep", "owner", "own_biz"); // the member's link to a firm client
    await linkTo(tok(2), "owner", "prep", "prep_biz"); // the owner's link to the client the member set up
    await linkTo(tok(3), "prep", "prep", "prep_biz"); // the member's link to the client they set up
    await linkTo(tok(4), "owner", "owner", "own_biz"); // untouched
    await insertMapShare(sql, newShare(tok(5), "prep")); // made before links named a business
    await removeMember(sql, "owner", "prep");
    const states = [];
    for (const i of [1, 2, 3, 4, 5]) states.push(await revoked(tok(i)));
    expect(states).toEqual([true, false, true, false, true]);
    // The client stayed with the firm under the owner, and the kept link follows it.
    const kept = await pg.query<{ business_owner_id: string; business_id: string }>(
      "select business_owner_id, business_id from map_shares where token = $1",
      [tok(2)],
    );
    expect(kept.rows).toEqual([{ business_owner_id: "owner", business_id: "prep_biz" }]);
    expect(await shareStillReachable(sql, tok(2))).toBe(true);
  });

  it("keeps a departing member's links to their own business they shared with the firm", async () => {
    await pg.exec(`
      insert into businesses (id, user_id, name, industry, profile, revision, firm_user_id, granted_at)
        values ('prep_own', 'prep', 'Prep Own', 'dental', '{}'::jsonb, 1, 'owner', now());
    `);
    await linkTo(tok(1), "prep", "prep", "prep_own"); // the member's link to their own shared business
    await linkTo(tok(2), "prep", "prep", "prep_biz"); // the member's link to a client they set up
    await removeMember(sql, "owner", "prep");
    expect([await revoked(tok(1)), await revoked(tok(2))]).toEqual([false, true]);
    // The shared business stays the member's, so the link still serves.
    expect(await shareStillReachable(sql, tok(1))).toBe(true);
  });

  it("does the same when the member leaves", async () => {
    await linkTo(tok(1), "prep", "owner", "own_biz");
    await leaveFirm(sql, "owner", "prep");
    expect(await revoked(tok(1))).toBe(true);
  });

  it("stops serving a link whose maker can no longer reach its business", async () => {
    await linkTo(tok(1), "prep", "owner", "own_biz");
    await insertMapShare(sql, newShare(tok(2), "prep"));
    expect(await shareStillReachable(sql, tok(1))).toBe(true);
    expect(await shareStillReachable(sql, tok(2))).toBe(true);
    // The membership ends without detachMember running.
    await pg.exec(`delete from firm_members where member_user_id = 'prep'`);
    expect(await shareStillReachable(sql, tok(1))).toBe(false);
    await linkTo(tok(3), "owner", "owner", "own_biz");
    expect(await shareStillReachable(sql, tok(3))).toBe(true);
    await pg.exec(`update businesses set deleted_at = now() where id = 'own_biz'`);
    expect(await shareStillReachable(sql, tok(3))).toBe(false);
  });

  it("serves a link to the maker's own business before its first save reaches the account", async () => {
    await linkTo(tok(1), "owner", "owner", "not_saved_yet");
    expect(await shareStillReachable(sql, tok(1))).toBe(true);
    // Another account's unsaved id gives the maker nothing: it is not theirs.
    await linkTo(tok(2), "prep", "owner", "not_saved_yet");
    expect(await shareStillReachable(sql, tok(2))).toBe(false);
  });
});
