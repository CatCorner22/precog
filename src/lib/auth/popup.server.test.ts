import { describe, expect, it, vi } from "vitest";

vi.mock("./server", () => ({ auth: {}, SESSION_TOKEN_COOKIE: "__Host-grok-auth.session_token" }));

const { handleAuthPopupRequest, readCookie } = await import("./popup.server");

function withCookie(cookie: string | null) {
  return new Request("https://app.grok-sandbox.com/auth/popup", {
    headers: cookie === null ? {} : { cookie },
  });
}

async function postedMessage(url: string, cookie: string) {
  const res = await handleAuthPopupRequest(new Request(url, { headers: { cookie } }));
  const html = await res.text();
  const json = /<script type="application\/json" id="grok-auth-popup-msg">(.*?)<\/script>/s.exec(
    html,
  )?.[1];
  return { res, message: JSON.parse(json ?? "null") as Record<string, unknown> };
}

describe("readCookie", () => {
  it.each([
    [null, null],
    ["", null],
    ["a=1; b=2", null],
    ["__Host-grok-auth.session_token=tok.en=", "tok.en="],
    ["x=1;  __Host-grok-auth.session_token=a%2Fb ; y=2", "a/b"],
    ["__Host-grok-auth.session_token=%E0%A4%A", "%E0%A4%A"],
    ["prefix__Host-grok-auth.session_token=nope", null],
    ["=orphan; __Host-grok-auth.session_token=ok", "ok"],
  ])("reads %j as %j", (cookie, expected) => {
    expect(readCookie(withCookie(cookie), "__Host-grok-auth.session_token")).toBe(expected);
  });
});

describe("pop-up completion page", () => {
  it("posts the session token after a successful callback", async () => {
    const { res, message } = await postedMessage(
      "https://app.grok-sandbox.com/auth/popup?done=1",
      "__Host-grok-auth.session_token=abc",
    );
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(message).toEqual({ source: "grok-auth-popup", token: "abc" });
  });

  it("posts Better Auth's error code and no token after a failed callback", async () => {
    const { message } = await postedMessage(
      "https://app.grok-sandbox.com/auth/popup?done=1&error=account_not_linked",
      "__Host-grok-auth.session_token=stale",
    );
    expect(message).toEqual({
      source: "grok-auth-popup",
      token: null,
      error: "account_not_linked",
    });
  });
});
