import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { openTestDb, type TestDb } from "@/test/pglite";
import { defaultProfile, type PracticeProfile } from "../practice-profile";
import { dueItemsFor, forAudience } from "./due-items";
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
});

describe("email rendering", () => {
  it("writes a digest with counts, one section per client, and an opt-out line", () => {
    const items = dueItemsFor(profileWithDues(), TODAY);
    const mail = renderDigest({
      firmName: "North Advisors",
      clients: [{ businessName: "Riverside Plumbing", items }],
      appUrl: "https://app.example",
    });
    expect(mail.subject).toMatch(/overdue across 1 client$/);
    expect(mail.text).toContain("Riverside Plumbing");
    expect(mail.text).toContain("https://app.example/firm");
    expect(mail.html).toContain("Turn it off in the firm workspace");
    expect(mail.html).not.toContain("<script");
  });

  it("escapes names in the owner note", () => {
    const mail = renderOwnerReminder({
      businessName: "A <b>Shop</b>",
      firmName: null,
      items: [
        { key: "k", title: "Do it", detail: "x", dueOn: null, overdue: false, audience: "both" },
      ],
    });
    expect(mail.html).toContain("A &lt;b&gt;Shop&lt;/b&gt;");
    expect(mail.subject).toBe("A <b>Shop</b>: 1 item to confirm");
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

  it("sends one digest per advisor and one note per owner, then stays quiet about the same items", async () => {
    const sent: { to: string; subject: string }[] = [];
    const send = async (to: string, message: { subject: string }) => {
      sent.push({ to, subject: message.subject });
    };
    const first = await runDigest(db.sql, { today: TODAY, appUrl: "https://app.example", send });
    expect(first).toMatchObject({ advisors: 1, owners: 1, skipped: 1, errors: [] });
    expect(sent.map((s) => s.to).sort()).toEqual(["adv@firm.test", "owner@shop.test"]);

    const second = await runDigest(db.sql, { today: TODAY, appUrl: "https://app.example", send });
    expect(second).toMatchObject({ advisors: 0, owners: 0 });
    expect(sent).toHaveLength(2);
  });

  it("respects the digest switch", async () => {
    await db.sql`insert into notification_settings (user_id, weekly_digest) values ('adv', false)`;
    const sent: string[] = [];
    const outcome = await runDigest(db.sql, {
      today: TODAY,
      appUrl: "https://app.example",
      send: async (to) => {
        sent.push(to);
      },
    });
    expect(outcome.advisors).toBe(0);
    expect(sent).toEqual([]);
  });
});
