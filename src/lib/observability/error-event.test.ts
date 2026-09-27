import { describe, expect, it } from "vitest";
import { isErrorEventPayload, scrubLocation, scrubText, toErrorEvent } from "./error-event";
import { sentryEnvelope, sentryTarget } from "./report.server";

describe("error event scrubbing", () => {
  it("removes emails, tokens, bearer headers and quoted text", () => {
    const text =
      'Failed for jane.doe@firm.example with Bearer abc.def.ghi and share token 9f8e7d6c5b4a39281706f5e4d3c2b1a0 on "Riverside Dental"';
    const out = scrubText(text, 500);
    expect(out).not.toContain("jane.doe");
    expect(out).not.toContain("9f8e7d6c5b4a39281706f5e4d3c2b1a0");
    expect(out).not.toContain("Riverside");
    expect(out).toContain("Bearer [token]");
    expect(out).toContain("[email]");
  });

  it("redacts secret-looking query pairs", () => {
    expect(scrubText("GET /share?passcode=1234&token=zz", 500)).toBe(
      "GET /share?passcode=[redacted]&token=[redacted]",
    );
  });

  it("drops the query string and id-like segments from a location", () => {
    expect(scrubLocation("/share/9f8e7d6c5b4a39281706f5e4d3c2b1a0?passcode=1")).toBe("/share/[id]");
    expect(scrubLocation("/report")).toBe("/report");
    expect(scrubLocation(null)).toBeNull();
  });

  it("shapes an Error and a bare string alike", () => {
    const err = toErrorEvent(new TypeError("boom for x@y.io"), {
      where: "server",
      at: "server-fn",
      now: new Date("2026-09-25T00:00:00Z"),
    });
    expect(err.name).toBe("TypeError");
    expect(err.message).toBe("boom for [email]");
    expect(err.occurredAt).toBe("2026-09-25T00:00:00.000Z");
    expect(toErrorEvent("plain", { where: "client" }).message).toBe("plain");
    expect(toErrorEvent(undefined, { where: "client" }).message).toBe("Unknown error");
  });

  it("keeps hostnames, versions and dotted file names in a stack", () => {
    for (const text of [
      "at load (https://precog.example.com/assets/index-Dd3E9.js:12:345)",
      "node_modules/react-dom.development.js:100:2",
      "Version 1.2.3 mismatch at www.example.com",
      "at chunk-ABCDEFGHIJKLMNOPQRSTUVWXYZ012345.js:1:2",
    ])
      expect(scrubText(text, 500)).toBe(text);
  });

  it("still removes a real JWT and a share token", () => {
    const jwt =
      "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4ifQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c";
    expect(scrubText(`token ${jwt} expired`, 500)).toBe("token [token] expired");
    // Share tokens are 36 hex characters (share/share-server.ts, randomHex(18)).
    expect(scrubText("share 0f1e2d3c4b5a69788796a5b4c3d2e1f0a1b2 gone", 500)).toBe(
      "share [token] gone",
    );
  });

  it("keeps the message a non-Error rejection carries", () => {
    const plain = toErrorEvent({ message: "Invalid origin", status: 403 }, { where: "client" });
    expect(plain.message).toBe("Invalid origin");
    const response = toErrorEvent(new Response("x", { status: 500 }), { where: "client" });
    expect(response.message).toBe("HTTP 500");
    expect(response.name).toBe("Response");
    // Quoted strings in the JSON are scrubbed like any other typed text.
    expect(toErrorEvent({ code: 7 }, { where: "client" }).message).toBe('{"[text]":7}');
    expect(toErrorEvent(null, { where: "client" }).message).toBe("Unknown error");
  });

  it("accepts only well-formed client payloads at the intake", () => {
    const good = toErrorEvent(new Error("x"), { where: "client", at: "/" });
    expect(isErrorEventPayload(good)).toBe(true);
    expect(isErrorEventPayload({ ...good, where: "server" })).toBe(false);
    expect(isErrorEventPayload({ ...good, message: "x".repeat(501) })).toBe(false);
    expect(isErrorEventPayload(null)).toBe(false);
  });
});

describe("sentry transport", () => {
  it("derives the envelope endpoint from a DSN", () => {
    const target = sentryTarget("https://publickey@o123.ingest.sentry.io/456");
    expect(target?.url).toBe("https://o123.ingest.sentry.io/api/456/envelope/");
    expect(target?.auth).toContain("sentry_key=publickey");
    expect(sentryTarget("not a url")).toBeNull();
    expect(sentryTarget("https://sentry.io/")).toBeNull();
  });

  it("writes a three-line envelope with the exception", () => {
    const event = toErrorEvent(new Error("bad"), { where: "server", at: "server-fn" });
    const lines = sentryEnvelope(event, "abc").split("\n");
    expect(lines).toHaveLength(3);
    expect(JSON.parse(lines[1])).toEqual({ type: "event" });
    const body = JSON.parse(lines[2]);
    expect(body.exception.values[0].value).toBe("bad");
    expect(body.tags.where).toBe("server");
  });
});
