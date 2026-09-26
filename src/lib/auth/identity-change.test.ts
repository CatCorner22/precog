import { afterEach, describe, expect, it, vi } from "vitest";
afterEach(() => vi.unstubAllGlobals());
async function barrier() {
  vi.resetModules();
  const listeners = new Map<string, (event: { key: string }) => void>();
  vi.stubGlobal("window", {
    localStorage: { setItem: vi.fn() },
    addEventListener: (key: string, fn: (event: { key: string }) => void) => listeners.set(key, fn),
  });
  const mod = await import("./identity-change");
  return { mod, listeners };
}
describe("identity generation barrier", () => {
  it("invalidates requests when the verified account changes", async () => {
    const { mod } = await barrier();
    mod.displayAccount("A");
    const a = mod.identitySnapshot();
    expect(mod.identityUnchanged(a)).toBe(true);
    mod.displayAccount("B");
    expect(mod.identityUnchanged(a)).toBe(false);
    expect(mod.identitySnapshot().accountId).toBe("B");
  });
  it("locks immediately and does not revive old requests after a cancelled sign-in", async () => {
    const { mod } = await barrier();
    mod.displayAccount("A");
    const old = mod.identitySnapshot();
    mod.beginIdentityChange();
    expect(mod.identityLocked()).toBe(true);
    mod.finishIdentityChange();
    expect(mod.identityLocked()).toBe(false);
    expect(mod.identityUnchanged(old)).toBe(false);
  });
  it("locks other tabs without transmitting private data", async () => {
    const { mod, listeners } = await barrier();
    const changed = vi.fn();
    const remove = mod.subscribeIdentity(changed);
    listeners.get("storage")!({ key: "unrelated" });
    expect(mod.identityLocked()).toBe(false);
    listeners.get("storage")!({ key: "precog.identity-change.v1" });
    expect(mod.identityLocked()).toBe(true);
    expect(changed).toHaveBeenCalledOnce();
    remove();
  });
  it("respects recovery cancellation before identity change", async () => {
    const { mod } = await barrier();
    const remove = mod.registerAccountExit(async () => false);
    expect(await mod.prepareAccountExit()).toBe(false);
    expect(mod.identityLocked()).toBe(false);
    remove();
    expect(await mod.prepareAccountExit()).toBe(true);
  });
  it("lets sign-out capture account-specific cleanup before the provider unmounts", async () => {
    const { mod } = await barrier();
    const cleanup = vi.fn();
    const remove = mod.registerAccountCleanup(cleanup);
    const captured = mod.accountExitCleanup();
    remove();
    expect(mod.accountExitCleanup()).toBeNull();
    captured?.();
    expect(cleanup).toHaveBeenCalledOnce();
  });
});
