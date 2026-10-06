import { describe, expect, it } from "vitest";
import { staleSubscriptionEvent } from "./billing-store";

const AT = "2026-09-01T10:00:00.000Z";
const LATER = "2026-09-01T10:00:01.000Z";
const EARLIER = "2026-09-01T09:59:59.000Z";

const stored = (status: string | null, eventAt: string | null = AT, subscriptionId = "sub_1") => ({
  subscriptionId,
  status,
  eventAt,
});
const incoming = (
  status: string | null,
  eventAt: string | null = AT,
  subscriptionId = "sub_1",
) => ({
  subscriptionId,
  status,
  eventAt,
});

describe("staleSubscriptionEvent", () => {
  it("skips an event created before the stored one, whatever its status", () => {
    expect(staleSubscriptionEvent(stored("incomplete"), incoming("active", EARLIER))).toBe(true);
    expect(staleSubscriptionEvent(stored("active"), incoming("canceled", EARLIER))).toBe(true);
  });

  it("applies an event created after the stored one, even to a lower status", () => {
    expect(staleSubscriptionEvent(stored("past_due"), incoming("active", LATER))).toBe(false);
    expect(staleSubscriptionEvent(stored("active"), incoming("incomplete", LATER))).toBe(false);
  });

  it("never moves the same subscription down the rank within one second", () => {
    expect(staleSubscriptionEvent(stored("active"), incoming("incomplete"))).toBe(true);
    expect(staleSubscriptionEvent(stored("trialing"), incoming("incomplete"))).toBe(true);
    expect(staleSubscriptionEvent(stored("past_due"), incoming("active"))).toBe(true);
    expect(staleSubscriptionEvent(stored("unpaid"), incoming("trialing"))).toBe(true);
    expect(staleSubscriptionEvent(stored("canceled"), incoming("active"))).toBe(true);
    expect(staleSubscriptionEvent(stored("canceled"), incoming("past_due"))).toBe(true);
    expect(staleSubscriptionEvent(stored("incomplete_expired"), incoming("incomplete"))).toBe(true);
  });

  it("applies a same-second event of the same or a higher rank", () => {
    expect(staleSubscriptionEvent(stored("incomplete"), incoming("active"))).toBe(false);
    expect(staleSubscriptionEvent(stored("active"), incoming("trialing"))).toBe(false);
    expect(staleSubscriptionEvent(stored("trialing"), incoming("active"))).toBe(false);
    expect(staleSubscriptionEvent(stored("active"), incoming("past_due"))).toBe(false);
    expect(staleSubscriptionEvent(stored("past_due"), incoming("unpaid"))).toBe(false);
    expect(staleSubscriptionEvent(stored("unpaid"), incoming("past_due"))).toBe(false);
    expect(staleSubscriptionEvent(stored("past_due"), incoming("canceled"))).toBe(false);
    expect(staleSubscriptionEvent(stored("active"), incoming("active"))).toBe(false);
  });

  it("ranks only the subscription's own events, and only statuses it knows", () => {
    // A new subscription in the second the old one ended starts its own life.
    expect(staleSubscriptionEvent(stored("canceled"), incoming("incomplete", AT, "sub_2"))).toBe(
      false,
    );
    expect(staleSubscriptionEvent(stored("active"), incoming("paused"))).toBe(false);
    expect(staleSubscriptionEvent(stored("paused"), incoming("incomplete"))).toBe(false);
  });

  it("skips no event when either time is unknown, or the event carries no status", () => {
    expect(staleSubscriptionEvent(stored("active", null), incoming("incomplete"))).toBe(false);
    expect(staleSubscriptionEvent(stored("active"), incoming("incomplete", null))).toBe(false);
    // A checkout completion keeps the stored status anyway.
    expect(staleSubscriptionEvent(stored("canceled"), incoming(null))).toBe(false);
  });
});
