import { describe, expect, it } from "vitest";
import {
  mapRoleToDuties,
  parseAccessExport,
  parseVendorExport,
  pendingQueueCount,
} from "./reconcile";
import type { Person } from "../types";

const people: Person[] = [
  {
    id: "p1",
    name: "Ada Owner",
    role: "Owner",
    active: true,
    entitlements: ["bank_reconcile"],
  },
];

describe("access reconciliation", () => {
  it("maps a known role and queues a permission it does not know", () => {
    const mapped = mapRoleToDuties("Accountant / Widget Role");
    expect(mapped.mapped).toContain("bank_reconcile");
    expect(mapped.unmatchedTokens.join(" ")).toContain("widget role");
  });

  it("pairs a QuickBooks-style user with the team and queues the extra duties", () => {
    const csv =
      "Name,Email,User Role\nAda Owner,ada@example.com,Accountant\nNew Hire,new@example.com,Admin\n";
    const parsed = parseAccessExport(csv, people, "2026-09-24");
    expect(parsed.source).toBe("quickbooks");
    const ada = parsed.users.find((u) => u.name === "Ada Owner");
    expect(ada?.personId).toBe("p1");
    expect(ada?.status).toBe("pending");
    const hire = parsed.users.find((u) => u.name === "New Hire");
    expect(hire?.personId).toBeUndefined();
    expect(
      pendingQueueCount({
        importedAt: "",
        source: parsed.source,
        users: parsed.users,
        vendors: [],
      }),
    ).toBeGreaterThan(0);
  });

  it("reads a vendor export and flags a supplier added in the last 90 days", () => {
    const csv =
      "Vendor,Created Date,Email\nNorth Supply,2026-08-01,ap@north.example\nOld Mill,2024-01-01,old@mill.example\n";
    const vendors = parseVendorExport(csv, "2026-09-24");
    expect(vendors.find((v) => v.name === "North Supply")?.recent).toBe(true);
    expect(vendors.find((v) => v.name === "Old Mill")?.recent).toBe(false);
  });
});
