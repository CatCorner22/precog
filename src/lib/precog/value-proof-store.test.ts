import { describe, expect, it } from "vitest";
import { VALUE_CASE_STORAGE_KEY } from "./value-case";
import { VALUE_EVIDENCE_STORAGE_KEY } from "./value-evidence";
import { readValueProof, removeValueProof, writeValueProof } from "./value-proof-store";
import type { StorageLike } from "./local-data";

function memoryStorage(seed: Record<string, string> = {}) {
  const data = new Map(Object.entries(seed));
  const storage: StorageLike & { data: Map<string, string> } = {
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => void data.set(k, v),
    removeItem: (k) => void data.delete(k),
    data,
  };
  return storage;
}

describe("value proof for an owner with two businesses in one browser", () => {
  it("keeps each business's figures apart, and a new business starts empty", () => {
    const storage = memoryStorage();
    writeValueProof("biz_alpha", { valueCase: { directRecoveries: 12345 }, evidence: [] }, storage);
    expect(readValueProof("biz_beta", storage)).toEqual({
      valueCase: undefined,
      evidence: undefined,
    });
    writeValueProof("biz_beta", { valueCase: { directRecoveries: 777 }, evidence: [] }, storage);
    expect(readValueProof("biz_alpha", storage).valueCase).toEqual({ directRecoveries: 12345 });
    expect(readValueProof("biz_beta", storage).valueCase).toEqual({ directRecoveries: 777 });
  });

  it("moves the old browser-wide figures to the first business that reads them, once", () => {
    const storage = memoryStorage({
      [VALUE_CASE_STORAGE_KEY]: JSON.stringify({ directRecoveries: 500 }),
      [VALUE_EVIDENCE_STORAGE_KEY]: JSON.stringify([{ id: "ev1" }]),
    });
    expect(readValueProof("biz_alpha", storage)).toEqual({
      valueCase: { directRecoveries: 500 },
      evidence: [{ id: "ev1" }],
    });
    expect(storage.data.has(VALUE_CASE_STORAGE_KEY)).toBe(false);
    expect(storage.data.has(VALUE_EVIDENCE_STORAGE_KEY)).toBe(false);
    // Read again after the move: same figures, from the business's own keys.
    expect(readValueProof("biz_alpha", storage).valueCase).toEqual({ directRecoveries: 500 });
    // Another business does not inherit them.
    expect(readValueProof("biz_beta", storage).valueCase).toBeUndefined();
  });

  it("keeps the old figures where they are when the browser refuses the move", () => {
    const storage = memoryStorage({
      [VALUE_CASE_STORAGE_KEY]: JSON.stringify({ directRecoveries: 500 }),
    });
    const full: StorageLike = {
      getItem: storage.getItem,
      removeItem: storage.removeItem,
      setItem: () => {
        throw new DOMException("full", "QuotaExceededError");
      },
    };
    expect(readValueProof("biz_alpha", full).valueCase).toEqual({ directRecoveries: 500 });
    expect(storage.data.get(VALUE_CASE_STORAGE_KEY)).toBe(
      JSON.stringify({ directRecoveries: 500 }),
    );
  });

  it("forgets a business's figures when the business is removed", () => {
    const storage = memoryStorage();
    writeValueProof("biz_alpha", { valueCase: { directRecoveries: 1 }, evidence: [] }, storage);
    removeValueProof("biz_alpha", storage);
    expect(storage.data.size).toBe(0);
  });
});
