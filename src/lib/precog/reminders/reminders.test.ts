import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { openTestDb, type TestDb } from "@/test/pglite";
import { defaultProfile, normalizeProfile, type PracticeProfile } from "../practice-profile";
import { reportServerError } from "@/lib/observability/report.server";
import { dueItemsFor, forAudience, type ReminderItem } from "./due-items";
import {
  awaitingReviewLine,
  renderDigest,
  renderOwnerEmailConfirm,
  renderOwnerReminder,
} from "./email";
import { DIGEST_OMITTED_PROFILE_KEYS, runDigest } from "./digest";
import {
  answerDigestAsk,
  digestTokenFor,
  loadDigestAsk,
  loadNotificationSettings,
  saveNotificationSettings,
  stopDigestByToken,
} from "../firm/store";
import { INDUSTRIES } from "../industry";
import { getIndustryTemplate } from "../templates";
import type { Person } from "../types";

// A normaliser bug for one business, by name: the rest pass through unchanged.
const brokenName = vi.hoisted(() => ({ value: null as string | null }));
vi.mock("../practice-profile", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../practice-profile")>();
  return {
    ...actual,
    normalizeProfile: (...args: Parameters<typeof actual.normalizeProfile>) => {
      if (brokenName.value && args[0]?.practiceName === brokenName.value)
        throw new Error("normaliser bug");
      return actual.normalizeProfile(...args);
    },
  };
});
vi.mock("@/lib/observability/report.server", () => ({
  reportServerError: vi.fn(async () => undefined),
}));

const TODAY = "2026-09-25";
const OWNER_TOKEN = "ab".repeat(24);

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

  it("names the monthly review to the owner audience when the business has no firm", () => {
    const items = dueItemsFor(profileWithDues(), TODAY, { hasFirm: false });
    const monthly = items.find((i) => i.key === "monthly:2026-09");
    expect(monthly?.advisorOnly).toBe(false);
    expect(forAudience(items, "owner").map((i) => i.key)).toContain("monthly:2026-09");
    // Saying the business has a firm keeps the advisor-only rule, as the default does.
    expect(
      forAudience(dueItemsFor(profileWithDues(), TODAY, { hasFirm: true }), "owner").map(
        (i) => i.key,
      ),
    ).not.toContain("monthly:2026-09");
  });

  it("finds the same items in the profile the digest reads, without the map's history fields", () => {
    const full: PracticeProfile = {
      ...profileWithDues(),
      mapLayout: { proc_1: { x: 10, y: 20 } },
      mapHealthHistory: [{ at: "2026-09-01T00:00:00Z", score: 40 }],
      mapVersions: [
        {
          id: "v1",
          name: "Before the change",
          createdAt: "2026-09-01T00:00:00Z",
          healthScore: 40,
          processes: [],
          people: ownTeam(),
          layout: {},
        },
      ],
      plannedAbsences: [
        { id: "a1", personId: "p2", industry: "general", from: "2026-09-28", to: "2026-10-02" },
      ],
    };
    const stripped: Record<string, unknown> = { ...full };
    for (const key of DIGEST_OMITTED_PROFILE_KEYS) delete stripped[key];
    const items = dueItemsFor(normalizeProfile(full), TODAY);
    expect(items.length).toBeGreaterThan(0);
    expect(dueItemsFor(normalizeProfile(stripped), TODAY)).toEqual(items);
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

  it("counts an edited sample kept under its demo name as the owner's, and names its monthly review", () => {
    for (const industry of INDUSTRIES.map((i) => i.id)) {
      const base = defaultProfile(industry);
      const edited: PracticeProfile = {
        ...base,
        customPeople: [...getIndustryTemplate(industry).people],
      };
      const keys = dueItemsFor(edited, "2026-10-06").map((i) => i.key);
      expect(keys, industry).toContain("monthly:2026-10");
      // An unfinished copy keeps the older rule: a demo name is not the owner's.
      expect(dueItemsFor({ ...edited, onboardingComplete: false }, "2026-10-06"), industry).toEqual(
        [],
      );
    }
  });

  it("names only the monthly review for an own team whose people were emptied", () => {
    const emptied: PracticeProfile = {
      ...defaultProfile("general"),
      practiceName: "Riverside Plumbing",
      customPeople: [],
    };
    expect(dueItemsFor(emptied, "2026-10-06").map((i) => i.key)).toEqual(["monthly:2026-10"]);
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
  const STOP_URL = "https://app.example/api/digest-email?do=stop&token=t";

  it("writes a digest with counts, one section per client, item links and a stop link", () => {
    const items = dueItemsFor(profileWithDues(), TODAY);
    const mail = renderDigest({
      firmName: "North Advisors",
      clients: [{ businessId: "biz_1", businessName: "Riverside Plumbing", items }],
      appUrl: "https://app.example",
      unsubscribeUrl: STOP_URL,
    });
    expect(mail.subject).toMatch(/^Precog: \d+ items overdue across 1 client$/);
    expect(mail.text.split("\n")[0]).toBe("North Advisors: weekly digest");
    expect(mail.html).toContain("Weekly digest");
    expect(mail.text).toContain("overdue since Sep 20, 2026");
    expect(mail.text).not.toMatch(/\d{4}-\d{2}-\d{2}\)/);
    expect(mail.text).toContain("Riverside Plumbing");
    expect(mail.text).toContain("https://app.example/firm");
    expect(mail.text).toContain(
      `You receive this because the weekly digest is on in your Precog account. Stop it: ${STOP_URL}`,
    );
    expect(mail.html).toContain(`<a href="${escapeAmp(STOP_URL)}">Stop the weekly digest</a>`);
    expect(mail.html).not.toContain("Turn it off in the firm workspace");
    expect(mail.headers).toEqual({
      "List-Unsubscribe": `<${STOP_URL}>`,
      "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
    });
    // Each item opens its business and tab on the home page.
    expect(mail.text).toContain("https://app.example/?business=biz_1&tab=monthly&item=decisions");
    expect(mail.html).toContain(
      '<a href="https://app.example/?business=biz_1&amp;tab=knowledge">Confirm Cy Gone is off payroll',
    );
    expect(mail.html).not.toContain("<script");
  });

  it("adds one line about QuickBooks connections that need attention, and none when all is well", () => {
    const items = dueItemsFor(profileWithDues(), TODAY);
    const render = (needAttention: number) =>
      renderDigest({
        firmName: "North Advisors",
        clients: [{ businessId: "biz_1", businessName: "Riverside Plumbing", items }],
        appUrl: "https://app.example",
        unsubscribeUrl: STOP_URL,
        quickBooks: { needAttention },
      });
    const two = render(2);
    expect(two.text).toContain(
      "\nQuickBooks needs attention for 2 clients. See the firm workspace.\n\nOpen the firm workspace:",
    );
    expect(two.html).toContain(
      '<p style="margin-top:16px">QuickBooks needs attention for 2 clients. See the firm workspace.</p>',
    );
    expect(render(1).text).toContain(
      "QuickBooks needs attention for 1 client. See the firm workspace.",
    );
    expect(render(0).text).not.toContain("QuickBooks");
    expect(render(0).text).toBe(
      renderDigest({
        firmName: "North Advisors",
        clients: [{ businessId: "biz_1", businessName: "Riverside Plumbing", items }],
        appUrl: "https://app.example",
        unsubscribeUrl: STOP_URL,
      }).text,
    );
    expect(two.subject).toBe(render(0).subject);
  });

  it("adds one line about versions awaiting the recipient's review, after QuickBooks, and none at zero", () => {
    const items = dueItemsFor(profileWithDues(), TODAY);
    const render = (awaiting: number, needAttention = 0) =>
      renderDigest({
        firmName: "North Advisors",
        clients: [{ businessId: "biz_1", businessName: "Riverside Plumbing", items }],
        appUrl: "https://app.example",
        unsubscribeUrl: STOP_URL,
        quickBooks: { needAttention },
        reviews: { awaiting },
      });
    expect(render(1).text).toContain(
      "\n1 report version awaits your review. See the firm workspace.\n\nOpen the firm workspace:",
    );
    expect(render(1).html).toContain(
      '<p style="margin-top:16px">1 report version awaits your review. See the firm workspace.</p>',
    );
    expect(render(3).text).toContain(
      "3 report versions await your review. See the firm workspace.",
    );
    expect(awaitingReviewLine(2)).toBe(
      "2 report versions await your review. See the firm workspace.",
    );
    const both = render(2, 1).text;
    expect(both.indexOf("QuickBooks needs attention")).toBeLessThan(
      both.indexOf("2 report versions await"),
    );
    expect(render(0).text).not.toContain("await");
    expect(render(0).text).toBe(
      renderDigest({
        firmName: "North Advisors",
        clients: [{ businessId: "biz_1", businessName: "Riverside Plumbing", items }],
        appUrl: "https://app.example",
        unsubscribeUrl: STOP_URL,
      }).text,
    );
    expect(render(2).subject).toBe(render(0).subject);
  });

  it("names the business in the subject for an owner outside a firm", () => {
    const items = dueItemsFor(profileWithDues(), TODAY);
    const one = [{ ...items[0], overdue: false }];
    const subject = (
      firmName: string | null,
      clients: { businessId: string; businessName: string; items: ReminderItem[] }[],
    ) =>
      renderDigest({ firmName, clients, appUrl: "https://app.example", unsubscribeUrl: STOP_URL })
        .subject;
    expect(subject(null, [{ businessId: "biz_1", businessName: "Ortiz Dental", items }])).toMatch(
      /^Precog: \d+ items overdue on Ortiz Dental$/,
    );
    expect(subject(null, [{ businessId: "biz_1", businessName: "Ortiz Dental", items: one }])).toBe(
      "Precog: 1 item due this week on Ortiz Dental",
    );
    expect(
      subject(null, [
        { businessId: "biz_1", businessName: "Ortiz Dental", items },
        { businessId: "biz_2", businessName: "Hill Dental", items },
      ]),
    ).toMatch(/^Precog: \d+ items overdue across 2 businesses$/);
    // A firm's subjects are unchanged.
    expect(
      subject("North Advisors", [
        { businessId: "biz_1", businessName: "Ortiz Dental", items: one },
      ]),
    ).toBe("Precog: 1 item due this week");
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
      href: "?tab=monthly",
    };
    const mail = renderOwnerReminder({
      businessName: "A <b>Shop</b>",
      firmName: null,
      items: [item],
      unsubscribeUrl: "https://app.example/api/owner-email?do=stop&token=t",
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
      unsubscribeUrl: "https://app.example/api/owner-email?do=stop&token=t",
    });
    expect(mail.replyTo).toBe("adv@firm.test");
    expect(mail.text).toContain("North Advisors set these reminders up in Precog.");
    expect(mail.text).not.toContain("Owner opens the statement.");
  });

  it("carries a link that stops the owner's reminders, also as a one-click header", () => {
    const url = "https://app.example/api/owner-email?do=stop&token=t";
    const mail = renderOwnerReminder({
      businessName: "Riverside Plumbing",
      firmName: null,
      items: forAudience(dueItemsFor(profileWithDues(), TODAY), "owner"),
      unsubscribeUrl: url,
    });
    expect(mail.text).toContain(url);
    expect(mail.html).toContain("Stop these reminders");
    expect(mail.headers).toEqual({
      "List-Unsubscribe": `<${url}>`,
      "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
    });
  });

  it("asks the owner to agree before any reminder", () => {
    const mail = renderOwnerEmailConfirm({
      businessName: "A <b>Shop</b>",
      firmName: "North Advisors",
      confirmUrl: "https://app.example/api/owner-email?do=confirm&token=t",
    });
    expect(mail.subject).toBe("Get reminders about A <b>Shop</b>?");
    expect(mail.text).toContain("North Advisors wants Precog to email you reminders");
    expect(mail.html).toContain("A &lt;b&gt;Shop&lt;/b&gt;");
    expect(mail.replyTo).toBeUndefined();
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
      "integration_connections",
      "email_suppressions",
      "notification_settings",
      "engagement_marks",
      "firm_members",
      "firms",
      "businesses",
      '"user"',
    );
    await seedAdvisor("adv", "adv@firm.test");
    await seedAdvisor("quiet", "quiet@firm.test");
    await db.pg.query(
      `insert into businesses (id, user_id, name, industry, profile, revision)
       values ('biz_1', 'adv', 'Riverside Plumbing', 'general', $1::jsonb, 1)`,
      [JSON.stringify(profileWithDues())],
    );
    await db.pg.query(
      `insert into engagement_marks (user_id, business_id, owner_email, owner_email_token, owner_email_confirmed_at)
       values ('adv', 'biz_1', 'owner@shop.test', $1, now())`,
      [OWNER_TOKEN],
    );
    await db.pg.query(
      `insert into businesses (id, user_id, name, industry, profile, revision)
       values ('biz_2', 'quiet', 'Sample', 'general', $1::jsonb, 1)`,
      [JSON.stringify(defaultProfile("general"))],
    );
  });
  afterEach(() => {
    vi.useRealTimers();
    brokenName.value = null;
    vi.mocked(reportServerError).mockClear();
  });

  /**
   * A user who turned the digest on. No row now means off (nobody is opted
   * in by default), so each advisor the tests expect a digest for gets a
   * row; notification_settings references "user", so it follows the user.
   */
  async function seedAdvisor(id: string, email: string) {
    await db.seedUser(id, email);
    await db.sql`insert into notification_settings (user_id, weekly_digest) values (${id}, true)`;
  }

  function recorder() {
    const sent: {
      to: string;
      subject: string;
      text: string;
      replyTo?: string;
      headers?: Record<string, string>;
    }[] = [];
    const send = async (
      to: string,
      message: {
        subject: string;
        text: string;
        replyTo?: string;
        headers?: Record<string, string>;
      },
    ) => {
      sent.push({
        to,
        subject: message.subject,
        text: message.text,
        replyTo: message.replyTo,
        headers: message.headers,
      });
    };
    return { sent, send };
  }

  const run = (send: ReturnType<typeof recorder>["send"]) =>
    runDigest(db.sql, { today: TODAY, appUrl: "https://app.example", send });

  it("sends the owner's note with a stop link even when nobody gets a digest", async () => {
    await db.sql`update notification_settings set weekly_digest = false where user_id = 'adv'`;
    const { sent, send } = recorder();
    const outcome = await run(send);
    expect(outcome).toMatchObject({ advisors: 0, owners: 1 });
    expect(sent.map((s) => s.to)).toEqual(["owner@shop.test"]);
    expect(sent[0].replyTo).toBe("adv@firm.test");
    expect(sent[0].text).toContain(
      `https://app.example/api/owner-email?do=stop&token=${OWNER_TOKEN}`,
    );
  });

  it("follows the firm owner's switch even when a member turned theirs off", async () => {
    await firmWithReviewer();
    await db.sql`update notification_settings set weekly_digest = false where user_id = 'adv'`;
    await db.sql`update notification_settings set owner_reminders = false where user_id = 'rev'`;
    const { sent, send } = recorder();
    const outcome = await run(send);
    expect(outcome.owners).toBe(1);
    expect(sent.filter((s) => s.to === "owner@shop.test")).toHaveLength(1);
  });

  it("emails an owner address only once confirmed and until the owner stops it", async () => {
    await db.sql`update engagement_marks set owner_email_confirmed_at = null`;
    const { sent, send } = recorder();
    expect((await run(send)).owners).toBe(0);
    await db.sql`
      update engagement_marks set owner_email_confirmed_at = now(), owner_email_unsubscribed_at = now()
    `;
    expect((await run(send)).owners).toBe(0);
    expect(sent.map((s) => s.to)).not.toContain("owner@shop.test");
  });

  it("skips an advisor whose address bounced or complained, and logs nothing for them", async () => {
    await db.sql`
      insert into email_suppressions (email, reason, provider_event_id)
      values ('adv@firm.test', 'bounced', 'em_1')
    `;
    const { sent, send } = recorder();
    const outcome = await run(send);
    expect(outcome).toMatchObject({ advisors: 0, owners: 1 });
    expect(sent.map((s) => s.to)).toEqual(["owner@shop.test"]);
    const logged = await db.sql<{ recipient: string }>`
      select distinct recipient from reminder_log order by recipient
    `;
    expect(logged.map((r) => r.recipient)).toEqual(["owner@shop.test"]);
  });

  it("skips an owner whose address complained while the other owner still gets a note", async () => {
    await db.pg.query(
      `insert into businesses (id, user_id, name, industry, profile, revision)
       values ('biz_3', 'adv', 'Hill Dental', 'general', $1::jsonb, 1)`,
      [JSON.stringify({ ...profileWithDues(), practiceName: "Hill Dental" })],
    );
    await db.pg.query(
      `insert into engagement_marks (user_id, business_id, owner_email, owner_email_token, owner_email_confirmed_at)
       values ('adv', 'biz_3', 'Second@Shop.test', $1, now())`,
      ["cd".repeat(24)],
    );
    // The stored address differs only in case: suppression ignores case.
    await db.sql`
      insert into email_suppressions (email, reason, provider_event_id)
      values ('second@shop.test', 'complained', 'em_2')
    `;
    const { sent, send } = recorder();
    const outcome = await run(send);
    expect(outcome).toMatchObject({ advisors: 1, owners: 1 });
    expect(sent.map((s) => s.to).sort()).toEqual(["adv@firm.test", "owner@shop.test"]);
  });

  it("sends the digest only to an address Precog can vouch for", async () => {
    await db.sql`update "user" set "emailVerified" = false where id = 'adv'`;
    const first = recorder();
    const outcome = await run(first.send);
    expect(outcome.advisors).toBe(0);
    expect(first.sent.map((s) => s.to)).toEqual(["owner@shop.test"]);
    expect(first.sent[0].replyTo).toBeUndefined();

    await db.sql`
      insert into account (id, "accountId", "providerId", "userId", "createdAt", "updatedAt")
      values ('acc_g', 'g-1', 'grok-google', 'adv', now(), now())
    `;
    // A Google sign-in whose address the broker did not mark confirmed is not vouched for.
    const second = recorder();
    expect((await run(second.send)).advisors).toBe(0);
    expect(second.sent.map((s) => s.to)).toEqual([]);

    await db.sql`update "user" set "emailVerified" = true where id = 'adv'`;
    const third = recorder();
    expect((await run(third.send)).advisors).toBe(1);
    expect(third.sent.map((s) => s.to)).toEqual(["adv@firm.test"]);
  });

  it("sends nothing to an X-only account, and its owner notes carry no reply-to", async () => {
    // A confirmed flag does not help: X sign-ins carry a made-up address.
    await db.sql`
      insert into account (id, "accountId", "providerId", "userId", "createdAt", "updatedAt")
      values ('acc_x', 'x-1', 'grok-x', 'adv', now(), now())
    `;
    const { sent, send } = recorder();
    const outcome = await run(send);
    expect(outcome).toMatchObject({ advisors: 0, owners: 1, errors: [] });
    expect(sent.map((s) => s.to)).toEqual(["owner@shop.test"]);
    expect(sent[0].replyTo).toBeUndefined();

    // The same account with a password sign-in as well is vouched for again.
    await db.sql`
      insert into account (id, "accountId", "providerId", "userId", "createdAt", "updatedAt")
      values ('acc_c', 'adv', 'credential', 'adv', now(), now())
    `;
    const again = recorder();
    expect((await run(again.send)).advisors).toBe(1);
    expect(again.sent.map((s) => s.to)).toEqual(["adv@firm.test"]);
  });

  /** 'adv' becomes the owner of North Advisors with biz_1 as a client, and 'rev' a reviewer. */
  async function firmWithReviewer() {
    await seedAdvisor("rev", "rev@firm.test");
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

  it("stops before the first recipient once the deadline has passed, and sends it all next time", async () => {
    const late = recorder();
    const stopped = await runDigest(db.sql, {
      today: TODAY,
      appUrl: "https://app.example",
      send: late.send,
      deadline: Date.now() - 1,
    });
    // Two digest recipients (adv, quiet) and one owner note are left.
    expect(stopped).toEqual({
      advisors: 0,
      owners: 0,
      skipped: 0,
      errors: [],
      stopped: true,
      remaining: 3,
    });
    expect(late.sent).toEqual([]);
    expect(await db.sql`select 1 from reminder_log`).toEqual([]);

    const { sent, send } = recorder();
    const next = await runDigest(db.sql, {
      today: TODAY,
      appUrl: "https://app.example",
      send,
      deadline: Date.now() + 60_000,
    });
    expect(next).toEqual({
      advisors: 1,
      owners: 1,
      skipped: 1,
      errors: [],
      stopped: false,
      remaining: 0,
    });
    expect(sent.map((s) => s.to).sort()).toEqual(["adv@firm.test", "owner@shop.test"]);
  });

  it("names the firm the workspace shows: an owner's own firm, else the first one joined", async () => {
    await firmWithReviewer();
    // 'rev' also joins a second firm later, and 'adv' joins it too while owning North.
    await seedAdvisor("west", "west@firm.test");
    await db.pg.exec(`
      insert into firms (user_id, name) values ('west', 'West Partners');
      insert into firm_members (firm_user_id, member_user_id, role, joined_at)
        values ('west', 'west', 'owner', now()),
               ('west', 'rev', 'preparer', now() + interval '1 day'),
               ('west', 'adv', 'preparer', now() + interval '1 day');
      update firm_members set joined_at = now() - interval '1 day' where firm_user_id = 'adv';
      insert into businesses (id, user_id, firm_user_id, name, industry, profile, revision)
        select 'biz_w', 'west', 'west', 'West Client', 'general', profile, 1
        from businesses where id = 'biz_1';
    `);
    const { sent, send } = recorder();
    const outcome = await run(send);
    expect(outcome.errors).toEqual([]);
    const firstLine = (to: string) => sent.find((s) => s.to === to)?.text.split("\n")[0];
    expect(firstLine("adv@firm.test")).toBe("North Advisors: weekly digest");
    expect(firstLine("rev@firm.test")).toBe("North Advisors: weekly digest");
    expect(firstLine("west@firm.test")).toBe("West Partners: weekly digest");
    // The digest names the firm's own clients only: rev sees Riverside, not West Client.
    expect(sent.find((s) => s.to === "rev@firm.test")?.text).not.toContain("West Client");
    // Each recipient got a stop link with a token minted once.
    const tokens = await db.sql<{ user_id: string; digest_token: string | null }>`
      select user_id, digest_token from notification_settings order by user_id
    `;
    for (const t of tokens.filter((t) => ["adv", "rev", "west"].includes(t.user_id))) {
      expect(t.digest_token).toMatch(/^[0-9a-f]{48}$/);
      expect(sent.find((s) => s.to === `${t.user_id}@firm.test`)?.text).toContain(
        `token=${t.digest_token}`,
      );
    }
  });

  it("respects the digest switch", async () => {
    await db.sql`update notification_settings set weekly_digest = false where user_id = 'adv'`;
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

  it("tells a firm's digests how many clients' QuickBooks connections need attention", async () => {
    await firmWithReviewer();
    const connect = (userId: string, businessId: string, refreshExpires: string) =>
      db.pg.query(
        `insert into integration_connections (user_id, business_id, provider, realm_id,
           access_token_enc, refresh_token_enc, access_expires_at, refresh_expires_at, last_error)
         values ($1, $2, 'qbo', '123', 'a', 'r', now() + interval '1 hour', ${refreshExpires}, $3)`,
        [userId, businessId, null],
      );
    const quiet = recorder();
    await run(quiet.send);
    expect(quiet.sent.find((s) => s.to === "adv@firm.test")?.text).not.toContain("QuickBooks");

    await db.clear("reminder_log");
    await connect("adv", "biz_1", "now() + interval '10 days'");
    await connect("quiet", "biz_2", "now() + interval '90 days'");
    await db.sql`
      update integration_connections set last_error = 'QuickBooks refused the request. Try again later.'
      where business_id = 'biz_2'
    `;
    const { sent, send } = recorder();
    await run(send);
    const line = "QuickBooks needs attention for 1 client. See the firm workspace.";
    expect(sent.find((s) => s.to === "adv@firm.test")?.text).toContain(line);
    expect(sent.find((s) => s.to === "rev@firm.test")?.text).toContain(line);
    // biz_2 belongs to an account outside the firm, with nothing due: no digest, no count.
    expect(sent.map((s) => s.to)).not.toContain("quiet@firm.test");
    expect(sent.find((s) => s.to === "owner@shop.test")?.text).not.toContain("QuickBooks");
  });

  describe("versions awaiting review", () => {
    /** Firm "adv" with reviewer `rev` and preparer `prep`; each gets a digest. */
    async function firmWithPreparer() {
      await firmWithReviewer();
      await seedAdvisor("prep", "prep@firm.test");
      await db.pg.query(
        `insert into firm_members (firm_user_id, member_user_id, role) values ('adv', 'prep', 'preparer')`,
      );
    }
    let next = 0;
    async function version(
      preparedBy: string,
      fields: { from?: string | null; requested?: boolean; reviewed?: boolean; returned?: boolean },
    ) {
      next += 1;
      await db.pg.query(
        `insert into report_versions (id, user_id, business_id, version_no, profile, prepared_by,
           review_requested_at, review_requested_from, reviewed_at, returned_at)
         values ($1, 'adv', 'biz_1', $2, '{}'::jsonb, $3,
           case when $4 then now() end, $5,
           case when $6 then now() end, case when $7 then now() end)`,
        [
          `rv_${next}`,
          next,
          preparedBy,
          fields.requested !== false,
          fields.from ?? null,
          fields.reviewed === true,
          fields.returned === true,
        ],
      );
    }
    async function lines() {
      await db.clear("reminder_log");
      const { sent, send } = recorder();
      await run(send);
      const line = (to: string) =>
        sent
          .find((s) => s.to === to)
          ?.text.split("\n")
          .find((l) => l.includes("your review")) ?? null;
      return {
        adv: line("adv@firm.test"),
        rev: line("rev@firm.test"),
        prep: line("prep@firm.test"),
      };
    }

    it("counts a request only for the reviewer it went to, never for the preparer", async () => {
      await firmWithPreparer();
      await version("prep", { from: "rev" });
      await version("prep", { from: "rev" });
      expect(await lines()).toEqual({
        adv: null,
        rev: "2 report versions await your review. See the firm workspace.",
        prep: null,
      });
    });

    it("counts an unassigned request for the owner and every reviewer who did not prepare it", async () => {
      await firmWithPreparer();
      await version("prep", { from: null });
      await version("rev", { from: null });
      expect(await lines()).toEqual({
        adv: "2 report versions await your review. See the firm workspace.",
        rev: "1 report version awaits your review. See the firm workspace.",
        prep: null,
      });
    });

    it("treats a request to someone no longer an owner or reviewer as unassigned", async () => {
      await firmWithPreparer();
      await version("prep", { from: "rev" });
      await db.pg.query(`update firm_members set role = 'preparer' where member_user_id = 'rev'`);
      expect(await lines()).toEqual({
        adv: "1 report version awaits your review. See the firm workspace.",
        rev: null,
        prep: null,
      });
    });

    it("counts only the versions this firm locked on a business its owner shared with it", async () => {
      await firmWithPreparer();
      await db.sql`update businesses set firm_user_id = 'adv', granted_at = now() where id = 'biz_1'`;
      // Locked for an earlier firm, before a hand-back and this grant.
      await version("prep", { from: "adv" });
      await db.sql`update report_versions set firm_user_id = 'earlier' where id = ${`rv_${next}`}`;
      expect((await lines()).adv).toBeNull();
      await version("prep", { from: "adv" });
      await db.sql`update report_versions set firm_user_id = 'adv' where id = ${`rv_${next}`}`;
      expect((await lines()).adv).toBe(
        "1 report version awaits your review. See the firm workspace.",
      );
    });

    it("reads which versions are the firm's through the versions list's own rule", async () => {
      // One definition of the rule (reports.ts), so the digest and the list
      // the reviewer opens cannot drift apart.
      const { FIRM_READS_VERSION } = await import("../firm/reports");
      expect(FIRM_READS_VERSION).toContain("v.firm_user_id = b.firm_user_id");
      const digest = readFileSync(
        join(process.cwd(), "src/lib/precog/reminders/digest.ts"),
        "utf8",
      );
      expect(digest).toContain("${FIRM_READS_VERSION}");
      expect(digest).not.toContain("granted_at is null");
    });

    it("leaves out versions not requested, reviewed or returned, and a deleted client's", async () => {
      await firmWithPreparer();
      await version("prep", { requested: false });
      await version("prep", { from: "adv", reviewed: true });
      await version("prep", { from: "adv", returned: true });
      expect((await lines()).adv).toBeNull();
      await version("prep", { from: "adv" });
      expect((await lines()).adv).toBe(
        "1 report version awaits your review. See the firm workspace.",
      );
      // A client deleted since: nothing due is announced for it either.
      await db.sql`update businesses set deleted_at = now() where id = 'biz_1'`;
      expect((await lines()).adv).toBeNull();
    });
  });

  it("names the monthly review in the owner's note for a business with no firm, and not for a firm client", async () => {
    vi.stubEnv("STRIPE_SECRET_KEY", "");
    try {
      const solo = recorder();
      expect((await run(solo.send)).owners).toBe(1);
      const soloNote = solo.sent.find((s) => s.to === "owner@shop.test");
      expect(soloNote?.text).toContain("Monthly review for 2026-09");

      await db.sql`delete from reminder_log`;
      await firmWithReviewer();
      const firm = recorder();
      expect((await run(firm.send)).owners).toBe(1);
      const firmNote = firm.sent.find((s) => s.to === "owner@shop.test");
      expect(firmNote?.text).not.toContain("Monthly review for 2026-09");
      // The firm's own digest still names it.
      expect(firm.sent.find((s) => s.to === "adv@firm.test")?.text).toContain(
        "Monthly review for 2026-09",
      );
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it("follows the firm owner's switch for the client's owner, not a member's", async () => {
    await firmWithReviewer();
    await db.sql`update notification_settings set owner_reminders = false where user_id = 'adv'`;
    await db.sql`update notification_settings set owner_reminders = true where user_id = 'rev'`;
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

  it("sends every other digest when one business cannot be normalised, and names it", async () => {
    await seedAdvisor("adv2", "adv2@firm.test");
    await seedAdvisor("adv3", "adv3@firm.test");
    await db.pg.query(
      `insert into businesses (id, user_id, name, industry, profile, revision)
       values ('biz_3', 'adv2', 'Hill Dental', 'general', $1::jsonb, 1),
              ('biz_4', 'adv3', 'Broken Books', 'general', $2::jsonb, 1)`,
      [
        JSON.stringify({ ...profileWithDues(), practiceName: "Hill Dental" }),
        JSON.stringify({ ...profileWithDues(), practiceName: "Broken Books" }),
      ],
    );
    await db.sql`update engagement_marks set owner_email_confirmed_at = null`;
    brokenName.value = "Broken Books";
    const { sent, send } = recorder();
    const outcome = await run(send);
    expect(sent.map((s) => s.to).sort()).toEqual(["adv2@firm.test", "adv@firm.test"]);
    expect(outcome.advisors).toBe(2);
    expect(outcome.errors).toEqual(["business biz_4: normaliser bug"]);
    expect(reportServerError).toHaveBeenCalledTimes(1);
    expect(reportServerError).toHaveBeenCalledWith(expect.any(Error), "digest-normalize");
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

  it("sends no digest to an account with no settings row: nobody is opted in by default", async () => {
    await db.sql`delete from notification_settings where user_id = 'adv'`;
    const { sent, send } = recorder();
    const outcome = await run(send);
    expect(outcome.advisors).toBe(0);
    expect(sent.map((s) => s.to)).toEqual(["owner@shop.test"]);
    expect(await loadNotificationSettings(db.sql, "adv")).toEqual({
      weeklyDigest: false,
      ownerReminders: true,
    });
  });

  it("carries a stop link per account that turns the digest off, also as a one-click header", async () => {
    const { sent, send } = recorder();
    await run(send);
    const digest = sent.find((s) => s.to === "adv@firm.test")!;
    const token = await digestTokenFor(db.sql, "adv");
    const url = `https://app.example/api/digest-email?do=stop&token=${token}`;
    expect(token).toMatch(/^[0-9a-f]{48}$/);
    expect(digest.text).toContain(`Stop it: ${url}`);
    expect(digest.text).toContain("https://app.example/?business=biz_1&tab=");
    expect(digest.headers?.["List-Unsubscribe"]).toBe(`<${url}>`);
    // The same token on the next run; the link in an older digest keeps working.
    expect(await digestTokenFor(db.sql, "adv")).toBe(token);

    expect(await stopDigestByToken(db.sql, "ef".repeat(24))).toBe(false);
    expect((await loadNotificationSettings(db.sql, "adv")).weeklyDigest).toBe(true);
    expect(await stopDigestByToken(db.sql, token)).toBe(true);
    expect((await loadNotificationSettings(db.sql, "adv")).weeklyDigest).toBe(false);
  });

  it("asks once: no row is unasked, a firm-page choice or an answer counts as asked", async () => {
    await db.sql`delete from notification_settings where user_id = 'adv'`;
    expect(await loadDigestAsk(db.sql, "adv")).toEqual({ asked: false });
    await saveNotificationSettings(db.sql, "adv", { weeklyDigest: false, ownerReminders: true });
    expect(await loadDigestAsk(db.sql, "adv")).toEqual({ asked: true });

    expect(await loadDigestAsk(db.sql, "quiet")).toEqual({ asked: true });
    await db.sql`delete from notification_settings where user_id = 'quiet'`;
    expect(await loadDigestAsk(db.sql, "quiet")).toEqual({ asked: false });
    await answerDigestAsk(db.sql, "quiet", true);
    expect(await loadDigestAsk(db.sql, "quiet")).toEqual({ asked: true });
    expect(await loadNotificationSettings(db.sql, "quiet")).toEqual({
      weeklyDigest: true,
      ownerReminders: true,
    });
  });

  it("leaves owner reminders alone when the digest question is answered", async () => {
    await db.sql`update notification_settings set owner_reminders = false where user_id = 'adv'`;
    await answerDigestAsk(db.sql, "adv", false);
    expect(await loadNotificationSettings(db.sql, "adv")).toEqual({
      weeklyDigest: false,
      ownerReminders: false,
    });
    await answerDigestAsk(db.sql, "adv", true);
    expect(await loadNotificationSettings(db.sql, "adv")).toEqual({
      weeklyDigest: true,
      ownerReminders: false,
    });
  });
});

function escapeAmp(url: string): string {
  return url.replace(/&/g, "&amp;");
}
