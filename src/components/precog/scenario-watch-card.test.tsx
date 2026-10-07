import { isValidElement, type ReactElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { getIndustryTemplate } from "@/lib/precog/templates";
import { scenarioUnfolding } from "@/lib/precog/scenario-unfolding";
import { dutiesOffTeam, UNANSWERED } from "@/lib/precog/onboarding/setup-answers";
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

  it("marks an unassessed linked knowledge item as not recorded", () => {
    const tpl = { ...getIndustryTemplate("dental"), relations: [] };
    const scenario = tpl.scenarios.find((item) => item.id === "sc-front-desk-leaves");
    if (!scenario) throw new Error("Missing dental departure scenario");
    const watch = scenarioWatch(tpl, scenario, [], new Set());
    const html = renderToStaticMarkup(
      ScenarioWatchCard({ scenario, unfolding: scenarioUnfolding(scenario.id)!, watch }),
    );

    expect(html).toContain(
      "Insurance denial appeals: who can run it alone isn&#x27;t recorded yet; mark it on Who knows what.",
    );
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

  describe("a scenario whose duty the setup answers place outside the team", () => {
    const dental = getIndustryTemplate("dental");
    const scenario = dental.scenarios.find((item) => item.id === "sc-payroll-ghost")!;
    const card = (watch: ReturnType<typeof scenarioWatch>) =>
      renderToStaticMarkup(
        ScenarioWatchCard({ scenario, unfolding: scenarioUnfolding(scenario.id)!, watch }),
      );
    // Payroll master and payment release are ticked, on two people; nobody enters payroll.
    const tpl = {
      ...dental,
      roleTemplates: {},
      people: [
        {
          id: "sue",
          name: "Sue Lam",
          role: "Owner",
          active: true,
          entitlements: ["edit_payroll_master" as const],
        },
        {
          id: "tom",
          name: "Tom Reyes",
          role: "Bookkeeper",
          active: true,
          entitlements: ["release_payment" as const],
        },
      ],
    };

    it("asks for a tick on enter payroll while the answers keep payroll in house", () => {
      const watch = scenarioWatch(tpl, scenario, [], new Set(), dutiesOffTeam(UNANSWERED));
      expect(watch.unassignedDuties).toEqual(["enter payroll"]);
      expect(watch.offTeamDuties).toEqual([]);
      expect(card(watch)).toContain(
        "Nobody on the team is ticked for enter payroll, so Precog cannot tell whether one person holds both duties this needs. Tick whoever does it on the Team tab.",
      );
    });

    it("says payroll is not run in house when the answers say payroll is none", () => {
      const off = dutiesOffTeam({ ...UNANSWERED, payroll: "none" });
      const watch = scenarioWatch(tpl, scenario, [], new Set(), off);
      expect(watch.unassignedDuties).toEqual([]);
      expect(watch.offTeamDuties).toEqual(["enter payroll"]);
      const html = card(watch);
      expect(html).not.toContain("Tick whoever");
      expect(html).not.toContain("ticked for enter payroll");
      expect(html).toContain(
        "Your setup answers place enter payroll outside the team, so nobody on the team holds both duties this needs.",
      );
    });
  });
});
