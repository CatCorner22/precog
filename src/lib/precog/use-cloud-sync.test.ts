import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { memoryStorage } from "@/test/memory-storage";
import { ScopedStorage } from "./workspace-storage";
import { AccountLineage, LocalProfileStore } from "./save-conflict";
import {
  defaultProfile,
  loadPortfolio,
  savePortfolioEntry,
  type PracticeProfile,
} from "./practice-profile";
import type { Workspace } from "./workspace-context";
import type { SaveConflictState } from "./use-cloud-sync";
import type { KnowledgeItem } from "./types";

// The hooks run as plain functions: refs are plain objects, callbacks are
// themselves, and effects run once, in order, when `effects.run()` is called.
// There is no DOM renderer here, so this drives the callbacks the provider
// hands out, which is where saving and conflict handling live.
const effects = vi.hoisted(() => {
  const queue: (() => unknown)[] = [];
  return {
    queue,
    run() {
      for (const effect of queue.splice(0)) effect();
    },
  };
});
const setters = vi.hoisted(() => ({ calls: [] as unknown[] }));
vi.mock("react", async (importOriginal) => ({
  ...(await importOriginal<typeof import("react")>()),
  useCallback: <T>(fn: T) => fn,
  useMemo: <T>(fn: () => T) => fn(),
  useRef: <T>(current: T) => ({ current }),
  useState: <T>(init: T | (() => T)) => [
    typeof init === "function" ? (init as () => T)() : init,
    (value: unknown) => void setters.calls.push(value),
  ],
  useEffect: (effect: () => unknown) => void effects.queue.push(effect),
}));
vi.mock("sonner", () => ({
  toast: Object.assign(vi.fn(), { error: vi.fn(), success: vi.fn() }),
}));
vi.mock("@/lib/auth/client", () => ({ authEnabled: true }));
vi.mock("@/lib/auth/identity-change", () => ({
  identitySnapshot: () => ({ accountId: "user_1", generation: 0, locked: false }),
  identityUnchanged: () => true,
  registerExitCheck: () => () => undefined,
  registerExitCleanup: () => () => undefined,
}));
const server = vi.hoisted(() => ({
  loadBusinessProfile: vi.fn(),
  saveBusinessProfile: vi.fn(),
  listBusinesses: vi.fn(),
  loadBusiness: vi.fn(),
  deleteBusiness: vi.fn(),
}));
vi.mock("./profile-server", () => server);

// Renamed: here they run as plain functions, not inside a component.
const { useCloudSync: runCloudSync } = await import("./use-cloud-sync");
const { usePortfolio: runPortfolio } = await import("./use-portfolio");

const USER = "user_1";
let clock = Date.parse("2026-09-23T10:00:00Z");
function edit(p: PracticeProfile, patch: Partial<PracticeProfile>): PracticeProfile {
  clock += 1000;
  return { ...p, ...patch, updatedAt: new Date(clock).toISOString() };
}
function item(name: string): KnowledgeItem {
  return {
    id: `k-${name}`,
    name,
    criticality: "important",
    category: "process",
    description: "",
    linkedProcessIds: [],
  };
}
function business(id: string, name: string): PracticeProfile {
  return edit({ ...defaultProfile("general"), businessId: id, practiceName: name }, {});
}

/** One browser: every tab of it shares this storage. */
function browser(): Workspace {
  const raw = memoryStorage();
  return { accountId: USER, local: new ScopedStorage(raw, USER), session: null };
}

/** One tab's useCloudSync, signed in, with the account's open-business load answered. */
async function syncTab(workspace: Workspace, open: PracticeProfile) {
  const profileRef = { current: open };
  const activated: PracticeProfile[] = [];
  const lineage = new AccountLineage();
  lineage.start(open.businessId as string, open.updatedAt);
  const localStore = new LocalProfileStore(() => workspace.local);
  localStore.write(open);
  server.loadBusinessProfile.mockResolvedValueOnce({ found: false, profile: null, revision: null });
  server.listBusinesses.mockResolvedValueOnce([]);
  const sync = runCloudSync({
    workspace,
    profile: open,
    profileRef,
    setProfile: vi.fn(),
    ready: true,
    setReady: vi.fn(),
    isPending: false,
    userId: USER,
    userIsDevFallback: false,
    localStore,
    lineage,
    activateProfile: (next) => {
      activated.push(next);
      profileRef.current = next;
      lineage.start(next.businessId as string, next.updatedAt);
    },
    clearHistory: vi.fn(),
  });
  effects.run();
  // The bootstrap reopened the stored copy, which is `open` itself.
  activated.length = 0;
  await vi.waitFor(() => expect(server.loadBusinessProfile).toHaveBeenCalled());
  await Promise.resolve();
  await Promise.resolve();
  return { sync, profileRef, activated, localStore, lineage };
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
  const target = new EventTarget();
  vi.stubGlobal("window", target);
  vi.stubGlobal("document", Object.assign(new EventTarget(), { visibilityState: "visible" }));
  setters.calls.length = 0;
  effects.queue.length = 0;
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.resetAllMocks();
});

describe("'Keep this tab's copy' after another tab saved", () => {
  it("saves the chosen copy to the account, not only to this browser", async () => {
    const workspace = browser();
    const mine = business("biz_a", "Mine Co");
    const tab = await syncTab(workspace, mine);
    const theirs = edit(mine, { practiceName: "Theirs Co" });
    tab.sync.raiseConflict({
      reason: "other-tab",
      businessId: "biz_a",
      remote: theirs,
      revision: null,
      updatedAt: theirs.updatedAt,
    });
    server.saveBusinessProfile.mockResolvedValueOnce({ ok: true, revision: 3 });

    await tab.sync.resolveSaveConflict("overwrite");

    expect(server.saveBusinessProfile).toHaveBeenCalledTimes(1);
    const sent = server.saveBusinessProfile.mock.calls[0][0].data;
    expect(sent.profile.practiceName).toBe("Mine Co");
    expect(setters.calls).toContain("synced");
  });
});

describe("a save conflict for a business the owner has since left", () => {
  const conflictFor = (remote: PracticeProfile): SaveConflictState => ({
    reason: "remote-edit",
    businessId: "biz_a",
    remote,
    revision: 8,
    updatedAt: remote.updatedAt,
  });

  it("'Use the account's copy' settles that business and leaves the open one alone", async () => {
    const workspace = browser();
    const left = edit(business("biz_a", "Left Co"), { customKnowledge: [item("Edited here")] });
    savePortfolioEntry(left, workspace.local);
    const opened = business("biz_new", "New Co");
    const tab = await syncTab(workspace, opened);
    const remote = edit(business("biz_a", "Left Co"), { practiceName: "Left Co (renamed)" });
    tab.sync.raiseConflict(conflictFor(remote));
    server.saveBusinessProfile.mockResolvedValue({ ok: true, revision: 1 });

    await tab.sync.resolveSaveConflict("reload");

    expect(tab.activated).toEqual([]);
    expect(tab.sync.cloudRevision.current.get("biz_a")).toBe(8);
    // The open business saved once the banner went, on its own revision.
    expect(tab.sync.cloudRevision.current.get("biz_new")).toBe(1);
    const portfolio = Object.values(loadPortfolio(workspace.local));
    expect(loadPortfolio(workspace.local).biz_a?.practiceName).toBe("Left Co (renamed)");
    // This device's edits are kept as a copy, not dropped.
    expect(
      portfolio.some(
        (p) =>
          p.businessId !== "biz_a" &&
          p.practiceName === "Left Co (copy from this device)" &&
          p.customKnowledge?.[0]?.name === "Edited here",
      ),
    ).toBe(true);
    // The open business is saved under its own id, never with the left business's base.
    for (const [call] of server.saveBusinessProfile.mock.calls)
      expect(call.data.profile.businessId === "biz_new" ? call.data.baseRevision : null).toBe(null);
  });

  it("'Keep this device's copy' saves that business's copy here over the account's", async () => {
    const workspace = browser();
    const left = edit(business("biz_a", "Left Co"), { customKnowledge: [item("Edited here")] });
    savePortfolioEntry(left, workspace.local);
    const tab = await syncTab(workspace, business("biz_new", "New Co"));
    const remote = edit(business("biz_a", "Left Co"), { practiceName: "Left Co (renamed)" });
    tab.sync.raiseConflict(conflictFor(remote));
    server.saveBusinessProfile.mockResolvedValue({ ok: true, revision: 9 });

    await tab.sync.resolveSaveConflict("overwrite");

    const saved = server.saveBusinessProfile.mock.calls.map(([call]) => call.data);
    const leftSave = saved.find((d) => d.profile.businessId === "biz_a");
    expect(leftSave?.baseRevision).toBe(8);
    expect(leftSave?.profile.customKnowledge?.[0]?.name).toBe("Edited here");
    expect(tab.activated).toEqual([]);
  });
});

describe("account bases and stamps shared by the tabs of one browser", () => {
  it("one tab's write never puts back another tab's older revision", async () => {
    const workspace = browser();
    const a = business("biz_a", "A Co");
    const one = await syncTab(workspace, a);
    const two = await syncTab(workspace, a);
    one.sync.openedFromAccount(a, 7);
    two.sync.openedFromAccount(business("biz_b", "B Co"), 3);
    const stored = JSON.parse(workspace.local?.getItem("precog.cloud-bases.v1") ?? "{}") as Record<
      string,
      number
    >;
    expect(stored).toEqual({ biz_a: 7, biz_b: 3 });
    // The stamp one tab saw the account take counts in the other tab too.
    expect(two.sync.accountTook("biz_a", a.updatedAt)).toBe(true);
  });
});

/** usePortfolio on top of one tab's sync. */
function portfolioTab(
  workspace: Workspace,
  tab: Awaited<ReturnType<typeof syncTab>>,
  overrides: { flushActive?: () => Promise<boolean> } = {},
) {
  return runPortfolio({
    workspace,
    profile: tab.profileRef.current,
    profileRef: tab.profileRef,
    setProfile: vi.fn(),
    activateProfile: (next) => {
      tab.activated.push(next);
      tab.profileRef.current = next;
    },
    clearHistory: vi.fn(),
    localStore: tab.localStore,
    cloudUser: true,
    cloudRevision: tab.sync.cloudRevision,
    saveConflictRef: tab.sync.saveConflictRef,
    raiseConflict: tab.sync.raiseConflict,
    accountTook: tab.sync.accountTook,
    flushLocal: tab.sync.flushLocal,
    flushActive: overrides.flushActive ?? tab.sync.flushActive,
    openedFromAccount: tab.sync.openedFromAccount,
    remoteBusinesses: [],
    setRemoteBusinesses: vi.fn(),
    portfolioVersion: 0,
    bumpPortfolio: vi.fn(),
    setSwitching: vi.fn(),
  });
}

describe("adding a business while the open one's account save is refused", () => {
  it("keeps the open business, so the banner sits on the business it is about", async () => {
    const workspace = browser();
    const a = business("biz_a", "A Co");
    const tab = await syncTab(workspace, a);
    const remote = edit(a, { practiceName: "A Co elsewhere" });
    server.saveBusinessProfile.mockResolvedValueOnce({
      ok: false,
      revision: 8,
      profile: remote,
      updatedAt: remote.updatedAt,
    });
    const portfolio = portfolioTab(workspace, tab);

    const result = await portfolio.createBusiness("general", "New Co");

    expect(result.ok).toBe(false);
    expect(tab.activated).toEqual([]);
    expect(tab.sync.saveConflictRef.current?.businessId).toBe("biz_a");
  });
});

describe("switching to a business the account moved on from", () => {
  it("opens this device's unsynced edits with the banner up instead of dropping them", async () => {
    const workspace = browser();
    const base = business("biz_b", "B Co");
    const offline = edit(base, { customKnowledge: [item("Offline item")] });
    savePortfolioEntry(offline, workspace.local);
    workspace.local?.setItem("precog.cloud-bases.v1", JSON.stringify({ biz_b: 5 }));
    const tab = await syncTab(workspace, business("biz_a", "A Co"));
    const remote = edit(base, { practiceName: "B Co elsewhere" });
    server.loadBusiness.mockResolvedValueOnce({ found: true, profile: remote, revision: 6 });
    server.saveBusinessProfile.mockResolvedValue({ ok: true, revision: 2 });
    const portfolio = portfolioTab(workspace, tab);

    const result = await portfolio.switchBusiness("biz_b");

    expect(result).toEqual({ ok: true });
    expect(tab.activated.at(-1)?.customKnowledge?.[0]?.name).toBe("Offline item");
    expect(tab.sync.saveConflictRef.current).toMatchObject({
      reason: "remote-edit",
      businessId: "biz_b",
      revision: 6,
    });
    expect(tab.sync.saveConflictRef.current?.remote.practiceName).toBe("B Co elsewhere");
  });

  it("says the account could not be reached when the load fails and nothing is here", async () => {
    const workspace = browser();
    const tab = await syncTab(workspace, business("biz_a", "A Co"));
    server.loadBusiness.mockRejectedValueOnce(new Error("Failed to fetch"));
    server.saveBusinessProfile.mockResolvedValue({ ok: true, revision: 2 });
    const portfolio = portfolioTab(workspace, tab);

    const result = await portfolio.switchBusiness("biz_elsewhere");

    expect(result).toEqual({
      ok: false,
      reason: "Precog could not reach your account. Try again.",
    });
  });
});
