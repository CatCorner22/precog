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
