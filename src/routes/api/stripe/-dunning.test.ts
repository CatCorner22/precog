import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { openTestDb, type TestDb } from "@/test/pglite";
import { signPayload } from "@/lib/precog/billing/stripe";
import { saveFirm } from "@/lib/precog/firm/store";
import { loadBillingAccount } from "@/lib/precog/firm/billing-store";
import { Route as StripeWebhook } from "./webhook";

// The leading "-" keeps this file out of the generated route tree.

const db = vi.hoisted(() => ({ current: null as TestDb | null }));
const mail = vi.hoisted(() => ({
  configured: true,
  failure: null as Error | null,
  sent: [] as { to: string; subject: string; text: string }[],
}));
const report = vi.hoisted(() => ({
  error: vi.fn(async (_err: unknown, _at?: string | null) => {}),
}));

vi.mock("@/lib/db", () => ({
  getSql: async () => {
    if (!db.current) throw new Error("test database not open");
    return db.current.sql;
  },
}));
vi.mock("@/lib/precog/reminders/mailer.server", () => ({
  mailConfigured: () => mail.configured,
  sendEmail: async (to: string, message: { subject: string; text: string }) => {
    if (mail.failure) throw mail.failure;
    mail.sent.push({ to, subject: message.subject, text: message.text });
  },
}));
vi.mock("@/lib/observability/report.server", () => ({ reportServerError: report.error }));

type Handler = (ctx: { request: Request }) => Promise<Response> | Response;
const post = (StripeWebhook as unknown as { options: { server: { handlers: { POST: Handler } } } })
  .options.server.handlers.POST;

async function deliver(event: Record<string, unknown>) {
  const payload = JSON.stringify(event);
  const t = Math.floor(Date.now() / 1000);
  const v1 = await signPayload("whsec_test", t, payload);
  return post({
    request: new Request("https://app.example/api/stripe/webhook", {
      method: "POST",
      body: payload,
      headers: { "stripe-signature": `t=${t},v1=${v1}` },
    }),
  });
}

const subscription = (id: string, status: string, created: number) => ({
  id,
  type: "customer.subscription.updated",
  created,
  data: {
    object: { id: "sub_1", status, customer: "cus_1", metadata: { userId: "owner" } },
  },
});
const failedInvoice = (id: string, created: number) => ({
  id,
  type: "invoice.payment_failed",
  created,
  data: {
    object: {
      id: "in_1",
      customer: "cus_1",
      subscription: "sub_1",
      hosted_invoice_url: "https://invoice.stripe.com/i/in_1",
    },
  },
});

beforeAll(async () => {
  vi.stubEnv("PUBLIC_APP_URL", "https://app.example");
  vi.stubEnv("STRIPE_WEBHOOK_SECRET", "whsec_test");
  db.current = await openTestDb();
}, 60_000);
afterAll(async () => {
  vi.unstubAllEnvs();
  await db.current?.close();
});
beforeEach(async () => {
  const t = db.current!;
  await t.clear(
    "email_suppressions",
    "billing_events",
    "billing_accounts",
    "firm_members",
    "firms",
    '"user"',
  );
  await t.seedUser("owner", "owner@firm.test");
  await saveFirm(t.sql, "owner", "North Advisors", "assessment");
  mail.configured = true;
  mail.failure = null;
  mail.sent.length = 0;
  report.error.mockClear();
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe("Stripe webhook dunning", () => {
  it("emails the firm owner once with the hosted invoice link, after the plan goes past due", async () => {
    expect((await deliver(subscription("e1", "active", 100))).status).toBe(200);
    expect((await deliver(failedInvoice("e2", 1_700_000_000))).status).toBe(200);
    expect(mail.sent).toEqual([]);
    const res = await deliver(subscription("e3", "past_due", 1_700_000_500));
    expect(await res.json()).toEqual({ received: true, outcome: "applied" });
    expect(mail.sent).toHaveLength(1);
    expect(mail.sent[0]).toMatchObject({
      to: "owner@firm.test",
      subject: "Precog: the Firm plan payment failed",
    });
    expect(mail.sent[0].text).toContain(
      "The payment for the Firm plan for North Advisors failed on 2023-11-14. Stripe will try again over the next 14 days. Precog keeps the plan open until 2023-11-28;",
    );
    expect(mail.sent[0].text).toContain("Fix the payment: https://invoice.stripe.com/i/in_1");
    expect(
      (await loadBillingAccount(db.current!.sql, "owner"))?.paymentFailedEmailSentAt,
    ).not.toBeNull();
    // A second past_due event sends nothing more.
    await deliver(subscription("e4", "past_due", 1_700_001_000));
    expect(mail.sent).toHaveLength(1);
    expect(report.error).not.toHaveBeenCalled();
  });

  it("answers 200 and reports it when the email fails after the event committed", async () => {
    mail.failure = new Error("Resend timed out");
    const res = await deliver(subscription("e1", "past_due", 1_700_000_000));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ received: true, outcome: "applied" });
    expect(report.error).toHaveBeenCalledWith(mail.failure, "stripe-webhook-after-commit");
    expect((await loadBillingAccount(db.current!.sql, "owner"))?.subscriptionStatus).toBe(
      "past_due",
    );
    // Unstamped, so the next past_due event of the episode sends the email.
    mail.failure = null;
    await deliver(subscription("e2", "past_due", 1_700_000_500));
    expect(mail.sent).toHaveLength(1);
  });

  it("links the firm page when no invoice event carried a link", async () => {
    await deliver(subscription("e1", "past_due", 1_700_000_000));
    expect(mail.sent[0].text).toContain(
      "Fix the payment: https://app.example/firm?billing=overdue",
    );
  });

  it("sends nothing to a suppressed owner address, reports it once and stamps the episode", async () => {
    await db.current!.sql`insert into email_suppressions (email, reason, provider_event_id)
      values ('owner@firm.test', 'bounced', 'em_1')`;
    await deliver(subscription("e1", "past_due", 1_700_000_000));
    await deliver(subscription("e2", "past_due", 1_700_000_500));
    expect(mail.sent).toEqual([]);
    expect(report.error).toHaveBeenCalledTimes(1);
    expect(report.error.mock.calls[0][1]).toBe("stripe-dunning");
    expect(
      (await loadBillingAccount(db.current!.sql, "owner"))?.paymentFailedEmailSentAt,
    ).not.toBeNull();
  });

  it("stamps nothing while email is not set up, so the first connected deployment sends", async () => {
    mail.configured = false;
    await deliver(subscription("e1", "past_due", 1_700_000_000));
    expect(mail.sent).toEqual([]);
    expect(
      (await loadBillingAccount(db.current!.sql, "owner"))?.paymentFailedEmailSentAt,
    ).toBeNull();
    mail.configured = true;
    await deliver(subscription("e2", "past_due", 1_700_000_500));
    expect(mail.sent).toHaveLength(1);
  });

  it("sends nothing for a failed invoice while the subscription is still active", async () => {
    await deliver(subscription("e1", "active", 100));
    await deliver(failedInvoice("e2", 1_700_000_000));
    expect(mail.sent).toEqual([]);
    expect(
      (await loadBillingAccount(db.current!.sql, "owner"))?.paymentFailedEmailSentAt,
    ).toBeNull();
  });
});
