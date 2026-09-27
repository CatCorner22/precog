import { describe, expect, it } from "vitest";
import { RequestError } from "@/lib/request-errors";
import { instantInput, inviteRoleInput, tokenInput } from "./server-inputs";

describe("firm server inputs", () => {
  it("keeps ISO engagement stamps and refuses anything else as a 400", () => {
    expect(instantInput(undefined)).toBeNull();
    expect(instantInput(null)).toBeNull();
    expect(instantInput("2026-09-26")).toBe("2026-09-26");
    expect(instantInput("2026-09-26T17:25:20.000Z")).toBe("2026-09-26T17:25:20.000Z");
    for (const bad of ["Invalid Date", "yesterday", "2026-02-30", "2026-09-26 junk", 42]) {
      expect(() => instantInput(bad)).toThrow(RequestError);
    }
  });

  it("accepts only invitation tokens and invite roles", () => {
    expect(tokenInput({ token: "a".repeat(48) })).toEqual({ token: "a".repeat(48) });
    expect(() => tokenInput({ token: "A".repeat(48) })).toThrow(RequestError);
    expect(inviteRoleInput("reviewer")).toBe("reviewer");
    expect(() => inviteRoleInput("owner")).toThrow(RequestError);
  });
});
