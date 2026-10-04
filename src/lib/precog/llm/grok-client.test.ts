import { afterEach, describe, expect, it, vi } from "vitest";
import { grokChat } from "./grok-client.server";

describe("grokChat", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns text and model on success", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          choices: [{ message: { content: "  hello  " } }],
          model: "grok-test",
        }),
        { status: 200 },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      grokChat("test-key", {
        messages: [{ role: "user", content: "hi" }],
        maxTokens: 10,
        temperature: 0.2,
      }),
    ).resolves.toEqual({ text: "hello", model: "grok-test" });
  });

  it("returns null on non-2xx responses and logs the status without the key", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          new Response("Incorrect API key provided: xai-abc123secret", { status: 401 }),
        ),
    );

    await expect(
      grokChat("test-key", {
        messages: [{ role: "user", content: "hi" }],
        maxTokens: 10,
        temperature: 0.2,
      }),
    ).resolves.toBeNull();
    expect(log).toHaveBeenCalledTimes(1);
    expect(String(log.mock.calls[0][0])).toContain("401");
    expect(String(log.mock.calls[0][0])).not.toContain("abc123secret");
    log.mockRestore();
  });

  it("returns null when content is empty", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ choices: [{ message: { content: "  " } }] }), {
          status: 200,
        }),
      ),
    );

    await expect(
      grokChat("test-key", {
        messages: [{ role: "user", content: "hi" }],
        maxTokens: 10,
        temperature: 0.2,
      }),
    ).resolves.toBeNull();
  });

  it("returns null when fetch rejects and says whether it timed out", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const options = {
      messages: [{ role: "user" as const, content: "hi" }],
      maxTokens: 10,
      temperature: 0.2,
    };
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new DOMException("slow", "TimeoutError")));
    await expect(grokChat("test-key", options)).resolves.toBeNull();
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("fetch failed")));
    await expect(grokChat("test-key", options)).resolves.toBeNull();

    expect(String(log.mock.calls[0][0])).toMatch(/no answer within 20s/);
    expect(String(log.mock.calls[1][0])).toMatch(/TypeError: fetch failed/);
    log.mockRestore();
  });

  it("logs one usage line per call with tokens, feature, model and latency, never the prompt or key", async () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          choices: [{ message: { content: "answer" } }],
          model: "grok-test",
          usage: { prompt_tokens: 120, completion_tokens: 45, total_tokens: 165 },
        }),
        { status: 200 },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    await grokChat("xai-secretkey", {
      messages: [{ role: "user", content: "private owner text" }],
      maxTokens: 10,
      temperature: 0.2,
      feature: "review",
    });

    expect(info).toHaveBeenCalledTimes(1);
    const line = String(info.mock.calls[0][0]);
    expect(line.startsWith("[grok] usage ")).toBe(true);
    const parsed = JSON.parse(line.slice("[grok] usage ".length));
    expect(parsed).toMatchObject({
      feature: "review",
      model: "grok-test",
      promptTokens: 120,
      completionTokens: 45,
      totalTokens: 165,
      outcome: "ok",
    });
    expect(parsed.latencyMs).toBeGreaterThanOrEqual(0);
    expect(line).not.toContain("private owner text");
    expect(line).not.toContain("secretkey");
    // The feature label stays local; the request body carries no extra field.
    const init = fetchMock.mock.calls[0][1] as RequestInit;
    expect(JSON.parse(String(init.body))).not.toHaveProperty("feature");
    info.mockRestore();
  });

  it("logs the failure outcome with null tokens when the call fails", async () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const options = {
      messages: [{ role: "user" as const, content: "hi" }],
      maxTokens: 10,
      temperature: 0.2,
    };
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("busy", { status: 503 })));
    await grokChat("test-key", options);
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new DOMException("slow", "TimeoutError")));
    await grokChat("test-key", options);
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ choices: [{ message: { content: "" } }] }), {
          status: 200,
        }),
      ),
    );
    await grokChat("test-key", options);

    const lines = info.mock.calls.map((call) =>
      JSON.parse(String(call[0]).slice("[grok] usage ".length)),
    );
    expect(lines.map((l) => l.outcome)).toEqual(["http_503", "timeout", "empty"]);
    for (const l of lines) {
      expect(l).toMatchObject({ feature: "unknown", promptTokens: null, totalTokens: null });
    }
    info.mockRestore();
    error.mockRestore();
  });

  it("hands onUsage the same line it logs, on success and on failure", async () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const onUsage = vi.fn();
    const options = {
      messages: [{ role: "user" as const, content: "hi" }],
      maxTokens: 10,
      temperature: 0.2,
      feature: "coach",
      onUsage,
    };
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          choices: [{ message: { content: "answer" } }],
          model: "grok-test",
          usage: { prompt_tokens: 12, completion_tokens: 4, total_tokens: 16 },
        }),
        { status: 200 },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);
    await grokChat("test-key", options);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("busy", { status: 503 })));
    await grokChat("test-key", options);

    const logged = info.mock.calls.map((call) =>
      JSON.parse(String(call[0]).slice("[grok] usage ".length)),
    );
    expect(onUsage.mock.calls.map((c) => c[0])).toEqual(logged);
    expect(onUsage.mock.calls[0][0]).toMatchObject({
      feature: "coach",
      model: "grok-test",
      promptTokens: 12,
      completionTokens: 4,
      outcome: "ok",
    });
    expect(onUsage.mock.calls[1][0]).toMatchObject({ outcome: "http_503", promptTokens: null });
    // The callback stays local: the request body carries no extra field.
    const init = fetchMock.mock.calls[0][1] as RequestInit;
    expect(JSON.parse(String(init.body))).not.toHaveProperty("onUsage");
    info.mockRestore();
    error.mockRestore();
  });

  it("keeps its answer when onUsage throws", async () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ choices: [{ message: { content: "fine" } }] }), {
          status: 200,
        }),
      ),
    );
    await expect(
      grokChat("test-key", {
        messages: [{ role: "user", content: "hi" }],
        maxTokens: 10,
        temperature: 0.2,
        onUsage: () => {
          throw new Error("recorder down");
        },
      }),
    ).resolves.toMatchObject({ text: "fine" });
    info.mockRestore();
  });

  it("only sends response_format for JSON requests", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ choices: [{ message: { content: "ok" } }] }), {
        status: 200,
      }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const options = {
      messages: [{ role: "user" as const, content: "hi" }],
      maxTokens: 10,
      temperature: 0.2,
    };

    await grokChat("test-key", options);
    const firstInit = fetchMock.mock.calls[0][1] as RequestInit;
    expect(JSON.parse(String(firstInit.body))).not.toHaveProperty("response_format");
    await grokChat("test-key", { ...options, jsonObject: true });
    const secondInit = fetchMock.mock.calls[1][1] as RequestInit;
    expect(JSON.parse(String(secondInit.body))).toMatchObject({
      response_format: { type: "json_object" },
    });
  });
});
