import { describe, expect, it } from "vitest";
import { SlidingWindowLimiter } from "../llm/rate-limit";
import { INVITE_PEEKS_PER_MINUTE, takeInvitePeekAllowance } from "../firm/server";
import { SHARE_VIEWS_PER_MINUTE, takeShareViewAllowance } from "./share-server";

describe("share view allowance", () => {
  it("refuses an address past its opens a minute, and only that address", () => {
    let now = 0;
    const limiter = new SlidingWindowLimiter(
      { limit: SHARE_VIEWS_PER_MINUTE, windowMs: 60_000 },
      () => now,
    );
    for (let i = 0; i < SHARE_VIEWS_PER_MINUTE; i++) takeShareViewAllowance("10.0.0.1", limiter);
    expect(() => takeShareViewAllowance("10.0.0.1", limiter)).toThrow(
      expect.objectContaining({ status: 429 }),
    );
    expect(() => takeShareViewAllowance("10.0.0.2", limiter)).not.toThrow();
    now = 61_000;
    expect(() => takeShareViewAllowance("10.0.0.1", limiter)).not.toThrow();
  });
});

describe("invitation peek allowance", () => {
  it("refuses an address past its peeks a minute, and only that address", () => {
    let now = 0;
    const limiter = new SlidingWindowLimiter(
      { limit: INVITE_PEEKS_PER_MINUTE, windowMs: 60_000 },
      () => now,
    );
    for (let i = 0; i < INVITE_PEEKS_PER_MINUTE; i++) takeInvitePeekAllowance("10.0.0.1", limiter);
    expect(() => takeInvitePeekAllowance("10.0.0.1", limiter)).toThrow(
      expect.objectContaining({ status: 429 }),
    );
    expect(() => takeInvitePeekAllowance("10.0.0.2", limiter)).not.toThrow();
    now = 61_000;
    expect(() => takeInvitePeekAllowance("10.0.0.1", limiter)).not.toThrow();
  });
});
