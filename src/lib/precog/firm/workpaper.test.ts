import { describe, expect, it } from "vitest";
import { diffSnapshots, type QboEmployee } from "../integrations/qbo/model";
import { monthlyWorkpaperFacts } from "./workpaper";

const employee: QboEmployee = {
  id: "e1",
  name: "Pat Lee",
  active: true,
  releasedOn: null,
};
const reading = (employees: QboEmployee[]) =>
  diffSnapshots(null, { takenAt: "2026-10-06T12:00:00Z", vendors: [], employees }, [
    { name: employee.name, active: false },
  ]);

describe("QuickBooks workpaper employee-list evidence", () => {
  it("describes an active employee-list record, not a payroll payment", () => {
    const fact = monthlyWorkpaperFacts(reading([employee]))[0];
    expect(fact.label).toBe("Marked left here; still active in QuickBooks");
    expect(fact.detail).toContain("Pat Lee");
    expect(fact.detail).toContain("still active in the QuickBooks employee list");
    expect(fact.detail).toContain("Payment status not checked.");
    expect(fact.detail).toContain("Check the payroll register");
    expect(fact.detail).not.toMatch(/still paid|still pays|stopped their pay/i);
  });

  it.each([
    { employees: [] },
    { employees: [{ ...employee, active: false }] },
    { employees: [{ ...employee, releasedOn: "2026-10-01" }] },
  ])("does not infer no payments from employee-list state: %j", ({ employees }) => {
    const fact = monthlyWorkpaperFacts(reading(employees))[0];
    expect(fact.detail).toContain(
      "No person marked left on the duty map is still active in this QuickBooks employee-list reading.",
    );
    expect(fact.detail).toContain("Payment status not checked.");
    expect(fact.detail).not.toMatch(/still paid|still pays|no payment/i);
  });

  it("keeps payment status unknown when no reading is available", () => {
    const fact = monthlyWorkpaperFacts(null)[0];
    expect(fact.detail).toContain(
      "No QuickBooks reading yet, so the monthly checks are the record.",
    );
    expect(fact.detail).toContain("Payment status not checked.");
  });
});
