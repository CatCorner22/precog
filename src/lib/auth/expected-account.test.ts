import { describe, expect, it } from "vitest";
import { assertExpectedAccount } from "./expected-account";
describe("expected account is a constraint, not a credential", () => {
  it("allows only the exact verified session account", () => {
    expect(() => assertExpectedAccount("A", "A")).not.toThrow();
    for (const value of ["B", "a", " A ", "", null, undefined, {}, 1]) {
      try {
        assertExpectedAccount(value, "A");
        throw new Error("unexpected permission");
      } catch (error) {
        expect(error).toMatchObject({ status: 409 });
      }
    }
  });
});
