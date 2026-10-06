import { isValidElement, type ReactElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { getIndustryTemplate } from "@/lib/precog/templates";
import { scenarioUnfolding } from "@/lib/precog/scenario-unfolding";
import { scenarioWatch } from "./scenario-page";
import { ScenarioWatchCard } from "./scenario-watch-card";

function findButton(node: ReactNode, label: string): ReactElement<{ onClick: () => void }> | null {
  if (Array.isArray(node)) {
    for (const child of node) {
      const found = findButton(child, label);
      if (found) return found;
    }
    return null;
  }
  if (
    !isValidElement<{ "aria-label"?: string; children?: ReactNode; onClick?: () => void }>(node)
  ) {
    return null;
  }
  if (node.props["aria-label"] === label) {
    return node as ReactElement<{ onClick: () => void }>;
  }
  return findButton(node.props.children, label);
}

describe("ScenarioWatchCard", () => {
  it("shows the unfolding, warning signs, and opens the scenario control failure report", () => {
    const tpl = getIndustryTemplate("dental");
    const scenario = tpl.scenarios.find((item) => item.id === "sc-vendor-fraud")!;
    const unfolding = scenarioUnfolding(scenario.id)!;
    const watch = scenarioWatch(tpl, scenario, [], new Set());
    const onOpenFailure = vi.fn();
    const tree = ScenarioWatchCard({ scenario, unfolding, watch, onOpenFailure });
    const html = renderToStaticMarkup(tree);
    const control = tpl.controls.find((item) => item.id === "c-sod-ap")!;
    const buttonLabel = `What if “${control.name}” fails?`;

    expect(html).toContain("What could go wrong");
    expect(html).toContain("How it unfolds");
    expect(html).toContain(unfolding.steps[0]);
    expect(html).toContain("Warning signs");
    expect(html).toContain(unfolding.warningSigns[0]);

    const button = findButton(tree, buttonLabel);
    expect(button).not.toBeNull();
    button?.props.onClick();
    expect(onOpenFailure).toHaveBeenCalledWith("control:c-sod-ap");
  });
});
