import { describe, expect, it } from "vitest";
import { importEvidenceMessage } from "./value-evidence-register-text";

describe("importEvidenceMessage", () => {
  it("agrees with one item left as it was", () => {
    expect(importEvidenceMessage({ added: 0, updated: 1 }, 2)).toBe(
      "Precog imported 1 record: it replaced 1 item with the same id. The 1 other item stays as it was.",
    );
  });

  it("agrees with several items left as they were, and says nothing when none are", () => {
    expect(importEvidenceMessage({ added: 1, updated: 0 }, 3)).toBe(
      "Precog imported 1 record: it added 1 new item. The 3 other items stay as they were.",
    );
    expect(importEvidenceMessage({ added: 2, updated: 0 }, 0)).toBe(
      "Precog imported 2 records: it added 2 new items.",
    );
  });
});
