import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createHookRuntime, type HookRuntime } from "@/test/hook-runtime";

// The hook runs under src/test/hook-runtime.ts, its layout effect as an effect.
const hooks = vi.hoisted(() => ({ runtime: null as HookRuntime | null }));
vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react")>();
  const effect = (run: () => void, deps?: unknown[]) =>
    hooks.runtime?.active ? hooks.runtime.useEffect(run, deps) : actual.useEffect(run, deps);
  return { ...actual, useEffect: effect, useLayoutEffect: effect };
});
const identity = vi.hoisted(() => ({ set: vi.fn() }));
vi.mock("./identity-change", () => ({ setDisplayedAccount: identity.set }));

const { useRecordDisplayedAccount } = await import("./use-record-displayed-account");
const runtime = createHookRuntime();
hooks.runtime = runtime;

afterEach(() => {
  runtime.reset();
  vi.clearAllMocks();
});

describe("useRecordDisplayedAccount", () => {
  it("records the signed-in account once per account, and nothing while signed out", () => {
    let id: string | null | undefined = undefined;
    const Page = () => useRecordDisplayedAccount(id);
    runtime.render(Page);
    id = null;
    runtime.render(Page);
    expect(identity.set).not.toHaveBeenCalled();
    id = "ada";
    runtime.render(Page);
    runtime.render(Page);
    expect(identity.set.mock.calls).toEqual([["ada"]]);
    id = "bo";
    runtime.render(Page);
    expect(identity.set.mock.calls).toEqual([["ada"], ["bo"]]);
  });

  it("runs as a layout effect in the browser, before the page's own effects", () => {
    const source = readFileSync(
      new URL("./use-record-displayed-account.ts", import.meta.url),
      "utf8",
    );
    expect(source).toContain(
      'const useBrowserLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;',
    );
  });
});
