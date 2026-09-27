import { describe, expect, it } from "vitest";
import { MAX_VALUE_EVIDENCE_ITEMS, type ValueEvidence } from "./value-evidence";
import { mergeImportedEvidence } from "./value-evidence-import";

function item(id: string, description = id): ValueEvidence {
  return {
    id,
    kind: "recovery",
    description,
    source: "memo",
    amount: 100,
    observedAt: "2026-08-01",
    verified: true,
  };
}

describe("mergeImportedEvidence", () => {
  it("keeps the items already in the register and adds the new ones", () => {
    const current = Array.from({ length: 12 }, (_, i) => item(`c${i}`));
    const result = mergeImportedEvidence(current, [item("n1"), item("n2")]);
    expect(result.items).toHaveLength(14);
    expect(result.items.slice(0, 12)).toEqual(current);
    expect(result).toMatchObject({ added: 2, updated: 0 });
  });

  it("replaces an item with the same id in place", () => {
    const result = mergeImportedEvidence(
      [item("a"), item("b")],
      [item("a", "corrected"), item("c")],
    );
    expect(result.items.map((i) => i.description)).toEqual(["corrected", "b", "c"]);
    expect(result).toMatchObject({ added: 1, updated: 1 });
  });

  it("refuses an import that would overflow the register", () => {
    const current = Array.from({ length: MAX_VALUE_EVIDENCE_ITEMS }, (_, i) => item(`c${i}`));
    expect(() => mergeImportedEvidence(current, [item("one-more")])).toThrow(
      /Nothing was imported/,
    );
  });
});
