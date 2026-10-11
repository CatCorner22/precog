import { describe, expect, it } from "vitest";
import { normalizeProcedure } from "./normalize";

const TODAY = "2026-10-01";
const base = {
  id: "proc-1",
  industry: "general",
  title: "Make the deposit",
  steps: [{ id: "s1", text: "Count the drawer." }],
  createdAt: "2026-01-05",
};

describe("normalizing a stored procedure", () => {
  it("reads the stored duties once", () => {
    let reads = 0;
    const raw = { ...base };
    Object.defineProperty(raw, "dutyIds", {
      enumerable: true,
      get() {
        reads += 1;
        return ["bank_reconcile"];
      },
    });
    const p = normalizeProcedure(raw, TODAY);
    expect(p?.dutyIds).toEqual(["bank_reconcile"]);
    expect(reads).toBe(1);
  });

  it("keeps the day a procedure became written, and leaves it out when none is stored", () => {
    expect(normalizeProcedure({ ...base, writtenAt: "2026-09-30" }, TODAY)?.writtenAt).toBe(
      "2026-09-30",
    );
    expect(normalizeProcedure(base, TODAY)).not.toHaveProperty("writtenAt");
    // Not a day, or after the latest day: dropped, as createdAt would be.
    expect(normalizeProcedure({ ...base, writtenAt: "soon" }, TODAY)).not.toHaveProperty(
      "writtenAt",
    );
    expect(normalizeProcedure({ ...base, writtenAt: "2026-12-01" }, TODAY)).not.toHaveProperty(
      "writtenAt",
    );
    // Never before the procedure was started.
    expect(normalizeProcedure({ ...base, writtenAt: "2025-12-31" }, TODAY)?.writtenAt).toBe(
      "2026-01-05",
    );
  });
});
