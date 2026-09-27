import { describe, expect, it } from "vitest";
import { suggestLocally, type SuggestionInput } from "./suggest";

function input(processName: string, description = ""): SuggestionInput {
  return {
    processName,
    description,
    industryLabel: "Dental",
    existingRiskTitles: [],
    existingIdeaTitles: [],
    availableControls: [],
    ownerRoles: [],
  };
}

const riskTitles = (processName: string, description = "") =>
  suggestLocally(input(processName, description)).risks.map((r) => r.title);

describe("suggestLocally", () => {
  it("does not match pattern words inside ordinary words", () => {
    const result = suggestLocally(
      input(
        "Staff safety training",
        "Until the manager completes the checklist, multiple staff attend",
      ),
    );
    expect(result.rationale).toMatch(/^No specific pattern matched/);
    expect(result.risks.map((r) => r.title)).toEqual([
      "Only one person knows how this runs",
      "No independent review of this process",
    ]);
  });

  it("still matches whole words", () => {
    expect(riskTitles("Cash drawer close")).toContain("Cash skimmed before it is recorded");
    expect(riskTitles("Inventory counts")).toContain("Shrink absorbed as an inventory adjustment");
  });

  it("reads 'account' as no count and 'recorder' as no order", () => {
    expect(riskTitles("Account setup", "Recorder keeps the setup notes")).toEqual([
      "Only one person knows how this runs",
      "No independent review of this process",
    ]);
  });
});
