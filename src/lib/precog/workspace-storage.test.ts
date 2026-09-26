import { describe, expect, it } from "vitest";
import {
  BusinessSaveQueue,
  ScopedStorage,
  removeAcknowledgedCopies,
  workspacePrefix,
} from "./workspace-storage";

class MemoryStorage {
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
}
const active = "precog.practiceProfile.v2";
const portfolio = "precog.portfolio.v1";

describe("account workspace isolation", () => {
  it("isolates identical business ids for A, B and the guest", () => {
    const raw = new MemoryStorage();
    const a = new ScopedStorage(raw, "A"),
      b = new ScopedStorage(raw, "B"),
      guest = new ScopedStorage(raw, null);
    a.setItem(active, "A secret");
    b.setItem(active, "B secret");
    guest.setItem(active, "guest draft");
    expect(a.getItem(active)).toBe("A secret");
    expect(b.getItem(active)).toBe("B secret");
    expect(guest.getItem(active)).toBe("guest draft");
    a.clear();
    expect(a.length).toBe(0);
    expect(b.getItem(active)).toBe("B secret");
    expect(guest.getItem(active)).toBe("guest draft");
  });
  it("does not adopt or erase legacy unassigned records", () => {
    const raw = new MemoryStorage();
    raw.setItem(active, "legacy owner unknown");
    const a = new ScopedStorage(raw, "A");
    expect(a.getItem(active)).toBeNull();
    a.setItem(active, "current");
    a.clear();
    expect(raw.getItem(active)).toBe("legacy owner unknown");
  });
  it("encodes identity delimiters, including the literal guest identity", () => {
    const ids = [null, "guest", "A", "A:B", "A%3AB", "A:", "", "é"];
    expect(new Set(ids.map(workspacePrefix)).size).toBe(ids.length);
  });
  it("an old storage object cannot change destination when a new account opens", () => {
    const raw = new MemoryStorage();
    const old = new ScopedStorage(raw, "A");
    const next = new ScopedStorage(raw, "B");
    old.setItem(active, "late callback");
    expect(next.getItem(active)).toBeNull();
    expect(old.entries()).toEqual({ [active]: "late callback" });
  });
  it("propagates refused writes so callers cannot claim success", () => {
    const raw = new MemoryStorage();
    raw.setItem = () => {
      throw new Error("quota");
    };
    expect(() => new ScopedStorage(raw, "A").setItem(active, "x")).toThrow("quota");
  });
  it("exports and clears only keys within the exact namespace", () => {
    const raw = new MemoryStorage();
    const a = new ScopedStorage(raw, "A");
    raw.setItem("unrelated", "keep");
    new ScopedStorage(raw, "A:B").setItem("x", "other");
    a.setItem("x", "1");
    a.setItem("y", "2");
    expect(a.entries()).toEqual({ x: "1", y: "2" });
    expect(a.key(2)).toBeNull();
    a.clear();
    expect(raw.length).toBe(2);
  });
  it("on sign-out removes exact acknowledged copies but not unsynced work", () => {
    const raw = new MemoryStorage();
    const a = new ScopedStorage(raw, "A");
    const saved = { businessId: "one", updatedAt: "same", name: "saved" };
    const unsynced = { businessId: "two", updatedAt: "same", name: "local only" };
    a.setItem(active, JSON.stringify({ localRev: "r", localBase: null, ...saved }));
    a.setItem(portfolio, JSON.stringify({ one: saved, two: unsynced }));
    a.setItem("precog.value-proof", "not confirmed in cloud");
    removeAcknowledgedCopies(a, new Map([["one", saved]]));
    expect(a.getItem(active)).toBeNull();
    expect(JSON.parse(a.getItem(portfolio)!)).toEqual({ two: unsynced });
    expect(a.getItem("precog.value-proof")).not.toBeNull();
  });
  it("does not use an equal timestamp as proof of equal contents", () => {
    const a = new ScopedStorage(new MemoryStorage(), "A");
    const saved = { businessId: "one", updatedAt: "same", name: "saved" };
    const edited = { ...saved, name: "unsynced" };
    a.setItem(active, JSON.stringify(edited));
    removeAcknowledgedCopies(a, new Map([["one", saved]]));
    expect(a.getItem(active)).toBe(JSON.stringify(edited));
  });
  it("keeps corrupt or unrecognized records during cleanup", () => {
    const a = new ScopedStorage(new MemoryStorage(), "A");
    a.setItem(active, "{bad");
    a.setItem(portfolio, "[]");
    removeAcknowledgedCopies(a, new Map());
    expect(a.getItem(active)).toBe("{bad");
    expect(a.getItem(portfolio)).toBe("[]");
  });
});

describe("business save serialization", () => {
  it("does not start the second save until the first completes", async () => {
    const q = new BusinessSaveQueue();
    const order: number[] = [];
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const first = q.run("one", async () => {
      order.push(1);
      await gate;
      order.push(2);
    });
    const second = q.run("one", async () => {
      order.push(3);
    });
    await Promise.resolve();
    await Promise.resolve();
    expect(order).toEqual([1]);
    release();
    await Promise.all([first, second]);
    expect(order).toEqual([1, 2, 3]);
  });
  it("allows another business to proceed and does not poison a queue after failure", async () => {
    const q = new BusinessSaveQueue();
    const failed = q.run("one", async () => {
      throw new Error("failed");
    });
    const good = q.run("one", async () => 2);
    const other = q.run("two", async () => 3);
    await expect(failed).rejects.toThrow("failed");
    await expect(good).resolves.toBe(2);
    await expect(other).resolves.toBe(3);
  });
  it("permanently closes queued saves on account changes", async () => {
    const q = new BusinessSaveQueue();
    let called = false;
    const pending = q.run("one", async () => {
      called = true;
    });
    q.close();
    await expect(pending).rejects.toThrow("closed");
    await expect(q.run("two", async () => 2)).rejects.toThrow("closed");
    expect(called).toBe(false);
  });
});
