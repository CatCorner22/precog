import { describe, expect, it } from "vitest";
import { pluralTeamLabel } from "./industry-copy";

describe("pluralTeamLabel", () => {
  it("says businesses, not businesss, for a general small business", () => {
    expect(pluralTeamLabel("general")).toBe("businesses");
  });

  it("adds a plain s for the other industries", () => {
    expect(pluralTeamLabel("dental")).toBe("practices");
    expect(pluralTeamLabel("retail")).toBe("stores");
    expect(pluralTeamLabel("restaurant")).toBe("restaurants");
    expect(pluralTeamLabel("professional_services")).toBe("firms");
  });
});
