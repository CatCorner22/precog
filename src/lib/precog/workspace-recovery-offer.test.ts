import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  hasWorkspaceRecoveryOffer,
  importableGuestCount,
  legacyEntries,
  legacyEntryCount,
} from "./workspace-recovery-offer";
import { WORKSPACE_PREFIX } from "./workspace-storage";

class MemoryStorage implements Storage {
  data = new Map<string, string>();
  get length() {
    return this.data.size;
  }
  key(index: number) {
    return [...this.data.keys()][index] ?? null;
  }
  getItem(key: string) {
    return this.data.get(key) ?? null;
  }
  setItem(key: string, value: string) {
    this.data.set(key, value);
  }
  removeItem(key: string) {
    this.data.delete(key);
  }
  clear() {
    this.data.clear();
  }
}

describe("workspace recovery offer", () => {
  let local: MemoryStorage;
  let session: MemoryStorage;

  beforeEach(() => {
    local = new MemoryStorage();
    session = new MemoryStorage();
    vi.stubGlobal("window", { localStorage: local, sessionStorage: session });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("counts legacy keys outside the workspace prefix", () => {
    local.setItem("precog.practiceProfile.v1", "{}");
    local.setItem(`${WORKSPACE_PREFIX}account`, "x");
    expect(legacyEntryCount()).toBe(1);
    expect(Object.keys(legacyEntries(false))).toEqual(["precog.practiceProfile.v1"]);
  });

  it("offers recovery when legacy or guest work exists", () => {
    expect(hasWorkspaceRecoveryOffer("acct", null)).toBe(false);
    local.setItem("precog.portfolio.v1", "[]");
    expect(hasWorkspaceRecoveryOffer("acct", null)).toBe(true);
    local.clear();
    expect(importableGuestCount("acct", null)).toBe(0);
  });
});
