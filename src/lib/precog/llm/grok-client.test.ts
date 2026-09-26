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
