import { describe, expect, it } from "vitest";
import {
  canKeepLocalData,
  clearLocalCopies,
  readLocal,
  readLocalJson,
  removeLocal,
  writeLocal,
  type StorageLike,
} from "./local-data";

/** A browser whose site data is blocked: every read and write throws, as Safari and Chrome do. */
const blocked: StorageLike = {
  getItem: () => {
    throw new DOMException("blocked", "SecurityError");
  },
  setItem: () => {
    throw new DOMException("blocked", "QuotaExceededError");
  },
  removeItem: () => {
    throw new DOMException("blocked", "SecurityError");
  },
};

function memoryStorage(seed: Record<string, string> = {}) {
  const data = new Map(Object.entries(seed));
  return {
    get length() {
      return data.size;
    },
    key: (i: number) => [...data.keys()][i] ?? null,
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, v),
    removeItem: (k: string) => void data.delete(k),
    data,
  };
}

describe("value proof when the browser blocks or fills storage", () => {
  it("reads nothing and reports the write as not kept instead of throwing", () => {
    expect(readLocal("precog-value-case-v1", blocked)).toBeNull();
    expect(readLocalJson("precog-value-case-v1", blocked)).toBeUndefined();
    expect(writeLocal("precog-value-case-v1", "{}", blocked)).toBe(false);
    expect(() => removeLocal("precog-value-case-v1", blocked)).not.toThrow();
    expect(canKeepLocalData(blocked)).toBe(false);
  });

  it("treats a missing storage area (server render) the same way", () => {
    expect(readLocal("k", null)).toBeNull();
    expect(writeLocal("k", "v", null)).toBe(false);
    expect(canKeepLocalData(null)).toBe(false);
  });

  it("ignores a stored value that is not JSON rather than failing the tab", () => {
    const storage = memoryStorage({ "precog-value-case-v1": "{not json" });
    expect(readLocalJson("precog-value-case-v1", storage)).toBeUndefined();
  });

  it("round-trips values when storage works, and leaves no probe key behind", () => {
    const storage = memoryStorage();
    expect(writeLocal("precog-value-case-v1", JSON.stringify({ hourlyCost: 40 }), storage)).toBe(
      true,
    );
    expect(readLocalJson("precog-value-case-v1", storage)).toEqual({ hourlyCost: 40 });
    expect(canKeepLocalData(storage)).toBe(true);
    expect(storage.data.has("precog.storage-probe")).toBe(false);
  });
});

describe("clearing this device's saved data", () => {
  it("also removes the value proof figures, which use a dash in their key", () => {
    const storage = memoryStorage({
      "precog.practiceProfile.v2": "{}",
      "precog-value-case-v1": "{}",
      "precog-value-evidence-v1": "[]",
      "other-app": "keep",
    });
    clearLocalCopies(storage);
    expect([...storage.data.keys()]).toEqual(["other-app"]);
  });
});
