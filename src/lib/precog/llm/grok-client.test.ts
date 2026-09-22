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

  it("returns null on non-2xx responses", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("no", { status: 503 })));

    await expect(
      grokChat("test-key", {
        messages: [{ role: "user", content: "hi" }],
        maxTokens: 10,
        temperature: 0.2,
      }),
    ).resolves.toBeNull();
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

  it("returns null when fetch rejects", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new DOMException("aborted", "AbortError")));

    await expect(
      grokChat("test-key", {
        messages: [{ role: "user", content: "hi" }],
        maxTokens: 10,
        temperature: 0.2,
      }),
    ).resolves.toBeNull();
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
