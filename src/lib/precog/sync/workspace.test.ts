import { describe, expect, it } from "vitest";
import {
  assertProfileOwner,
  profileOwner,
  scopedStorage,
  WorkspaceSession,
  type KeyedStorage,
} from "./workspace";

function memory(): KeyedStorage {
  const values = new Map<string, string>();
  return {
    get length() {
      return values.size;
    },
    key: (i) => [...values.keys()][i] ?? null,
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => {
      values.set(key, value);
    },
    removeItem: (key) => {
      values.delete(key);
    },
  };
}

describe("workspace isolation", () => {
  it("separates identical keys belonging to two accounts and a guest", () => {
    const raw = memory();
    const a = scopedStorage(raw, "account-a");
    const b = scopedStorage(raw, "account-b");
    const guest = scopedStorage(raw, null);
    a.setItem("draft", "A");
    b.setItem("draft", "B");
    guest.setItem("draft", "guest");
    expect(a.getItem("draft")).toBe("A");
    expect(b.getItem("draft")).toBe("B");
    expect(guest.getItem("draft")).toBe("guest");
    a.removeItem("draft");
    expect(b.getItem("draft")).toBe("B");
    expect(guest.getItem("draft")).toBe("guest");
  });
  it("does not adopt unassigned legacy records", () => {
    const raw = memory();
    raw.setItem("precog.practiceProfile.v2", JSON.stringify({ practiceName: "Unassigned" }));
    expect(scopedStorage(raw, "a").getItem("precog.practiceProfile.v2")).toBeNull();
    expect(scopedStorage(raw, null).getItem("precog.practiceProfile.v2")).toBeNull();
    expect(raw.getItem("precog.practiceProfile.v2")).not.toBeNull();
  });
  it("refuses old adapters after A switches to B, and after A signs back in", () => {
    const session = new WorkspaceSession();
    const raw = memory();
    const first = session.activate("a");
    const adapter = scopedStorage(raw, "a", () => session.assertCurrent(first));
    adapter.setItem("draft", "A");
    session.activate("b");
    expect(() => adapter.setItem("draft", "late A")).toThrow("Account changed");
    session.activate("a");
    expect(() => adapter.getItem("draft")).toThrow("Account changed");
    expect(scopedStorage(raw, "a").getItem("draft")).toBe("A");
  });
  it("rejects an old account payload even through the new account's adapter", () => {
    const raw = memory();
    const b = scopedStorage(raw, "b");
    const aProfile = { workspaceOwnerId: "a", businessId: "same" };
    expect(() => b.setItem("precog.practiceProfile.v2", JSON.stringify(aProfile))).toThrow();
    expect(() => b.setItem("precog.portfolio.v1", JSON.stringify({ same: aProfile }))).toThrow();
    expect(b.length).toBe(0);
  });
  it("retains an explicit guest marker and rejects an absent owner marker", () => {
    expect(profileOwner({ workspaceOwnerId: null })).toBeNull();
    expect(profileOwner({})).toBeUndefined();
    expect(() => assertProfileOwner({}, "a")).toThrow();
    expect(() => assertProfileOwner({ workspaceOwnerId: null }, "a")).toThrow();
    expect(() => assertProfileOwner({ workspaceOwnerId: "a" }, "a")).not.toThrow();
  });
  it("enumerates only the selected workspace", () => {
    const raw = memory();
    scopedStorage(raw, "a").setItem("draft", "A");
    const b = scopedStorage(raw, "b");
    b.setItem("one", "1");
    b.setItem("two", "2");
    expect(b.length).toBe(2);
    expect([b.key(0), b.key(1)]).toEqual(["one", "two"]);
  });
});
