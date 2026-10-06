import { isValidElement, type ReactElement, type ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { resolveTemplate } from "@/lib/precog/active-template";
import { defaultProfile, type PracticeProfile } from "@/lib/precog/practice-profile";
import type { IndustryTemplate } from "@/lib/precog/templates";
import { SodControlsSection } from "./sod-controls-section";

const state = vi.hoisted(() => ({
  profile: null as unknown,
  template: null as unknown,
  addDecision: vi.fn(),
}));
vi.mock("@/lib/precog/practice-context", () => ({
  usePractice: () => ({
    profile: state.profile as PracticeProfile,
    addDecision: state.addDecision,
  }),
  useTemplate: () => state.template as IndustryTemplate,
}));
vi.mock("@/lib/precog/presentation", () => ({
  useTabName: () => (tab: string) => tab,
}));

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

beforeEach(() => {
  const profile = defaultProfile("dental");
  state.profile = profile;
  state.template = resolveTemplate(profile);
  state.addDecision.mockReset();
});

describe("control-failure links from the Controls view", () => {
  it("opens the selected control's failure report", () => {
    const profile = state.profile as PracticeProfile;
    const control = resolveTemplate(profile).controls.find((item) => item.id === "c-sod-ap")!;
    const onNavigate = vi.fn();
    const tree = SodControlsSection({ onNavigate });
    const button = findButton(tree, `What if ${control.name} fails?`);

    expect(button).not.toBeNull();
    button?.props.onClick();

    expect(onNavigate).toHaveBeenCalledWith("precog", `failure:control:${control.id}`);
  });
});
