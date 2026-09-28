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
  });
});
