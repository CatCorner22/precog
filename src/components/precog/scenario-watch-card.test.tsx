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

  it("says a needed duty is ticked for nobody instead of saying nobody holds both", () => {
    const dental = getIndustryTemplate("dental");
    const scenario = dental.scenarios.find((item) => item.id === "sc-vendor-fraud")!;
    const tpl = {
      ...dental,
      roleTemplates: {},
      people: [
        {
          id: "tom",
          name: "Tom Reyes",
          role: "Bookkeeper",
          active: true,
          entitlements: ["release_payment", "enter_invoices"],
        },
      ],
    };
    const watch = scenarioWatch(tpl, scenario, [], new Set());
    expect(watch.unassignedDuties).toEqual(["set up suppliers"]);
    const html = renderToStaticMarkup(
      ScenarioWatchCard({ scenario, unfolding: scenarioUnfolding(scenario.id)!, watch }),
    );
    expect(html).not.toContain("Nobody on the team holds both duties this needs.");
    expect(html).toContain(
      "Nobody on the team is ticked for set up suppliers, so Precog cannot tell whether one person holds both duties this needs. Tick whoever does it on the Team tab.",
    );

    // With every needed duty ticked for someone and no open pair, the card says so.
    const split = scenarioWatch(
      {
        ...tpl,
        people: [
          ...tpl.people,
          {
            id: "sue",
            name: "Sue Lam",
            role: "Owner",
            active: true,
            entitlements: ["create_vendor"],
          },
        ],
      },
      scenario,
      [],
      new Set(),
    );
    expect(split.unassignedDuties).toEqual([]);
    expect(
      renderToStaticMarkup(
        ScenarioWatchCard({ scenario, unfolding: scenarioUnfolding(scenario.id)!, watch: split }),
      ),
    ).toContain("Nobody on the team holds both duties this needs.");
  });
});
