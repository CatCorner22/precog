import { describe, expect, it } from "vitest";
import { ruleBasedReason } from "./grok-status";

describe("ruleBasedReason", () => {
  it("says nothing when Grok answered", () => {
    expect(ruleBasedReason("grok", "allowed")).toBeNull();
  });

  it("tells the owner why the built-in rules answered", () => {
    expect(ruleBasedReason("local", "rate_limited")).toMatch(/limit/);
    expect(ruleBasedReason("local", "unauthenticated")).toMatch(/Sign in/);
    expect(ruleBasedReason("local", "no_api_key")).toMatch(/no AI suggestions set up/);
    expect(ruleBasedReason("local", "allowed")).toMatch(/did not answer/);
    expect(ruleBasedReason("local", "daily_limit")).toBe(
      "Precog has reached today's AI limit, so these come from built-in rules. Try again tomorrow.",
    );
  });

  it("names the plan and the figures in force when today's AI limit is the reason", () => {
    const free = { scope: "user" as const, plan: "free" as const, limit: 100, paidLimit: 400 };
    expect(ruleBasedReason("local", "daily_limit", free)).toBe(
      "Precog has reached today's AI limit for the free plan (100 calls), so these come from built-in rules. Try again tomorrow, or start the Firm plan for 400 a day.",
    );
    expect(ruleBasedReason("local", "daily_limit", { ...free, paidLimit: 600 })).toBe(
      "Precog has reached today's AI limit for the free plan (100 calls), so these come from built-in rules. Try again tomorrow, or start the Firm plan for 600 a day.",
    );
    expect(ruleBasedReason("local", "daily_limit", { ...free, plan: "paid", limit: 400 })).toBe(
      "Precog has reached today's AI limit for your plan (400 calls), so these come from built-in rules. Try again tomorrow.",
    );
    expect(ruleBasedReason("local", "daily_limit", { ...free, scope: "global" })).toBe(
      "Precog has reached its AI limit for today across every account, so these come from built-in rules. Try again tomorrow.",
    );
    // Grok answered: no reason, whatever the detail says.
    expect(ruleBasedReason("grok", "allowed", free)).toBeNull();
  });
});
