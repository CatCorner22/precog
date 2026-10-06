import { describe, expect, it, vi } from "vitest";
import { memoryStorage } from "@/test/memory-storage";
import { ScopedStorage } from "./workspace-storage";
import { LocalProfileStore } from "./save-conflict";
import {
  ACTIVE_PROFILE_KEY,
  defaultProfile,
  loadPortfolio,
  savePortfolioEntry,
  type PracticeProfile,
} from "./practice-profile";
import type { Workspace } from "./workspace-context";

// The hook runs as a plain function: refs are plain objects, callbacks are
// themselves, and effects do not run.
vi.mock("react", async (importOriginal) => ({
  ...(await importOriginal<typeof import("react")>()),
  useCallback: <T>(fn: T) => fn,
  useMemo: <T>(fn: () => T) => fn(),
  useRef: <T>(current: T) => ({ current }),
  useEffect: () => undefined,
}));
vi.mock("sonner", () => ({ toast: Object.assign(vi.fn(), { error: vi.fn() }) }));
const server = vi.hoisted(() => ({ loadBusiness: vi.fn(), deleteBusiness: vi.fn() }));
vi.mock("./profile-server", () => server);
vi.mock("./firm/entitlements-server", () => ({ getEntitlements: vi.fn() }));
vi.mock("./recovery-copy", () => ({ downloadRecoveryCopy: vi.fn() }));

// Renamed: here it runs as a plain function, not inside a component.
const { usePortfolio: runPortfolio, NOT_SAVED_ON_SWITCH } = await import("./use-portfolio");

function business(id: string, name: string): PracticeProfile {
  return { ...defaultProfile("general"), businessId: id, practiceName: name };
}

function portfolio(input: {
  open: PracticeProfile;
  cloudUser?: boolean;
  flushLocal?: () => boolean;
  localStore?: LocalProfileStore;
  workspace?: Workspace;
}) {
  const workspace = input.workspace ?? {
    accountId: null,
    local: new ScopedStorage(memoryStorage(), null),
    session: null,
  };
  const activateProfile = vi.fn();
  const hook = runPortfolio({
    workspace,
    profile: input.open,
    profileRef: { current: input.open },
    setProfile: vi.fn(),
    activateProfile,
    clearHistory: vi.fn(),
    localStore: input.localStore ?? new LocalProfileStore(() => workspace.local),
    cloudUser: input.cloudUser ?? false,
    cloudRevision: { current: new Map() },
    saveConflictRef: { current: null },
    raiseConflict: vi.fn(),
    accountTook: () => false,
    flushLocal: input.flushLocal ?? (() => true),
    flushActive: async () => true,
    openedFromAccount: vi.fn(),
    remoteBusinesses: [],
    setRemoteBusinesses: vi.fn(),
    portfolioVersion: 0,
    bumpPortfolio: vi.fn(),
    setSwitching: vi.fn(),
  });
  return { hook, activateProfile, workspace };
}

describe("switching businesses", () => {
  it("stays on the open business when an edit made during the account load cannot be saved", async () => {
    const local = new ScopedStorage(memoryStorage(), "user_1");
    const workspace: Workspace = { accountId: "user_1", local, session: null };
    savePortfolioEntry(business("biz_b", "B Co"), local);
    server.loadBusiness.mockResolvedValueOnce({ found: false });
    // The save before the account load succeeds (flushActive); the write
    // after it, for the edit made meanwhile, is refused.
    const flushLocal = vi.fn(() => false);
    const { hook, activateProfile } = portfolio({
      open: business("biz_a", "A Co"),
      cloudUser: true,
      flushLocal,
      workspace,
    });
    const result = await hook.switchBusiness("biz_b");
    expect(result).toEqual({ ok: false, reason: NOT_SAVED_ON_SWITCH });
    expect(NOT_SAVED_ON_SWITCH).toBe(
      "Precog could not save this business on this device, so it stayed open. Download a recovery copy, then try again.",
    );
    expect(activateProfile).not.toHaveBeenCalled();
  });

  it("writes an edit made during the account load before the next business opens", async () => {
    const local = new ScopedStorage(memoryStorage(), "user_1");
    const workspace: Workspace = { accountId: "user_1", local, session: null };
    savePortfolioEntry(business("biz_b", "B Co"), local);
    server.loadBusiness.mockResolvedValueOnce({ found: false });
    const order: string[] = [];
    const flushLocal = vi.fn(() => {
      order.push("flush");
      return true;
    });
    const { hook, activateProfile } = portfolio({
      open: business("biz_a", "A Co"),
      cloudUser: true,
      flushLocal,
      workspace,
    });
    activateProfile.mockImplementation(() => order.push("open"));
    expect(await hook.switchBusiness("biz_b")).toEqual({ ok: true });
    expect(order.at(-2)).toBe("flush");
    expect(order.at(-1)).toBe("open");
  });
});

describe("the business list", () => {
  it("lists every readable business when one stored entry is damaged", () => {
    const { workspace } = portfolio({ open: business("biz_a", "A Co") });
    savePortfolioEntry(business("biz_b", "B Co"), workspace.local);
    const raw = JSON.parse(workspace.local?.getItem("precog.portfolio.v1") as string);
    raw.biz_null = null;
    raw.biz_num = { ...business("biz_num", "x"), practiceName: 7 };
    workspace.local?.setItem("precog.portfolio.v1", JSON.stringify(raw));
    const { hook } = portfolio({ open: business("biz_a", "A Co"), workspace });
    expect(hook.businesses.map((b) => b.id).sort()).toEqual(["biz_a", "biz_b", "biz_num"]);
  });
});

describe("removing a business", () => {
  it("keeps it removed when another tab left it as the open business", async () => {
    const { workspace } = portfolio({ open: business("biz_a", "A Co") });
    const local = workspace.local as ScopedStorage;
    // Another tab opened B and closed: the open-business key holds B.
    const otherTab = new LocalProfileStore(() => local);
    otherTab.load();
    otherTab.write(business("biz_b", "B Co"));
    savePortfolioEntry(business("biz_a", "A Co"), local);
    savePortfolioEntry(business("biz_b", "B Co"), local);

    const thisTab = new LocalProfileStore(() => local);
    const { hook } = portfolio({ open: business("biz_a", "A Co"), workspace, localStore: thisTab });
    await hook.deleteBusiness("biz_b");

    expect(Object.keys(loadPortfolio(local))).toEqual(["biz_a"]);
    // A reload opens this tab's business, not the removed one.
    const reloaded = new LocalProfileStore(() => local).load();
    expect(reloaded.profile.businessId).toBe("biz_a");
    // The other tab, still open on B, saves again: B is not listed again.
    expect(savePortfolioEntry(business("biz_b", "B Co (edited)"), local)).toBe(true);
    expect(Object.keys(loadPortfolio(local))).toEqual(["biz_a"]);
    expect(local.getItem(ACTIVE_PROFILE_KEY)).toContain('"biz_a"');
  });
});
