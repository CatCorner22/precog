import { isValidElement, type ReactElement, type ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { resolveTemplate } from "@/lib/precog/active-template";
import { defaultProfile } from "@/lib/precog/practice-profile";
import { buildStartHereModel } from "@/lib/precog/start-here/model";
import { doNextSteps, stepFocus } from "@/lib/precog/actions/do-next";
import { StartHereContinuitySection } from "./start-here-continuity-section";
import { FIRST_STEPS_SHOWN, stepDestination } from "@/lib/precog/start-here/layout";
import { StartHereFirstStepsSection } from "./start-here-first-steps-section";

// The tree walk below calls components as functions, outside React, so the
// wording hook is replaced with the Plain labels it would return.
vi.mock("@/lib/precog/presentation", async (importActual) => {
  const actual = await importActual<typeof import("@/lib/precog/presentation")>();
  const { tabLabel } = await import("@/lib/precog/navigation");
  return { ...actual, useTabName: () => (tab: Parameters<typeof tabLabel>[0]) => tabLabel(tab) };
});

function model() {
  const profile = defaultProfile("dental");
  return buildStartHereModel({
    profile,
    template: resolveTemplate(profile),
    today: new Date(2026, 8, 26),
  });
}

/** The first element in a static tree whose aria-label matches. */
function findByAriaLabel(
  node: ReactNode,
  pattern: RegExp,
): ReactElement<{ onClick: () => void }> | null {
  if (!isValidElement(node)) return null;
  const props = node.props as { "aria-label"?: string; children?: ReactNode; onClick?: () => void };
  if (props["aria-label"] && pattern.test(props["aria-label"])) {
    return node as ReactElement<{ onClick: () => void }>;
  }
  if (typeof node.type === "function") {
    return findByAriaLabel((node.type as (p: unknown) => ReactNode)(node.props), pattern);
  }
  for (const child of [props.children].flat()) {
    const hit = findByAriaLabel(child, pattern);
    if (hit) return hit;
  }
  return null;
}

describe("Start here, Do these first on one screen", () => {
  const steps = doNextSteps(model().firstSteps.items);

  it("numbers the top three and folds the rest", () => {
    expect(steps.length).toBeGreaterThan(FIRST_STEPS_SHOWN);
    const html = renderToStaticMarkup(
      <StartHereFirstStepsSection
        model={model().firstSteps}
        part="actions"
        onOpenDetail={() => {}}
      />,
    );
    for (const s of steps.slice(0, FIRST_STEPS_SHOWN)) expect(html).toContain(s.control.label);
    expect(html).toContain(`Show the other ${steps.length - FIRST_STEPS_SHOWN}`);
    expect(html).toMatch(/<details(?! open)[^>]*><summary[^>]*>Show the other/);
    expect(html).not.toContain("Give staff a way to report concerns");
    expect(html).not.toContain("on exactly one person.");
  });

  it("gives every step one button to the screen that fixes it", () => {
    const open = vi.fn();
    const built = model();
    const tree = (
      <StartHereFirstStepsSection model={built.firstSteps} part="actions" onOpenDetail={open} />
    );
    const first = steps[0];
    const landing = stepDestination(first, stepFocus(first, built.firstSteps.open));
    const button = findByAriaLabel(
      tree,
      new RegExp(`^${landing!.button.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}: `),
    );
    expect(button).not.toBeNull();
    button?.props.onClick();
    expect(open).toHaveBeenCalledWith(landing!.tab, landing!.item);
    expect(stepDestination({ answers: 2 })).toMatchObject({
      tab: "sod",
      button: "Open the conflicts it answers",
    });
    expect(
      stepDestination(
        { answers: 2 },
        {
          personId: "p2",
          personName: "Maya Chen",
          entitlementA: "cash_receipts",
          entitlementB: "bank_reconcile",
        },
      ),
    ).toEqual({
      tab: "team",
      item: "person~p2~cash_receipts~bank_reconcile",
      button: "Change Maya Chen's duties",
    });
    expect(stepDestination({ answers: 0 })).toBeNull();
  });

  it("gives a step that answers no finding no button, since no screen lists it", () => {
    const firstSteps = model().firstSteps;
    const quiet = { ...steps[0], answers: 0 };
    const html = renderToStaticMarkup(
      <StartHereFirstStepsSection
        model={{
          ...firstSteps,
          items: [{ kind: "step" as const, id: quiet.control.id, step: quiet }],
        }}
        part="actions"
        onOpenDetail={() => {}}
      />,
    );
    expect(html).toContain(quiet.control.label);
    expect(html).not.toContain("Open the conflicts it answers");
    expect(html).not.toMatch(/aria-label="Change /);
    expect(html).toContain('aria-label="Open Who knows what: Insurance denial appeals"');
  });

  it("has no button when nothing opens a screen, as the report renders it", () => {
    const html = renderToStaticMarkup(<StartHereFirstStepsSection model={model().firstSteps} />);
    expect(html).not.toContain("Open the conflicts it answers");
    expect(html).toContain("Give staff a way to report concerns");
  });

  it("keeps the notes under their own heading in the fold", () => {
    const html = renderToStaticMarkup(
      <StartHereFirstStepsSection model={model().firstSteps} part="notes" />,
    );
    expect(html).toContain("Also worth knowing");
    expect(html).not.toContain("Do these first");
  });
});

describe("Start here, continuity split into today and readiness", () => {
  it("renders nothing for today when nobody is out and nothing is pending", () => {
    const m = model().continuity;
    const quiet = { ...m, staffingToday: { ...m.staffingToday, headline: null } };
    expect(
      renderToStaticMarkup(
        <StartHereContinuitySection model={quiet} onOpenDetail={() => {}} part="today" />,
      ),
    ).toBe("");
  });

  it("renders the figures without the today card for readiness", () => {
    const m = model().continuity;
    const busy = { ...m, staffingToday: { ...m.staffingToday, headline: "Maya is out today." } };
    const html = renderToStaticMarkup(
      <StartHereContinuitySection model={busy} onOpenDetail={() => {}} part="readiness" />,
    );
    expect(html).toContain("Continuity readiness");
    expect(html).toContain("Can the business run if someone is out tomorrow?");
    expect(html).not.toContain("Maya is out today.");
    const today = renderToStaticMarkup(
      <StartHereContinuitySection model={busy} onOpenDetail={() => {}} part="today" />,
    );
    expect(today).toContain("Maya is out today.");
    expect(today).not.toContain("Continuity readiness");
  });
});
