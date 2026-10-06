import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { openTestDb, type TestDb } from "@/test/pglite";
import { defaultProfile } from "../practice-profile";
import { assembleAccountExport, decodeExportPage, type ExportPartRequest } from "../account-export";
import { createGrant } from "./grant-store";
import { lockReportVersion } from "./reports";

// The server functions run as plain handlers: the validator, then the
// handler with the caller's id, against this file's PGlite.
const ref = vi.hoisted(() => ({ db: null as null | { sql: unknown } }));
const report = vi.hoisted(() => ({ error: vi.fn(async (_err: unknown, _at?: string) => {}) }));
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
// Account deletion's recent-sign-in check has its own tests (fresh-session.test.ts).
vi.mock("@/lib/auth/fresh-session", () => ({ requireFreshSession: async () => ({ email: null }) }));
vi.mock("@/lib/db", () => ({ getSql: async () => ref.db?.sql }));
vi.mock("@/lib/observability/report.server", () => ({ reportServerError: report.error }));
vi.mock("@/lib/request-origin.server", () => ({
  requestOrigin: () => "https://precog.test",
  originFrom: () => "https://precog.test",
}));

const server = await import("./server");
const engagement = await import("./engagement-server");
const review = await import("./review-server");
const grant = await import("./grant-server");
const share = await import("../share/share-server");
const qbo = await import("../integrations/qbo/server");
const account = await import("../account-server");
const profile = await import("../profile-server");
const { applyBillingEvent } = await import("../billing/webhook");
const { parseStripeEvent } = await import("../billing/stripe");

type Call = (args: { context: { userId: string }; data: unknown }) => Promise<unknown>;
const call = <T = unknown>(fn: unknown, userId: string, data: unknown = {}) =>
  (fn as Call)({ context: { userId }, data }) as Promise<T>;

/** The whole account export, its parts fetched in order as the browser does. */
async function exportAll(userId: string) {
  const first = await call<{ base64: string; parts: ExportPartRequest[] | null }>(
    account.exportAccountDataPage,
    userId,
    { section: "account" },
  );
  const pages = [decodeExportPage(first.base64)];
  for (const part of first.parts ?? []) {
    const sent = await call<{ base64: string }>(account.exportAccountDataPage, userId, part);
    pages.push(decodeExportPage(sent.base64));
  }
  return assembleAccountExport(pages);
}

// ── Every POST server function writes the log or says why not ─────────────

const SRC = join(process.cwd(), "src/lib/precog");
const WRITER = /\b(recordAudit\w*|insertAudit)\(/;
const EXEMPT = /\/\/ audit: exempt \(.+\)/;

/** The files decision 32 names: the firm's, sharing, QuickBooks, account, profile, operator. */
function auditedFiles(): string[] {
  const firm = readdirSync(join(SRC, "firm"))
    .filter((f) => f.endsWith(".ts") && !f.endsWith(".test.ts"))
    .map((f) => join(SRC, "firm", f));
  const others = [
    "share/share-server.ts",
    "integrations/qbo/server.ts",
    "account-server.ts",
    "profile-server.ts",
    "operator/server.ts",
  ]
    .map((f) => join(SRC, f))
    .filter((f) => existsSync(f));
  return [...firm, ...others];
}

/** Each POST export's source, from its declaration to the close of its handler. */
function postFunctions(): { name: string; file: string; body: string }[] {
  const found: { name: string; file: string; body: string }[] = [];
  for (const file of auditedFiles()) {
    const text = readFileSync(file, "utf8");
    const re = /export const (\w+) = createServerFn\(\{ method: "POST" \}\)/g;
    for (let m = re.exec(text); m; m = re.exec(text)) {
      const end = text.indexOf("\n  });\n", m.index);
      found.push({
        name: m[1],
        file: file.slice(SRC.length + 1),
        body: text.slice(m.index, end === -1 ? undefined : end),
      });
    }
  }
  return found;
}

describe("activity log coverage", () => {
  it("finds the POST server functions it checks", () => {
    const names = postFunctions().map((f) => `${f.file}#${f.name}`);
    expect(names).toEqual(
      expect.arrayContaining([
        "firm/server.ts#lockReport",
        "firm/engagement-server.ts#saveEngagement",
        "firm/review-server.ts#returnReport",
        "firm/grant-server.ts#endFirmAccess",
        "share/share-server.ts#revokeMapShare",
        "integrations/qbo/server.ts#disconnectQuickBooks",
        "account-server.ts#deleteAccount",
        "profile-server.ts#deleteBusiness",
      ]),
    );
  });

  it("has every one write the log, or carry `// audit: exempt (<reason>)`", () => {
    const silent = postFunctions()
      .filter((f) => !WRITER.test(f.body) && !EXEMPT.test(f.body))
      .map((f) => `${f.file}#${f.name}`);
    expect(silent).toEqual([]);
  });
});

// ── Each writer's event lands with the right actor ─────────────────────────

let db: TestDb;

beforeAll(async () => {
  db = await openTestDb();
  ref.db = db;
}, 60_000);

afterAll(async () => {
  await db.close();
});

/**
 * No Stripe, no email, no QuickBooks keys: every plan is open. Firm North:
 * owner `fo`, reviewer `rv`, preparer `pp`; `nm` is invited later. biz_1 is
 * pp's client for North, biz_f the owner's; `bo` owns biz_g, outside any
 * firm until shared; `so` owns biz_s and is in no firm.
 */
beforeEach(async () => {
  report.error.mockClear();
  await db.clear(
    "billing_events",
    "billing_accounts",
    "integration_connections",
    "map_shares",
    "business_firm_grants",
    "business_history",
    "business_deletion_markers",
    "report_versions",
    "engagement_marks",
    "firm_invites",
    "firm_members",
    "firms",
    "businesses",
    '"user"',
  );
  for (const id of ["fo", "rv", "pp", "nm", "bo", "so"]) await db.seedUser(id);
  await db.pg.exec(`
    update "user" set name = 'Fay Owner' where id = 'fo';
    update "user" set name = 'Pat Prep' where id = 'pp';
    insert into firms (user_id, name) values ('fo', 'North');
    insert into firm_members (firm_user_id, member_user_id, role) values
      ('fo', 'fo', 'owner'), ('fo', 'rv', 'reviewer'), ('fo', 'pp', 'preparer');
  `);
  await db.pg.query(
    `insert into businesses (id, user_id, name, industry, profile, revision, firm_user_id) values
       ('biz_1', 'pp', 'Ortiz Dental', 'dental', $1::jsonb, 1, 'fo'),
       ('biz_f', 'fo', 'Fay Client', 'dental', $1::jsonb, 1, 'fo'),
       ('biz_g', 'bo', 'Bo Shop', 'dental', $1::jsonb, 1, null),
       ('biz_s', 'so', 'Solo Shop', 'dental', $1::jsonb, 1, null)`,
    [JSON.stringify({ ...defaultProfile("dental"), practiceName: "Ortiz Dental" })],
  );
});

interface LogRow {
  firm: string;
  actor: string | null;
  name: string;
  event: string;
  business: string | null;
  subject: string | null;
  detail: Record<string, unknown>;
}

async function log(): Promise<LogRow[]> {
  return db.sql<LogRow>`
    select firm_user_id as firm, actor_user_id as actor, actor_name as name, event,
      business_id as business, subject_user_id as subject, detail
    from firm_audit_log order by id
  `;
}

describe("firm writers", () => {
  it("logs the letterhead, invitations, a join and a role change, by who did them", async () => {
    await call(server.saveFirmLetterhead, "fo", {
      letterhead: "1 Main St",
      logoDataUrl: null,
      coverPage: true,
    });
    const first = await call<{ invite: { token: string } }>(server.inviteFirmMember, "fo", {
      email: "other@example.test",
      role: "preparer",
    });
    await call(server.revokeFirmInvite, "fo", { token: first.invite.token });
    const invite = await call<{ invite: { token: string } }>(server.inviteFirmMember, "fo", {
      email: "nm@example.test",
      role: "reviewer",
    });
    await call(server.acceptFirmInvite, "nm", { token: invite.invite.token });
    await call(server.setFirmMemberRole, "fo", { userId: "rv", role: "preparer" });
    // The same role again moves nothing and writes nothing.
    await call(server.setFirmMemberRole, "fo", { userId: "rv", role: "preparer" });
    const rows = await log();
    expect(rows.map((r) => [r.event, r.actor, r.name, r.subject])).toEqual([
      ["letterhead_changed", "fo", "Fay Owner", null],
      ["member_invited", "fo", "Fay Owner", null],
      ["invite_revoked", "fo", "Fay Owner", null],
      ["member_invited", "fo", "Fay Owner", null],
      ["member_joined", "nm", "nm", "nm"],
      ["role_changed", "fo", "Fay Owner", "rv"],
    ]);
    expect(rows.every((r) => r.firm === "fo")).toBe(true);
    // The invited address stays out of the log, as every detail does.
    expect(rows[1].detail).toEqual({ role: "preparer" });
    expect(JSON.stringify(rows.map((r) => r.detail))).not.toContain("@");
    expect(rows[5].detail).toEqual({ from: "reviewer", to: "preparer" });
  });

  it("logs a removal with each client it hands over, and a member leaving", async () => {
    await call(server.removeFirmMember, "fo", { userId: "pp" });
    await call(server.leaveFirm, "rv");
    // Removing someone who is no longer a member changes nothing and logs nothing.
    await call(server.removeFirmMember, "fo", { userId: "pp" });
    await call(server.removeFirmMember, "fo", { userId: "rv" });
    const rows = await log();
    expect(rows.map((r) => [r.event, r.actor, r.business, r.subject])).toEqual([
      ["member_removed", "fo", null, "pp"],
      ["client_handed_over", "fo", "biz_1", "pp"],
      ["member_left", "rv", null, "rv"],
    ]);
    expect(rows[1].detail).toEqual({ from: "biz_1" });
  });

  it("moves the log with the firm on an ownership transfer, and logs the transfer", async () => {
    await call(server.saveFirmLetterhead, "fo", {
      letterhead: "1 Main St",
      logoDataUrl: null,
      coverPage: true,
    });
    const res = await call<{ moved: { from: string; to: string; name: string }[] }>(
      server.transferFirmOwnership,
      "fo",
      { userId: "rv" },
    );
    const rows = await log();
    // The old owner's own client (biz_f) moves to the new owner, logged as a hand-over.
    expect(rows.map((r) => [r.firm, r.event, r.actor, r.business, r.subject])).toEqual([
      ["rv", "letterhead_changed", "fo", null, null],
      ["rv", "ownership_transferred", "fo", null, "rv"],
      ["rv", "client_handed_over", "fo", "biz_f", "fo"],
    ]);
    expect(rows[2].detail).toEqual({ from: "biz_f" });
    expect(res.moved).toEqual([{ from: "biz_f", to: "biz_f", name: "Fay Client" }]);
  });

  it("logs a renamed hand-over on a transfer under the business's new address", async () => {
    // The new owner already holds an id the old owner's client uses.
    await db.pg.query(
      `insert into businesses (id, user_id, name, industry, profile, revision, firm_user_id)
       values ('biz_f', 'rv', 'Rv Own', 'dental', $1::jsonb, 1, null)`,
      [JSON.stringify(defaultProfile("dental"))],
    );
    const res = await call<{ moved: { from: string; to: string; name: string }[] }>(
      server.transferFirmOwnership,
      "fo",
      { userId: "rv" },
    );
    expect(res.moved).toHaveLength(1);
    expect(res.moved[0].from).toBe("biz_f");
    expect(res.moved[0].to).toMatch(/^biz_f-[0-9a-f]+$/);
    const handed = (await log()).filter((r) => r.event === "client_handed_over");
    expect(handed.map((r) => [r.business, r.subject, r.detail])).toEqual([
      [res.moved[0].to, "fo", { from: "biz_f" }],
    ]);
  });

  it("logs a locked version's lock, review, sending and the owner address, without the address", async () => {
    const locked = await call<{ version: { id: string } }>(server.lockReport, "pp", {
      businessId: "biz_1",
    });
    await call(server.signOffReport, "rv", { id: locked.version.id });
    await call(server.markReportSent, "pp", { id: locked.version.id });
    await call(server.setClientOwnerEmail, "pp", { businessId: "biz_1", email: "" });
    const rows = await log();
    expect(rows.map((r) => [r.event, r.actor, r.business])).toEqual([
      ["version_locked", "pp", "biz_1"],
      ["version_reviewed", "rv", "biz_1"],
      ["version_sent", "pp", "biz_1"],
      ["owner_email_set", "pp", "biz_1"],
    ]);
    expect(rows[0].detail).toEqual({ versionId: locked.version.id, versionNo: 1 });
    expect(rows[3].detail).toEqual({ cleared: true });
    // A solo business has no firm and no log.
    await call(server.lockReport, "so", { businessId: "biz_s" });
    expect(await log()).toHaveLength(4);
  });

  it("logs a revoke once, and never revokes an invitation already accepted", async () => {
    const open = await call<{ invite: { token: string } }>(server.inviteFirmMember, "fo", {
      email: "other@example.test",
      role: "preparer",
    });
    await call(server.revokeFirmInvite, "fo", { token: open.invite.token });
    await call(server.revokeFirmInvite, "fo", { token: open.invite.token });
    const used = await call<{ invite: { token: string } }>(server.inviteFirmMember, "fo", {
      email: "nm@example.test",
      role: "reviewer",
    });
    await call(server.acceptFirmInvite, "nm", { token: used.invite.token });
    await call(server.revokeFirmInvite, "fo", { token: used.invite.token });
    expect((await log()).map((r) => r.event)).toEqual([
      "member_invited",
      "invite_revoked",
      "member_invited",
      "member_joined",
    ]);
    // The accepted invitation keeps its record of who joined by it.
    expect(
      await db.sql`select accepted_by from firm_invites where token = ${used.invite.token}`,
    ).toEqual([{ accepted_by: "nm" }]);
  });

  it("logs one client_deleted when two deletes of the same client race", async () => {
    await Promise.all([
      call(profile.deleteBusiness, "fo", { id: "biz_f", expectedAccountId: "fo" }),
      call(profile.deleteBusiness, "fo", { id: "biz_f", expectedAccountId: "fo" }),
    ]);
    expect((await log()).map((r) => [r.event, r.business])).toEqual([["client_deleted", "biz_f"]]);
  });

  it("logs a client deleted and restored, once each", async () => {
    await call(profile.deleteBusiness, "fo", { id: "biz_f", expectedAccountId: "fo" });
    await call(profile.deleteBusiness, "fo", { id: "biz_f", expectedAccountId: "fo" });
    await call(server.restoreDeletedClient, "fo", { businessId: "biz_f" });
    await call(profile.deleteBusiness, "so", { id: "biz_s", expectedAccountId: "so" });
    expect((await log()).map((r) => [r.event, r.actor, r.business])).toEqual([
      ["client_deleted", "fo", "biz_f"],
      ["client_restored", "fo", "biz_f"],
    ]);
  });

  it("writes nothing for the exempt page-open stamp and notification switches", async () => {
    await call(server.recordEngagement, "pp", {
      businessId: "biz_1",
      openFindings: 1,
      acceptedFindings: 0,
    });
    await call(server.updateNotificationSettings, "pp", {
      weeklyDigest: true,
      ownerReminders: false,
    });
    expect(await log()).toEqual([]);
  });
});

describe("engagement writers", () => {
  it("logs saves, ending and reopening, the retention period and the archive download", async () => {
    await call(engagement.saveEngagement, "pp", {
      businessId: "biz_1",
      scope: "Monthly close",
      periodStart: null,
      periodEnd: null,
      preparerUserId: null,
      reviewerUserId: null,
    });
    // Reopening an engagement that never ended, and ending it twice, change
    // nothing the second time and log nothing for it.
    await call(engagement.setEngagementStatus, "fo", { businessId: "biz_1", status: "active" });
    await call(engagement.setEngagementStatus, "fo", { businessId: "biz_1", status: "ended" });
    await call(engagement.setEngagementStatus, "fo", { businessId: "biz_1", status: "ended" });
    await call(engagement.setEngagementStatus, "fo", { businessId: "biz_1", status: "active" });
    await call(engagement.saveFirmRetention, "fo", { years: 10 });
    await call(engagement.getEngagement, "rv", { businessId: "biz_1", withReviews: true });
    // Reading the engagement without the review log is not an export.
    await call(engagement.getEngagement, "rv", { businessId: "biz_1" });
    const rows = await log();
    expect(rows.map((r) => [r.event, r.actor, r.business])).toEqual([
      ["engagement_saved", "pp", "biz_1"],
      ["engagement_ended", "fo", "biz_1"],
      ["engagement_reopened", "fo", "biz_1"],
      ["retention_changed", "fo", null],
      ["export_run", "rv", "biz_1"],
    ]);
    expect(rows[3].detail).toEqual({ years: 10 });
    expect(rows[4].detail).toEqual({ kind: "engagement_archive" });
  });
});

describe("review writers", () => {
  it("logs a request for review and a return, naming who it went to", async () => {
    const v = await lockReportVersion(db.sql, {
      ownerUserId: "pp",
      businessId: "biz_1",
      preparedBy: "pp",
      scopeNote: "",
      id: "rv_1",
    });
    await call(review.requestReportReview, "pp", { id: v.id });
    await call(review.returnReport, "fo", { id: v.id, note: "Add the bank token note." });
    const rows = await log();
    expect(rows.map((r) => [r.event, r.actor, r.business, r.subject])).toEqual([
      ["version_review_requested", "pp", "biz_1", "fo"],
      ["version_returned", "fo", "biz_1", "pp"],
    ]);
    expect(JSON.stringify(rows)).not.toContain("bank token");
  });
});

describe("grant writers", () => {
  it("logs the firm's acceptance and the hand-back, from either side", async () => {
    const first = await createGrant(db.sql, {
      ownerUserId: "bo",
      businessId: "biz_g",
      email: "fo@example.test",
    });
    await call(grant.acceptClientGrant, "fo", { token: first.token });
    await call(grant.endFirmAccess, "bo", { businessId: "biz_g" });
    const again = await createGrant(db.sql, {
      ownerUserId: "bo",
      businessId: "biz_g",
      email: "fo@example.test",
    });
    await call(grant.acceptClientGrant, "fo", { token: again.token });
    await call(grant.endFirmAccess, "fo", { businessId: "biz_g" });
    // Closing an invitation no firm accepted hands nothing back.
    await createGrant(db.sql, { ownerUserId: "bo", businessId: "biz_g", email: "x@y.test" });
    await call(grant.endFirmAccess, "bo", { businessId: "biz_g" });
    const rows = await log();
    expect(rows.map((r) => [r.firm, r.event, r.actor, r.business, r.detail])).toEqual([
      ["fo", "client_granted", "fo", "biz_g", {}],
      ["fo", "client_handed_back", "bo", "biz_g", { by: "owner" }],
      ["fo", "client_granted", "fo", "biz_g", {}],
      ["fo", "client_handed_back", "fo", "biz_g", { by: "firm" }],
    ]);
  });
});

describe("share writers", () => {
  it("logs a report link made and a link revoked on a firm client, not on a solo business", async () => {
    const locked = await call<{ version: { id: string } }>(server.lockReport, "pp", {
      businessId: "biz_1",
    });
    await call(server.signOffReport, "rv", { id: locked.version.id });
    const link = await call<{ token: string }>(share.createReportShare, "pp", {
      versionId: locked.version.id,
    });
    await call(share.revokeMapShare, "fo", { token: link.token });
    // A repeated revoke (a double click, a retry) writes nothing more.
    await call(share.revokeMapShare, "fo", { token: link.token });
    await call(share.revokeMapShare, "pp", { token: link.token });
    await db.pg.exec(`
      insert into map_shares (token, user_id, business_name, industry, payload, expires_at,
        business_owner_id, business_id)
      values ('solo1', 'so', 'Solo Shop', 'dental', '{}'::jsonb, now() + interval '7 days',
        'so', 'biz_s');
    `);
    await call(share.revokeMapShare, "so", { token: "solo1" });
    const rows = (await log()).filter((r) => r.event.startsWith("share_"));
    expect(rows.map((r) => [r.event, r.actor, r.business])).toEqual([
      ["share_created", "pp", "biz_1"],
      ["share_revoked", "fo", "biz_1"],
    ]);
    expect(rows[0].detail).toEqual({ kind: "report", versionId: locked.version.id });
  });
});

describe("account deletion writer", () => {
  it("logs a member's departure and a shared client's hand-back in the firm's log", async () => {
    const first = await createGrant(db.sql, {
      ownerUserId: "bo",
      businessId: "biz_g",
      email: "fo@example.test",
    });
    await call(grant.acceptClientGrant, "fo", { token: first.token });
    await call(account.deleteAccount, "rv", { confirm: "DELETE" });
    await call(account.deleteAccount, "bo", { confirm: "DELETE" });
    // An account in no firm, sharing nothing, writes nothing.
    await call(account.deleteAccount, "so", { confirm: "DELETE" });
    const rows = await log();
    expect(rows.map((r) => [r.firm, r.event, r.actor, r.business, r.subject, r.detail])).toEqual([
      ["fo", "client_granted", "fo", "biz_g", null, {}],
      ["fo", "member_left", "rv", null, "rv", { reason: "account_deleted" }],
      ["fo", "client_handed_back", "bo", "biz_g", null, { by: "owner", reason: "account_deleted" }],
    ]);
    // The rows outlive the accounts and keep the names they had.
    expect(rows[1].name).toBe("rv");
    const gone = await db.sql<{ n: number }>`
      select count(*)::int as n from "user" where id in ('rv', 'bo', 'so')
    `;
    expect(gone[0].n).toBe(0);
  });
});

describe("QuickBooks writers", () => {
  it("logs a disconnection by the firm, and nothing when there was no connection", async () => {
    await db.pg.exec(`
      insert into integration_connections (user_id, business_id, provider, realm_id,
        access_token_enc, refresh_token_enc, access_expires_at, refresh_expires_at)
      values ('pp', 'biz_1', 'qbo', '123', 'a', 'r', now() + interval '1 hour',
        now() + interval '30 days');
    `);
    await call(qbo.disconnectQuickBooks, "rv", { businessId: "biz_1" });
    await call(qbo.disconnectQuickBooks, "rv", { businessId: "biz_1" });
    expect((await log()).map((r) => [r.event, r.actor, r.business])).toEqual([
      ["quickbooks_disconnected", "rv", "biz_1"],
    ]);
  });
});

describe("export writers", () => {
  it("logs the account export and a history download for an account in a firm only", async () => {
    await db.pg.exec(`
      insert into business_history (user_id, business_id, revision, name, industry, profile)
        values ('pp', 'biz_1', 0, 'Before', 'dental', '{}'::jsonb);
    `);
    await exportAll("pp");
    await call(account.exportBusinessHistory, "pp", { businessId: "biz_1" });
    await exportAll("so");
    const rows = await log();
    expect(rows.map((r) => [r.firm, r.event, r.actor, r.business, r.detail])).toEqual([
      ["fo", "export_run", "pp", null, { kind: "account" }],
      ["fo", "export_run", "pp", "biz_1", { kind: "history" }],
    ]);
  });

  it("logs no history download that returned no versions", async () => {
    await db.pg.exec(`
      insert into business_history (user_id, business_id, revision, name, industry, profile)
        values ('so', 'biz_s', 0, 'Before', 'dental', '{}'::jsonb),
               ('bo', 'biz_g', 0, 'Before', 'dental', '{}'::jsonb);
    `);
    // Another account's business, one that does not exist, and one the
    // caller's firm does not work on: each page is empty, so nothing ran.
    for (const data of [
      { businessId: "biz_s" },
      { businessId: "biz_nope" },
      { businessId: "biz_g", ownerUserId: "bo" },
    ]) {
      const page = await call<{ base64: string }>(account.exportBusinessHistory, "pp", data);
      expect(JSON.parse(Buffer.from(page.base64, "base64").toString("utf8"))).toEqual([]);
    }
    expect(await log()).toEqual([]);
  });

  it("puts the firm's log in the firm owner's export, newest first", async () => {
    await call(server.saveFirmLetterhead, "fo", {
      letterhead: "1 Main St",
      logoDataUrl: null,
      coverPage: true,
    });
    await call(engagement.saveFirmRetention, "fo", { years: 9 });
    const owner = await exportAll("fo");
    expect(
      owner.firmActivity.map((r: { event: string; actorName: string }) => [r.event, r.actorName]),
    ).toEqual([
      ["retention_changed", "Fay Owner"],
      ["letterhead_changed", "Fay Owner"],
    ]);
    const member = await exportAll("pp");
    expect(member.firmActivity).toEqual([]);
  });
});

describe("webhook writer", () => {
  const subEvent = (id: string, status: string, created: number) =>
    parseStripeEvent(
      JSON.stringify({
        id,
        type: "customer.subscription.updated",
        created,
        data: {
          object: {
            id: "sub_1",
            status,
            customer: "cus_1",
            metadata: { userId: "fo" },
            items: { data: [{ price: { id: "price_t1" } }] },
          },
        },
      }),
    )!;

  it("logs a plan change when Stripe moves the stored status, with no actor", async () => {
    await applyBillingEvent(db.sql, subEvent("e1", "active", 100));
    await applyBillingEvent(db.sql, subEvent("e2", "active", 200));
    await applyBillingEvent(db.sql, subEvent("e3", "past_due", 300));
    const rows = await log();
    expect(rows.map((r) => [r.firm, r.event, r.actor, r.name, r.detail])).toEqual([
      ["fo", "plan_changed", null, "", { from: null, to: "active", priceId: "price_t1" }],
      ["fo", "plan_changed", null, "", { from: "active", to: "past_due", priceId: "price_t1" }],
    ]);
  });

  it("logs nothing in the firm a member joined when the member's own subscription moves", async () => {
    // A member with a billing row of their own (a checkout started before
    // joining, or a former owner after a transfer) owns no firm to move.
    await db.pg.exec(
      `insert into billing_accounts (user_id, stripe_customer_id) values ('pp', 'cus_pp')`,
    );
    const before = await db.sql<{ plan: string }>`select plan from firms where user_id = 'fo'`;
    await applyBillingEvent(
      db.sql,
      parseStripeEvent(
        JSON.stringify({
          id: "e_pp",
          type: "customer.subscription.updated",
          created: 100,
          data: {
            object: {
              id: "sub_pp",
              status: "active",
              customer: "cus_pp",
              metadata: { userId: "pp" },
              items: { data: [{ price: { id: "price_t1" } }] },
            },
          },
        }),
      )!,
    );
    expect(await log()).toEqual([]);
    expect(await db.sql`select plan from firms where user_id = 'fo'`).toEqual(before);
  });
});

it("reported no failed write in any of the above", () => {
  expect(report.error).not.toHaveBeenCalledWith(expect.anything(), "audit");
});
