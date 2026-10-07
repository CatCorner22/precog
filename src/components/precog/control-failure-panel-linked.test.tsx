import { isValidElement, type ReactElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { resolveTemplate } from "@/lib/precog/active-template";
import { localDateKey } from "@/lib/precog/dates";
import { defaultProfile, type PracticeProfile } from "@/lib/precog/practice-profile";
import type { FailureTarget } from "@/lib/precog/scoring/control-failure";
import { confirmedScenarioIds } from "@/lib/precog/scoring/scope";
import { createHookRuntime, type HookRuntime } from "@/test/hook-runtime";
import { evaluateControlFailure } from "@/lib/precog/scoring/control-failure";
import { ControlFailurePanel } from "./control-failure-panel";

const state = vi.hoisted(() => ({
  profile: null as unknown,
  template: null as unknown,
  runtime: null as HookRuntime | null,
}));
vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react")>();
  return {
    ...actual,
    useState: (initial: unknown) =>
      state.runtime?.active ? state.runtime.useState(initial) : actual.useState(initial),
    useMemo: (factory: () => unknown, deps: readonly unknown[]) =>
      state.runtime?.active ? factory() : actual.useMemo(factory, deps),
    useEffect: (effect: () => void | (() => void), deps?: readonly unknown[]) =>
      state.runtime?.active
        ? state.runtime.useEffect(effect, deps)
        : actual.useEffect(effect, deps),
  };
});
vi.mock("@/lib/precog/practice-context", () => ({
  usePractice: () => ({
    profile: state.profile as PracticeProfile,
    template: state.template as ReturnType<typeof resolveTemplate>,
  }),
}));

const runtime = createHookRuntime();
state.runtime = runtime;
const escape = (text: string) => text.replaceAll("'", "&#x27;");

function expectedHeadline(profile: PracticeProfile, target: FailureTarget) {
  return evaluateControlFailure(resolveTemplate(profile), target, {
    staff: profile.staff,
    riskVariables: profile.riskVariables,
    dualRelease: profile.dualRelease,
    today: localDateKey(new Date()),
    confirmedScenarioIds: confirmedScenarioIds(profile.decisions, profile.industry),
  }).headline;
}

function elementOfType<T extends ReactElement>(node: ReactNode, type: string): T | undefined {
  if (Array.isArray(node)) {
    for (const child of node) {
      const found = elementOfType<T>(child, type);
      if (found) return found;
    }
    return undefined;
  }
  if (!isValidElement<{ children?: ReactNode }>(node)) return undefined;
  if (node.type === type) return node as T;
  return elementOfType<T>(node.props.children, type);
}

beforeEach(() => {
  // The panel scrolls its picker into view after render; node has no frame.
  vi.stubGlobal("requestAnimationFrame", () => 0);
  vi.stubGlobal("cancelAnimationFrame", () => {});
  const profile = defaultProfile("dental");
  state.profile = profile;
  state.template = resolveTemplate(profile);
  runtime.reset();
});

describe("linked control-failure targets", () => {
  it("follows a changed initial target without remounting", async () => {
    const profile = state.profile as PracticeProfile;
    const initialTarget: FailureTarget = { kind: "safeguard", id: "dual_release" };
    const nextTarget: FailureTarget = { kind: "control", id: "c-sod-cash" };
    const first = await runtime.settle(() =>
      ControlFailurePanel({ initialTarget: "safeguard:dual_release" }),
    );
    const firstHtml = renderToStaticMarkup(first);
    const next = await runtime.settle(() =>
      ControlFailurePanel({ initialTarget: "control:c-sod-cash" }),
    );
    const nextHtml = renderToStaticMarkup(next);

    expect(firstHtml).toContain(escape(expectedHeadline(profile, initialTarget)));
    expect(firstHtml).toContain('value="safeguard:dual_release" selected=""');
    expect(nextHtml).toContain(escape(expectedHeadline(profile, nextTarget)));
    expect(nextHtml).toContain('value="control:c-sod-cash" selected=""');
  });

  it("notifies the runner when the picker changes", async () => {
    const onTargetChange = vi.fn();
    const tree = await runtime.settle(() =>
      ControlFailurePanel({ initialTarget: "safeguard:dual_release", onTargetChange }),
    );
    const select = elementOfType<
      ReactElement<{
        onChange: (event: { target: { value: string } }) => void;
      }>
    >(tree, "select");

    select?.props.onChange({ target: { value: "control:c-sod-cash" } });

    expect(onTargetChange).toHaveBeenCalledWith("control:c-sod-cash");
  });
});
