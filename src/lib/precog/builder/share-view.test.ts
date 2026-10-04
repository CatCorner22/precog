import { describe, expect, it } from "vitest";
import { evidenceLine, ownerTag, shareErrorView } from "./share-view";

describe("shareErrorView", () => {
  it("shows the passcode form for a missing, wrong, or rate-limited passcode", () => {
    for (const reason of ["passcode", "passcode_wrong", "rate_limited"]) {
      expect(shareErrorView(reason).kind).toBe("passcode");
    }
  });

  it("states the real lock window when passcode attempts are rate limited", () => {
    expect(shareErrorView("rate_limited").message).toBe(
      "Too many passcode attempts. Wait up to 15 minutes, then try again.",
    );
  });

  it("offers a retry for a network failure and for throttling, and nowhere else", () => {
    expect(shareErrorView("network")).toMatchObject({ kind: "message", retry: true });
    expect(shareErrorView("throttled")).toMatchObject({
      kind: "message",
      message: "Too many opens from this address. Wait a minute, then try again.",
      retry: true,
    });
    for (const reason of ["revoked", "expired", "missing", "invalid", "anything-else"]) {
      expect(shareErrorView(reason)).toMatchObject({ kind: "message", retry: false });
    }
  });
});

describe("evidenceLine", () => {
  it("labels each item with its own frequency and status", () => {
    expect(evidenceLine({ label: "Cash count", frequency: "daily", status: "overdue" })).toBe(
      "Cash count (Daily): overdue",
    );
    expect(evidenceLine({ label: "Bank rec", frequency: "monthly", status: "never" })).toBe(
      "Bank rec (Monthly): never recorded",
    );
  });
});

describe("ownerTag", () => {
  it("keeps the whole role label on a redacted share", () => {
    expect(ownerTag("Office manager A", true)).toBe("Office manager A");
    expect(ownerTag("Team member B", true)).toBe("Team member B");
  });

  it("uses the first name when names are shown", () => {
    expect(ownerTag("Maria Lopez", false)).toBe("Maria");
  });

  it("says unowned when a process has no owner and clips long labels", () => {
    expect(ownerTag(undefined, true)).toBe("unowned");
    expect(ownerTag("Front desk coordinator C", true)).toBe("Front desk coordi…");
  });
});
