import { describe, expect, it } from "vitest";
import { ILLUSTRATIVE_LABEL } from "./scenario-level";

describe("ILLUSTRATIVE_LABEL", () => {
  it("says the scenario figures are examples and not the owner's own books", () => {
    expect(ILLUSTRATIVE_LABEL).toBe("Example figures, not from your books");
  });
});
