import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { brokerCallbacks } from "./broker-callbacks";

let auth: (typeof import("./server"))["auth"];
beforeAll(async () => {
  vi.stubEnv("DATABASE_URL", "");
  vi.stubEnv("VITE_AUTH_ENABLED", "true");
  vi.stubEnv("GROK_AUTH_ISSUER", "https://broker.example");
  ({ auth } = await import("./server"));
}, 60_000);
afterAll(() => vi.unstubAllEnvs());

describe("broker callback compatibility", () => {
  it("keeps preview callback URLs dynamic and rejects callbacks without valid state", async () => {
    const origin = "https://audit.grok-sandbox.com";
    const start = await auth.handler(
      new Request(`${origin}/api/auth/sign-in/social`, {
        method: "POST",
        headers: { "content-type": "application/json", origin, host: "audit.grok-sandbox.com" },
        body: JSON.stringify({ provider: "grok-google", callbackURL: `${origin}/` }),
      }),
    );
    expect(start.status).toBe(200);
    const authorize = new URL((await start.json()).url);
    const callback = `${origin}/api/auth/oauth2/callback/grok-google`;
    expect(authorize.searchParams.get("redirect_uri")).toBe(callback);
    const response = await auth.handler(
      new Request(`${callback}?code=untrusted&state=invalid`, {
        headers: { host: "audit.grok-sandbox.com" },
      }),
    );
    expect(response.headers.get("location")).toContain("error=");
    expect(response.headers.getSetCookie().join(";")).not.toContain("session_token=");
  });

  it("rewrites only registered callback paths, preserving the request", async () => {
    const plugin = brokerCallbacks();
    const request = new Request(
      "https://app.grok-sandbox.com/api/auth/oauth2/callback/grok-google?state=abc&code=xyz",
      { headers: { cookie: "state=abc" } },
    );
    const result = await plugin.onRequest!(request, {} as never);
    expect(result && "request" in result && result.request.url).toBe(
      "https://app.grok-sandbox.com/api/auth/callback/grok-google?state=abc&code=xyz",
    );
    expect(result && "request" in result && result.request.headers.get("cookie")).toBe("state=abc");
    for (const path of ["callback/unknown", "callback/grok-google/extra", "sign-in/social"]) {
      expect(
        await plugin.onRequest!(
          new Request(`https://example.com/api/auth/oauth2/${path}`),
          {} as never,
        ),
      ).toBeUndefined();
    }
  });

  it.each(["grok-google", "grok-x"])(
    "completes %s through the old broker URL with PKCE and the existing account identity",
    async (provider) => {
      const origin = "http://localhost:8080";
      const context = await auth.$context;
      const user = await context.internalAdapter.createUser(
        { email: `${provider}@firm.example`, name: "Existing owner", emailVerified: true },
        { method: "email-password" },
      );
      await context.internalAdapter.linkAccount({
        userId: user.id,
        providerId: provider,
        accountId: `subject-${provider}`,
      });
      const start = await auth.handler(
        new Request(`${origin}/api/auth/sign-in/social`, {
          method: "POST",
          headers: { "content-type": "application/json", origin, host: "localhost:8080" },
          body: JSON.stringify({ provider, callbackURL: `${origin}/` }),
        }),
      );
      expect(start.status).toBe(200);
      const authorize = new URL((await start.json()).url);
      const redirect = `${origin}/api/auth/oauth2/callback/${provider}`;
      expect(authorize.searchParams.get("redirect_uri")).toBe(redirect);
      expect(authorize.searchParams.get("code_challenge_method")).toBe("S256");
      const cookie = start.headers
        .getSetCookie()
        .map((c) => c.split(";")[0])
        .join("; ");
      const fetch = vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
        const url = String(input instanceof Request ? input.url : input);
        if (url === "https://broker.example/api/auth/oauth2/token") {
          const body = new URLSearchParams(String(init?.body));
          expect(body.get("redirect_uri")).toBe(redirect);
          expect(body.get("code_verifier")).toBeTruthy();
          return Response.json({ access_token: "test-access", token_type: "Bearer" });
        }
        if (url === "https://broker.example/api/auth/oauth2/userinfo") {
          return Response.json({
            id: `subject-${provider}`,
            email: user.email,
            email_verified: true,
            name: user.name,
          });
        }
        throw new Error(`Unexpected request: ${url}`);
      });
      try {
        const callback = new URL(redirect);
        callback.searchParams.set("state", authorize.searchParams.get("state")!);
        callback.searchParams.set("code", "test-code");
        const response = await auth.handler(
          new Request(callback, { headers: { cookie, host: "localhost:8080" } }),
        );
        expect(response.status).toBe(302);
        expect(response.headers.get("location")).toBe(`${origin}/`);
        const sessionCookie = response.headers
          .getSetCookie()
          .map((c) => c.split(";")[0])
          .join("; ");
        const session = await auth.api.getSession({
          headers: new Headers({ cookie: sessionCookie }),
        });
        expect(session?.user.id).toBe(user.id);
        expect(fetch).toHaveBeenCalledTimes(2);
      } finally {
        fetch.mockRestore();
      }
    },
    60_000,
  );
});
