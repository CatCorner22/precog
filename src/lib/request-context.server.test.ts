import { beforeEach, describe, expect, it, vi } from "vitest";

const server = vi.hoisted(() => ({
  request: null as Request | null,
  ip: undefined as string | undefined,
  status: undefined as number | undefined,
  headers: new Map<string, string>(),
}));

vi.mock("@tanstack/react-start/server", () => ({
  getRequest: () => {
    if (!server.request) throw new Error("No StartEvent found in AsyncLocalStorage");
    return server.request;
  },
  getRequestIP: () => server.ip,
  setResponseStatus: (status: number) => {
    server.status = status;
  },
  setResponseHeader: (name: string, value: string) => {
    server.headers.set(name, value);
  },
}));

const { originFrom, requestOrigin } = await import("./request-origin.server");
const { requestIp } = await import("./request-ip.server");
const { applyClientErrorStatus } = await import("./server-fn-status.server");
const { RequestError } = await import("./request-errors");

beforeEach(() => {
  server.request = null;
  server.ip = undefined;
  server.status = undefined;
  server.headers.clear();
  vi.unstubAllEnvs();
});

describe("originFrom", () => {
  const spoofed = new Headers({ "x-forwarded-host": "evil.example", "x-forwarded-proto": "https" });

  it("prefers PUBLIC_APP_URL, then BETTER_AUTH_URL, without a trailing slash", () => {
    expect(
      originFrom("http://internal:8080/x", spoofed, {
        PUBLIC_APP_URL: "https://links.example.com/",
        BETTER_AUTH_URL: "https://app.example.com",
      }),
    ).toBe("https://links.example.com");
    expect(
      originFrom("http://internal:8080/x", spoofed, {
        BETTER_AUTH_URL: "https://app.example.com/",
      }),
    ).toBe("https://app.example.com");
  });

  it("ignores forwarded headers off Vercel unless the operator trusts them", () => {
    expect(originFrom("http://internal:8080/x", spoofed, {})).toBe("http://internal:8080");
    expect(originFrom("http://internal:8080/x", spoofed, { TRUST_FORWARDED_HOST: "1" })).toBe(
      "https://evil.example",
    );
  });

  it("uses the proxy's forwarded host on Vercel", () => {
    const headers = new Headers({ "x-forwarded-host": "app.vercel.app, other" });
    expect(originFrom("http://internal/x", headers, { VERCEL: "1" })).toBe("http://app.vercel.app");
  });
});

describe("request context wrappers", () => {
  it("requestOrigin reads the current request", () => {
    vi.stubEnv("PUBLIC_APP_URL", "");
    vi.stubEnv("BETTER_AUTH_URL", "");
    vi.stubEnv("VERCEL", "");
    server.request = new Request("https://preview.example.test/_serverFn/x");
    expect(requestOrigin()).toBe("https://preview.example.test");
  });

  it("requestIp uses the socket address off Vercel and throws outside a request", () => {
    vi.stubEnv("VERCEL", "");
    vi.stubEnv("TRUSTED_CLIENT_IP_HEADER", "");
    server.request = new Request("https://x.test/", { headers: { "x-forwarded-for": "6.6.6.6" } });
    server.ip = "10.0.0.1";
    expect(requestIp()).toBe("10.0.0.1");
    server.request = null;
    expect(() => requestIp()).toThrow(/No StartEvent/);
  });

  it("applyClientErrorStatus sets the status only on a server-function request", () => {
    server.request = new Request("https://x.test/_serverFn/abc", { method: "POST" });
    expect(applyClientErrorStatus(new RequestError(409, "Conflict"))).toBe(true);
    expect(server.status).toBe(409);
    server.status = undefined;
    server.request = new Request("https://x.test/firm");
    expect(applyClientErrorStatus(new RequestError(409, "Conflict"))).toBe(true);
    expect(server.status).toBeUndefined();
    expect(applyClientErrorStatus(new Error("ours"))).toBe(false);
    server.request = null;
    expect(applyClientErrorStatus(new RequestError(400, "Bad"))).toBe(true);
  });

  it("gives a 429 with a known window a Retry-After in whole seconds", () => {
    server.request = new Request("https://x.test/_serverFn/abc", { method: "POST" });
    const limited = Object.assign(new RequestError(429, "Too many requests"), {
      retryAfterMs: 8_200,
    });
    applyClientErrorStatus(limited);
    expect(server.status).toBe(429);
    expect(server.headers.get("retry-after")).toBe("9");
    server.headers.clear();
    applyClientErrorStatus(new RequestError(429, "Too many requests"));
    expect(server.headers.has("retry-after")).toBe(false);
  });
});
