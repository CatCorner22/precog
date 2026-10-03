import { describe, expect, it } from "vitest";
import type { RoleAssignment } from "./detect";
import {
  dutyBaselineKey,
  readDutyBaseline,
  seedDutyBaseline,
  storeDutyBaseline,
} from "./duty-baseline";

function memoryStorage() {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => void data.set(key, value),
  };
}

const before: RoleAssignment[] = [
  { personId: "p1", personName: "Ana", role: "Bookkeeper", entitlements: ["enter_invoices"] },
];
const after: RoleAssignment[] = [
  {
    personId: "p1",
    personName: "Ana",
    role: "Bookkeeper",
    entitlements: ["enter_invoices", "release_payment"],
  },
];

describe("duty baseline", () => {
  it("keeps the key Duty assignments used", () => {
    expect(dutyBaselineKey("biz-1")).toBe("precog.power-map-baseline.v1:biz-1");
  });

  it("seeds the duties before a change, so the change stays pending", () => {
    const storage = memoryStorage();
    expect(seedDutyBaseline(storage, "biz-1", before)).toBe(true);
    // A later screen mounting with the changed duties does not replace the seed.
    expect(seedDutyBaseline(storage, "biz-1", after)).toBe(false);
    expect(readDutyBaseline(storage, "biz-1")).toEqual(before);
  });

  it("leaves a baseline the owner accepted alone", () => {
    const storage = memoryStorage();
    storeDutyBaseline(storage, "biz-1", after);
    expect(seedDutyBaseline(storage, "biz-1", before)).toBe(false);
    expect(readDutyBaseline(storage, "biz-1")).toEqual(after);
  });

  it("keeps each business apart and survives missing storage", () => {
    const storage = memoryStorage();
    seedDutyBaseline(storage, "biz-1", before);
    expect(readDutyBaseline(storage, "biz-2")).toBeUndefined();
    expect(seedDutyBaseline(null, "biz-1", before)).toBe(false);
    expect(readDutyBaseline(undefined, "biz-1")).toBeUndefined();
  });
});
