import { describe, expect, it } from "vitest";
import {
  mapRoleToDuties,
  normalizeAccessReconciliation,
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
    const parsed = parseAccessExport(csv, people, "2026-09-24", {});
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

  it("reads a payroll roster with employee and department columns", () => {
    const csv =
      "Employee Name,Department,Job Title,Status\nAda Owner,Ops,Payroll Manager,Active\n";
    const parsed = parseAccessExport(csv, people, "2026-09-24", {});
    expect(parsed.source).toBe("payroll");
    expect(parsed.users[0]?.name).toBe("Ada Owner");
    expect(parsed.users[0]?.mapped).toContain("enter_payroll");
  });
});

describe("people who have left and duties that come from a role", () => {
  const ben: Person = {
    id: "p-ben",
    name: "Ben Cole",
    role: "Bookkeeper",
    active: false,
    lastDay: "2026-05-01",
    entitlements: ["enter_invoices", "post_payments", "bank_reconcile"],
  };
  const csv = "Name,Email,User Role\nBen Cole,ben@x.com,Bookkeeper\n";

  it("keeps a live login for someone marked as left in the queue, flagged", () => {
    const [row] = parseAccessExport(csv, [ben], "2026-09-24", {}).users;
    expect(row).toMatchObject({ personId: "p-ben", status: "pending", leftBusiness: true });
    expect(normalizeAccessReconciliation({ users: [row] })?.users[0].leftBusiness).toBe(true);
  });

  it("pairs the row with a current namesake before one who has left", () => {
    const current: Person = { ...ben, id: "p-ben-2", active: true, lastDay: undefined };
    const [row] = parseAccessExport(csv, [ben, current], "2026-09-24", {}).users;
    expect(row).toMatchObject({ personId: "p-ben-2", status: "mapped" });
    expect(row.leftBusiness).toBeUndefined();
  });

  it("compares the export with the duties a person's role gives them", () => {
    const ana: Person = { id: "p-ana", name: "Ana Ruiz", role: "Bookkeeper", active: true };
    const roles = { Bookkeeper: ["enter_invoices", "post_payments", "bank_reconcile"] } as const;
    const [row] = parseAccessExport(
      "Name,Email,User Role\nAna Ruiz,ana@x.com,Bookkeeper\n",
      [ana],
      "2026-09-24",
      roles,
    ).users;
    expect(row).toMatchObject({ status: "mapped", extra: [], missingFromBooks: [] });
    const [reports] = parseAccessExport(
      "Name,Email,User Role\nAna Ruiz,ana@x.com,Reports only\n",
      [{ ...ana, role: "Volunteer" }],
      "2026-09-24",
      {},
    ).users;
    expect(reports.missingFromBooks).toEqual([]);
  });
});

describe("matching people whose names are spelled without accents", () => {
  it("matches an export row 'Jose Perez' to the team member 'José Pérez'", () => {
    const people = [
      { id: "p1", name: "José Pérez", role: "Office manager", entitlements: [] },
    ] as unknown as Person[];
    const parsed = parseAccessExport(
      "Name,Email,Role\nJose Perez,j@example.com,Admin\n",
      people,
      "2026-09-26",
      {},
    );
    expect(parsed.users.map((u) => u.personId)).toEqual(["p1"]);
  });
});

describe("role phrases and vendor dates", () => {
  it("matches role phrases as whole words and ignores filler words", () => {
    expect(mapRoleToDuties("Administrator")).toEqual({
      mapped: ["manage_user_access", "pms_admin_roles"],
      unmatchedTokens: [],
    });
    expect(mapRoleToDuties("Standard user")).toEqual({
      mapped: ["enter_invoices", "post_payments"],
      unmatchedTokens: [],
    });
    expect(mapRoleToDuties("Badminton coach").mapped).toEqual([]);
  });

  it("reads the vendor date forms the roster importer reads", () => {
    const csv = "Vendor,Created\nA Co,9/1/26\nB Co,1 Sep 2026\nC Co,2026-09-01\nD Co,2025-01-01\n";
    expect(parseVendorExport(csv, "2026-09-26").map((v) => [v.name, v.recent])).toEqual([
      ["A Co", true],
      ["B Co", true],
      ["C Co", true],
      ["D Co", false],
    ]);
  });
});
