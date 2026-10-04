import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { openTestDb, type TestDb } from "@/test/pglite";
import { signState } from "@/lib/precog/integrations/qbo/oauth";
import { stateSecret } from "@/lib/precog/integrations/qbo/client.server";
import { signPayload } from "@/lib/precog/billing/stripe";
import { Route as QboCallback } from "./integrations/qbo/callback";
import { Route as Cron } from "./cron/digest";
import { Route as StripeWebhook } from "./stripe/webhook";
import { Route as ResendWebhook } from "./resend/webhook";
import { signSvixPayload } from "@/lib/precog/reminders/resend-webhook";
import { Route as ProcedureImage } from "./procedure-image";
import { Route as OwnerEmail } from "./owner-email";
import { Route as DigestEmail } from "./digest-email";

// The leading "-" keeps this file out of the generated route tree.

const db = vi.hoisted(() => ({ current: null as TestDb | null }));
const session = vi.hoisted(() => ({ userId: null as string | null }));
const digestStage = vi.hoisted(() => ({ fail: false, sendsFail: false }));
const billing = vi.hoisted(() => ({ failure: null as Error | null }));
const report = vi.hoisted(() => ({
  error: vi.fn(async (_err: unknown, _at?: string | null) => {}),
}));

vi.mock("@/lib/db", () => ({
  getSql: async () => {
    if (!db.current) throw new Error("test database not open");
    return db.current.sql;
  },
}));
vi.mock("@/lib/precog/reminders/digest", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/precog/reminders/digest")>();
  return {
    ...actual,
    runDigest: (...args: Parameters<typeof actual.runDigest>) => {
      if (digestStage.fail) throw new Error("digest failed");
      if (digestStage.sendsFail)
        return Promise.resolve({ advisors: 0, owners: 0, skipped: 0, errors: ["owner b1: down"] });
      return actual.runDigest(...args);
    },
  };
});
vi.mock("@/lib/precog/billing/webhook", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/precog/billing/webhook")>();
  return {
    ...actual,
    applyBillingEvent: (...args: Parameters<typeof actual.applyBillingEvent>) => {
      if (billing.failure) throw billing.failure;
      return actual.applyBillingEvent(...args);
    },
  };
});
vi.mock("@/lib/observability/report.server", () => ({ reportServerError: report.error }));
vi.mock("@/lib/auth/verify.server", () => ({
  requireUserId: async () => {
    if (!session.userId) throw new Error("Unauthorized");
    return session.userId;
  },
}));

// A Resend signing secret in its real shape: "whsec_" and a base64 key.
const RESEND_SECRET = `whsec_${btoa("resend-test-signing-key")}`;

type Handler = (ctx: { request: Request }) => Promise<Response> | Response;
function handlers(route: unknown): Record<string, Handler> {
  return (route as { options: { server: { handlers: Record<string, Handler> } } }).options.server
    .handlers;
}

beforeAll(async () => {
  vi.stubEnv("INTEGRATION_KEY", "test-master-key");
  vi.stubEnv("QBO_CLIENT_ID", "cid");
  vi.stubEnv("QBO_CLIENT_SECRET", "csecret");
  vi.stubEnv("PUBLIC_APP_URL", "https://app.example");
  vi.stubEnv("CRON_SECRET", "cron-secret-value");
  vi.stubEnv("STRIPE_WEBHOOK_SECRET", "whsec_test");
  vi.stubEnv("RESEND_WEBHOOK_SECRET", RESEND_SECRET);
  db.current = await openTestDb();
}, 60_000);
afterAll(async () => {
  vi.unstubAllEnvs();
  await db.current?.close();
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  session.userId = null;
  digestStage.fail = false;
  digestStage.sendsFail = false;
  billing.failure = null;
  report.error.mockClear();
});

describe("QuickBooks callback", () => {
  const tokens = () =>
    Response.json({
      access_token: "access",
      refresh_token: "refresh",
      expires_in: 3600,
      x_refresh_token_expires_in: 8_640_000,
    });

  beforeEach(async () => {
    const t = db.current!;
    await t.clear("integration_connections", "businesses", '"user"');
    await t.seedUser("owner");
    await t.seedUser("other");
    await t.pg.query(
      `insert into businesses (id, user_id, name, industry, profile, revision)
       values ('biz_1', 'owner', 'Riverside Plumbing', 'general', '{}'::jsonb, 1)`,
    );
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => tokens()),
    );
  });

  async function callback(query: Record<string, string>) {
    const url = new URL("https://app.example/api/integrations/qbo/callback");
    for (const [k, v] of Object.entries(query)) url.searchParams.set(k, v);
    return handlers(QboCallback).GET({ request: new Request(url) });
  }
  const signed = () =>
    signState({ userId: "owner", businessId: "biz_1", issuedAt: Date.now() }, stateSecret());
  const saved = async () =>
    (await db.current!.sql<{ user_id: string }>`select user_id from integration_connections`)
      .length;

  it("saves the connection for the account that started it", async () => {
    session.userId = "owner";
    const res = await callback({ code: "c", state: await signed(), realmId: "9130" });
    expect(res.headers.get("location")).toBe("/firm?quickbooks=connected");
    expect(await saved()).toBe(1);
  });

  it("refuses a connect link finished by another account or by a signed-out browser", async () => {
    session.userId = "other";
    const wrong = await callback({ code: "c", state: await signed(), realmId: "9130" });
    expect(wrong.headers.get("location")).toBe("/firm?quickbooks=wrong-account");
    session.userId = null;
    const out = await callback({ code: "c", state: await signed(), realmId: "9130" });
    expect(out.headers.get("location")).toBe("/firm?quickbooks=signed-out");
    expect(await saved()).toBe(0);
  });
});

describe("QuickBooks callback input", () => {
  it("refuses a company id that is not a number, and answers other methods with 405", async () => {
    session.userId = "owner";
    const state = await signState(
      { userId: "owner", businessId: "biz_1", issuedAt: Date.now() },
      stateSecret(),
    );
    const url = new URL("https://app.example/api/integrations/qbo/callback");
    url.searchParams.set("code", "c");
    url.searchParams.set("state", state);
    url.searchParams.set("realmId", "../../evil?x=1");
    const res = await handlers(QboCallback).GET({ request: new Request(url) });
    expect(res.headers.get("location")).toBe("/firm?quickbooks=invalid");
    const post = await handlers(QboCallback).ANY({
      request: new Request(url, { method: "POST" }),
    });
    expect(post.status).toBe(405);
    expect(post.headers.get("allow")).toBe("GET");
  });
});

describe("scheduled run", () => {
  const run = (authorization?: string) =>
    handlers(Cron).GET({
      request: new Request("https://app.example/api/cron/digest", {
        headers: authorization ? { authorization } : {},
      }),
    });

  it("refuses a missing or wrong secret", async () => {
    expect((await run()).status).toBe(401);
    expect((await run("Bearer nope")).status).toBe(401);
    expect((await run("Bearer cron-secret-value-and-more")).status).toBe(401);
  });

  it("runs every stage with the right secret, purging share logs past their retention", async () => {
    const t = db.current!;
    await t.clear("map_share_views", "map_shares", "businesses", '"user"');
    await t.seedUser("owner");
    await t.pg.query(
      `insert into map_shares (token, user_id, business_name, industry, payload, expires_at)
       values ('ab12', 'owner', 'Riverside', 'general', '{}'::jsonb, now() + interval '7 days')`,
    );
    await t.pg.query(
      `insert into map_share_views (token, viewed_at)
       values ('ab12', now() - interval '91 days'), ('ab12', now() - interval '1 day')`,
    );
    const res = await run("Bearer cron-secret-value");
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({
      ok: true,
      purged: 0,
      quickbooksAlerts: { emailed: 0 },
      shareLogs: true,
      activation: { signedUp: 1 },
      failures: [],
    });
    const left = await t.pg.query<{ n: string }>(`select count(*)::text as n from map_share_views`);
    expect(left.rows[0].n).toBe("1");
  });

  it("still purges and re-reads the books when the digest fails", async () => {
    digestStage.fail = true;
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const res = await run("Bearer cron-secret-value");
    expect(res.status).toBe(500);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body).toMatchObject({ ok: false, failures: ["digest"], digest: null, purged: 0 });
    expect(body.synced).toEqual({ synced: 0, failed: 0 });
  });

  it("counts a digest that sent nothing and had errors as a failed stage", async () => {
    digestStage.sendsFail = true;
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const res = await run("Bearer cron-secret-value");
    expect(res.status).toBe(500);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body).toMatchObject({ ok: false, failures: ["digest"] });
    expect(body.synced).toEqual({ synced: 0, failed: 0 });
  });
});

describe("Stripe webhook", () => {
  const deliver = async (payload: string, headers: Record<string, string> = {}) =>
    handlers(StripeWebhook).POST({
      request: new Request("https://app.example/api/stripe/webhook", {
        method: "POST",
        body: payload,
        headers,
      }),
    });

  it("refuses an oversized delivery by its declared length and by its bytes", async () => {
    const declared = await deliver("{}", { "content-length": String(300 * 1024) });
    expect(declared.status).toBe(413);
    // 100,000 three-byte characters: under the limit in characters, over it in bytes.
    const wide = await deliver("€".repeat(100_000));
    expect(wide.status).toBe(413);
  });

  it("refuses a bad signature and accepts a signed event", async () => {
    const payload = JSON.stringify({ id: "evt_1", type: "ping", data: { object: {} } });
    expect((await deliver(payload, { "stripe-signature": "t=1,v1=00" })).status).toBe(400);
    const t = Math.floor(Date.now() / 1000);
    const v1 = await signPayload("whsec_test", t, payload);
    const res = await deliver(payload, { "stripe-signature": `t=${t},v1=${v1}` });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ received: true });
  });

  it("reports a failure to apply the event and answers 500 without its details", async () => {
    billing.failure = new Error("relation billing_accounts does not exist");
    const payload = JSON.stringify({ id: "evt_2", type: "ping", data: { object: {} } });
    const t = Math.floor(Date.now() / 1000);
    const v1 = await signPayload("whsec_test", t, payload);
    const res = await deliver(payload, { "stripe-signature": `t=${t},v1=${v1}` });
    expect(res.status).toBe(500);
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(await res.text()).not.toContain("billing_accounts");
    expect(report.error).toHaveBeenCalledWith(billing.failure, "stripe-webhook");
  });

  it("does not report a refusal that names a 4xx status", async () => {
    billing.failure = Object.assign(new Error("Conflict"), { status: 409 });
    const payload = JSON.stringify({ id: "evt_3", type: "ping", data: { object: {} } });
    const t = Math.floor(Date.now() / 1000);
    const v1 = await signPayload("whsec_test", t, payload);
    const res = await deliver(payload, { "stripe-signature": `t=${t},v1=${v1}` });
    expect(res.status).toBe(409);
    expect(report.error).not.toHaveBeenCalled();
  });
});

describe("Resend webhook", () => {
  const deliver = async (payload: string, headers: Record<string, string> = {}) =>
    handlers(ResendWebhook).POST({
      request: new Request("https://app.example/api/resend/webhook", {
        method: "POST",
        body: payload,
        headers,
      }),
    });
  const signedHeaders = async (payload: string, id = "msg_1") => {
    const timestamp = Math.floor(Date.now() / 1000);
    const sig = await signSvixPayload(RESEND_SECRET, id, timestamp, payload);
    return { "svix-id": id, "svix-timestamp": String(timestamp), "svix-signature": `v1,${sig}` };
  };
  const bounce = (to: string[], type = "Permanent") =>
    JSON.stringify({ type: "email.bounced", data: { email_id: "em_1", to, bounce: { type } } });

  beforeEach(async () => {
    await db.current!.clear("email_suppressions");
  });

  it("answers 404 while no webhook secret is set", async () => {
    vi.stubEnv("RESEND_WEBHOOK_SECRET", "");
    const payload = bounce(["dead@shop.test"]);
    const res = await deliver(payload, await signedHeaders(payload));
    expect(res.status).toBe(404);
    expect(await res.text()).toBe("Email events are not connected");
    vi.stubEnv("RESEND_WEBHOOK_SECRET", RESEND_SECRET);
  });

  it("refuses an oversized delivery by its declared length and by its bytes", async () => {
    const declared = await deliver("{}", { "content-length": String(300 * 1024) });
    expect(declared.status).toBe(413);
    const wide = await deliver("€".repeat(100_000));
    expect(wide.status).toBe(413);
  });

  it("refuses a missing or bad signature and a signed body that is not an event", async () => {
    const payload = bounce(["dead@shop.test"]);
    expect((await deliver(payload)).status).toBe(400);
    const bad = await deliver(payload, {
      ...(await signedHeaders(payload)),
      "svix-signature": "v1,AAAA",
    });
    expect(bad.status).toBe(400);
    expect(await bad.text()).toBe("Bad signature");
    const notEvent = await deliver("[1]", await signedHeaders("[1]"));
    expect(notEvent.status).toBe(400);
    expect(await notEvent.text()).toBe("Bad event");
    expect(await db.current!.sql`select email from email_suppressions`).toEqual([]);
  });

  it("records a bounced address once, however often the event is delivered", async () => {
    const payload = bounce(["Dead@Shop.test"]);
    const first = await deliver(payload, await signedHeaders(payload));
    expect(first.status).toBe(200);
    expect(await first.json()).toEqual({ received: true, suppressed: 1 });
    const again = await deliver(payload, await signedHeaders(payload, "msg_2"));
    expect(await again.json()).toEqual({ received: true, suppressed: 1 });
    const complaint = JSON.stringify({
      type: "email.complained",
      data: { email_id: "em_1", to: ["dead@shop.test"] },
    });
    await deliver(complaint, await signedHeaders(complaint, "msg_3"));
    const rows = await db.current!.sql<{
      email: string;
      reason: string;
      provider_event_id: string;
    }>`
      select email, reason, provider_event_id from email_suppressions
    `;
    expect(rows).toEqual([
      { email: "dead@shop.test", reason: "bounced", provider_event_id: "em_1" },
    ]);
  });

  it("stops nobody for a transient bounce or an unrelated event", async () => {
    const soft = bounce(["full@shop.test"], "Transient");
    expect(await (await deliver(soft, await signedHeaders(soft))).json()).toEqual({
      received: true,
      suppressed: 0,
    });
    const sent = JSON.stringify({ type: "email.sent", data: { to: ["a@shop.test"] } });
    expect(await (await deliver(sent, await signedHeaders(sent, "msg_2"))).json()).toEqual({
      received: true,
      suppressed: 0,
    });
    expect(await db.current!.sql`select email from email_suppressions`).toEqual([]);
  });

  it("answers 405 to anything but a POST", async () => {
    const res = await handlers(ResendWebhook).ANY({
      request: new Request("https://app.example/api/resend/webhook"),
    });
    expect(res.status).toBe(405);
    expect(res.headers.get("allow")).toBe("POST");
  });
});

describe("owner email links", () => {
  const token = "cd".repeat(24);
  const url = (action: string, t = token) =>
    `https://app.example/api/owner-email?do=${action}&token=${t}`;
  const state = async () =>
    (
      await db.current!.pg.query<{ confirmed: boolean; stopped: boolean }>(
        `select owner_email_confirmed_at is not null as confirmed,
          owner_email_unsubscribed_at is not null as stopped from engagement_marks`,
      )
    ).rows[0];

  beforeEach(async () => {
    const t = db.current!;
    await t.clear("engagement_marks", "businesses", '"user"');
    await t.seedUser("owner");
    await t.pg.query(
      `insert into businesses (id, user_id, name, industry, profile, revision)
       values ('biz_1', 'owner', 'Riverside <Plumbing>', 'general', '{}'::jsonb, 1)`,
    );
    await t.pg.query(
      `insert into engagement_marks (user_id, business_id, owner_email, owner_email_token)
       values ('owner', 'biz_1', 'o@shop.test', $1)`,
      [token],
    );
  });

  it("shows a button on open and changes nothing until it is pressed", async () => {
    const res = await handlers(OwnerEmail).GET({ request: new Request(url("confirm")) });
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain("Riverside &lt;Plumbing&gt;");
    expect(html).toContain('<form method="post">');
    expect(await state()).toEqual({ confirmed: false, stopped: false });
  });

  it("confirms, then stops with a one-click POST", async () => {
    const ok = await handlers(OwnerEmail).POST({
      request: new Request(url("confirm"), { method: "POST" }),
    });
    expect(ok.status).toBe(200);
    expect(await state()).toEqual({ confirmed: true, stopped: false });
    const stop = await handlers(OwnerEmail).POST({
      request: new Request(url("stop"), { method: "POST", body: "List-Unsubscribe=One-Click" }),
    });
    expect(stop.status).toBe(200);
    expect(await state()).toEqual({ confirmed: true, stopped: true });
  });

  it("answers 404 for an unknown or malformed token", async () => {
    for (const request of [
      new Request(url("stop", "ef".repeat(24)), { method: "POST" }),
      new Request(url("stop", "nope"), { method: "POST" }),
      new Request(url("delete"), { method: "POST" }),
    ]) {
      expect((await handlers(OwnerEmail).POST({ request })).status).toBe(404);
    }
    expect(await state()).toEqual({ confirmed: false, stopped: false });
  });
});

describe("digest email links", () => {
  const token = "ab".repeat(24);
  const url = (query: string) => `https://app.example/api/digest-email?${query}`;
  const digestOn = async () =>
    (
      await db.current!.pg.query<{ on: boolean }>(
        `select weekly_digest as "on" from notification_settings where user_id = 'adv'`,
      )
    ).rows[0].on;

  beforeEach(async () => {
    const t = db.current!;
    await t.clear("notification_settings", '"user"');
    await t.seedUser("adv");
    await t.pg.query(
      `insert into notification_settings (user_id, weekly_digest, digest_token) values ('adv', true, $1)`,
      [token],
    );
  });

  it("shows a button on open and changes nothing until it is pressed", async () => {
    const res = await handlers(DigestEmail).GET({
      request: new Request(url(`do=stop&token=${token}`)),
    });
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("no-store");
    const html = await res.text();
    expect(html).toContain("Stop the weekly digest?");
    expect(html).toContain(
      "Precog will stop emailing you the weekly note about what is due on your businesses.",
    );
    expect(html).toContain('<form method="post">');
    expect(html).toContain(">Stop the weekly digest</button>");
    expect(await digestOn()).toBe(true);
  });

  it("stops the digest with a one-click POST", async () => {
    const res = await handlers(DigestEmail).POST({
      request: new Request(url(`do=stop&token=${token}`), {
        method: "POST",
        body: "List-Unsubscribe=One-Click",
      }),
    });
    expect(res.status).toBe(200);
    expect(await res.text()).toContain(
      "Precog will not send you the weekly digest again unless you turn it on.",
    );
    expect(await digestOn()).toBe(false);
  });

  it("answers 404 for an unknown or malformed token or another action", async () => {
    for (const query of [
      `do=stop&token=${"ef".repeat(24)}`,
      "do=stop&token=nope",
      `do=confirm&token=${token}`,
    ]) {
      expect((await handlers(DigestEmail).GET({ request: new Request(url(query)) })).status).toBe(
        404,
      );
      const post = await handlers(DigestEmail).POST({
        request: new Request(url(query), { method: "POST" }),
      });
      expect(post.status).toBe(404);
      const body = await post.text();
      expect(body).toContain("This link no longer works");
      expect(body).toContain(
        "The link may have changed since Precog sent the email. Turn the weekly digest off from the header after you sign in.",
      );
    }
    expect(await digestOn()).toBe(true);
    const other = await handlers(DigestEmail).ANY({
      request: new Request(url(`do=stop&token=${token}`), { method: "PUT" }),
    });
    expect(other.status).toBe(405);
  });
});

describe("procedure image", () => {
  beforeEach(async () => {
    const t = db.current!;
    await t.clear("procedure_images", "businesses", '"user"');
    await t.seedUser("owner");
    await t.seedUser("other");
    for (const user of ["owner", "other"]) {
      await t.pg.query(
        `insert into businesses (id, user_id, name, industry, profile, revision)
         values ('biz_1', $1, 'Riverside Plumbing', 'general', '{}'::jsonb, 1)`,
        [user],
      );
    }
    await t.pg.query(
      `insert into procedure_images (id, user_id, business_id, content_type, bytes, byte_size, width, height, sha256)
       values ('img_one', 'owner', 'biz_1', 'image/png', '\\x89504e47', 4, 1, 1, 'abc')`,
    );
  });

  const get = (query: string) =>
    handlers(ProcedureImage).GET({
      request: new Request(`https://app.example/api/procedure-image?${query}`),
    });

  it("serves the owner's picture with its stored type and private, no-sniff headers", async () => {
    session.userId = "owner";
    const res = await get("b=biz_1&id=img_one");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("image/png");
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
    expect(res.headers.get("cache-control")).toBe("private, max-age=86400");
    expect(res.headers.get("content-security-policy")).toBe("default-src 'none'");
    expect(new Uint8Array(await res.arrayBuffer())).toEqual(
      new Uint8Array([0x89, 0x50, 0x4e, 0x47]),
    );
  });

  it("answers 404 to a signed-out viewer, another account, and a malformed request", async () => {
    expect((await get("b=biz_1&id=img_one")).status).toBe(404);
    session.userId = "other";
    expect((await get("b=biz_1&id=img_one")).status).toBe(404);
    session.userId = "owner";
    expect((await get("b=biz_1&id=../../etc")).status).toBe(404);
    expect((await get("id=img_one")).status).toBe(404);
  });

  it("lets the viewer's browser keep a miss for a minute, the same for every 404", async () => {
    const misses = [await get("b=biz_1&id=img_one")];
    session.userId = "owner";
    misses.push(await get("b=biz_1&id=img_missing"), await get("b=biz_1&id=../../etc"));
    for (const res of misses) {
      expect(res.status).toBe(404);
      expect(res.headers.get("cache-control")).toBe("private, max-age=60");
    }
  });

  it("refuses other methods", async () => {
    const res = await handlers(ProcedureImage).ANY({
      request: new Request("https://app.example/api/procedure-image", { method: "POST" }),
    });
    expect(res.status).toBe(405);
  });
});
