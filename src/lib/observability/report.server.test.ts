import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { toErrorEvent, type ErrorEvent } from "./error-event";
import { forwardErrorEvent, scrubEvent, sentryEnvelope, sentryFrames } from "./report.server";

function clientEvent(overrides: Partial<ErrorEvent> = {}): ErrorEvent {
  return {
    message: "boom",
    name: "Error",
    stack: null,
    where: "client",
    at: "/",
    occurredAt: "2026-09-26T10:00:00.000Z",
    release: null,
    ...overrides,
  };
}

describe("sentry frames", () => {
  it("lists frames oldest caller first, split into function, file, line and column", () => {
    const stack = [
      "TypeError: boom",
      "    at inner (https://x.test/a.js:1:2)",
      "    at https://x.test/b.js:3:4",
      "    at async Promise.all (index 0)",
    ].join("\n");
    expect(sentryFrames(stack)).toEqual([
      { function: "at async Promise.all (index 0)" },
      { function: "?", filename: "https://x.test/b.js", lineno: 3, colno: 4 },
      { function: "inner", filename: "https://x.test/a.js", lineno: 1, colno: 2 },
    ]);
  });

  it("reads Firefox and Safari frames, which have no header line", () => {
    expect(sentryFrames("load@https://x.test/a.js:12:34\n@https://x.test/b.js:5:6")).toEqual([
      { function: "?", filename: "https://x.test/b.js", lineno: 5, colno: 6 },
      { function: "load", filename: "https://x.test/a.js", lineno: 12, colno: 34 },
    ]);
  });

  it("puts the throwing frame last in the envelope", () => {
    const event = clientEvent({
      stack:
        "Error: boom\n    at inner (https://x.test/a.js:1:2)\n    at outer (https://x.test/b.js:3:4)",
    });
    const body = JSON.parse(sentryEnvelope(event, "abc").split("\n")[2]);
    const frames = body.exception.values[0].stacktrace.frames;
    expect(frames.at(-1)).toMatchObject({ function: "inner", filename: "https://x.test/a.js" });
  });
});

describe("scrubEvent", () => {
  it("scrubs and bounds every field a browser can set", () => {
    const out = scrubEvent(
      clientEvent({
        name: "Error jane@firm.example",
        at: "/share/abc?passcode=1234 jane@firm.example",
        occurredAt: "now",
        release: "r".repeat(15_000),
      }),
      new Date("2026-09-26T12:00:00Z"),
    );
    expect(out.name).toBe("Error [email]");
    expect(out.at).toBe("/share/abc");
    expect(out.occurredAt).toBe("2026-09-26T12:00:00.000Z");
    expect(out.release).toBeNull();
    expect(scrubEvent(clientEvent({ release: "jane@firm.example" })).release).toBeNull();
    expect(scrubEvent(clientEvent({ release: "a".repeat(40) })).release).toBe("a".repeat(40));
  });

  it("keeps a valid timestamp and a server event's fields", () => {
    const event = toErrorEvent(new Error("bad"), { where: "server", at: "server-fn" });
    expect(scrubEvent(event)).toEqual(event);
  });
});

describe("delivery", () => {
  const fetchMock = vi.fn();
  let consoleError: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.stubGlobal("fetch", fetchMock);
    vi.stubEnv("SENTRY_DSN", "");
    vi.stubEnv("ERROR_REPORT_URL", "https://hooks.example.test/errors");
    consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    fetchMock.mockReset();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    consoleError.mockRestore();
  });

  it("says so when the tracker refuses the event", async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 401 }));
    await forwardErrorEvent(clientEvent());
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(consoleError).toHaveBeenCalledWith(
      "[error] ERROR_REPORT_URL refused the event with HTTP 401",
    );
  });

  it("keeps a separate budget for server events when browser reports flood in", async () => {
    fetchMock.mockImplementation(async () => new Response(null, { status: 202 }));
    for (let i = 0; i < 40; i += 1) await forwardErrorEvent(clientEvent());
    const clientCalls = fetchMock.mock.calls.length;
    expect(clientCalls).toBeLessThan(40);
    expect(
      consoleError.mock.calls.some((args: unknown[]) => /dropping the rest/.test(String(args[0]))),
    ).toBe(true);
    await forwardErrorEvent(toErrorEvent(new Error("server"), { where: "server" }));
    expect(fetchMock.mock.calls.length).toBe(clientCalls + 1);
  });
});
