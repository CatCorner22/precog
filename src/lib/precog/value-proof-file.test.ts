import { describe, expect, it } from "vitest";
import { DEFAULT_VALUE_CASE } from "./value-case";
import type { ValueEvidence } from "./value-evidence";
import { readValueProof, writeValueProof } from "./value-proof-store";
import {
  buildValueProofFile,
  loadValueProofFile,
  parseValueProofFile,
  VALUE_PROOF_FILE_FORMAT,
} from "./value-proof-file";
import { memoryStorage } from "@/test/memory-storage";

const item: ValueEvidence = {
  id: "r1",
  kind: "recovery",
  description: "Duplicate supplier payment recovered",
  source: "AP credit memo 118",
  amount: 2_400,
  observedAt: "2026-08-01",
  verified: true,
};

describe("value proof file", () => {
  it("round-trips one business's value case and evidence to another device", () => {
    const here = memoryStorage();
    writeValueProof(
      "biz_a",
      {
        valueCase: {
          ...DEFAULT_VALUE_CASE,
          directRecoveries: 2_400,
          entered: ["directRecoveries"],
        },
        evidence: [item],
      },
      here,
    );
    const out = buildValueProofFile(
      "biz_a",
      "Bright Smile Dental",
      new Date(2026, 9, 2, 9, 0),
      here,
    );
    expect(out.fileName).toBe("bright-smile-dental-value-proof-2026-10-02.json");
    expect(out.file.format).toBe(VALUE_PROOF_FILE_FORMAT);
    expect(out.file.businessName).toBe("Bright Smile Dental");

    const there = memoryStorage();
    const loaded = loadValueProofFile("biz_z", out.content, there);
    expect(loaded.ok).toBe(true);
    const stored = readValueProof("biz_z", there, { claimLegacy: false });
    expect(stored.valueCase).toEqual({
      ...DEFAULT_VALUE_CASE,
      directRecoveries: 2_400,
      entered: ["directRecoveries"],
    });
    expect(stored.evidence).toEqual([item]);
  });

  it("exports a business with nothing saved as an empty file that loads the defaults", () => {
    const out = buildValueProofFile("biz_new", "", new Date(2026, 9, 2), memoryStorage());
    expect(out.fileName).toBe("business-value-proof-2026-10-02.json");
    expect(out.file.valueCase).toBeNull();
    expect(out.file.valueEvidence).toEqual([]);
    const there = memoryStorage();
    expect(loadValueProofFile("biz_b", out.content, there).ok).toBe(true);
    expect(readValueProof("biz_b", there).valueCase).toEqual({
      ...DEFAULT_VALUE_CASE,
      entered: [],
    });
  });

  it.each([
    ["not JSON", "{oops", "not a Precog value proof file"],
    ["another file", JSON.stringify({ version: 1, evidence: [] }), "not a Precog value proof file"],
    [
      "a newer version",
      JSON.stringify({ format: VALUE_PROOF_FILE_FORMAT, version: 9, valueEvidence: [] }),
      "newer version",
    ],
    [
      "no register",
      JSON.stringify({ format: VALUE_PROOF_FILE_FORMAT, version: 1, valueCase: null }),
      "no evidence register",
    ],
    [
      "a bad value case",
      JSON.stringify({
        format: VALUE_PROOF_FILE_FORMAT,
        version: 1,
        valueCase: "lots",
        valueEvidence: [],
      }),
      "no readable value case",
    ],
    [
      "too many items",
      JSON.stringify({
        format: VALUE_PROOF_FILE_FORMAT,
        version: 1,
        valueCase: null,
        valueEvidence: Array.from({ length: 501 }, (_, i) => ({ ...item, id: `r${i}` })),
      }),
      "at most 500",
    ],
  ])("refuses %s and writes nothing", (_label, text, message) => {
    const storage = memoryStorage();
    writeValueProof("biz_a", { valueCase: { directRecoveries: 7 }, evidence: [] }, storage);
    const before = new Map(storage.data);
    const result = loadValueProofFile("biz_a", text, storage);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toContain(message);
    expect(new Map(storage.data)).toEqual(before);
    expect(() => parseValueProofFile(text)).toThrow(message);
  });
});
