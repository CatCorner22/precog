import { describe, expect, it } from "vitest";
import { parseScenarioItem, scenarioItem } from "./scenario-link";

describe("parseScenarioItem", () => {
  it.each([null, undefined, ""])("defaults %s to one scenario", (item) => {
    expect(parseScenarioItem(item)).toEqual({
      view: "single",
      scenarioId: null,
      failureTarget: null,
    });
  });

  it.each(["compare", "variables", "cascades", "failure"] as const)("opens the %s view", (item) => {
    expect(parseScenarioItem(item)).toEqual({
      view: item,
      scenarioId: null,
      failureTarget: null,
    });
  });

  it.each(["control:c-sod-ap", "safeguard:dual_release"])(
    "opens the failure view for %s",
    (target) => {
      expect(parseScenarioItem(`failure:${target}`)).toEqual({
        view: "failure",
        scenarioId: null,
        failureTarget: target,
      });
    },
  );

  it.each(["embezzlement", "failure:", "failure:control"])("treats %s as a scenario id", (item) => {
    expect(parseScenarioItem(item)).toEqual({
      view: "single",
      scenarioId: item,
      failureTarget: null,
    });
  });
});

describe("scenarioItem", () => {
  it.each([
    ["single", "embezzlement", null, "embezzlement"],
    ["single", null, null, undefined],
    ["compare", "embezzlement", null, "compare"],
    ["variables", "embezzlement", null, "variables"],
    ["cascades", "embezzlement", null, "cascades"],
    ["failure", "embezzlement", null, "failure"],
    ["failure", "embezzlement", "control:c-sod-ap", "failure:control:c-sod-ap"],
    ["failure", "embezzlement", "safeguard:dual_release", "failure:safeguard:dual_release"],
  ] as const)("encodes %s view", (view, scenarioId, failureTarget, expected) => {
    const item = scenarioItem(view, scenarioId, failureTarget);
    expect(item).toBe(expected);
    expect(parseScenarioItem(item)).toEqual({
      view,
      scenarioId: view === "single" ? scenarioId : null,
      failureTarget: view === "failure" ? (failureTarget ?? null) : null,
    });
  });
});
