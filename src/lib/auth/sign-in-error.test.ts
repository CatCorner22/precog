import { describe, expect, it } from "vitest";
import { signInErrorMessage } from "./sign-in-error";

describe("signInErrorMessage", () => {
  it("tells the visitor to allow pop-ups when the sign-in window was blocked", () => {
    expect(signInErrorMessage(new Error("Pop-up blocked — allow pop-ups for sign-in"))).toMatch(
      /Allow pop-ups/,
    );
  });

  it("names a cancelled pop-up as cancelled", () => {
    expect(signInErrorMessage(new Error("Sign-in was cancelled or failed"))).toBe(
      "Sign-in was cancelled or did not finish. Try again.",
    );
  });

  it("carries the broker's own message", () => {
    expect(signInErrorMessage(new Error("broker down"))).toBe(
      "Sign-in failed (broker down). Try again in a moment.",
    );
  });

  it("still says something when the rejection is not an Error", () => {
    expect(signInErrorMessage(undefined)).toBe("Sign-in failed. Try again in a moment.");
    expect(signInErrorMessage(new Error("  "))).toBe("Sign-in failed. Try again in a moment.");
  });
});
