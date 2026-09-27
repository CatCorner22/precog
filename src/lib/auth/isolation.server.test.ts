import { afterEach, describe, expect, it, vi } from "vitest";

/** The same-site chokepoint in front of every per-user server function. */
let request: Request | undefined;
vi.mock("@tanstack/react-start/server", () => ({ getRequest: () => request }));

const { assertSameSiteRequest } = await import("./isolation.server");

afterEach(() => {
  request = undefined;
});

function withHeaders(method: string, headers: Record<string, string>) {
  request = new Request("https://app.example/_serverFn/x", { method, headers });
}

describe("assertSameSiteRequest", () => {
  it.each([
    ["no Fetch-Metadata (server-to-server, SSR)", "POST", {}],
    ["this app's own page", "POST", { "sec-fetch-site": "same-origin", "sec-fetch-mode": "cors" }],
    ["an address-bar load", "GET", { "sec-fetch-site": "none", "sec-fetch-mode": "navigate" }],
    [
      "a top-level navigation from a sibling app",
      "GET",
      { "sec-fetch-site": "same-site", "sec-fetch-mode": "navigate", "sec-fetch-dest": "document" },
    ],
  ])("allows %s", (_label, method, headers) => {
    withHeaders(method, headers);
    expect(() => assertSameSiteRequest()).not.toThrow();
  });

  it.each([
    [
      "a sibling's navigate GET into an <object>",
      "GET",
      { "sec-fetch-site": "same-site", "sec-fetch-mode": "navigate", "sec-fetch-dest": "object" },
    ],
    [
      "a sibling's navigate GET into an <embed>",
      "GET",
      { "sec-fetch-site": "same-site", "sec-fetch-mode": "navigate", "sec-fetch-dest": "embed" },
    ],
    [
      "a sibling's form POST navigation",
      "POST",
      { "sec-fetch-site": "same-site", "sec-fetch-mode": "navigate", "sec-fetch-dest": "document" },
    ],
    [
      "a sibling's scripted POST",
      "POST",
      { "sec-fetch-site": "same-site", "sec-fetch-mode": "cors" },
    ],
    [
      "a cross-site scripted GET",
      "GET",
      { "sec-fetch-site": "cross-site", "sec-fetch-mode": "cors" },
    ],
  ])("blocks %s with 403", (_label, method, headers) => {
    withHeaders(method, headers);
    expect(() => assertSameSiteRequest()).toThrow(expect.objectContaining({ status: 403 }));
  });
});
