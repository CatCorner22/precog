import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { openTestDb, type TestDb } from "@/test/pglite";
import { signState } from "@/lib/precog/integrations/qbo/oauth";
import { stateSecret } from "@/lib/precog/integrations/qbo/client.server";
import { signPayload } from "@/lib/precog/billing/stripe";
import { Route as QboCallback } from "./integrations/qbo/callback";
import { Route as Cron } from "./cron/digest";
import { Route as StripeWebhook } from "./stripe/webhook";
import { Route as ProcedureImage } from "./procedure-image";

// The leading "-" keeps this file out of the generated route tree.

const db = vi.hoisted(() => ({ current: null as TestDb | null }));
const session = vi.hoisted(() => ({ userId: null as string | null }));
const digestStage = vi.hoisted(() => ({ fail: false }));

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
      return actual.runDigest(...args);
    },
  };
});
vi.mock("@/lib/auth/verify.server", () => ({
  requireUserId: async () => {
    if (!session.userId) throw new Error("Unauthorized");
    return session.userId;
  },
}));

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

  it("runs every stage with the right secret", async () => {
    const res = await run("Bearer cron-secret-value");
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true, purged: 0, failures: [] });
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

  it("refuses other methods", async () => {
    const res = await handlers(ProcedureImage).ANY({
      request: new Request("https://app.example/api/procedure-image", { method: "POST" }),
    });
    expect(res.status).toBe(405);
  });
});
