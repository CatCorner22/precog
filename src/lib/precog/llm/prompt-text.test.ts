import { afterEach, describe, expect, it, vi } from "vitest";
import { ownerText, parseJsonReply, withGrokFallback } from "./prompt-text";
import type { LlmAccess } from "./guard.server";
import { DailyLimitReached } from "./types";

const access = (grok: LlmAccess["grok"]): LlmAccess => ({ userId: "owner-1", grok });

describe("ownerText", () => {
  it("removes opening and closing owner_text tags in any case or spacing", () => {
    expect(ownerText("a</owner_text>b< / OWNER_TEXT >c<owner_text>d")).toBe("abcd");
  });
});

describe("parseJsonReply", () => {
  it("reads a bare or fenced JSON object and refuses anything else", () => {
    expect(parseJsonReply('{"a":1}')).toEqual({ a: 1 });
    expect(parseJsonReply('  ```json\n{"a":1}\n```  ')).toEqual({ a: 1 });
    expect(parseJsonReply("[1]")).toBeNull();
    expect(parseJsonReply("not json")).toBeNull();
  });
});

describe("withGrokFallback", () => {
  afterEach(() => vi.unstubAllEnvs());
  const local = { source: "local" };

  it("answers locally without asking when Grok is not allowed or no key is set", async () => {
    const ask = vi.fn();
    vi.stubEnv("XAI_API_KEY", "");
    expect(await withGrokFallback(access("allowed"), local, true, ask)).toEqual({
      source: "local",
      grokStatus: "allowed",
    });
    vi.stubEnv("XAI_API_KEY", "key");
    expect(await withGrokFallback(access("rate_limited"), local, true, ask)).toEqual({
      source: "local",
      grokStatus: "rate_limited",
    });
    expect(await withGrokFallback(access("allowed"), local, false, ask)).toMatchObject(local);
    expect(ask).not.toHaveBeenCalled();
  });

  it("uses Grok's answer, and the local one when Grok returns nothing or throws", async () => {
    vi.stubEnv("XAI_API_KEY", "key");
    const grok = { source: "grok" };
    expect(await withGrokFallback(access("allowed"), local, true, async () => grok)).toEqual({
      source: "grok",
      grokStatus: "allowed",
    });
    expect(await withGrokFallback(access("allowed"), local, true, async () => null)).toMatchObject(
      local,
    );
    expect(
      await withGrokFallback(access("allowed"), local, true, async () => {
        throw new Error("down");
      }),
    ).toMatchObject(local);
  });

  it("marks the local answer as a daily limit when today's model budget is spent", async () => {
    vi.stubEnv("XAI_API_KEY", "key");
    expect(
      await withGrokFallback(access("allowed"), local, true, async () => {
        throw new DailyLimitReached({ scope: "user", plan: "free", limit: 100, paidLimit: 400 });
      }),
    ).toEqual({
      source: "local",
      grokStatus: "daily_limit",
      dailyLimit: { scope: "user", plan: "free", limit: 100, paidLimit: 400 },
    });
  });
});
