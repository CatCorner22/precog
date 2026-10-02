import { describe, expect, it } from "vitest";
import { isStaleDeployError } from "./stale-deploy";

describe("isStaleDeployError", () => {
  it("reads the server's answer to an unknown server function as a new release", () => {
    expect(isStaleDeployError(new Error("Not found"))).toBe(true);
    expect(isStaleDeployError(new Error("Not found\n"))).toBe(true);
  });

  it("reads a chunk the new release renamed as a new release, in each browser's words", () => {
    expect(
      isStaleDeployError(
        new TypeError("Failed to fetch dynamically imported module: https://x.test/a.js"),
      ),
    ).toBe(true);
    expect(isStaleDeployError(new TypeError("Importing a module script failed."))).toBe(true);
    expect(
      isStaleDeployError(new TypeError("error loading dynamically imported module: /a.js")),
    ).toBe(true);
  });

  it("leaves every other failure an ordinary save error", () => {
    expect(isStaleDeployError(new Error("Failed to fetch"))).toBe(false);
    expect(isStaleDeployError(new Error("Business not found"))).toBe(false);
    expect(isStaleDeployError(new Error("Not found: biz_a"))).toBe(false);
    expect(isStaleDeployError(new Error("Your account holds 50 businesses"))).toBe(false);
    expect(isStaleDeployError("Not found")).toBe(false);
    expect(isStaleDeployError({ message: "Not found" })).toBe(false);
    expect(isStaleDeployError(null)).toBe(false);
  });
});
