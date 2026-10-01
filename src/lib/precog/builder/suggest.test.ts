import { describe, expect, it } from "vitest";
import {
  padWithRules,
  suggestLocally,
  type SuggestionInput,
  type SuggestionResult,
} from "./suggest";

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

describe("padWithRules", () => {
  const grok: SuggestionResult = {
    source: "grok",
    model: "grok-4.5",
    risks: [
      {
        title: "Refunds issued without a receipt",
        kind: "fraud",
        severity: 4,
        likelihood: 3,
        note: "",
      },
      {
        title: "Cash skimmed before it is recorded",
        kind: "fraud",
        severity: 5,
        likelihood: 3,
        note: "",
      },
    ],
    ideas: [],
    controlIds: [],
    rationale: "Grok reviewed the process description.",
  };

  it("marks the rule risks it adds and keeps Grok's choice of no controls", () => {
    const local = suggestLocally({
      ...input("Cash deposits"),
      availableControls: [{ id: "c-cash", name: "Daily cash count" }],
    });
    expect(local.controlIds).toEqual(["c-cash"]);

    const padded = padWithRules(grok, local);
    expect(padded.source).toBe("grok");
    expect(padded.controlIds).toEqual([]);
    expect(padded.risks).toHaveLength(4);
    expect(padded.risks.slice(0, 2)).toEqual(grok.risks);
    expect(padded.risks.slice(2).every((r) => r.ruleBased)).toBe(true);
    // A rule risk Grok already named is not added twice.
    expect(
      padded.risks.filter((r) => r.title === "Cash skimmed before it is recorded"),
    ).toHaveLength(1);
    expect(grok.risks).toHaveLength(2);
  });
});
