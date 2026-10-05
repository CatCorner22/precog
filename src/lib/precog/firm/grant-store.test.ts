import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { Sql } from "@/lib/db";
import { inTransaction } from "@/lib/sql-transaction";
import { openTestDb, type TestDb } from "@/test/pglite";
import { businessLimitMessage } from "../business-lifecycle";
import { countClients, loadEntitlements } from "./entitlements.server";
import {
  acceptGrant,
  ALREADY_WITH_FIRM,
  createGrant,
  END_ACCESS_REFUSED,
  endGrant,
  GRANT_CLOSED,
  GRANT_CONFIRM,
  GRANT_LIMIT,
  GRANT_TTL_DAYS,
  grantMismatch,
  handBackGranted,
  loadGrantFor,
  MAX_GRANTS_PER_BUSINESS_PER_DAY,
  NOT_GRANTED,
  ONLY_FIRM_OWNER_ACCEPTS,
  OWN_BUSINESS_GRANT,
  peekGrant,
} from "./grant-store";
import { listReportVersions, lockReportVersion, reportVersionFor } from "./reports";
import { loadFirmFor, saveFirm } from "./store";

// createReportShare runs as a plain handler against this file's PGlite.
const ref = vi.hoisted(() => ({ db: null as null | { sql: unknown } }));
vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => {
    let validate = (input: unknown) => input;
    const chain = {
      middleware: () => chain,
      validator: (fn: (input: unknown) => unknown) => {
        validate = fn;
        return chain;
      },
      handler:
        (fn: (args: { context: unknown; data: unknown }) => unknown) =>
        (args: { context: unknown; data: unknown }) =>
          fn({ context: args.context, data: validate(args.data) }),
    };
    return chain;
  },
}));
vi.mock("@/lib/auth/middleware", () => ({ authMiddleware: {} }));
vi.mock("@/lib/db", () => ({ getSql: async () => ref.db?.sql }));
vi.mock("@/lib/request-origin.server", () => ({ requestOrigin: () => "https://precog.example" }));
vi.mock("@/lib/request-ip.server", () => ({ requestIp: () => "192.0.2.1" }));

let db: TestDb;

beforeAll(async () => {
  db = await openTestDb();
  ref.db = db;
}, 60_000);

afterAll(async () => {
  await db.close();
});

/**
 * `bo` owns biz_1 alone (no firm). Firm North is `fo`'s, with preparer `fm`;
 * firm South is `fo2`'s. `xo` owns firm X, signed in with X only.
 */
beforeEach(async () => {
  await db.clear(
    "map_shares",
    "business_firm_grants",
    "report_versions",
    "engagement_marks",
    "firm_members",
    "firms",
    "businesses",
    "account",
    '"user"',
  );
  for (const id of ["bo", "fo", "fm", "fo2", "xo", "out"]) await db.seedUser(id);
  await db.pg.exec(`
    update "user" set name = 'Rosa Ortiz' where id = 'bo';
    insert into firms (user_id, name) values ('fo', 'North'), ('fo2', 'South'), ('xo', 'X Firm');
    insert into firm_members (firm_user_id, member_user_id, role) values
      ('fo', 'fo', 'owner'), ('fo', 'fm', 'preparer'),
      ('fo2', 'fo2', 'owner'), ('xo', 'xo', 'owner');
    insert into account (id, "accountId", "providerId", "userId", "createdAt", "updatedAt")
      values ('a_x', 'x1', 'grok-x', 'xo', now(), now());
    insert into businesses (id, user_id, name, industry, profile, revision) values
      ('biz_1', 'bo', 'Ortiz Dental', 'general', '{}'::jsonb, 1);
  `);
});

const invite = (email: string, businessId = "biz_1") =>
  createGrant(db.sql, { ownerUserId: "bo", businessId, email });

async function business(id = "biz_1") {
  const rows = await db.pg.query<{ firm_user_id: string | null; granted_at: string | null }>(
    "select firm_user_id, granted_at from businesses where user_id = 'bo' and id = $1",
    [id],
  );
  return rows.rows[0];
}

async function refusal(work: Promise<unknown>): Promise<{ status: number; message: string }> {
  const err = (await work.then(
    () => null,
    (e: unknown) => e,
  )) as { status: number; message: string } | null;
  if (!err) throw new Error("expected a refusal");
  return { status: err.status, message: err.message };
}

describe("the client invitation texts", () => {
  it("pins every refusal", () => {
    expect([
      ALREADY_WITH_FIRM,
      GRANT_LIMIT,
      ONLY_FIRM_OWNER_ACCEPTS,
      GRANT_CONFIRM,
      GRANT_CLOSED,
      OWN_BUSINESS_GRANT,
      END_ACCESS_REFUSED,
      NOT_GRANTED,
      grantMismatch("f***@example.test"),
    ]).toEqual([
      "This business already works with a firm. End that firm's access first.",
      "Precog sends at most five firm invitations a day for one business.",
      "Only a firm's owner can accept a client invitation. Set up your firm on the Firm page first, then open this link again.",
      "Sign in with Google or with the email address the invitation was sent to.",
      "This invitation has expired or was already used. Ask the business owner for a new one.",
      "This invitation is for your own business, so there is nothing to accept. Send the link to the firm owner it names.",
      "Only the business's owner or the owner of the firm working on it can end the firm's access.",
      "Its owner did not share this business with the firm, so there is no access to end.",
      "This invitation was sent to f***@example.test. Sign in with that address to accept it.",
    ]);
    expect(GRANT_TTL_DAYS).toBe(14);
    expect(MAX_GRANTS_PER_BUSINESS_PER_DAY).toBe(5);
  });
});

describe("inviting a firm", () => {
  it("creates a 48-character token that expires in 14 days, and peeks masked", async () => {
    const grant = await invite("FO@Example.test");
    expect(grant.token).toMatch(/^[a-f0-9]{48}$/);
    expect(grant.email).toBe("fo@example.test");
    const days = (Date.parse(grant.expiresAt) - Date.parse(grant.createdAt)) / 86_400_000;
    expect(Math.round(days)).toBe(14);
    expect(await peekGrant(db.sql, grant.token)).toEqual({
      businessName: "Ortiz Dental",
      ownerName: "Rosa Ortiz",
      invitedEmailMasked: "f***@example.test",
      status: "open",
    });
    expect(await peekGrant(db.sql, "0".repeat(48))).toBeNull();
    expect(await loadGrantFor(db.sql, "bo", "biz_1")).toEqual({
      pendingEmail: "fo@example.test",
      expiresAt: grant.expiresAt,
    });
  });

  it("refuses a business that already works with a firm", async () => {
    await db.pg.exec(`update businesses set firm_user_id = 'fo' where id = 'biz_1'`);
    expect(await refusal(invite("fo@example.test"))).toEqual({
      status: 409,
      message: ALREADY_WITH_FIRM,
    });
  });

  it("sends at most five a day for one business; a new one replaces the open one", async () => {
    const first = await invite("fo@example.test");
    for (let i = 1; i < MAX_GRANTS_PER_BUSINESS_PER_DAY; i += 1) await invite("fo@example.test");
    expect((await peekGrant(db.sql, first.token))?.status).toBe("used");
    expect(await refusal(invite("fo@example.test"))).toEqual({ status: 429, message: GRANT_LIMIT });
  });

  it("reads an invitation as used once the business works with a firm, however it got one", async () => {
    const grant = await invite("fo@example.test");
    await db.pg.exec(`update businesses set firm_user_id = 'fo2' where id = 'biz_1'`);
    expect((await peekGrant(db.sql, grant.token))?.status).toBe("used");
    expect(await refusal(acceptGrant(db.sql, grant.token, "fo"))).toEqual({
      status: 409,
      message: GRANT_CLOSED,
    });
  });

  it("closes the business's open invitation when its owner starts a firm of their own", async () => {
    const grant = await invite("fo@example.test");
    // saveFirm makes the owner's businesses the new firm's clients.
    await saveFirm(db.sql, "bo", "Ortiz Books", null);
    expect((await business()).firm_user_id).toBe("bo");
    expect((await peekGrant(db.sql, grant.token))?.status).toBe("used");
    expect(await loadGrantFor(db.sql, "bo", "biz_1")).toBeNull();
    const stored = await db.pg.query<{ revoked: boolean }>(
      "select revoked_at is not null as revoked from business_firm_grants where token = $1",
      [grant.token],
    );
    expect(stored.rows).toEqual([{ revoked: true }]);
  });

  it("reads an expired invitation as expired", async () => {
    const grant = await invite("fo@example.test");
    await db.pg.query(
      "update business_firm_grants set expires_at = now() - interval '1 minute' where token = $1",
      [grant.token],
    );
    expect((await peekGrant(db.sql, grant.token))?.status).toBe("expired");
    expect(await refusal(acceptGrant(db.sql, grant.token, "fo"))).toEqual({
      status: 409,
      message: GRANT_CLOSED,
    });
    expect(await loadGrantFor(db.sql, "bo", "biz_1")).toBeNull();
  });
});

describe("accepting a client invitation", () => {
  it("adds the business to the invited firm owner's clients, still the owner's", async () => {
    const grant = await invite("fo@example.test");
    const accepted = await acceptGrant(db.sql, grant.token, "fo");
    expect(accepted).toEqual({
      businessName: "Ortiz Dental",
      ownerUserId: "bo",
      businessId: "biz_1",
      firmUserId: "fo",
    });
    const row = await business();
    expect(row.firm_user_id).toBe("fo");
    expect(row.granted_at).toBeTruthy();
    expect((await peekGrant(db.sql, grant.token))?.status).toBe("used");
    expect(await refusal(acceptGrant(db.sql, grant.token, "fo"))).toEqual({
      status: 409,
      message: GRANT_CLOSED,
    });
    // It counts toward the firm's client limit and tier.
    expect(await countClients(db.sql, "fo", await loadFirmFor(db.sql, "fo"))).toBe(1);
    expect(await loadGrantFor(db.sql, "bo", "biz_1")).toEqual({
      firmName: "North",
      since: expect.any(String),
    });
    const stored = await db.pg.query<{ accepted_by: string; firm_user_id: string }>(
      "select accepted_by, firm_user_id from business_firm_grants where token = $1",
      [grant.token],
    );
    expect(stored.rows[0]).toEqual({ accepted_by: "fo", firm_user_id: "fo" });
  });

  it("refuses a member who is not the firm's owner", async () => {
    const grant = await invite("fm@example.test");
    expect(await refusal(acceptGrant(db.sql, grant.token, "fm"))).toEqual({
      status: 409,
      message: ONLY_FIRM_OWNER_ACCEPTS,
    });
    expect(await refusal(acceptGrant(db.sql, grant.token, "out"))).toEqual({
      status: 409,
      message: ONLY_FIRM_OWNER_ACCEPTS,
    });
  });

  it("refuses another firm owner, and an address Precog cannot vouch for", async () => {
    const grant = await invite("fo@example.test");
    expect(await refusal(acceptGrant(db.sql, grant.token, "fo2"))).toEqual({
      status: 409,
      message: grantMismatch("f***@example.test"),
    });
    const toX = await invite("xo@example.test");
    expect(await refusal(acceptGrant(db.sql, toX.token, "xo"))).toEqual({
      status: 409,
      message: GRANT_CONFIRM,
    });
    expect((await business()).firm_user_id).toBeNull();
  });

  it("refuses the business's own account", async () => {
    const grant = await invite("bo@example.test");
    expect(await refusal(acceptGrant(db.sql, grant.token, "bo"))).toEqual({
      status: 409,
      message: OWN_BUSINESS_GRANT,
    });
  });

  it("refuses at the firm's client limit with the plan's own words", async () => {
    await db.pg.exec(`
      insert into businesses (id, user_id, name, industry, profile, revision, firm_user_id)
      select 'biz_f' || n, 'fo', 'Client ' || n, 'general', '{}'::jsonb, 1, 'fo'
      from generate_series(1, 50) n
    `);
    const grant = await invite("fo@example.test");
    const e = await loadEntitlements(db.sql, "fo");
    expect(await refusal(acceptGrant(db.sql, grant.token, "fo"))).toEqual({
      status: 402,
      message: businessLimitMessage({ plan: e.plan, limit: e.clientLimit, tier: e.tier }),
    });
    expect((await business()).firm_user_id).toBeNull();
  });
});

const ENGAGEMENT = `select scope, period_start, period_end, status, ended_at,
  preparer_user_id, reviewer_user_id, started_at, owner_email, accepted_findings
  from engagement_marks where user_id = 'bo' and business_id = 'biz_1'`;

describe("ending the firm's access", () => {
  async function granted(): Promise<void> {
    const grant = await invite("fo@example.test");
    await acceptGrant(db.sql, grant.token, "fo");
  }

  it("either side hands the business back: both columns clear", async () => {
    for (const actor of ["bo", "fo"]) {
      await granted();
      expect(
        await endGrant(db.sql, { ownerUserId: "bo", businessId: "biz_1", actorUserId: actor }),
      ).toEqual({ firmUserId: "fo" });
      expect(await business()).toEqual({ firm_user_id: null, granted_at: null });
      expect(await loadGrantFor(db.sql, "bo", "biz_1")).toBeNull();
      expect(await countClients(db.sql, "fo", await loadFirmFor(db.sql, "fo"))).toBe(0);
    }
  });

  it("refuses a member of the firm and anyone else", async () => {
    await granted();
    for (const actor of ["fm", "fo2"]) {
      expect(
        await refusal(
          endGrant(db.sql, { ownerUserId: "bo", businessId: "biz_1", actorUserId: actor }),
        ),
      ).toEqual({ status: 403, message: END_ACCESS_REFUSED });
    }
  });

  it("refuses a firm client its owner never shared", async () => {
    await db.pg.exec(`update businesses set firm_user_id = 'fo' where id = 'biz_1'`);
    expect(
      await refusal(
        endGrant(db.sql, { ownerUserId: "bo", businessId: "biz_1", actorUserId: "fo" }),
      ),
    ).toEqual({ status: 409, message: NOT_GRANTED });
  });

  it("with no firm yet, closes the waiting invitation", async () => {
    const grant = await invite("fo@example.test");
    await endGrant(db.sql, { ownerUserId: "bo", businessId: "biz_1", actorUserId: "bo" });
    expect((await peekGrant(db.sql, grant.token))?.status).toBe("used");
  });

  it("revokes only the firm's links; the owner's own map link survives", async () => {
    await granted();
    await db.pg.exec(`
      insert into map_shares (token, user_id, payload, business_owner_id, business_id) values
        ('t_owner', 'bo', '{}', 'bo', 'biz_1'),
        ('t_firm', 'fo', '{}', 'bo', 'biz_1'),
        ('t_member', 'fm', '{}', 'bo', 'biz_1');
    `);
    await endGrant(db.sql, { ownerUserId: "bo", businessId: "biz_1", actorUserId: "fo" });
    const rows = await db.pg.query<{ token: string; revoked: boolean }>(
      "select token, revoked_at is not null as revoked from map_shares order by token",
    );
    expect(rows.rows).toEqual([
      { token: "t_firm", revoked: true },
      { token: "t_member", revoked: true },
      { token: "t_owner", revoked: false },
    ]);
  });

  it("hands back through the one helper endGrant and the account deletion share", async () => {
    await granted();
    await db.pg.exec(`
      update engagement_marks set scope = 'Old scope', status = 'ended', ended_at = now()
        where user_id = 'bo' and business_id = 'biz_1';
      insert into map_shares (token, user_id, payload, business_owner_id, business_id) values
        ('t_owner', 'bo', '{}', 'bo', 'biz_1'), ('t_firm', 'fm', '{}', 'bo', 'biz_1');
      insert into businesses (id, user_id, name, industry, profile, revision, firm_user_id)
        values ('biz_c', 'fm', 'Member client', 'general', '{}'::jsonb, 1, 'fo');
    `);
    await inTransaction(db.sql, async (tx) => {
      await handBackGranted(tx, "bo", "biz_1");
      // A firm client its owner never shared is not the helper's to move.
      await handBackGranted(tx, "fm", "biz_c");
    });
    expect(await business()).toEqual({ firm_user_id: null, granted_at: null });
    const engagement = (await db.pg.query<Record<string, unknown>>(ENGAGEMENT)).rows[0];
    expect(engagement).toMatchObject({ scope: "", status: "active", ended_at: null });
    const links = await db.pg.query<{ token: string; revoked: boolean }>(
      "select token, revoked_at is not null as revoked from map_shares order by token",
    );
    expect(links.rows).toEqual([
      { token: "t_firm", revoked: true },
      { token: "t_owner", revoked: false },
    ]);
    const member = await db.pg.query<{ firm_user_id: string | null }>(
      "select firm_user_id from businesses where id = 'biz_c'",
    );
    expect(member.rows).toEqual([{ firm_user_id: "fo" }]);
  });

  it("accepting and ending start the engagement afresh and keep its stamps", async () => {
    const filled = `insert into engagement_marks (user_id, business_id, scope, period_start,
        period_end, status, ended_at, preparer_user_id, reviewer_user_id, started_at,
        owner_email, accepted_findings)
      values ('bo', 'biz_1', 'Old scope', '2026-01-01', '2026-12-31', 'ended', now(), 'fm',
        'fo', '2026-02-01T00:00:00Z', 'rosa@ortiz.test', 3)
      on conflict (user_id, business_id) do update set scope = excluded.scope,
        period_start = excluded.period_start, period_end = excluded.period_end,
        status = excluded.status, ended_at = excluded.ended_at,
        preparer_user_id = excluded.preparer_user_id, reviewer_user_id = excluded.reviewer_user_id`;
    const fresh = {
      scope: "",
      period_start: null,
      period_end: null,
      status: "active",
      ended_at: null,
      preparer_user_id: null,
      reviewer_user_id: null,
      owner_email: "rosa@ortiz.test",
      accepted_findings: 3,
    };
    await db.pg.exec(filled);
    await granted();
    const afterAccept = (await db.pg.query<Record<string, unknown>>(ENGAGEMENT)).rows[0];
    expect(afterAccept).toMatchObject(fresh);
    expect(afterAccept.started_at).toBeTruthy();
    await db.pg.exec(filled);
    await endGrant(db.sql, { ownerUserId: "bo", businessId: "biz_1", actorUserId: "bo" });
    const afterEnd = (await db.pg.query<Record<string, unknown>>(ENGAGEMENT)).rows[0];
    expect(afterEnd).toMatchObject(fresh);
    expect(afterEnd.started_at).toBeTruthy();
  });
});

describe("the order the client invitation's writers lock rows in", () => {
  /** The table each `for update` statement locks, in order, transactions included. */
  function recorder(): { sql: Sql; locks: string[] } {
    const locks: string[] = [];
    const note = (text: string) => {
      if (/for update/i.test(text)) locks.push(/from\s+("?\w+"?)/i.exec(text)?.[1] ?? "?");
    };
    const wrap = (inner: Sql): Sql => {
      const sql = ((strings: TemplateStringsArray, ...values: unknown[]) => {
        note(strings.join("$"));
        return inner(strings, ...values);
      }) as Sql;
      sql.query = (text, params) => {
        note(text);
        return inner.query(text, params);
      };
      const begin = inner.transaction?.bind(inner);
      if (begin) sql.transaction = (work) => begin((tx) => work(wrap(tx)));
      return sql;
    };
    return { sql: wrap(db.sql), locks };
  }

  it("takes the business before the invitation in acceptGrant, as createGrant and endGrant do", async () => {
    const created = recorder();
    const grant = await createGrant(created.sql, {
      ownerUserId: "bo",
      businessId: "biz_1",
      email: "fo@example.test",
    });
    const accepted = recorder();
    await acceptGrant(accepted.sql, grant.token, "fo");
    const ended = recorder();
    await endGrant(ended.sql, { ownerUserId: "bo", businessId: "biz_1", actorUserId: "bo" });
    // A re-send or a close (businesses, then the open invitations) racing an
    // acceptance would otherwise wait on each other's rows.
    expect([created.locks[0], accepted.locks[0], ended.locks[0]]).toEqual([
      "businesses",
      "businesses",
      "businesses",
    ]);
    expect(accepted.locks).toEqual(["businesses", "business_firm_grants"]);
  });

  it("still refuses an invitation closed while the acceptance waited for the business", async () => {
    const grant = await invite("fo@example.test");
    await endGrant(db.sql, { ownerUserId: "bo", businessId: "biz_1", actorUserId: "bo" });
    expect(await refusal(acceptGrant(db.sql, grant.token, "fo"))).toEqual({
      status: 409,
      message: GRANT_CLOSED,
    });
    expect((await business()).firm_user_id).toBeNull();
  });
});

describe("a later firm sees only the versions it locked", () => {
  type Call = (args: {
    context: { userId: string };
    data: Record<string, unknown>;
  }) => Promise<unknown>;

  async function grantTo(firmOwner: string, email: string): Promise<void> {
    const grant = await invite(email);
    await acceptGrant(db.sql, grant.token, firmOwner);
  }

  const lock = (id: string, preparedBy: string) =>
    lockReportVersion(db.sql, {
      ownerUserId: "bo",
      businessId: "biz_1",
      preparedBy,
      scopeNote: "",
      id,
    });

  it("after a hand-back and a grant to South, South reads none of North's versions", async () => {
    await grantTo("fo", "fo@example.test");
    const north = await lock("rv_north", "fm");
    const stored = await db.pg.query<{ firm_user_id: string }>(
      "select firm_user_id from report_versions where id = 'rv_north'",
    );
    expect(stored.rows[0].firm_user_id).toBe("fo");
    expect(await reportVersionFor(db.sql, "fm", north.id)).toEqual({
      ownerUserId: "bo",
      businessId: "biz_1",
    });
    await endGrant(db.sql, { ownerUserId: "bo", businessId: "biz_1", actorUserId: "fo" });
    // North no longer opens the version it locked; the owner keeps it.
    expect(await reportVersionFor(db.sql, "fo", north.id)).toBeNull();
    expect(await reportVersionFor(db.sql, "bo", north.id)).not.toBeNull();

    await grantTo("fo2", "fo2@example.test");
    expect(await listReportVersions(db.sql, "bo", "biz_1", "fo2")).toEqual([]);
    expect(await reportVersionFor(db.sql, "fo2", north.id)).toBeNull();
    const { createReportShare } = await import("../share/share-server");
    expect(
      await refusal(
        (createReportShare as unknown as Call)({
          context: { userId: "fo2" },
          data: { versionId: north.id },
        }),
      ),
    ).toMatchObject({ status: 404 });

    const south = await lock("rv_south", "fo2");
    expect((await listReportVersions(db.sql, "bo", "biz_1", "fo2")).map((v) => v.id)).toEqual([
      south.id,
    ]);
    expect((await listReportVersions(db.sql, "bo", "biz_1")).map((v) => v.id)).toEqual([
      south.id,
      north.id,
    ]);
  });
});

describe("the client invitation server functions", () => {
  type Call = (args: {
    context?: { userId: string };
    data: Record<string, unknown>;
  }) => Promise<Record<string, unknown>>;
  const fns = () => import("./grant-server");
  const as = async (
    name: "inviteFirmToBusiness" | "getBusinessGrant" | "acceptClientGrant" | "endFirmAccess",
    userId: string,
    data: Record<string, unknown>,
  ) => ((await fns())[name] as unknown as Call)({ context: { userId }, data });

  it("pins the owner-only refusal and the address prompt", async () => {
    const { ONLY_OWNER_INVITES } = await fns();
    expect(ONLY_OWNER_INVITES).toBe(
      "Only the business's own account can invite a firm to work on it.",
    );
    await expect(
      as("inviteFirmToBusiness", "bo", { businessId: "biz_1", email: "nope" }),
    ).rejects.toMatchObject({ status: 400, message: "Enter the firm owner's email address" });
  });

  it("invites from the business's own account, unmailed without email, and hands back the link", async () => {
    const sent = await as("inviteFirmToBusiness", "bo", {
      businessId: "biz_1",
      email: "fo@example.test",
    });
    expect(sent).toMatchObject({ emailed: false, email: "fo@example.test" });
    expect(sent.url).toMatch(/^https:\/\/precog\.example\/join\/client\/[a-f0-9]{48}$/);
    const token = String(sent.url).split("/").pop() as string;
    expect(await as("getBusinessGrant", "bo", { businessId: "biz_1" })).toEqual({
      own: true,
      canInvite: true,
      grant: { pendingEmail: "fo@example.test", expiresAt: sent.expiresAt },
    });
    const { peekClientGrant } = await fns();
    expect(await (peekClientGrant as unknown as Call)({ data: { token } })).toEqual({
      grant: expect.objectContaining({ businessName: "Ortiz Dental", status: "open" }),
    });
    expect(await as("acceptClientGrant", "fo", { token })).toEqual({
      businessName: "Ortiz Dental",
      businessId: "biz_1",
    });
    // The firm sees who it works for, never a waiting invitation.
    expect(await as("getBusinessGrant", "fm", { businessId: "biz_1" })).toEqual({
      own: false,
      canInvite: false,
      grant: { firmName: "North", since: expect.any(String) },
    });
    await as("endFirmAccess", "fo", { businessId: "biz_1" });
    expect((await business()).firm_user_id).toBeNull();
  });

  it("refuses an invitation from the firm working on the business", async () => {
    await db.pg.exec(`
      insert into businesses (id, user_id, name, industry, profile, revision, firm_user_id)
        values ('biz_c', 'fm', 'Client', 'general', '{}'::jsonb, 1, 'fo');
    `);
    await expect(
      as("inviteFirmToBusiness", "fo", { businessId: "biz_c", email: "fo2@example.test" }),
    ).rejects.toMatchObject({
      status: 403,
      message: "Only the business's own account can invite a firm to work on it.",
    });
  });
});
