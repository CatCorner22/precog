import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { openTestDb, type TestDb } from "@/test/pglite";
import {
  ENGAGEMENT_ENDED,
  ENGAGEMENT_SCOPE_MAX,
  NOT_A_FIRM_CLIENT,
  OWNER_ONLY_STATUS,
  parseEngagementInput,
  PERIOD_BACKWARDS,
  PICK_MEMBERS,
  PICK_REVIEWER,
  RETENTION_REFUSAL,
  RETENTION_YEARS_DEFAULT,
  RETENTION_YEARS_MAX,
  RETENTION_YEARS_MIN,
} from "./engagement-row";
import {
  assertEngagementOpen,
  engagementEnded,
  loadClientFirm,
  loadEngagement,
  loadFirmRetention,
  loadReviewLog,
  saveEngagement,
  saveFirmRetention,
  setEngagementStatus,
} from "./engagement-store";

let db: TestDb;

beforeAll(async () => {
  db = await openTestDb();
}, 60_000);

afterAll(async () => {
  await db.close();
});

/**
 * Firm "own" (owner `own`, reviewer `rev`, preparer `prep`) with client
 * `biz_1` under the owner's account; `solo` holds `biz_s` with no firm.
 */
beforeEach(async () => {
  await db.clear(
    "review_events",
    "engagement_marks",
    "firm_members",
    "firms",
    "businesses",
    '"user"',
  );
  for (const id of ["own", "rev", "prep", "solo", "out"]) await db.seedUser(id);
  await db.pg.exec(`
    insert into firms (user_id, name) values ('own', 'North Advisors');
    insert into firm_members (firm_user_id, member_user_id, role) values
      ('own', 'own', 'owner'), ('own', 'rev', 'reviewer'), ('own', 'prep', 'preparer');
    insert into businesses (id, user_id, name, industry, profile, revision, firm_user_id) values
      ('biz_1', 'own', 'Client', 'general', '{}'::jsonb, 1, 'own'),
      ('biz_s', 'solo', 'Solo', 'general', '{}'::jsonb, 1, null);
  `);
});

const blank = {
  scope: "",
  periodStart: null,
  periodEnd: null,
  preparerUserId: null,
  reviewerUserId: null,
};

function save(fields: Partial<typeof blank>, actorUserId = "own") {
  return saveEngagement(db.sql, {
    ownerUserId: "own",
    businessId: "biz_1",
    actorUserId,
    ...blank,
    ...fields,
  });
}

describe("the constants and texts", () => {
  it("pins the retention range, the scope length and every refusal", () => {
    expect([RETENTION_YEARS_MIN, RETENTION_YEARS_MAX, RETENTION_YEARS_DEFAULT]).toEqual([7, 15, 7]);
    expect(ENGAGEMENT_SCOPE_MAX).toBe(600);
    expect(ENGAGEMENT_ENDED).toBe(
      "The engagement with this client has ended, so the firm can read it but not change it. The firm owner can reopen it on the Firm page.",
    );
    expect(PICK_MEMBERS).toBe("Pick a preparer and reviewer from the firm's members.");
    expect(PICK_REVIEWER).toBe(
      "Pick a reviewer who holds the owner or reviewer role and is not the preparer.",
    );
    expect(PERIOD_BACKWARDS).toBe("The period ends before it starts.");
    expect(NOT_A_FIRM_CLIENT).toBe("Only a firm's client has an engagement.");
    expect(OWNER_ONLY_STATUS).toBe("Only the firm owner can end or reopen an engagement.");
    expect(RETENTION_REFUSAL).toBe("Pick a period from 7 to 15 years.");
  });
});

describe("parseEngagementInput", () => {
  it("trims and caps the scope, takes empty dates and members as null", () => {
    expect(
      parseEngagementInput({
        scope: `  ${"x".repeat(700)}  `,
        periodStart: "",
        periodEnd: "2026-12-31",
        preparerUserId: "",
        reviewerUserId: "rev",
      }),
    ).toEqual({
      scope: "x".repeat(600),
      periodStart: null,
      periodEnd: "2026-12-31",
      preparerUserId: null,
      reviewerUserId: "rev",
    });
  });

  it("refuses a period that ends before it starts, and a date that is not a day", () => {
    expect(() =>
      parseEngagementInput({ ...blank, periodStart: "2026-06-01", periodEnd: "2026-05-31" }),
    ).toThrow(PERIOD_BACKWARDS);
    expect(() => parseEngagementInput({ ...blank, periodStart: "2026-02-30" })).toThrow(
      "Engagement dates must be ISO dates",
    );
  });
});

describe("saveEngagement", () => {
  it("saves the five fields and keeps the stamps, counts and owner address", async () => {
    await db.pg.exec(`
      insert into engagement_marks (user_id, business_id, started_at, report_sent_at,
        open_findings, accepted_findings, owner_email)
      values ('own', 'biz_1', '2026-01-02T00:00:00Z', '2026-03-04T00:00:00Z', 4, 2, 'o@shop.test');
    `);
    const saved = await save({
      scope: "Duty map and monthly review",
      periodStart: "2026-01-01",
      periodEnd: "2026-12-31",
      preparerUserId: "prep",
      reviewerUserId: "rev",
    });
    expect(saved).toEqual({
      scope: "Duty map and monthly review",
      periodStart: "2026-01-01",
      periodEnd: "2026-12-31",
      status: "active",
      endedAt: null,
      preparerUserId: "prep",
      reviewerUserId: "rev",
    });
    const rows = await db.pg.query<Record<string, unknown>>(
      `select started_at is not null as started, report_sent_at is not null as sent,
        open_findings, accepted_findings, owner_email from engagement_marks`,
    );
    expect(rows.rows[0]).toEqual({
      started: true,
      sent: true,
      open_findings: 4,
      accepted_findings: 2,
      owner_email: "o@shop.test",
    });
    expect(await loadEngagement(db.sql, "own", "biz_1")).toEqual(saved);
  });

  it("creates the row when none exists, and the owner may be the reviewer", async () => {
    expect(await loadEngagement(db.sql, "own", "biz_1")).toBeNull();
    const saved = await save({ preparerUserId: "prep", reviewerUserId: "own" }, "prep");
    expect([saved.preparerUserId, saved.reviewerUserId]).toEqual(["prep", "own"]);
  });

  it("refuses a preparer or reviewer from outside the firm", async () => {
    await expect(save({ preparerUserId: "out" })).rejects.toThrow(PICK_MEMBERS);
    await expect(save({ reviewerUserId: "solo" })).rejects.toThrow(PICK_MEMBERS);
  });

  it("refuses a reviewer who holds the preparer role or is the preparer", async () => {
    await expect(save({ reviewerUserId: "prep" })).rejects.toThrow(PICK_REVIEWER);
    await expect(save({ preparerUserId: "rev", reviewerUserId: "rev" })).rejects.toThrow(
      PICK_REVIEWER,
    );
    // The preparer may hold any role.
    expect((await save({ preparerUserId: "rev", reviewerUserId: "own" })).preparerUserId).toBe(
      "rev",
    );
  });

  it("refuses a business with no firm", async () => {
    await expect(
      saveEngagement(db.sql, {
        ownerUserId: "solo",
        businessId: "biz_s",
        actorUserId: "solo",
        ...blank,
      }),
    ).rejects.toThrow(NOT_A_FIRM_CLIENT);
  });

  it("refuses a firm member's save once the engagement has ended", async () => {
    await setEngagementStatus(db.sql, "own", "biz_1", "ended");
    await expect(save({ scope: "Later" }, "rev")).rejects.toThrow(ENGAGEMENT_ENDED);
    await expect(save({ scope: "Later" }, "own")).rejects.toThrow(ENGAGEMENT_ENDED);
  });
});

describe("ending and reopening", () => {
  it("ends with a stamp kept on a second end, and reopening clears it", async () => {
    await save({ scope: "Map" });
    const ended = await setEngagementStatus(db.sql, "own", "biz_1", "ended");
    expect(ended.status).toBe("ended");
    expect(ended.endedAt).not.toBeNull();
    expect(ended.scope).toBe("Map");
    expect(await engagementEnded(db.sql, "own", "biz_1")).toBe(true);
    const again = await setEngagementStatus(db.sql, "own", "biz_1", "ended");
    expect(again.endedAt).toBe(ended.endedAt);
    const reopened = await setEngagementStatus(db.sql, "own", "biz_1", "active");
    expect([reopened.status, reopened.endedAt]).toEqual(["active", null]);
    expect(await engagementEnded(db.sql, "own", "biz_1")).toBe(false);
  });

  it("the database refuses a status other than active or ended", async () => {
    await expect(
      db.pg.exec(
        `insert into engagement_marks (user_id, business_id, status) values ('own', 'biz_1', 'archived')`,
      ),
    ).rejects.toThrow();
  });
});

describe("assertEngagementOpen", () => {
  it("refuses a member of the business's firm on an ended client", async () => {
    await setEngagementStatus(db.sql, "own", "biz_1", "ended");
    for (const member of ["own", "rev", "prep"]) {
      await expect(assertEngagementOpen(db.sql, "own", "biz_1", member)).rejects.toMatchObject({
        status: 409,
        message: ENGAGEMENT_ENDED,
      });
    }
    // Someone outside the firm meets the access checks, not this one.
    await expect(assertEngagementOpen(db.sql, "own", "biz_1", "out")).resolves.toBeUndefined();
  });

  it("passes on an active client, on a client with no row and on a solo business", async () => {
    await expect(assertEngagementOpen(db.sql, "own", "biz_1", "rev")).resolves.toBeUndefined();
    await save({ scope: "Map" });
    await expect(assertEngagementOpen(db.sql, "own", "biz_1", "rev")).resolves.toBeUndefined();
    await setEngagementStatus(db.sql, "solo", "biz_s", "ended");
    await expect(assertEngagementOpen(db.sql, "solo", "biz_s", "solo")).resolves.toBeUndefined();
  });
});

describe("retention", () => {
  it("defaults to 7 years and saves 7 to 15", async () => {
    expect(await loadFirmRetention(db.sql, "own")).toBe(7);
    expect(await loadFirmRetention(db.sql, "solo")).toBeNull();
    expect(await loadClientFirm(db.sql, "own", "biz_1")).toEqual({
      firmUserId: "own",
      retentionYears: 7,
    });
    expect(await loadClientFirm(db.sql, "solo", "biz_s")).toBeNull();
    expect(await saveFirmRetention(db.sql, "own", 15)).toBe(15);
    expect(await saveFirmRetention(db.sql, "own", 10)).toBe(10);
    expect(await loadFirmRetention(db.sql, "own")).toBe(10);
  });

  it("refuses 6 and 16 in code while the column takes them", async () => {
    await expect(saveFirmRetention(db.sql, "own", 6)).rejects.toThrow(RETENTION_REFUSAL);
    await expect(saveFirmRetention(db.sql, "own", 16)).rejects.toThrow(RETENTION_REFUSAL);
    await db.pg.exec(`update firms set retention_years = 6 where user_id = 'own'`);
    await db.pg.exec(`update firms set retention_years = 16 where user_id = 'own'`);
    await expect(
      db.pg.exec(`update firms set retention_years = 0 where user_id = 'own'`),
    ).rejects.toThrow();
    await expect(
      db.pg.exec(`update firms set retention_years = 51 where user_id = 'own'`),
    ).rejects.toThrow();
  });

  it("refuses an account with no firm", async () => {
    await expect(saveFirmRetention(db.sql, "solo", 8)).rejects.toThrow("Set up the firm first");
  });
});

describe("loadReviewLog", () => {
  it("lists the business's results newest first, with who recorded them", async () => {
    await db.pg.exec(`
      insert into review_events (user_id, business_id, period, item_key, owner_name, due_on,
        result, notes, recorded_at, recorded_by) values
        ('own', 'biz_1', '2026-08', 'bank_rec', 'Ada', '2026-09-10', 'done', 'ok',
          '2026-09-01T10:00:00Z', 'rev'),
        ('own', 'biz_1', '2026-09', 'bank_rec', 'Ada', null, 'exception', 'late',
          '2026-10-01T10:00:00Z', 'prep'),
        ('solo', 'biz_s', '2026-09', 'bank_rec', '', null, 'done', '', '2026-10-02T10:00:00Z', null);
    `);
    const log = await loadReviewLog(db.sql, "own", "biz_1");
    expect(log.map((r) => [r.period, r.result, r.recordedByName, r.dueOn])).toEqual([
      ["2026-09", "exception", "prep", null],
      ["2026-08", "done", "rev", "2026-09-10"],
    ]);
    expect(log[0]).toMatchObject({ itemKey: "bank_rec", notes: "late", ownerName: "Ada" });
    expect(log[0].recordedAt).toBe("2026-10-01T10:00:00.000Z");
  });
});
