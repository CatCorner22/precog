import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createHookRuntime, type HookRuntime } from "@/test/hook-runtime";
import { defaultProfile, type PracticeProfile } from "@/lib/precog/practice-profile";
import { resolveTemplate } from "@/lib/precog/active-template";
import { REGISTER_ITEM_PAGE } from "@/lib/precog/continuity/register-window";
import { useContinuityPlanner } from "./use-continuity-planner";
import { ContinuityPlanner } from "../continuity-planner";

const state = vi.hoisted(() => ({
  runtime: null as HookRuntime | null,
  profile: null as PracticeProfile | null,
}));
vi.mock("react", async (original) => ({
  ...(await original<typeof import("react")>()),
  useState: <T>(value: T | (() => T)) => state.runtime!.useState(value),
  useEffect: (fn: () => void, deps?: readonly unknown[]) => state.runtime!.useEffect(fn, deps),
  useMemo: <T>(fn: () => T) => fn(),
}));
vi.mock("@/lib/precog/practice-context", () => ({
  usePracticeState: () => ({
    profile: state.profile,
    template: resolveTemplate(state.profile!),
  }),
  usePracticeActions: () => ({}),
}));
vi.mock("@/lib/use-today", () => ({ useToday: () => new Date(2026, 9, 10) }));
vi.mock("@/lib/precog/presentation", () => ({ useTabName: () => (tab: string) => tab }));

beforeEach(() => {
  state.runtime?.reset();
  state.runtime = createHookRuntime();
  state.profile = {
    ...defaultProfile("dental"),
    customPeople: [{ id: "person", name: "Kim", role: "Office Manager", active: true }],
    customKnowledge: Array.from({ length: REGISTER_ITEM_PAGE + 2 }, (_, i) => ({
      id: `task-${i}`,
      name: `Task ${i}`,
      kind: "duty",
      criticality: "important",
      category: "process",
      description: "",
      linkedProcessIds: [],
      documented: false,
    })),
    customRelations: [],
  };
});
afterEach(() => {
  state.runtime?.reset();
  vi.unstubAllGlobals();
});

describe("register task deep links", () => {
  it("opens the target task's register page on the first render", () => {
    const target = `task-${REGISTER_ITEM_PAGE + 1}`;
    const planner = state.runtime!.render(() => useContinuityPlanner(target));
    expect(planner.register.selected?.item.id).toBe(target);
    expect(planner.register.itemPage).toBe(1);
    expect(planner.register.visibleItems.map((row) => row.item.id)).toContain(target);
  });

  it("updates selection and page when a later link names another task on the same tab", async () => {
    state.runtime!.render(() => useContinuityPlanner("task-0"));
    const target = `task-${REGISTER_ITEM_PAGE}`;
    const planner = await state.runtime!.settle(() => useContinuityPlanner(target));
    expect(planner.register.selected?.item.id).toBe(target);
    expect(planner.register.itemPage).toBe(1);
    expect(planner.register.visibleItems.map((row) => row.item.id)).toContain(target);
  });

  it("does not reset a manually chosen page for a section or unknown task link", async () => {
    const first = state.runtime!.render(() => useContinuityPlanner("task-0"));
    first.register.setItemPage(1);
    const section = await state.runtime!.settle(() => useContinuityPlanner("absences"));
    expect(section.register.itemPage).toBe(1);
    expect(section.register.selected?.item.id).toBe("task-0");
    const unknown = await state.runtime!.settle(() => useContinuityPlanner("missing-task"));
    expect(unknown.register.itemPage).toBe(1);
    expect(unknown.register.selected?.item.id).toBe("task-0");
  });
});

describe("planner destination visibility and focus", () => {
  function destination() {
    const element = { scrollIntoView: vi.fn(), focus: vi.fn() };
    const lookup = vi.fn(() => element);
    vi.stubGlobal("document", { getElementById: lookup });
    vi.stubGlobal("requestAnimationFrame", (fn: () => void) => {
      fn();
      return 1;
    });
    vi.stubGlobal("cancelAnimationFrame", vi.fn());
    return { element, lookup };
  }

  it("reveals and focuses the selected task detail", async () => {
    const { element, lookup } = destination();
    await state.runtime!.settle(() =>
      ContinuityPlanner({
        initialKnowledgeId: `task-${REGISTER_ITEM_PAGE}`,
      }),
    );
    expect(lookup).toHaveBeenCalledWith("selected-knowledge");
    expect(element.scrollIntoView).toHaveBeenCalledWith({ block: "start" });
    expect(element.focus).toHaveBeenCalledWith({ preventScroll: true });
  });

  it.each(["absences", "leaving"])("keeps the %s section reveal and focus", async (id) => {
    const { element, lookup } = destination();
    await state.runtime!.settle(() => ContinuityPlanner({ initialKnowledgeId: id }));
    expect(lookup).toHaveBeenCalledWith(id);
    expect(element.scrollIntoView).toHaveBeenCalledWith({ block: "start" });
    expect(element.focus).toHaveBeenCalledWith({ preventScroll: true });
  });

  it("does not focus the fallback task when a link names an unknown ID", async () => {
    const { lookup } = destination();
    await state.runtime!.settle(() => ContinuityPlanner({ initialKnowledgeId: "missing-task" }));
    expect(lookup).not.toHaveBeenCalled();
  });
});
