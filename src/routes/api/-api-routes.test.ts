import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { openTestDb, type TestDb } from "@/test/pglite";
import { signState } from "@/lib/precog/integrations/qbo/oauth";
import { stateSecret } from "@/lib/precog/integrations/qbo/client.server";
import { Route as QboCallback } from "./integrations/qbo/callback";

// The leading "-" keeps this file out of the generated route tree.

const db = vi.hoisted(() => ({ current: null as TestDb | null }));
const session = vi.hoisted(() => ({ userId: null as string | null }));

vi.mock("@/lib/db", () => ({
  getSql: async () => {
    if (!db.current) throw new Error("test database not open");
    return db.current.sql;
  },
}));
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
  db.current = await openTestDb();
}, 60_000);
afterAll(async () => {
  vi.unstubAllEnvs();
  await db.current?.close();
});
afterEach(() => {
  vi.unstubAllGlobals();
  session.userId = null;
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
