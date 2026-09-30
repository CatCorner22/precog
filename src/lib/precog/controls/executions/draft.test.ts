import { describe, expect, it } from "vitest";
import { readDraft, writeDraft } from "./draft";
import { ScopedStorage } from "../../workspace-storage";
const memory = () => {
  const items = new Map<string, string>();
  return {
    get length() {
      return items.size;
    },
    key: (i: number) => [...items.keys()][i] ?? null,
    getItem: (k: string) => items.get(k) ?? null,
    setItem: (k: string, v: string) => {
      items.set(k, v);
    },
    removeItem: (k: string) => {
      items.delete(k);
    },
  };
};
describe("control evidence drafts", () => {
  it("keeps unfinished inputs through reload within only their account and business", () => {
    const raw = memory();
    const a = new ScopedStorage(raw, "a");
    const b = new ScopedStorage(raw, "b");
    expect(writeDraft(a, "biz1", { note: "Unfinished review", references: "ref" })).toBe(true);
    expect(readDraft(a, "biz1")).toEqual({ note: "Unfinished review", references: "ref" });
    expect(readDraft(a, "biz2")).toBeNull();
    expect(readDraft(b, "biz1")).toBeNull();
  });
  it("does not restore reviewer confirmation, nested payloads or a malformed draft", () => {
    const raw = memory();
    raw.setItem(
      "control-evidence-draft:v1:x",
      JSON.stringify({ note: "safe", independenceConfirmed: true, nested: { unsafe: true } }),
    );
    expect(readDraft(raw, "x")).toEqual({ note: "safe" });
    raw.setItem("control-evidence-draft:v1:x", "not JSON");
    expect(readDraft(raw, "x")).toBeNull();
  });
  it("reports storage refusal instead of claiming the draft was saved", () => {
    const raw = memory();
    raw.setItem = () => {
      throw new Error("quota");
    };
    expect(writeDraft(raw, "x", { note: "keep" })).toBe(false);
    expect(writeDraft(null, "x", { note: "keep" })).toBe(false);
  });
  it("removes a submitted draft without affecting another business", () => {
    const raw = memory();
    writeDraft(raw, "x", { note: "x" });
    writeDraft(raw, "y", { note: "y" });
    writeDraft(raw, "x", null);
    expect(readDraft(raw, "x")).toBeNull();
    expect(readDraft(raw, "y")).toEqual({ note: "y" });
  });
});
