import { describe, expect, it } from "vitest";
import { SlidingWindowLimiter } from "../llm/rate-limit";
import { EMAIL_LINK_OPENS_PER_MINUTE, takeEmailLinkAllowance } from "./email-link-limits";

describe("emailed-link allowance", () => {
  it("refuses an address past its opens a minute, and only that address", () => {
    let now = 0;
    const limiter = new SlidingWindowLimiter(
      { limit: EMAIL_LINK_OPENS_PER_MINUTE, windowMs: 60_000 },
      () => now,
    );
    for (let i = 0; i < EMAIL_LINK_OPENS_PER_MINUTE; i++) {
      expect(takeEmailLinkAllowance("10.0.0.1", limiter)).toBe(true);
    }
    expect(takeEmailLinkAllowance("10.0.0.1", limiter)).toBe(false);
    expect(takeEmailLinkAllowance("10.0.0.2", limiter)).toBe(true);
    now = 61_000;
    expect(takeEmailLinkAllowance("10.0.0.1", limiter)).toBe(true);
  });
});
