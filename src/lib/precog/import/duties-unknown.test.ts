import { describe, expect, it } from "vitest";
import { dutiesUnknown } from "./people-csv";

describe("dutiesUnknown", () => {
  const roleTemplates = { "Front desk": ["post_payments"], Observer: [] as string[] };

  it("is false when the person, their role here, or the shared role list gives duties", () => {
    expect(
      dutiesUnknown({ role: "Mystery", entitlements: ["bank_reconcile"] }, roleTemplates),
    ).toBe(false);
    expect(dutiesUnknown({ role: "Front desk" }, roleTemplates)).toBe(false);
    // A role mapped to no duties is still a known role.
    expect(dutiesUnknown({ role: "Observer" }, roleTemplates)).toBe(false);
  });

  it("is true for an unknown title with no duties of its own", () => {
    expect(dutiesUnknown({ role: "Mystery" }, roleTemplates)).toBe(true);
    expect(dutiesUnknown({ role: "Mystery", entitlements: [] }, roleTemplates)).toBe(true);
  });
});
