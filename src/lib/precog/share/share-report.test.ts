import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { openTestDb, type TestDb } from "@/test/pglite";
import { defaultProfile, type PracticeProfile } from "../practice-profile";
import { freezeReport } from "../report/stored-model";
import { lockReportVersion } from "../firm/reports";
import { removeMember } from "../firm/store";
import { BUSINESS_ROLE_REFUSED } from "../firm/access.server";
import { deleteBusinessRow } from "../business-store";
import {
  insertMapShare,
  listMapShareSummaries,
  loadReportShareRow,
  loadSharedReport,
  REPORT_SHARE_REFUSAL,
  reportShareRefusal,
  shareStillReachable,
  type NewMapShare,
} from "./share-store";
import { createReportShare } from "./share-server";

// createReportShare runs as a plain handler: the validator, then the handler
// with the caller's id, against this file's PGlite.
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

type ShareCall = (args: {
  context: { userId: string };
  data: { versionId: string };
}) => Promise<{ token: string }>;
const shareReport = (userId: string, versionId: string) =>
  (createReportShare as unknown as ShareCall)({ context: { userId }, data: { versionId } });

let db: TestDb;

beforeAll(async () => {
  db = await openTestDb();
  ref.db = db;
}, 60_000);

afterAll(() => db.close());

const token = (i: number) => `${String(i).padStart(2, "0")}${"b".repeat(30)}`;

/** A firm client with its own team, a journal note and a planned absence. */
const client: PracticeProfile = {
  ...defaultProfile("dental"),
  practiceName: "Ortiz Dental Studio",
  customPeople: [
    {
      id: "a",
      name: "Ada Park",
      role: "Owner",
      active: true,
      owner: true,
      entitlements: ["approve_payroll", "sign_checks"],
    },
    {
      id: "b",
      name: "Ben Ortiz",
      role: "Bookkeeper",
      active: true,
      entitlements: ["enter_invoices", "release_payment", "bank_reconcile"],
      employeeId: "EMP-0042",
    },
  ],
  customKnowledge: [
    {
      id: "k_bank",
      name: "Bank reconciliation",
      criticality: "critical",
      category: "process",
      description: "Ada keeps the bank token in the top drawer.",
      linkedProcessIds: [],
      documented: true,
      procedureLocation: "Shared drive > Finance > Bank binder",
    },
  ],
  decisions: [
    {
      id: "d1",
      createdAt: "2026-09-20T12:00:00.000Z",
      subject: "Vendor set-up",
      kind: "monitor",
      note: "Ben is on probation until December.",
    },
  ],
  plannedAbsences: [
    { id: "abs1", personId: "b", industry: "dental", from: "2026-10-10", to: "2026-10-17" },
  ],
  procedures: [
    {
      id: "proc1",
      industry: "dental",
      title: "Reconcile the operating account",
      prerequisites: [],
      steps: [{ id: "s1", text: "Open Banking." }],
      knowledgeIds: [],
      processIds: [],
      backupPersonIds: [],
      reviewEveryDays: 90,
      version: 1,
      changelog: [],
      proofs: [],
      createdAt: "2026-09-01",
      updatedAt: "2026-09-01",
    },
  ],
};

beforeEach(async () => {
  await db.clear(
    "map_shares",
    "billing_accounts",
    "report_versions",
    "firm_members",
    "firms",
    "businesses",
    "business_deletion_markers",
    '"user"',
  );
  for (const id of ["owner", "prep", "solo"]) await db.seedUser(id);
  await db.pg.exec(`
    insert into firms (user_id, name, letterhead) values ('owner', 'North Advisors', '12 Elm St');
    insert into firm_members (firm_user_id, member_user_id, role)
      values ('owner', 'owner', 'owner'), ('owner', 'prep', 'preparer');
  `);
  await db.pg.query(
    `insert into businesses (id, user_id, name, industry, profile, revision, firm_user_id)
     values ('client', 'prep', 'Ortiz Dental Studio', 'dental', $1::jsonb, 1, 'owner'),
            ('solo_biz', 'solo', 'Solo', 'dental', $1::jsonb, 1, null)`,
    [JSON.stringify(client)],
  );
});

async function lock(
  ownerUserId: string,
  businessId: string,
  id: string,
  withFigures = true,
  preparedBy = ownerUserId,
) {
  return lockReportVersion(db.sql, {
    ownerUserId,
    businessId,
    preparedBy,
    scopeNote: "",
    id,
    freeze: withFigures ? (profile) => freezeReport(profile, "2026-09-26") : undefined,
  });
}

const review = (id: string) =>
  db.pg.query(
    "update report_versions set reviewed_by = 'owner', reviewed_at = now() where id = $1",
    [id],
  );

function reportLink(tok: string, maker: string, versionId: string, businessId = "client") {
  const share: NewMapShare = {
    token: tok,
    userId: maker,
    businessName: "Ortiz Dental Studio",
    industry: "dental",
    payloadJson: "{}",
    expiresAt: new Date(Date.now() + 86_400_000).toISOString(),
    redacted: false,
    passcodeSalt: null,
    passcodeHash: null,
    businessOwnerId: businessId === "client" ? "prep" : "solo",
    businessId,
    reportVersionId: versionId,
  };
  return insertMapShare(db.sql, share);
}

describe("sharing a locked report version", () => {
  it("refuses a solo business, an unreviewed version and a version without figures", async () => {
    await lock("solo", "solo_biz", "rv_solo");
    await review("rv_solo");
    expect(await reportShareRefusal(db.sql, "solo", "rv_solo")).toBe(REPORT_SHARE_REFUSAL.solo);
    expect(REPORT_SHARE_REFUSAL.solo).toBe(
      "Report links are for a firm's client businesses. Add the business to your firm to share its report.",
    );

    await lock("prep", "client", "rv_draft");
    expect(await reportShareRefusal(db.sql, "prep", "rv_draft")).toBe(
      "Only a version reviewed for issuance can be shared. Review it for issuance first.",
    );

    await lock("prep", "client", "rv_bare", false);
    await review("rv_bare");
    expect(await reportShareRefusal(db.sql, "prep", "rv_bare")).toBe(
      "This version was locked without its stored figures, so Precog cannot share it as issued. Lock a new version and review it.",
    );

    await lock("prep", "client", "rv_ok");
    await review("rv_ok");
    expect(await reportShareRefusal(db.sql, "prep", "rv_ok")).toBeNull();
    expect(await reportShareRefusal(db.sql, "prep", "rv_missing")).toBe(
      "That report version does not exist",
    );
  });

  it("hands the page the frozen model, the firm snapshot and a profile without the business's notes", async () => {
    const v = await lock("prep", "client", "rv_1");
    expect(v.hasFigures).toBe(true);
    await review("rv_1");
    expect(await reportLink(token(1), "prep", "rv_1")).toBe(true);

    const row = await loadReportShareRow(db.sql, token(1));
    expect(row).toMatchObject({
      token: token(1),
      reportVersionId: "rv_1",
      ownerUserId: "prep",
      businessId: "client",
      versionNo: 1,
      revokedAt: null,
    });
    expect(row?.reviewedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    // A map link, or an unknown token, is not a report link.
    await insertMapShare(db.sql, {
      ...(await mapLink(token(2))),
    });
    expect(await loadReportShareRow(db.sql, token(2))).toBeNull();
    expect(await loadReportShareRow(db.sql, token(3))).toBeNull();

    const shared = await loadSharedReport(db.sql, row!, "2026-10-01");
    expect(shared?.version.id).toBe("rv_1");
    expect(shared?.frozen?.model?.summary.length).toBeGreaterThan(0);
    expect(shared?.firm).toEqual({
      name: "North Advisors",
      letterhead: "12 Elm St",
      logoDataUrl: null,
    });
    expect(shared?.profile.practiceName).toBe("Ortiz Dental Studio");
    expect(shared?.profile.businessId).toBe("client");
    expect(shared?.profile.customPeople?.map((p) => p.name)).toEqual(["Ada Park", "Ben Ortiz"]);
    // The link carries no journal text, no leave and no procedure text.
    expect(shared?.profile).not.toHaveProperty("notes");
    expect(shared?.profile.decisions).toEqual([]);
    expect(shared?.profile.plannedAbsences).toEqual([]);
    expect(shared?.profile.procedures ?? []).toEqual([]);
    const text = JSON.stringify(shared?.profile);
    expect(text).not.toContain("probation");
    expect(text).not.toContain("Open Banking");
    // Nor the roster's employee id or a register item's description; the
    // item's location travels because it decides whether freshness is tracked.
    expect(text).not.toContain("EMP-0042");
    expect(text).not.toContain("top drawer");
    expect(shared?.profile.customKnowledge?.[0].procedureLocation).toBe(
      "Shared drive > Finance > Bank binder",
    );
  });

  it("never names who a review was requested from, who returned it or the return note", async () => {
    await lock("prep", "client", "rv_1");
    await review("rv_1");
    await db.pg.query(
      `update report_versions set review_requested_at = now(), review_requested_by = 'prep',
         review_requested_from = 'owner', returned_at = now(), returned_by = 'owner',
         return_note = 'Ask Ada about the Quokka ledger' where id = 'rv_1'`,
    );
    await reportLink(token(1), "prep", "rv_1");
    const row = await loadReportShareRow(db.sql, token(1));
    const shared = await loadSharedReport(db.sql, row!, "2026-10-01");
    expect(shared?.version).toMatchObject({
      id: "rv_1",
      reviewRequestedAt: null,
      reviewRequestedFrom: null,
      reviewRequestedFromName: null,
      returnedAt: null,
      returnedBy: null,
      returnedByName: null,
      returnNote: "",
    });
    expect(shared?.version.reviewedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(JSON.stringify(shared)).not.toContain("Quokka ledger");
  });

  it("never prints a link whose version is not reviewed for issuance", async () => {
    await lock("prep", "client", "rv_1");
    await reportLink(token(1), "prep", "rv_1");
    const row = await loadReportShareRow(db.sql, token(1));
    expect(row?.reviewedAt).toBeNull();
    expect(await loadSharedReport(db.sql, row!, "2026-10-01")).toBeNull();
    await review("rv_1");
    const reviewed = await loadReportShareRow(db.sql, token(1));
    expect(reviewed?.reviewedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(await loadSharedReport(db.sql, reviewed!, "2026-10-01")).not.toBeNull();
  });

  it("lists a report link with its kind and version, and a map link as a map", async () => {
    await lock("prep", "client", "rv_1");
    await review("rv_1");
    await reportLink(token(1), "prep", "rv_1");
    await insertMapShare(db.sql, await mapLink(token(2)));
    const list = await listMapShareSummaries(db.sql, "prep");
    expect(
      list.map((l) => [l.token, l.kind, l.reportVersionId, l.versionNo, l.businessId]).sort(),
    ).toEqual([
      [token(1), "report", "rv_1", 1, "client"],
      [token(2), "map", null, null, "client"],
    ]);
    // The firm owner sees the member's report link too, and can revoke it.
    expect((await listMapShareSummaries(db.sql, "owner")).map((l) => l.token).sort()).toEqual([
      token(1),
      token(2),
    ]);
  });

  it("revokes the link when the business or the version is deleted", async () => {
    await lock("prep", "client", "rv_1");
    await lock("prep", "client", "rv_2");
    await review("rv_1");
    await review("rv_2");
    await reportLink(token(1), "prep", "rv_1");
    await reportLink(token(2), "prep", "rv_2");
    expect(await shareStillReachable(db.sql, token(1))).toBe(true);

    // The version goes: the share row goes with it (0040's cascade).
    await db.pg.query("delete from report_versions where id = 'rv_2'");
    expect(await loadReportShareRow(db.sql, token(2))).toBeNull();
    const rows = await db.pg.query<{ n: number }>(
      "select count(*)::int as n from map_shares where token = $1",
      [token(2)],
    );
    expect(rows.rows[0].n).toBe(0);

    // The business is deleted: the link is revoked and no longer reachable.
    await deleteBusinessRow(db.sql, "prep", "client", "owner");
    const revoked = await db.pg.query<{ r: boolean }>(
      "select revoked_at is not null as r from map_shares where token = $1",
      [token(1)],
    );
    expect(revoked.rows[0].r).toBe(true);
    expect(await shareStillReachable(db.sql, token(1))).toBe(false);
  });

  it("revokes a departing member's report links", async () => {
    await lock("prep", "client", "rv_1");
    await review("rv_1");
    await reportLink(token(1), "prep", "rv_1");
    await reportLink(token(2), "owner", "rv_1");
    await removeMember(db.sql, "owner", "prep");
    const states = await db.pg.query<{ token: string; r: boolean }>(
      "select token, revoked_at is not null as r from map_shares order by token",
    );
    expect(states.rows).toEqual([
      { token: token(1), r: true },
      { token: token(2), r: false },
    ]);
    // The owner's link follows the client to the owner's account.
    expect(await shareStillReachable(db.sql, token(2))).toBe(true);
  });
});

describe("sharing a solo owner's reviewed version", () => {
  const withStripe = () => {
    vi.stubEnv("STRIPE_SECRET_KEY", "sk_test");
    vi.stubEnv("STRIPE_PRICE_ASSESSMENT", "price_a");
    vi.stubEnv("STRIPE_PRICE_MONTHLY", "price_m");
  };
  const withoutStripe = () => {
    vi.stubEnv("STRIPE_SECRET_KEY", "");
    vi.stubEnv("STRIPE_PRICE_ASSESSMENT", "");
    vi.stubEnv("STRIPE_PRICE_MONTHLY", "");
  };
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  async function reviewedSoloVersion() {
    await lock("solo", "solo_biz", "rv_solo");
    await review("rv_solo");
  }

  it("refuses a free solo owner with the firm-clients text", async () => {
    withStripe();
    await reviewedSoloVersion();
    await expect(shareReport("solo", "rv_solo")).rejects.toMatchObject({
      status: 409,
      message: REPORT_SHARE_REFUSAL.solo,
    });
  });

  it("lets an Assessment owner inside its window share", async () => {
    withStripe();
    await reviewedSoloVersion();
    await db.sql`insert into billing_accounts (user_id, assessment_paid_at) values ('solo', now())`;
    const { token: tok } = await shareReport("solo", "rv_solo");
    const row = await loadReportShareRow(db.sql, tok);
    expect(row).toMatchObject({ reportVersionId: "rv_solo", ownerUserId: "solo" });
    expect((await loadSharedReport(db.sql, row!, "2026-10-01"))?.version.id).toBe("rv_solo");
  });

  it("lets a solo owner share on a deployment without Stripe", async () => {
    withoutStripe();
    await reviewedSoloVersion();
    const { token: tok } = await shareReport("solo", "rv_solo");
    expect((await loadReportShareRow(db.sql, tok))?.reportVersionId).toBe("rv_solo");
  });

  it("refuses a firm member's private business although the firm's plan is open", async () => {
    withStripe();
    await db.sql`insert into billing_accounts (user_id, subscription_id, subscription_status)
      values ('owner', 'sub_1', 'active')`;
    await db.pg.query(
      `insert into businesses (id, user_id, name, industry, profile, revision, firm_user_id)
       values ('prep_own', 'prep', 'Prep Own', 'dental', $1::jsonb, 1, null)`,
      [JSON.stringify(client)],
    );
    await lock("prep", "prep_own", "rv_private");
    await review("rv_private");
    await expect(shareReport("prep", "rv_private")).rejects.toMatchObject({
      status: 409,
      message: REPORT_SHARE_REFUSAL.solo,
    });
    // The firm's client still shares under the same plan.
    await lock("prep", "client", "rv_client");
    await review("rv_client");
    expect((await shareReport("prep", "rv_client")).token).toMatch(/^[0-9a-f]{36}$/);
  });

  it("refuses the owner of a business shared with a firm, and lets the firm share it under the firm's plan", async () => {
    withStripe();
    await db.sql`insert into billing_accounts (user_id, subscription_id, subscription_status)
      values ('owner', 'sub_1', 'active')`;
    // Solo's business, shared with the firm; the firm's preparer locked the version.
    await db.sql`update businesses set firm_user_id = 'owner', granted_at = now() where id = 'solo_biz'`;
    // Locked with its preparer: a locked version's preparer never changes
    // afterwards (the frozen-column trigger, migration 0048).
    await lock("solo", "solo_biz", "rv_granted", true, "prep");
    await db.sql`update report_versions set firm_user_id = 'owner' where id = 'rv_granted'`;
    await review("rv_granted");
    await expect(shareReport("solo", "rv_granted")).rejects.toMatchObject({
      status: 403,
      message: BUSINESS_ROLE_REFUSED,
    });
    // The firm shares it, on the firm's plan, though the owner's own plan is free.
    expect((await shareReport("prep", "rv_granted")).token).toMatch(/^[0-9a-f]{36}$/);
  });

  it("names no firm on a version the owner locked alone, after the business is shared with a firm", async () => {
    withoutStripe();
    await reviewedSoloVersion();
    const { token: tok } = await shareReport("solo", "rv_solo");
    const row = await loadReportShareRow(db.sql, tok);
    expect((await loadSharedReport(db.sql, row!, "2026-10-01"))?.firm).toBeNull();
    await db.sql`update businesses set firm_user_id = 'owner', granted_at = now() where id = 'solo_biz'`;
    // The link still prints the version as its owner issued it, with no preparer firm.
    expect((await loadSharedReport(db.sql, row!, "2026-10-01"))?.firm).toBeNull();
    // A version the firm locks from then on names the firm, as frozen at lock.
    await lock("solo", "solo_biz", "rv_firm", true, "prep");
    await review("rv_firm");
    const firmVersion = { ownerUserId: "solo", businessId: "solo_biz", reportVersionId: "rv_firm" };
    expect((await loadSharedReport(db.sql, firmVersion, "2026-10-01"))?.firm?.name).toBe(
      "North Advisors",
    );
  });

  it("names the firm's current name on a client's version locked before the firm was frozen in", async () => {
    // Inserted as such: the frozen-column trigger (migration 0048) refuses
    // clearing firm_name on a locked version.
    await db.pg.query(
      `insert into report_versions
         (id, user_id, business_id, version_no, profile, firm_name, reviewed_by, reviewed_at)
       values ('rv_old', 'prep', 'client', 1, $1::jsonb, null, 'owner', now())`,
      [JSON.stringify(client)],
    );
    const old = { ownerUserId: "prep", businessId: "client", reportVersionId: "rv_old" };
    expect((await loadSharedReport(db.sql, old, "2026-10-01"))?.firm).toEqual({
      name: "North Advisors",
      letterhead: "",
      logoDataUrl: null,
    });
  });
});

async function mapLink(tok: string): Promise<NewMapShare> {
  return {
    token: tok,
    userId: "prep",
    businessName: "Ortiz Dental Studio",
    industry: "dental",
    payloadJson: JSON.stringify({ version: 1 }),
    expiresAt: new Date(Date.now() + 86_400_000).toISOString(),
    redacted: false,
    passcodeSalt: null,
    passcodeHash: null,
    businessOwnerId: "prep",
    businessId: "client",
  };
}
