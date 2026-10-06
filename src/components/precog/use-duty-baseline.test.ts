import { afterEach, describe, expect, it, vi } from "vitest";
import type { RoleAssignment } from "@/lib/precog/sod/detect";
import { dutyBaselineKey } from "@/lib/precog/sod/duty-baseline";
import { createHookRuntime, type HookRuntime } from "@/test/hook-runtime";

// The hook runs under src/test/hook-runtime.ts, with this browser storage.
const hooks = vi.hoisted(() => ({
  runtime: null as HookRuntime | null,
  data: new Map<string, string>(),
}));
vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react")>();
  return {
    ...actual,
    useState: (init: unknown) =>
      hooks.runtime?.active ? hooks.runtime.useState(init) : actual.useState(init),
    useEffect: (run: () => void, deps?: unknown[]) =>
      hooks.runtime?.active ? hooks.runtime.useEffect(run, deps) : actual.useEffect(run, deps),
  };
});
vi.mock("@/lib/precog/workspace-context", () => ({
  useWorkspace: () => ({
    accountId: null,
    session: null,
    local: {
      getItem: (key: string) => hooks.data.get(key) ?? null,
      setItem: (key: string, value: string) => void hooks.data.set(key, value),
    },
  }),
}));

const { useDutyBaseline } = await import("./use-duty-baseline");
const runtime = createHookRuntime();
hooks.runtime = runtime;

afterEach(() => {
  runtime.reset();
  hooks.data.clear();
});

const team = (n: number, granted = -1): RoleAssignment[] =>
  Array.from({ length: n }, (_, i) => ({
    personId: `p${i}`,
    personName: `Person ${i}`,
    role: "Clerk",
    entitlements: i === granted ? ["enter_invoices", "collect_cash"] : ["enter_invoices"],
  }));

describe("useDutyBaseline", () => {
  it("keeps a 150-person baseline across a reload, so a new grant stays pending", () => {
    const accepted = team(150);
    let current = accepted;
    const Screen = () => useDutyBaseline(current, "biz-1");
    expect(runtime.render(Screen).baseline).toEqual(accepted);
    runtime.reset();
    // Someone grants Person 5 a duty; the screen reloads.
    current = team(150, 5);
    expect(runtime.render(Screen).baseline).toEqual(accepted);
  });

  it("never takes today's duties as accepted when the stored baseline cannot be read", () => {
    hooks.data.set(dutyBaselineKey("biz-1"), "{not json");
    const current = team(3, 1);
    const Screen = () => useDutyBaseline(current, "biz-1");
    const first = runtime.render(Screen);
    expect(first.baseline).toBeUndefined();
    expect(hooks.data.get(dutyBaselineKey("biz-1"))).toBe("{not json");
    // Accepting the current duties restarts change review.
    first.acceptBaseline(current);
    expect(runtime.render(Screen).baseline).toEqual(current);
    expect(JSON.parse(hooks.data.get(dutyBaselineKey("biz-1")) ?? "null")).toEqual(current);
  });
});
