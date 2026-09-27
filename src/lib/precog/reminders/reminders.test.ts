import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { openTestDb, type TestDb } from "@/test/pglite";
import { defaultProfile, type PracticeProfile } from "../practice-profile";
import { dueItemsFor, forAudience, type ReminderItem } from "./due-items";
import { renderDigest, renderOwnerReminder } from "./email";
import { runDigest } from "./digest";
import type { Person } from "../types";

const TODAY = "2026-09-25";

function ownTeam(): Person[] {
  return [
    {
      id: "p1",
      name: "Ada Owner",
      role: "Owner",
      active: true,
      owner: true,
      entitlements: ["approve_payments"],
    },
    {
      id: "p2",
      name: "Bea Books",
      role: "Bookkeeper",
      active: true,
      entitlements: ["record_transactions"],
    },
  ] as unknown as Person[];
}

function profileWithDues(): PracticeProfile {
  const base = defaultProfile("general");
  return {
    ...base,
    practiceName: "Riverside Plumbing",
    customPeople: ownTeam(),
    decisions: [
      {
        id: "d1",
        createdAt: "2026-08-01T00:00:00Z",
        subject: "bank reconciliation",
        kind: "remediate",
        note: "Owner opens the statement.",
        reviewBy: "2026-09-20",
        status: "open",
      },
      {
        id: "d2",
        createdAt: "2026-08-01T00:00:00Z",
        subject: "closed one",
        kind: "remediate",
        note: "",
        reviewBy: "2026-09-01",
        status: "closed",
      },
    ] as PracticeProfile["decisions"],
    leaverAccessChecks: [
      { id: "l1", name: "Cy Gone", industry: "general", notedOn: "2026-09-10", source: "marked" },
      {
        id: "l2",
        name: "Dee Done",
        industry: "general",
        notedOn: "2026-09-10",
        source: "marked",
        confirmedOn: "2026-09-12",
      },
    ],
  };
}

describe("due items", () => {
  it("names overdue decisions, unconfirmed leavers and the open monthly review; skips samples", () => {
    const items = dueItemsFor(profileWithDues(), TODAY);
    const keys = items.map((i) => i.key);
    expect(keys).toContain("decision:d1");
    expect(keys).not.toContain("decision:d2");
    expect(keys).toContain("leaver:l1");
    expect(keys).not.toContain("leaver:l2");
    expect(keys).toContain("monthly:2026-09");
    expect(items.find((i) => i.key === "decision:d1")?.overdue).toBe(true);
    expect(items[0].overdue).toBe(true);
    expect(forAudience(items, "owner").map((i) => i.key)).not.toContain("monthly:2026-09");
    expect(dueItemsFor(defaultProfile("general"), TODAY)).toEqual([]);
  });

  it("is quiet in the first days of a month about the monthly review", () => {
    const items = dueItemsFor(profileWithDues(), "2026-10-02");
    expect(items.map((i) => i.key)).not.toContain("monthly:2026-10");
  });

  it("keeps the advisor's decision note out of what the owner reads", () => {
    const decision = dueItemsFor(profileWithDues(), TODAY).find((i) => i.key === "decision:d1");
    expect(decision?.detail).toBe("Owner opens the statement.");
    expect(decision?.ownerDetail).toBe("Your advisor set Sep 20, 2026 to review this decision.");
  });

  it("judges a decision due today as not overdue in any server time zone", () => {
    const profile = profileWithDues();
    profile.decisions = [{ ...profile.decisions[0], reviewBy: TODAY }];
    for (const tz of ["UTC", "America/Los_Angeles", "Pacific/Auckland", "Pacific/Kiritimati"]) {
      vi.stubEnv("TZ", tz);
      const decision = dueItemsFor(profile, TODAY).find((i) => i.key === "decision:d1");
      expect(decision?.overdue, tz).toBe(false);
    }
    vi.unstubAllEnvs();
  });

  it("announces an overdue item again every four weeks while it stays open", () => {
    const leaver = (today: string) =>
      dueItemsFor(profileWithDues(), today).find((i) => i.key === "leaver:l1");
    expect(leaver("2026-09-25")).toMatchObject({
      announceKey: "leaver:l1#overdue-0",
      stillOpen: false,
    });
    expect(leaver("2026-10-08")?.announceKey).toBe("leaver:l1#overdue-1");
    expect(leaver("2026-10-08")?.stillOpen).toBe(true);
  });
});

describe("email rendering", () => {
  it("writes a digest with counts, one section per client, and an opt-out line", () => {
    const items = dueItemsFor(profileWithDues(), TODAY);
    const mail = renderDigest({
      firmName: "North Advisors",
      clients: [{ businessName: "Riverside Plumbing", items }],
      appUrl: "https://app.example",
    });
    expect(mail.subject).toMatch(/^Precog: \d+ items overdue across 1 client$/);
    expect(mail.text.split("\n")[0]).toBe("North Advisors: weekly digest");
    expect(mail.html).toContain("Weekly digest");
    expect(mail.text).toContain("overdue since Sep 20, 2026");
    expect(mail.text).not.toMatch(/\d{4}-\d{2}-\d{2}\)/);
    expect(mail.text).toContain("Riverside Plumbing");
    expect(mail.text).toContain("https://app.example/firm");
    expect(mail.html).toContain("Turn it off in the firm workspace");
    expect(mail.html).not.toContain("<script");
  });

  it("escapes names in the owner note", () => {
    const item: ReminderItem = {
      key: "k",
      announceKey: "k",
      title: "Do it",
      detail: "x",
      ownerDetail: "x",
      dueOn: TODAY,
      overdue: false,
      stillOpen: false,
      advisorOnly: false,
    };
    const mail = renderOwnerReminder({
      businessName: "A <b>Shop</b>",
      firmName: null,
      items: [item],
    });
    expect(mail.html).toContain("A &lt;b&gt;Shop&lt;/b&gt;");
    expect(mail.subject).toBe("A <b>Shop</b>: 1 item to confirm");
  });

  it("sends the owner's replies to the advisor and says who set the note up", () => {
    const items = forAudience(dueItemsFor(profileWithDues(), TODAY), "owner");
    const mail = renderOwnerReminder({
      businessName: "Riverside Plumbing",
      firmName: "North Advisors",
      items,
      advisorEmail: "adv@firm.test",
    });
    expect(mail.replyTo).toBe("adv@firm.test");
    expect(mail.text).toContain("North Advisors set these reminders up in Precog.");
    expect(mail.text).not.toContain("Owner opens the statement.");
  });
});

describe("digest run", () => {
  let db: TestDb;
  beforeAll(async () => {
    db = await openTestDb();
  }, 60_000);
  afterAll(async () => {
    await db.close();
  });
  beforeEach(async () => {
    await db.clear(
      "reminder_log",
      "notification_settings",
      "engagement_marks",
      "firm_members",
      "firms",
      "businesses",
      '"user"',
    );
    await db.seedUser("adv", "adv@firm.test");
    await db.seedUser("quiet", "quiet@firm.test");
    await db.pg.query(
      `insert into businesses (id, user_id, name, industry, profile, revision)
       values ('biz_1', 'adv', 'Riverside Plumbing', 'general', $1::jsonb, 1)`,
      [JSON.stringify(profileWithDues())],
    );
    await db.pg.query(
      `insert into engagement_marks (user_id, business_id, owner_email) values ('adv', 'biz_1', 'owner@shop.test')`,
    );
    await db.pg.query(
      `insert into businesses (id, user_id, name, industry, profile, revision)
       values ('biz_2', 'quiet', 'Sample', 'general', $1::jsonb, 1)`,
      [JSON.stringify(defaultProfile("general"))],
    );
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  function recorder() {
    const sent: { to: string; subject: string; replyTo?: string }[] = [];
    const send = async (to: string, message: { subject: string; replyTo?: string }) => {
      sent.push({ to, subject: message.subject, replyTo: message.replyTo });
    };
    return { sent, send };
  }

  /** 'adv' becomes the owner of North Advisors with biz_1 as a client, and 'rev' a reviewer. */
  async function firmWithReviewer() {
    await db.seedUser("rev", "rev@firm.test");
    await db.pg.exec(`
      insert into firms (user_id, name) values ('adv', 'North Advisors');
      insert into firm_members (firm_user_id, member_user_id, role)
        values ('adv', 'adv', 'owner'), ('adv', 'rev', 'reviewer');
      update businesses set firm_user_id = 'adv' where id = 'biz_1';
    `);
  }

  it("sends one digest per advisor and one note per owner, then stays quiet about the same items", async () => {
    const { sent, send } = recorder();
    const first = await runDigest(db.sql, { today: TODAY, appUrl: "https://app.example", send });
    expect(first).toMatchObject({ advisors: 1, owners: 1, skipped: 1, errors: [] });
    expect(sent.map((s) => s.to).sort()).toEqual(["adv@firm.test", "owner@shop.test"]);
    expect(sent.find((s) => s.to === "owner@shop.test")?.replyTo).toBe("adv@firm.test");

    const second = await runDigest(db.sql, { today: TODAY, appUrl: "https://app.example", send });
    expect(second).toMatchObject({ advisors: 0, owners: 0 });
    expect(sent).toHaveLength(2);
  });

  it("respects the digest switch", async () => {
    await db.sql`insert into notification_settings (user_id, weekly_digest) values ('adv', false)`;
    const { sent, send } = recorder();
    const outcome = await runDigest(db.sql, { today: TODAY, appUrl: "https://app.example", send });
    expect(outcome.advisors).toBe(0);
    expect(sent.filter((s) => s.to === "adv@firm.test")).toEqual([]);
  });

  it("sends the digest to a firm member who owns no business, with their own log rows", async () => {
    await firmWithReviewer();
    const { sent, send } = recorder();
    const outcome = await runDigest(db.sql, { today: TODAY, appUrl: "https://app.example", send });
    expect(outcome.advisors).toBe(2);
    expect(sent.map((s) => s.to).sort()).toEqual([
      "adv@firm.test",
      "owner@shop.test",
      "rev@firm.test",
    ]);
    const logged = await db.sql<{ recipient: string }>`
      select distinct recipient from reminder_log order by recipient
    `;
    expect(logged.map((r) => r.recipient)).toEqual([
      "adv@firm.test",
      "owner@shop.test",
      "rev@firm.test",
    ]);
  });

  it("follows the firm owner's switch for the client's owner, not a member's", async () => {
    await firmWithReviewer();
    await db.sql`insert into notification_settings (user_id, owner_reminders) values ('adv', false)`;
    await db.sql`insert into notification_settings (user_id, owner_reminders) values ('rev', true)`;
    const { sent, send } = recorder();
    const outcome = await runDigest(db.sql, { today: TODAY, appUrl: "https://app.example", send });
    expect(outcome.owners).toBe(0);
    expect(sent.map((s) => s.to)).not.toContain("owner@shop.test");
  });

  it("logs nothing when a send fails, so the next run tries again", async () => {
    const failing = async () => {
      throw new Error("provider down");
    };
    const outcome = await runDigest(db.sql, {
      today: TODAY,
      appUrl: "https://app.example",
      send: failing,
    });
    expect(outcome.errors).toHaveLength(2);
    expect(outcome.advisors + outcome.owners).toBe(0);
    const { sent, send } = recorder();
    await runDigest(db.sql, { today: TODAY, appUrl: "https://app.example", send });
    expect(sent.map((s) => s.to).sort()).toEqual(["adv@firm.test", "owner@shop.test"]);
  });

  it("reminds the owner again about a leaver still open four weeks later", async () => {
    const { send } = recorder();
    await runDigest(db.sql, { today: TODAY, appUrl: "https://app.example", send });
    const later = await runDigest(db.sql, {
      today: "2026-10-23",
      appUrl: "https://app.example",
      send,
    });
    expect(later.owners).toBe(1);
  });
});
