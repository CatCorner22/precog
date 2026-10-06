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
import { toSql } from "@/lib/sql-transaction";
import {
  createMapShare,
  createReportShare,
  loadMapShare,
  loadReportShare,
  MAP_SHARE_UNSAVED,
  revokeMapShare,
} from "./share-server";
import { buildSharePayload } from "./share-payload";
import type { ProcessNode } from "../types";
import type { ReviewRecord } from "../firm/reviews";

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
// The public loaders read the caller's address and user agent for the view log.
vi.mock("@/lib/request-ip.server", () => ({ requestIp: () => "203.0.113.9" }));
vi.mock("@tanstack/react-start/server", () => ({ getRequest: () => null }));
// The day each map link's week of actions was built for.
const weekly = vi.hoisted(() => ({ days: [] as string[] }));
vi.mock("../weekly-actions/build", async (importOriginal) => {
  const real = await importOriginal<typeof import("../weekly-actions/build")>();
  return {
    ...real,
    buildWeeklyActions: (input: Parameters<typeof real.buildWeeklyActions>[0]) => {
      weekly.days.push(input.today ?? "none");
      return real.buildWeeklyActions(input);
    },
  };
});

type ShareCall = (args: {
  context: { userId: string };
  data: { versionId: string };
}) => Promise<{ token: string }>;
const shareReport = (userId: string, versionId: string) =>
  (createReportShare as unknown as ShareCall)({ context: { userId }, data: { versionId } });
type RevokeCall = (args: {
  context: { userId: string };
  data: { token: string };
}) => Promise<{ ok: true }>;

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

  it("never names who a review was requested from, who returned it, the return note or the override note", async () => {
    await lock("prep", "client", "rv_1");
    await review("rv_1");
    await db.pg.query(
      `update report_versions set review_requested_at = now(), review_requested_by = 'prep',
         review_requested_from = 'owner', returned_at = now(), returned_by = 'owner',
         return_note = 'Ask Ada about the Quokka ledger',
         review_override_note = 'The assigned reviewer is at the Wombat audit' where id = 'rv_1'`,
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
      // Why someone reviewed in the assigned reviewer's place (migration 0056).
      reviewOverrideNote: null,
    });
    expect(shared?.version.reviewedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(JSON.stringify(shared)).not.toContain("Quokka ledger");
    expect(JSON.stringify(shared)).not.toContain("Wombat audit");
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

  it("revokes a link from the share panel in one statement, and logs only the call that ended it", async () => {
    await lock("prep", "client", "rv_1");
    await review("rv_1");
    await reportLink(token(1), "prep", "rv_1");
    /** The statements one revoke runs that read or write map_shares. */
    const revokeAs = async (userId: string) => {
      const texts: string[] = [];
      ref.db = {
        sql: toSql(async (text, params) => {
          texts.push(text);
          return db.sql.query(text, params);
        }),
      };
      try {
        await (revokeMapShare as unknown as RevokeCall)({
          context: { userId },
          data: { token: token(1) },
        });
      } finally {
        ref.db = db;
      }
      return texts.filter((t) => /\bmap_shares\b/.test(t));
    };
    expect(await revokeAs("owner")).toHaveLength(1);
    // A repeat (a double click, a retry) changes nothing and logs nothing.
    expect(await revokeAs("prep")).toHaveLength(1);
    const logged = await db.pg.query<{ actor_user_id: string; business_id: string }>(
      "select actor_user_id, business_id from firm_audit_log where event = 'share_revoked'",
    );
    expect(logged.rows).toEqual([{ actor_user_id: "owner", business_id: "client" }]);
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

/** Free text the business wrote for itself that no printed report shows. */
const PRIVATE_NOTES = [
  "bank login kept in the front drawer",
  "risk note: Maria skips the count",
  "idea note: buy a safe",
  "evidence note: binder 4",
  "waste note: double entry",
  "Quokka banking portal",
  "Shared drive > Payroll > Procedure",
  "Risk title the report never prints",
  "cash short $400, spoke to Maria",
  "an earlier draft of this month's note",
] as const;

/** A process on the client's map carrying every kind of private note. */
const notedProcess: ProcessNode = {
  id: "proc_payroll",
  name: "Run payroll",
  layer: "process",
  description: "Ada runs it; bank login kept in the front drawer.",
  dependencies: [],
  controlIds: [],
  stage: 2,
  ownerPersonIds: ["a"],
  risks: [
    {
      id: "risk_count",
      title: "Risk title the report never prints",
      kind: "fraud",
      severity: 4,
      likelihood: 3,
      note: "risk note: Maria skips the count",
    },
  ],
  ideas: [
    {
      id: "idea_safe",
      title: "Lock the drawer",
      category: "control",
      effort: "low",
      impact: "high",
      note: "idea note: buy a safe",
      status: "backlog",
    },
  ],
  wastes: [{ id: "w1", kind: "muda_rework", label: "Rework", note: "waste note: double entry" }],
  evidence: [
    { id: "e1", label: "Payroll register", frequency: "monthly", note: "evidence note: binder 4" },
  ],
  systems: ["Quokka banking portal"],
  inputs: ["Timesheets"],
  outputs: ["Pay stubs"],
  procedureLocation: "Shared drive > Payroll > Procedure",
};

/** This month's result (printed), an earlier draft for the same check, and a past month's note. */
function reviewsFor(now: Date): ReviewRecord[] {
  const period = now.toISOString().slice(0, 7);
  return [
    {
      key: "bank_statement",
      period,
      result: "done",
      ownerName: "Ada Park",
      notes: "Two deposits in transit.",
      recordedAt: now.toISOString(),
    },
    {
      key: "bank_statement",
      period,
      result: "exception",
      ownerName: "Ada Park",
      notes: "an earlier draft of this month's note",
      recordedAt: now.toISOString(),
    },
    {
      key: "bank_statement",
      period: "2025-01",
      result: "exception",
      ownerName: "Ada Park",
      notes: "cash short $400, spoke to Maria",
      recordedAt: "2025-01-31T12:00:00.000Z",
    },
  ];
}

const noted = (): PracticeProfile => ({
  ...client,
  customProcesses: [notedProcess],
  monthlyReviews: reviewsFor(new Date()),
});

type LoadCall = (args: { data: { token: string } }) => Promise<Record<string, unknown>>;

describe("what a public report link sends", () => {
  beforeEach(async () => {
    await db.pg.query("update businesses set profile = $1::jsonb where id = 'client'", [
      JSON.stringify(noted()),
    ]);
  });

  it("sends no process note, description or past monthly note, and keeps this month's printed result", async () => {
    await lock("prep", "client", "rv_1");
    await review("rv_1");
    await reportLink(token(1), "prep", "rv_1");
    const row = await loadReportShareRow(db.sql, token(1));
    const shared = await loadSharedReport(db.sql, row!, "2026-10-01");
    const text = JSON.stringify(shared);
    for (const secret of PRIVATE_NOTES) expect(text).not.toContain(secret);
    // What the report prints still travels: the process, its owner, its counts, this month's result.
    const [process] = shared?.profile.customProcesses ?? [];
    expect(process).toMatchObject({ id: "proc_payroll", name: "Run payroll", stage: 2 });
    expect(process.ownerPersonIds).toEqual(["a"]);
    expect(process.risks).toHaveLength(1);
    expect(process.ideas).toHaveLength(1);
    expect(shared?.profile.monthlyReviews?.map((r) => r.notes)).toEqual([
      "Two deposits in transit.",
    ]);
  });

  it("strips the notes from a link made before this change, as the public page loads it", async () => {
    await lock("prep", "client", "rv_1");
    await review("rv_1");
    // An older row whose stored payload carries a whole profile, notes and all.
    await insertMapShare(db.sql, {
      token: token(1),
      userId: "prep",
      businessName: "Ortiz Dental Studio",
      industry: "dental",
      payloadJson: JSON.stringify({ profile: noted() }),
      expiresAt: new Date(Date.now() + 86_400_000).toISOString(),
      redacted: false,
      passcodeSalt: null,
      passcodeHash: null,
      businessOwnerId: "prep",
      businessId: "client",
      reportVersionId: "rv_1",
    });
    const res = await (loadReportShare as unknown as LoadCall)({ data: { token: token(1) } });
    expect(res.found).toBe(true);
    const text = JSON.stringify(res);
    for (const secret of PRIVATE_NOTES) expect(text).not.toContain(secret);
    expect(text).toContain("Two deposits in transit.");
  });
});

type MapShareCall = (args: {
  context: { userId: string };
  data: Record<string, unknown>;
}) => Promise<{ token: string }>;
const shareMap = (userId: string, data: Record<string, unknown>) =>
  (createMapShare as unknown as MapShareCall)({ context: { userId }, data });
const storedPayload = async (tok: string) =>
  (
    await db.pg.query<{ payload: Record<string, unknown> }>(
      "select payload from map_shares where token = $1",
      [tok],
    )
  ).rows[0].payload;

describe("a map link", () => {
  it("is built on the server from the saved business, whatever the browser sends", async () => {
    const forged = {
      ...buildSharePayload(defaultProfile("dental"), []),
      businessName: "Acme Plumbing LLC",
      note: "Reviewed by our CPA",
    };
    forged.health = { ...forged.health, score: 98, bandLabel: "Strong" };
    const { token: tok } = await shareMap("prep", {
      businessId: "client",
      payload: forged,
      note: "For the bank",
    });
    const payload = await storedPayload(tok);
    expect(payload.businessName).toBe("Ortiz Dental Studio");
    expect(payload.note).toBe("For the bank");
    expect(JSON.stringify(payload)).not.toContain("Acme Plumbing");
    // The firm's work on its client names the firm; the date is the business's last save.
    expect(payload.sharedBy).toBe("North Advisors");
    expect(Date.parse(String(payload.savedAt))).not.toBeNaN();
    const roster = (payload.people as { name: string }[]).map((p) => p.name);
    expect(roster).toEqual(["Ada Park", "Ben Ortiz"]);
  });

  it("names the account on its own business, and no one when names are hidden", async () => {
    const own = await shareMap("solo", { businessId: "solo_biz" });
    expect((await storedPayload(own.token)).sharedBy).toBe("solo");
    const hidden = await shareMap("solo", { businessId: "solo_biz", redacted: true });
    const payload = await storedPayload(hidden.token);
    expect(payload.sharedBy).toBe("the business's own account");
    expect(payload.namesHidden).toBe(true);
    expect(JSON.stringify(payload)).not.toContain("Ada Park");
  });

  it("builds the week's actions on the owner's day, not the server's", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    // Already the 7th on the server's clock; still the 6th where the owner is.
    vi.setSystemTime(new Date("2026-10-07T02:00:00Z"));
    try {
      weekly.days.length = 0;
      await shareMap("solo", { businessId: "solo_biz", today: "2026-10-06" });
      expect(weekly.days).toEqual(["2026-10-06"]);
      // A day more than one away from the server's, or no day at all, is not taken.
      weekly.days.length = 0;
      await shareMap("solo", { businessId: "solo_biz", today: "2020-01-01" });
      await shareMap("solo", { businessId: "solo_biz" });
      expect(weekly.days).toEqual(["2026-10-07", "2026-10-07"]);
    } finally {
      vi.useRealTimers();
    }
  });

  it("is refused for a business the caller cannot reach, with no fallback to the caller", async () => {
    for (const businessId of ["biz_x", "client"]) {
      await expect(shareMap("solo", { businessId })).rejects.toMatchObject({
        status: 403,
        message: MAP_SHARE_UNSAVED,
      });
    }
    expect(MAP_SHARE_UNSAVED).toBe("Save this business to your account before sharing it.");
    const rows = await db.pg.query<{ n: number }>("select count(*)::int as n from map_shares");
    expect(rows.rows[0].n).toBe(0);
  });

  it("still serves a link an older build stored as the browser sent it", async () => {
    const old = buildSharePayload(defaultProfile("dental"), []);
    await insertMapShare(db.sql, {
      ...(await mapLink(token(1))),
      payloadJson: JSON.stringify(old),
    });
    const res = await (loadMapShare as unknown as LoadCall)({ data: { token: token(1) } });
    expect(res).toMatchObject({ found: true, payload: JSON.parse(JSON.stringify(old)) });
    expect(res.payload).not.toHaveProperty("sharedBy");
  });
});

describe("links a firm makes on a business its owner shared with the firm", () => {
  beforeEach(async () => {
    await db.sql`update businesses set firm_user_id = 'owner', granted_at = now() where id = 'solo_biz'`;
  });

  it("are listed for the business's own account with who made them, and the owner revokes them", async () => {
    const map = await shareMap("prep", { businessId: "solo_biz" });
    await lock("solo", "solo_biz", "rv_granted", true, "prep");
    await review("rv_granted");
    await reportLink(token(1), "prep", "rv_granted", "solo_biz");

    const listed = await listMapShareSummaries(db.sql, "solo");
    expect(listed.map((l) => [l.token, l.kind, l.createdBy, l.createdByFirm]).sort()).toEqual(
      [
        [token(1), "report", "prep", "North Advisors"],
        [map.token, "map", "prep", "North Advisors"],
      ].sort(),
    );
    // The firm made the map link in the firm's name.
    expect((await storedPayload(map.token)).sharedBy).toBe("North Advisors");

    for (const tok of [token(1), map.token]) {
      await (revokeMapShare as unknown as RevokeCall)({
        context: { userId: "solo" },
        data: { token: tok },
      });
    }
    const states = await db.pg.query<{ r: boolean }>(
      "select revoked_at is not null as r from map_shares order by token",
    );
    expect(states.rows.map((r) => r.r)).toEqual([true, true]);
    const logged = await db.pg.query<{ actor_user_id: string }>(
      "select actor_user_id from firm_audit_log where event = 'share_revoked'",
    );
    expect(logged.rows.map((r) => r.actor_user_id)).toEqual(["solo", "solo"]);
    // Another account still reaches none of them.
    expect(await listMapShareSummaries(db.sql, "nobody")).toEqual([]);
  });
});
