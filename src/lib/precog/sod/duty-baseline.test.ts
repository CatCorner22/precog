import { describe, expect, it } from "vitest";
import type { RoleAssignment } from "./detect";
import {
  dutyBaselineKey,
  hasStoredDutyBaseline,
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

  // ST-SCALE-2: a baseline of more than 100 people was stored but read back
  // as none, so Change review took today's duties as accepted on reload.
  it.each([101, 150, 400])("reads back a baseline of %i people", (n) => {
    const storage = memoryStorage();
    const team: RoleAssignment[] = Array.from({ length: n }, (_, i) => ({
      personId: `p${i}`,
      personName: `Person ${i}`,
      role: i === 0 ? "Owner" : "Clerk",
      entitlements: i % 7 === 5 ? ["collect_cash", "release_payment"] : ["enter_invoices"],
    }));
    expect(seedDutyBaseline(storage, "biz-1", team)).toBe(true);
    expect(readDutyBaseline(storage, "biz-1")).toEqual(team);
    expect(hasStoredDutyBaseline(storage, "biz-1")).toBe(true);
  });

  it("tells a stored baseline it cannot read from none", () => {
    const storage = memoryStorage();
    expect(hasStoredDutyBaseline(storage, "biz-1")).toBe(false);
    storage.setItem(dutyBaselineKey("biz-1"), "{not json");
    expect(readDutyBaseline(storage, "biz-1")).toBeUndefined();
    expect(hasStoredDutyBaseline(storage, "biz-1")).toBe(true);
    // Seeding leaves it alone; only accepting the duties again replaces it.
    expect(seedDutyBaseline(storage, "biz-1", before)).toBe(false);
    storeDutyBaseline(storage, "biz-1", before);
    expect(readDutyBaseline(storage, "biz-1")).toEqual(before);
    expect(hasStoredDutyBaseline(null, "biz-1")).toBe(false);
  });

  it("keeps each business apart and survives missing storage", () => {
    const storage = memoryStorage();
    seedDutyBaseline(storage, "biz-1", before);
    expect(readDutyBaseline(storage, "biz-2")).toBeUndefined();
    expect(seedDutyBaseline(null, "biz-1", before)).toBe(false);
    expect(readDutyBaseline(undefined, "biz-1")).toBeUndefined();
  });
});
