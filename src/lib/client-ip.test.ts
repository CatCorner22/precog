import { describe, expect, it } from "vitest";
import { clientIpFrom, trustedClientIpHeaders, VERCEL_CLIENT_IP_HEADERS } from "./client-ip";

const spoofed = new Headers({
  "x-real-ip": "10.0.0.1",
  "x-forwarded-for": "10.0.0.2, 172.16.0.1",
  "x-vercel-forwarded-for": "203.0.113.7",
});

describe("trustedClientIpHeaders", () => {
  it("trusts no header off Vercel unless the deployment names one", () => {
    expect(trustedClientIpHeaders({})).toEqual([]);
    expect(trustedClientIpHeaders({ VERCEL: "0" })).toEqual([]);
    expect(trustedClientIpHeaders({ TRUSTED_CLIENT_IP_HEADER: " X-Real-IP " })).toEqual([
      "x-real-ip",
    ]);
  });

  it("trusts the platform's headers on Vercel, its own first", () => {
    expect(trustedClientIpHeaders({ VERCEL: "1" })).toEqual(VERCEL_CLIENT_IP_HEADERS);
    expect(VERCEL_CLIENT_IP_HEADERS[0]).toBe("x-vercel-forwarded-for");
  });
});

describe("clientIpFrom", () => {
  it("ignores client-set headers when none is trusted", () => {
    // Regression: x-real-ip was read first everywhere, so a client could pick
    // a fresh rate-limit bucket per request by changing it.
    expect(clientIpFrom(spoofed, [], "198.51.100.4")).toBe("198.51.100.4");
    expect(clientIpFrom(spoofed, [], undefined)).toBe("unknown");
  });

  it("reads the first trusted header present, first entry only", () => {
    expect(clientIpFrom(spoofed, VERCEL_CLIENT_IP_HEADERS, "10.9.9.9")).toBe("203.0.113.7");
    expect(clientIpFrom(spoofed, ["x-forwarded-for"], "10.9.9.9")).toBe("10.0.0.2");
    expect(clientIpFrom(new Headers(), VERCEL_CLIENT_IP_HEADERS, "10.9.9.9")).toBe("10.9.9.9");
  });
});
