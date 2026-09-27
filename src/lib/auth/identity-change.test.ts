import { afterEach, describe, expect, it, vi } from "vitest";

type Barrier = typeof import("./identity-change");

afterEach(() => vi.unstubAllGlobals());

/**
 * Open `count` tabs: separate module instances over one shared localStorage.
 * A write from one tab reaches the other tabs as a `storage` event, as in a
 * browser. `as(i, fn)` runs `fn` as tab i.
 */
async function openTabs(count: number) {
  const store = new Map<string, string>();
  const listeners: { tab: number; fn: (event: { key: string; newValue: string }) => void }[] = [];
  let active = 0;
  vi.stubGlobal("window", {
    localStorage: {
      setItem(key: string, value: string) {
        store.set(key, value);
        for (const l of listeners) if (l.tab !== active) l.fn({ key, newValue: value });
      },
    },
    addEventListener(type: string, fn: (event: { key: string; newValue: string }) => void) {
      if (type === "storage") listeners.push({ tab: active, fn });
    },
  });
  const tabs: Barrier[] = [];
  for (let i = 0; i < count; i += 1) {
    vi.resetModules();
    active = i;
    const mod = await import("./identity-change");
    mod.subscribeIdentity(() => undefined);
    tabs.push(mod);
  }
  const as = <T>(i: number, fn: (tab: Barrier) => T): T => {
    active = i;
    return fn(tabs[i]);
  };
  return { as, tabs, store };
}

describe("identity generation barrier", () => {
  it("invalidates requests when the verified account changes", async () => {
    const { as } = await openTabs(1);
    as(0, (tab) => {
      tab.setDisplayedAccount("A");
      const a = tab.identitySnapshot();
      expect(tab.identityUnchanged(a)).toBe(true);
      tab.setDisplayedAccount("B");
      expect(tab.identityUnchanged(a)).toBe(false);
      expect(tab.identitySnapshot().accountId).toBe("B");
    });
  });

  it("locks immediately and does not revive old requests after a cancelled sign-in", async () => {
    const { as } = await openTabs(1);
    as(0, (tab) => {
      tab.setDisplayedAccount("A");
      const old = tab.identitySnapshot();
      tab.beginIdentityChange("signing-in");
      expect(tab.identityLockReason()).toBe("signing-in");
      tab.cancelIdentityChange();
      expect(tab.identityLockReason()).toBeNull();
      expect(tab.identityUnchanged(old)).toBe(false);
    });
  });
});

describe("other tabs", () => {
  it("unlock again when a sign-in in another tab is cancelled", async () => {
    const { as } = await openTabs(2);
    as(0, (tab) => tab.setDisplayedAccount("A"));
    as(1, (tab) => tab.setDisplayedAccount("A"));

    as(0, (tab) => tab.beginIdentityChange("signing-in"));
    expect(as(1, (tab) => tab.identityLockReason())).toBe("other-tab");

    as(0, (tab) => tab.cancelIdentityChange());
    expect(as(0, (tab) => tab.identityLockReason())).toBeNull();
    expect(as(1, (tab) => tab.identityLockReason())).toBeNull();
  });

  it("stay locked when the other tab now shows a different account", async () => {
    const { as } = await openTabs(2);
    as(0, (tab) => tab.setDisplayedAccount("A"));
    as(1, (tab) => tab.setDisplayedAccount("A"));

    as(0, (tab) => tab.beginIdentityChange("signing-in"));
    as(0, (tab) => {
      tab.finishIdentityChange();
      tab.setDisplayedAccount("B");
    });
    expect(as(1, (tab) => tab.identityLockReason())).toBe("changed");

    // A later cancel elsewhere does not unlock a tab whose account is stale.
    as(0, (tab) => tab.cancelIdentityChange());
    expect(as(1, (tab) => tab.identityLockReason())).toBe("changed");
  });

  it("unlock when a page opened after a cancelled redirect shows the same account", async () => {
    const { as } = await openTabs(3);
    as(0, (tab) => tab.setDisplayedAccount("A"));
    as(1, (tab) => tab.setDisplayedAccount("A"));
    // Tab 1 leaves for the provider's page and never reports a cancel.
    as(1, (tab) => tab.beginIdentityChange("signing-in"));
    expect(as(0, (tab) => tab.identityLockReason())).toBe("other-tab");
    // The customer comes back without signing in: a fresh page shows account A.
    as(2, (tab) => tab.setDisplayedAccount("A"));
    expect(as(0, (tab) => tab.identityLockReason())).toBeNull();
  });

  it("do not interrupt this tab's own sign-out", async () => {
    const { as } = await openTabs(2);
    as(0, (tab) => tab.setDisplayedAccount("A"));
    as(1, (tab) => tab.setDisplayedAccount("A"));
    as(0, (tab) => tab.beginIdentityChange("signing-out"));
    as(1, (tab) => tab.setDisplayedAccount("A"));
    expect(as(0, (tab) => tab.identityLockReason())).toBe("signing-out");
  });

  it("carry only a random change id and the verified account id", async () => {
    const { as, store } = await openTabs(2);
    as(0, (tab) => {
      tab.setDisplayedAccount("user_123");
      tab.beginIdentityChange("signing-out");
    });
    expect(store.get("precog.identity-change.v1")).toMatch(/^[a-z0-9]+:begin$/);
    expect(store.get("precog.identity-account.v1")).toMatch(/^[a-z0-9]+:user_123$/);
  });
});

describe("exit hooks", () => {
  it("tell the exit check which transition it guards and respect a cancel", async () => {
    const { as } = await openTabs(1);
    await as(0, async (tab) => {
      const check = vi.fn(async () => false);
      const remove = tab.registerExitCheck(check);
      expect(await tab.runExitCheck("sign-in")).toBe(false);
      expect(check).toHaveBeenCalledWith("sign-in");
      expect(tab.identityLockReason()).toBeNull();
      remove();
      expect(await tab.runExitCheck("sign-out")).toBe(true);
    });
  });

  it("let sign-out capture account-specific cleanup before the workspace unmounts", async () => {
    const { as } = await openTabs(1);
    as(0, (tab) => {
      const cleanup = vi.fn();
      const remove = tab.registerExitCleanup(cleanup);
      const captured = tab.currentExitCleanup();
      remove();
      expect(tab.currentExitCleanup()).toBeNull();
      captured?.();
      expect(cleanup).toHaveBeenCalledOnce();
    });
  });
});
