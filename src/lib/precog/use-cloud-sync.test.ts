import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { toast } from "sonner";
import { memoryStorage } from "@/test/memory-storage";
import { PRECOG_UPDATED_MESSAGE } from "./stale-deploy";
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
// hands out, which is where saving and conflict handling live. `unmount()`
// runs the cleanups the effects returned.
const effects = vi.hoisted(() => {
  const queue: (() => unknown)[] = [];
  const cleanups: (() => void)[] = [];
  return {
    queue,
    cleanups,
    run() {
      for (const effect of queue.splice(0)) {
        const cleanup = effect();
        if (typeof cleanup === "function") cleanups.push(cleanup as () => void);
      }
    },
    unmount() {
      for (const cleanup of cleanups.splice(0)) cleanup();
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
  toast: Object.assign(vi.fn(), { error: vi.fn(), success: vi.fn(), dismiss: vi.fn() }),
}));
vi.mock("@/lib/auth/client", () => ({ authEnabled: true }));
// The exit check the last tab registered, run as a sign-out would.
const exit = vi.hoisted(() => ({
  check: null as ((transition: "sign-in" | "sign-out") => Promise<boolean>) | null,
}));
// The identity lock, set by a test as another tab's sign-out would set it.
const identity = vi.hoisted(() => {
  const state = {
    lock: null as string | null,
    listeners: new Set<() => void>(),
    setLock(next: string | null) {
      state.lock = next;
      for (const listener of state.listeners) listener();
    },
  };
  return state;
});
vi.mock("@/lib/auth/identity-change", () => ({
  identitySnapshot: () => ({ accountId: "user_1", generation: 0, locked: false }),
  identityUnchanged: () => true,
  identityLockReason: () => identity.lock,
  subscribeIdentity: (listener: () => void) => {
    identity.listeners.add(listener);
    return () => void identity.listeners.delete(listener);
  },
  registerExitCheck: (check: typeof exit.check) => {
    exit.check = check;
    return () => undefined;
  },
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
const recovery = vi.hoisted(() => ({ downloadRecoveryCopy: vi.fn() }));
vi.mock("./recovery-copy", () => recovery);

// Renamed: here they run as plain functions, not inside a component.
const { useCloudSync: runCloudSync, LOCAL_FULL_MESSAGE } = await import("./use-cloud-sync");
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

/** One browser: every tab of it shares this storage. `refuse` makes writes of keys ending so throw, as a full store does ("" refuses every write). */
function browser(refuse?: string): Workspace {
  const raw = memoryStorage();
  const write = raw.setItem;
  raw.setItem = (key, value) => {
    if (refuse !== undefined && key.endsWith(refuse))
      throw new DOMException("Test quota", "QuotaExceededError");
    write(key, value);
  };
  return { accountId: USER, local: new ScopedStorage(raw, USER), session: null };
}

/**
 * One tab's useCloudSync, signed in, with the account's open-business load
 * answered (or failing once, with `loadFails`). `stored` is the copy this
 * browser holds at start-up, when it is not `open` itself.
 */
async function syncTab(
  workspace: Workspace,
  open: PracticeProfile,
  options: {
    loadFails?: boolean;
    stored?: PracticeProfile;
    /** The account's answer to the open-business load. */
    load?: { found: true; profile: PracticeProfile; revision: number; updatedAt: string };
    /** Not signed in: nothing loads from or saves to an account. */
    guest?: boolean;
  } = {},
) {
  const profileRef = { current: open };
  const activated: PracticeProfile[] = [];
  const lineage = new AccountLineage();
  lineage.start(open.businessId as string, open.updatedAt);
  const localStore = new LocalProfileStore(() => workspace.local);
  localStore.write(options.stored ?? open);
  if (options.loadFails)
    server.loadBusinessProfile.mockRejectedValueOnce(new Error("Failed to fetch"));
  else
    server.loadBusinessProfile.mockResolvedValueOnce(
      options.load ?? { found: false, profile: null, revision: null },
    );
  server.listBusinesses.mockResolvedValueOnce([]);
  const sync = runCloudSync({
    workspace,
    profile: open,
    profileRef,
    setProfile: vi.fn(),
    ready: true,
    setReady: vi.fn(),
    isPending: false,
    userId: options.guest ? undefined : USER,
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
  if (options.guest) return { sync, profileRef, activated, localStore, lineage };
  await vi.waitFor(() => expect(server.loadBusinessProfile).toHaveBeenCalled());
  await Promise.resolve();
  await Promise.resolve();
  return { sync, profileRef, activated, localStore, lineage };
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
  const target = Object.assign(new EventTarget(), { confirm: vi.fn(() => true) });
  vi.stubGlobal("window", target);
  exit.check = null;
  identity.lock = null;
  identity.listeners.clear();
  vi.stubGlobal("document", Object.assign(new EventTarget(), { visibilityState: "visible" }));
  setters.calls.length = 0;
  effects.queue.length = 0;
  effects.cleanups.length = 0;
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
  overrides: {
    flushActive?: () => Promise<boolean>;
    remoteBusinesses?: ReturnType<typeof runPortfolio>["businesses"];
  } = {},
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
    remoteBusinesses: overrides.remoteBusinesses ?? [],
    setRemoteBusinesses: vi.fn(),
    portfolioVersion: 0,
    bumpPortfolio: vi.fn(),
    setSwitching: vi.fn(),
  });
}

describe("firm portfolio identity", () => {
  it("keeps two shared clients with the same business id", async () => {
    const workspace = browser();
    const own = business("own", "Own Co");
    const tab = await syncTab(workspace, own);
    const summary = {
      id: "same",
      industry: "general" as const,
      updatedAt: own.updatedAt,
      processCount: 1,
      healthScore: null,
      shared: true,
      firmClient: true,
    };
    const portfolio = portfolioTab(workspace, tab, {
      remoteBusinesses: [
        { ...summary, name: "A client", ownerUserId: "owner-a" },
        { ...summary, name: "B client", ownerUserId: "owner-b" },
      ],
    });

    expect(portfolio.businesses.filter((b) => b.id === "same").map((b) => b.name)).toEqual([
      "A client",
      "B client",
    ]);
  });

  it("carries the selected owner through open and save requests", async () => {
    const workspace = browser();
    const tab = await syncTab(workspace, business("own", "Own Co"));
    const shared = { ...business("same", "A client"), ownerUserId: "owner-a" };
    server.loadBusiness.mockResolvedValueOnce({ found: true, profile: shared, revision: 4 });
    server.saveBusinessProfile.mockResolvedValue({ ok: true, revision: 5 });
    const portfolio = portfolioTab(workspace, tab);

    expect(await portfolio.switchBusiness("same", "owner-a")).toEqual({ ok: true });
    expect(server.loadBusiness).toHaveBeenCalledWith({
      data: expect.objectContaining({ id: "same", ownerUserId: "owner-a" }),
    });
    expect(tab.profileRef.current.ownerUserId).toBe("owner-a");
    tab.profileRef.current = edit(tab.profileRef.current, { practiceName: "A client updated" });
    expect(await tab.sync.flushActive()).toBe(true);
    expect(server.saveBusinessProfile).toHaveBeenLastCalledWith({
      data: expect.objectContaining({ ownerUserId: "owner-a" }),
    });
  });
});

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

/** The options of the first toast.error with this title. */
function errorToast(title: string) {
  const call = vi.mocked(toast.error).mock.calls.find(([said]) => said === title);
  return call?.[1] as
    { description?: string; action?: { label: string; onClick: () => void } } | undefined;
}

describe("an account load that fails at page open", () => {
  it("retries, then saves the work kept on this device to the account", async () => {
    const tab = await syncTab(browser(), business("biz_a", "A Co"), { loadFails: true });
    expect(setters.calls).toContain("error");
    // Nothing reaches the account before its copy is read, so sign-out offers the recovery download.
    vi.mocked(window.confirm).mockReturnValueOnce(false);
    expect(await exit.check?.("sign-out")).toBe(false);
    expect(window.confirm).toHaveBeenCalledWith(
      expect.stringContaining("Download a recovery copy and sign out?"),
    );
    expect(server.saveBusinessProfile).not.toHaveBeenCalled();
    server.loadBusinessProfile.mockResolvedValueOnce({
      found: false,
      profile: null,
      revision: null,
    });
    server.saveBusinessProfile.mockResolvedValue({ ok: true, revision: 1 });

    await vi.advanceTimersByTimeAsync(2000);

    expect(server.loadBusinessProfile).toHaveBeenCalledTimes(2);
    await vi.waitFor(() => expect(server.saveBusinessProfile).toHaveBeenCalledTimes(1));
    expect(server.saveBusinessProfile.mock.calls[0][0].data.profile.practiceName).toBe("A Co");
    expect(await tab.sync.flushActive()).toBe(true);
    expect(await exit.check?.("sign-out")).toBe(true);
    // The notice with "Try again" closes once the account is read.
    expect(toast.dismiss).toHaveBeenCalledWith("account-unreachable");
  });

  it("lets the owner switch businesses on this device's copy meanwhile", async () => {
    const workspace = browser();
    savePortfolioEntry(business("biz_b", "B Co"), workspace.local);
    const tab = await syncTab(workspace, business("biz_a", "A Co"), { loadFails: true });
    server.loadBusiness.mockRejectedValueOnce(new Error("Failed to fetch"));

    const result = await portfolioTab(workspace, tab).switchBusiness("biz_b");

    expect(result).toEqual({ ok: true });
    expect(tab.activated.at(-1)?.practiceName).toBe("B Co");
  });

  it("saves the edits made meanwhile over the account's copy when that copy is the one this tab built on", async () => {
    const base = business("biz_a", "A Co");
    const mine = edit(base, { customKnowledge: [item("Edited offline")] });
    const tab = await syncTab(browser(), base, { loadFails: true });
    tab.profileRef.current = mine;
    server.loadBusinessProfile.mockResolvedValueOnce({
      found: true,
      profile: base,
      revision: 4,
      updatedAt: base.updatedAt,
    });
    server.saveBusinessProfile.mockResolvedValue({ ok: true, revision: 5 });

    await vi.advanceTimersByTimeAsync(2000);

    await vi.waitFor(() => expect(server.saveBusinessProfile).toHaveBeenCalledTimes(1));
    const sent = server.saveBusinessProfile.mock.calls[0][0].data;
    expect(sent.baseRevision).toBe(4);
    expect(sent.profile.customKnowledge?.[0]?.name).toBe("Edited offline");
    expect(tab.sync.saveConflictRef.current).toBeNull();
    expect(tab.activated).toEqual([]);
  });

  it("asks which copy to keep, in words about the outage, when the account holds another version", async () => {
    const base = business("biz_a", "A Co");
    const mine = edit(base, { customKnowledge: [item("Edited offline")] });
    const tab = await syncTab(browser(), mine, { loadFails: true });
    server.loadBusinessProfile.mockResolvedValueOnce({
      found: true,
      profile: base,
      revision: 4,
      updatedAt: base.updatedAt,
    });

    // The connection returning retries at once, before the 2 s wait.
    window.dispatchEvent(new Event("online"));
    await vi.waitFor(() => expect(tab.sync.saveConflictRef.current).not.toBeNull());
    window.dispatchEvent(new Event("online"));
    await vi.advanceTimersByTimeAsync(60_000);

    expect(server.loadBusinessProfile).toHaveBeenCalledTimes(2);
    expect(tab.sync.saveConflictRef.current).toMatchObject({
      reason: "unreachable",
      businessId: "biz_a",
      revision: 4,
    });
    const raised = setters.calls.filter(
      (value) => (value as SaveConflictState | null)?.reason === "unreachable",
    );
    expect(raised).toHaveLength(1);
    expect(tab.activated).toEqual([]);
  });

  it("offers the recovery download, not a claim that the edits are kept, when this browser refuses them", async () => {
    // Every write refused, as with blocked site data.
    await syncTab(browser(""), business("biz_a", "A Co"), { loadFails: true });
    const offered = errorToast("Could not reach your account");
    expect(offered?.description).not.toContain("keeps your edits");
    expect(offered?.action?.label).toBe("Download a recovery copy");
    offered?.action?.onClick();
    expect(recovery.downloadRecoveryCopy).toHaveBeenCalledTimes(1);
  });

  it("offers Try again, which loads the account's copy at once", async () => {
    await syncTab(browser(), business("biz_a", "A Co"), { loadFails: true });
    const offered = errorToast("Could not reach your account");
    expect(offered?.action?.label).toBe("Try again");
    server.loadBusinessProfile.mockResolvedValueOnce({
      found: false,
      profile: null,
      revision: null,
    });
    server.saveBusinessProfile.mockResolvedValue({ ok: true, revision: 1 });

    offered?.action?.onClick();

    expect(server.loadBusinessProfile).toHaveBeenCalledTimes(2);
  });

  it("stops retrying once the workspace closes", async () => {
    await syncTab(browser(), business("biz_a", "A Co"), { loadFails: true });
    effects.unmount();
    await vi.advanceTimersByTimeAsync(120_000);
    expect(server.loadBusinessProfile).toHaveBeenCalledTimes(1);
  });
});

describe("a save that meets a newer release of Precog", () => {
  it("keeps the work on this device and asks for a reload, instead of a raw 'Not found'", async () => {
    const tab = await syncTab(browser(), business("biz_a", "A Co"));
    server.saveBusinessProfile.mockRejectedValue(new Error("Not found"));

    expect(await tab.sync.flushActive()).toBe(false);

    expect(errorToast(PRECOG_UPDATED_MESSAGE)?.action?.label).toBe("Reload");
    expect(errorToast("Not saved to your account")).toBeUndefined();
    expect(tab.localStore.peek("biz_a")?.profile.practiceName).toBe("A Co");
  });
});

describe("a browser that refuses the list of businesses", () => {
  it("never says the version not chosen is kept, and offers it as a download", async () => {
    const a = business("biz_a", "A Co");
    const tab = await syncTab(browser("precog.portfolio.v1"), a);
    const remote = edit(a, { practiceName: "A Co elsewhere" });
    tab.sync.raiseConflict({
      reason: "remote-edit",
      businessId: "biz_a",
      remote,
      revision: 8,
      updatedAt: remote.updatedAt,
    });

    await tab.sync.resolveSaveConflict("reload");

    expect(errorToast("This browser did not keep this device's copy")?.action?.label).toBe(
      "Download this copy",
    );
    const said = [...vi.mocked(toast).mock.calls, ...vi.mocked(toast.error).mock.calls].map(
      ([title, options]) => `${String(title)} ${String(options?.description ?? "")}`,
    );
    expect(said.some((text) => text.includes("keeps this device's copy"))).toBe(false);
  });

  it("does not report the open business written when only this device holds it", async () => {
    const tab = await syncTab(browser("precog.portfolio.v1"), business("biz_a", "A Co"));

    expect(tab.sync.flushLocal()).toBe(false);
    expect(errorToast("This browser did not keep your list of businesses")?.action?.label).toBe(
      "Download a recovery copy",
    );
  });
});

describe("the workspace closing while an edit waits for its local write", () => {
  it("writes the edit to this browser", async () => {
    const before = business("biz_a", "A Co");
    const typed = edit(before, { practiceName: "A Co typed" });
    const tab = await syncTab(browser(), typed, { stored: before });
    expect(tab.localStore.peek("biz_a")?.profile.practiceName).toBe("A Co");

    effects.unmount();

    expect(tab.localStore.peek("biz_a")?.profile.practiceName).toBe("A Co typed");
  });
});

const ACTIVE = "precog.practiceProfile.v2";
const STATUSES = new Set([
  "idle",
  "loading",
  "saving",
  "synced",
  "local",
  "local-error",
  "error",
  "conflict",
]);
/** The badge as last set. */
function lastStatus() {
  return setters.calls.filter((value) => typeof value === "string" && STATUSES.has(value)).at(-1);
}
/** One browser whose storage refuses the open business while `full.on` is set. */
function fillableBrowser() {
  const full = { on: false };
  const raw = memoryStorage();
  const write = raw.setItem;
  raw.setItem = (key, value) => {
    if (full.on && key.endsWith(ACTIVE)) throw new DOMException("Test quota", "QuotaExceededError");
    write(key, value);
  };
  const workspace: Workspace = {
    accountId: USER,
    local: new ScopedStorage(raw, USER),
    session: null,
  };
  return { workspace, full, raw };
}
function storageEvent(key: string | null, newValue: string | null) {
  return Object.assign(new Event("storage"), { key, newValue });
}
/** Whether closing the tab now asks first. */
function beforeUnloadBlocked() {
  const event = new Event("beforeunload", { cancelable: true });
  window.dispatchEvent(event);
  return event.defaultPrevented;
}

describe("two tabs editing one business at once", () => {
  it("the tab in conflict never writes its copy into the list of businesses", async () => {
    const workspace = browser();
    const before = business("biz_a", "A Co");
    const mine = edit(before, { customKnowledge: [item("Mine")] });
    const tab = await syncTab(workspace, mine, { stored: before });
    // The other tab saves its edit first: the open business and its list entry.
    const theirs = edit(before, { customKnowledge: [item("Theirs")] });
    new LocalProfileStore(() => workspace.local).write(theirs, { force: true });
    savePortfolioEntry(theirs, workspace.local);

    await vi.advanceTimersByTimeAsync(400);
    expect(tab.sync.saveConflictRef.current?.reason).toBe("other-tab");
    await vi.advanceTimersByTimeAsync(5000);

    expect(loadPortfolio(workspace.local).biz_a?.customKnowledge?.[0]?.name).toBe("Theirs");
    expect(tab.localStore.peek("biz_a")?.profile.customKnowledge?.[0]?.name).toBe("Theirs");
  });

  it("asks before the tab closes while the conflict is open", async () => {
    const workspace = browser();
    const a = business("biz_a", "A Co");
    const tab = await syncTab(workspace, a);
    expect(beforeUnloadBlocked()).toBe(false);
    const theirs = edit(a, { practiceName: "Theirs Co" });
    tab.sync.raiseConflict({
      reason: "other-tab",
      businessId: "biz_a",
      remote: theirs,
      revision: null,
      updatedAt: theirs.updatedAt,
    });

    expect(beforeUnloadBlocked()).toBe(true);
    server.saveBusinessProfile.mockResolvedValue({ ok: true, revision: 2 });
    await tab.sync.resolveSaveConflict("overwrite");
    expect(beforeUnloadBlocked()).toBe(false);
  });
});

describe("a browser whose storage is full", () => {
  it("says 'Not saved on this device' after a refused write, and writes again on pagehide", async () => {
    const { workspace, full } = fillableBrowser();
    const before = business("biz_a", "A Co");
    const typed = edit(before, { customKnowledge: [item("Typed while full")] });
    const tab = await syncTab(workspace, typed, { stored: before, guest: true });
    tab.profileRef.current = typed;
    full.on = true;

    await vi.advanceTimersByTimeAsync(400);

    expect(lastStatus()).toBe("local-error");
    expect(errorToast(LOCAL_FULL_MESSAGE)?.action?.label).toBe("Download a recovery copy");
    expect(tab.localStore.peek("biz_a")?.profile.customKnowledge?.[0]).toBeUndefined();
    // Closing now asks first: the edit is in this tab only.
    expect(beforeUnloadBlocked()).toBe(true);
    // The list keeps no copy this browser did not take as the open business.
    await vi.advanceTimersByTimeAsync(1200);
    expect(loadPortfolio(workspace.local).biz_a).toBeUndefined();

    full.on = false;
    window.dispatchEvent(new Event("pagehide"));

    expect(tab.localStore.peek("biz_a")?.profile.customKnowledge?.[0]?.name).toBe(
      "Typed while full",
    );
    expect(lastStatus()).toBe("local");
    expect(toast.dismiss).toHaveBeenCalledWith("local-save-failed");
    expect(beforeUnloadBlocked()).toBe(false);
  });

  it("tries the refused write again after a short wait", async () => {
    const { workspace, full } = fillableBrowser();
    const before = business("biz_a", "A Co");
    const typed = edit(before, { customKnowledge: [item("Typed while full")] });
    const tab = await syncTab(workspace, typed, { stored: before, guest: true });
    tab.profileRef.current = typed;
    full.on = true;
    await vi.advanceTimersByTimeAsync(2000);
    expect(lastStatus()).toBe("local-error");

    full.on = false;
    await vi.advanceTimersByTimeAsync(15_000);

    expect(tab.localStore.peek("biz_a")?.profile.customKnowledge?.[0]?.name).toBe(
      "Typed while full",
    );
    expect(loadPortfolio(workspace.local).biz_a?.customKnowledge?.[0]?.name).toBe(
      "Typed while full",
    );
    expect(lastStatus()).toBe("local");
  });
});

describe("another tab clearing this browser's storage", () => {
  it("writes the open business again at once", async () => {
    const { workspace, raw } = fillableBrowser();
    const a = edit(business("biz_a", "A Co"), { customKnowledge: [item("Kept")] });
    const tab = await syncTab(workspace, a, { guest: true });
    raw.data.clear();

    window.dispatchEvent(storageEvent(null, null));
    await vi.advanceTimersByTimeAsync(50);

    expect(tab.localStore.peek("biz_a")?.profile.customKnowledge?.[0]?.name).toBe("Kept");
    expect(loadPortfolio(workspace.local).biz_a?.customKnowledge?.[0]?.name).toBe("Kept");
    expect(lastStatus()).toBe("local");
  });

  it("writes it again when only the open business was removed", async () => {
    const { workspace } = fillableBrowser();
    const a = edit(business("biz_a", "A Co"), { customKnowledge: [item("Kept")] });
    const tab = await syncTab(workspace, a, { guest: true });
    workspace.local?.removeItem(ACTIVE);

    window.dispatchEvent(storageEvent(workspace.local?.physicalKey(ACTIVE) ?? null, null));
    await vi.advanceTimersByTimeAsync(50);

    expect(tab.localStore.peek("biz_a")?.profile.customKnowledge?.[0]?.name).toBe("Kept");
  });
});

describe("signing in to an account that holds the revision this device built on", () => {
  it("saves this device's later edits without asking", async () => {
    const workspace = browser();
    const base = business("biz_a", "A Co");
    const mine = edit(base, { customKnowledge: [item("Edited before the tab closed")] });
    workspace.local?.setItem("precog.cloud-bases.v1", JSON.stringify({ biz_a: 4 }));
    server.saveBusinessProfile.mockResolvedValue({ ok: true, revision: 5 });

    const tab = await syncTab(workspace, mine, {
      load: { found: true, profile: base, revision: 4, updatedAt: base.updatedAt },
    });

    expect(tab.sync.saveConflictRef.current).toBeNull();
    await vi.waitFor(() => expect(server.saveBusinessProfile).toHaveBeenCalledTimes(1));
    const sent = server.saveBusinessProfile.mock.calls[0][0].data;
    expect(sent.baseRevision).toBe(4);
    expect(sent.profile.customKnowledge?.[0]?.name).toBe("Edited before the tab closed");
    expect(tab.activated).toEqual([]);
  });

  it("still asks when the account moved on from that revision", async () => {
    const workspace = browser();
    const base = business("biz_a", "A Co");
    const mine = edit(base, { customKnowledge: [item("Edited here")] });
    workspace.local?.setItem("precog.cloud-bases.v1", JSON.stringify({ biz_a: 3 }));

    const tab = await syncTab(workspace, mine, {
      load: { found: true, profile: base, revision: 4, updatedAt: base.updatedAt },
    });

    expect(tab.sync.saveConflictRef.current).toMatchObject({ reason: "sign-in", revision: 4 });
    expect(server.saveBusinessProfile).not.toHaveBeenCalled();
  });

  it("asks again after a reload, and never saves over the account's newer copy (CW1-1)", async () => {
    const workspace = browser();
    const base = business("biz_a", "A Co");
    const mine = edit(base, { customKnowledge: [item("Edited here")] });
    const theirs = edit(base, { customKnowledge: [item("Edited on another device")] });
    workspace.local?.setItem("precog.cloud-bases.v1", JSON.stringify({ biz_a: 3 }));
    const load = {
      found: true as const,
      profile: theirs,
      revision: 4,
      updatedAt: theirs.updatedAt,
    };

    const first = await syncTab(workspace, mine, { load });
    expect(first.sync.saveConflictRef.current).toMatchObject({ reason: "sign-in", revision: 4 });
    effects.unmount();

    // The owner reloads before choosing: the account still holds the other device's copy.
    const second = await syncTab(workspace, mine, { load });
    expect(second.sync.saveConflictRef.current).toMatchObject({ reason: "sign-in", revision: 4 });
    await vi.advanceTimersByTimeAsync(5000);
    expect(server.saveBusinessProfile).not.toHaveBeenCalled();
    expect(second.activated).toEqual([]);
  });

  it("records the account's revision once the owner takes the account's copy", async () => {
    const workspace = browser();
    const base = business("biz_a", "A Co");
    const mine = edit(base, { customKnowledge: [item("Edited here")] });
    const theirs = edit(base, { customKnowledge: [item("Edited on another device")] });
    workspace.local?.setItem("precog.cloud-bases.v1", JSON.stringify({ biz_a: 3 }));
    const tab = await syncTab(workspace, mine, {
      load: { found: true, profile: theirs, revision: 4, updatedAt: theirs.updatedAt },
    });

    await tab.sync.resolveSaveConflict("reload");

    expect(JSON.parse(workspace.local?.getItem("precog.cloud-bases.v1") ?? "{}")).toEqual({
      biz_a: 4,
    });
  });

  it("asks again after a reload that follows an outage, too (CW1-1)", async () => {
    const workspace = browser();
    const base = business("biz_a", "A Co");
    const mine = edit(base, { customKnowledge: [item("Edited here")] });
    const theirs = edit(base, { customKnowledge: [item("Edited on another device")] });
    workspace.local?.setItem("precog.cloud-bases.v1", JSON.stringify({ biz_a: 3 }));
    const load = {
      found: true as const,
      profile: theirs,
      revision: 4,
      updatedAt: theirs.updatedAt,
    };

    const first = await syncTab(workspace, mine, { loadFails: true });
    server.loadBusinessProfile.mockResolvedValueOnce(load);
    await vi.advanceTimersByTimeAsync(2000);
    expect(first.sync.saveConflictRef.current).toMatchObject({ reason: "unreachable" });
    effects.unmount();

    const second = await syncTab(workspace, mine, { load });
    expect(second.sync.saveConflictRef.current).toMatchObject({ reason: "sign-in", revision: 4 });
    await vi.advanceTimersByTimeAsync(5000);
    expect(server.saveBusinessProfile).not.toHaveBeenCalled();
  });

  it("records the account's revision once this device takes the account's copy", async () => {
    const workspace = browser();
    const base = business("biz_a", "A Co");
    const theirs = edit(base, { customKnowledge: [item("Edited on another device")] });
    workspace.local?.setItem("precog.cloud-bases.v1", JSON.stringify({ biz_a: 3 }));
    // The account took this device's copy before the other device's edit.
    workspace.local?.setItem("precog.cloud-stamps.v1", JSON.stringify({ biz_a: base.updatedAt }));

    const tab = await syncTab(workspace, base, {
      load: { found: true, profile: theirs, revision: 4, updatedAt: theirs.updatedAt },
    });

    expect(tab.activated.at(-1)?.customKnowledge?.[0]?.name).toBe("Edited on another device");
    expect(JSON.parse(workspace.local?.getItem("precog.cloud-bases.v1") ?? "{}")).toEqual({
      biz_a: 4,
    });
  });
});

describe("the storage-full notice (CW1-3)", () => {
  async function fullTab() {
    const { workspace, full } = fillableBrowser();
    const before = business("biz_a", "A Co");
    const typed = edit(before, { customKnowledge: [item("Typed while full")] });
    const tab = await syncTab(workspace, typed, { stored: before, guest: true });
    tab.profileRef.current = typed;
    full.on = true;
    await vi.advanceTimersByTimeAsync(400);
    expect(errorToast(LOCAL_FULL_MESSAGE)).toBeDefined();
    vi.mocked(toast.dismiss).mockClear();
    return tab;
  }

  it("closes with the workspace that raised it", async () => {
    await fullTab();
    effects.unmount();
    expect(toast.dismiss).toHaveBeenCalledWith("local-save-failed");
  });

  it("closes once an account change locks the tab", async () => {
    await fullTab();
    identity.setLock("changed");
    expect(toast.dismiss).toHaveBeenCalledWith("local-save-failed");
  });
});
